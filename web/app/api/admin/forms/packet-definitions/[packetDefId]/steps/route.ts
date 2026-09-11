import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import {
    PACKET_STEP_KINDS,
    packetStepConfigRefusal,
    readPacketStepConfig,
    writePacketStepConfig,
    type PacketStepKind,
} from "@/lib/forms/packets/packetStepKind";

/**
 * POST /api/admin/forms/packet-definitions/[packetDefId]/steps — append one step of any kind.
 *
 * The existing `items` route replaces the whole ordered list and demands a form id per step, which
 * is right for reordering and wrong for "add an upload step": an administrator should not have to
 * build a one-question Form to say "upload your immunization record".
 *
 * So this route owns the ADMIN's vocabulary — collect information, upload a document, read and
 * acknowledge — and generates whatever executes it. For the two document kinds that means a
 * system-owned Form carrying a single control, created and published here and never shown to the
 * administrator. That reuse is deliberate: participant upload, View/Replace, classification,
 * completion evidence, the Processing return and the canonical return all already work through form
 * submissions, and a second execution engine would have to re-earn every one of those proofs.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ packetDefId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { packetDefId: raw } = await params;
    const packetDefId = parseUuidParam(raw, "packetDefId");
    if (packetDefId instanceof NextResponse) return packetDefId;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const kindRaw = typeof body.kind === "string" ? body.kind.trim() : "";
    if (!(PACKET_STEP_KINDS as readonly string[]).includes(kindRaw)) {
        return jsonError(`kind must be one of ${PACKET_STEP_KINDS.join(", ")}`, 400);
    }
    const kind = kindRaw as PacketStepKind;
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    const documentTypeKey = typeof body.document_type_key === "string" ? body.document_type_key.trim() : "";
    const acknowledgmentDocumentId =
        typeof body.acknowledgment_document_id === "string" ? body.acknowledgment_document_id.trim() : "";
    const requiresSignature = body.requires_signature === true;

    const config = readPacketStepConfig(
        writePacketStepConfig({}, {
            kind,
            label: label || null,
            instructions: instructions || null,
            documentTypeKey: documentTypeKey || null,
            acknowledgmentDocumentId: acknowledgmentDocumentId || null,
            requiresSignature,
        }),
    );
    const refusal = packetStepConfigRefusal(config);
    if (refusal) return jsonError(refusal, 400);

    const supabase = createAdminClient();

    const { data: def, error: defErr } = await supabase
        .from("form_packet_definitions")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .eq("id", packetDefId)
        .maybeSingle();
    if (defErr) return NextResponse.json({ error: defErr.message }, { status: 500 });
    if (!def) return jsonError("Packet not found", 404);

    // ── The form that EXECUTES this step ──────────────────────────────────────────────────────
    let formDefinitionId: string;
    if (kind === "form") {
        const given = typeof body.form_definition_id === "string" ? body.form_definition_id.trim() : "";
        if (!given) return jsonError("Choose a form for this step.", 400);
        const parsed = parseUuidParam(given, "form_definition_id");
        if (parsed instanceof NextResponse) return parsed;
        const { data: formRow } = await supabase
            .from("form_definitions")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("id", parsed)
            .maybeSingle();
        if (!formRow) return jsonError("That form is not in this organization.", 400);
        formDefinitionId = parsed;
    } else {
        const generated = await generateAdapterForm(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId ?? null,
            kind,
            label: label || (kind === "document_upload" ? "Upload a document" : "Read & acknowledge"),
            instructions,
            documentTypeKey,
            acknowledgmentDocumentId,
            requiresSignature,
        });
        if (!generated.ok) return jsonError(generated.error, 500);
        formDefinitionId = generated.formDefinitionId;
    }

    // Append after the last step. `sequence_index` is 0-based and uniquely constrained per packet.
    const { data: last } = await supabase
        .from("form_packet_items")
        .select("sequence_index")
        .eq("org_id", ctx.orgId)
        .eq("packet_definition_id", packetDefId)
        .order("sequence_index", { ascending: false })
        .limit(1)
        .maybeSingle();
    const nextIndex = ((last as { sequence_index?: number } | null)?.sequence_index ?? -1) + 1;

    const { data: inserted, error: insErr } = await supabase
        .from("form_packet_items")
        .insert({
            org_id: ctx.orgId,
            packet_definition_id: packetDefId,
            sequence_index: nextIndex,
            form_definition_id: formDefinitionId,
            metadata: writePacketStepConfig({}, {
                kind,
                label: label || null,
                instructions: instructions || null,
                documentTypeKey: documentTypeKey || null,
                acknowledgmentDocumentId: acknowledgmentDocumentId || null,
                requiresSignature,
            }),
        })
        .select("id, sequence_index, form_definition_id, metadata")
        .maybeSingle();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return jsonData(inserted);
}

/**
 * Create and publish the single-control Form that runs a document step.
 *
 * Named for the step so an operator reading Forms Studio can still tell what it is, and marked in
 * metadata as packet-owned so a later surface can keep these out of the administrator's Form list.
 */
async function generateAdapterForm(
    supabase: ReturnType<typeof createAdminClient>,
    input: {
        orgId: string;
        userId: string | null;
        kind: PacketStepKind;
        label: string;
        instructions: string;
        documentTypeKey: string;
        acknowledgmentDocumentId: string;
        requiresSignature: boolean;
    },
): Promise<{ ok: true; formDefinitionId: string } | { ok: false; error: string }> {
    const key = `packet_step_${input.kind}_${Date.now().toString(36)}`;

    const { data: form, error: formErr } = await supabase
        .from("form_definitions")
        .insert({
            org_id: input.orgId,
            key,
            name: input.label,
            kind: "center",
            is_active: true,
            // The marker that says an administrator did not author this and should not maintain it.
            metadata: { packet_step_adapter: true, packet_step_kind: input.kind },
        })
        .select("id")
        .maybeSingle();
    if (formErr || !form) return { ok: false, error: formErr?.message ?? "Could not create the step." };
    const formDefinitionId = (form as { id: string }).id;

    const fields =
        input.kind === "document_upload"
            ? [
                  {
                      id: "upload",
                      type: "file_ref",
                      label: input.label,
                      required: true,
                      ...(input.instructions ? { description: input.instructions } : {}),
                      document_type: input.documentTypeKey,
                  },
              ]
            : [
                  // The document itself is the content; the family reads it and then affirms.
                  {
                      id: "acknowledgment",
                      type: "boolean",
                      label: input.instructions || `I have read and agree to ${input.label}.`,
                      required: true,
                  },
                  ...(input.requiresSignature
                      ? [{ id: "signature", type: "signature", label: "Signature", required: true }]
                      : []),
              ];

    const schema_json = {
        title: input.label,
        schema_version: 1,
        sections: [],
        fields,
        ...(input.kind === "document_acknowledgment" && input.acknowledgmentDocumentId
            ? { acknowledgment_document_id: input.acknowledgmentDocumentId }
            : {}),
    };

    const nowIso = new Date().toISOString();
    const { error: verErr } = await supabase.from("form_definition_versions").insert({
        org_id: input.orgId,
        form_definition_id: formDefinitionId,
        version_number: 1,
        status: "published",
        schema_json,
        published_at: nowIso,
        published_by_user_id: input.userId,
    });
    if (verErr) return { ok: false, error: verErr.message };

    return { ok: true, formDefinitionId };
}
