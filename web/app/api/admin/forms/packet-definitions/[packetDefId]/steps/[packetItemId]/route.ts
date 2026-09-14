/**
 * PATCH /api/admin/forms/packet-definitions/[packetDefId]/steps/[packetItemId] — change ONE
 * obligation's configuration.
 *
 * ## Why this exists
 *
 * A packet step could be created with its configuration and then never inspected again. Packet
 * Studio could say what an obligation does — "read this document and sign it", "send in your
 * immunization record, filed as Immunization record" — but an administrator who asked *how was that
 * decided, and where do I change it* had nowhere to go. Authoring was a one-way door.
 *
 * ## What it will and will not change
 *
 * It writes the SAME keys the authoring path writes, through the same `writePacketStepConfig`, so
 * there is one shape and one owner. It deliberately does not touch:
 *
 *   - `form_definition_id` — which Form a "collect information" step uses is a composition decision
 *     and belongs to the steps list, not to a step's own configuration panel;
 *   - `sequence_index` — order is the packet's, changed by reordering;
 *   - the adapter form behind a document step — that is the machinery, and re-pointing it from here
 *     would make the administrator responsible for a thing the vocabulary exists to hide.
 *
 * A field absent from the body is left exactly as it was: this is a patch, so an editor that only
 * knows about one control cannot blank the rest.
 */

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { readPacketStepConfig, writePacketStepConfig } from "@/lib/forms/packets/packetStepKind";

export const dynamic = "force-dynamic";

const str = (v: unknown): string | undefined => (typeof v === "string" ? v.trim() : undefined);

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ packetDefId: string; packetItemId: string }> },
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { packetDefId: rawPacket, packetItemId: rawItem } = await params;
    const packetDefId = parseUuidParam(rawPacket, "packetDefId");
    if (packetDefId instanceof NextResponse) return packetDefId;
    const packetItemId = parseUuidParam(rawItem, "packetItemId");
    if (packetItemId instanceof NextResponse) return packetItemId;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const supabase = createAdminClient();

    // Scoped by packet AND org: a step id alone must not be enough to edit someone else's packet.
    const { data: row, error: readErr } = await supabase
        .from("form_packet_items")
        .select("id, metadata")
        .eq("org_id", ctx.orgId)
        .eq("packet_definition_id", packetDefId)
        .eq("id", packetItemId)
        .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!row) return jsonError("Step not found", 404);

    const current = readPacketStepConfig((row as { metadata?: unknown }).metadata);

    /*
     * The KIND is not patchable.
     *
     * Changing "read & acknowledge" into "upload a document" is not an edit, it is a different
     * obligation with different evidence and a different executor. Refusing it here keeps the step's
     * machinery and its meaning from drifting apart; an administrator who wants the other kind adds
     * the other kind.
     */
    if (body.kind !== undefined && body.kind !== current.kind) {
        return jsonError(
            "A step's completion method cannot be changed. Remove this step and add the kind you want.",
            400,
        );
    }

    const label = str(body.label);
    const instructions = str(body.participant_instructions ?? body.instructions);
    const documentTypeKey = str(body.document_type_key);
    const acknowledgmentDocumentId = str(body.acknowledgment_document_id);
    const requiresSignature =
        typeof body.requires_signature === "boolean" ? body.requires_signature : undefined;

    if (current.kind === "document_acknowledgment" && acknowledgmentDocumentId === "") {
        // A read-and-acknowledge step with no document is one a family cannot complete.
        return jsonError("This step needs a document for the family to read.", 400);
    }
    if (current.kind === "document_upload" && documentTypeKey === "") {
        return jsonError("This step needs to say what the uploaded document is filed as.", 400);
    }

    const metadata = writePacketStepConfig(row.metadata, {
        kind: current.kind,
        ...(label !== undefined ? { label: label || null } : {}),
        ...(instructions !== undefined ? { instructions: instructions || null } : {}),
        ...(documentTypeKey !== undefined ? { documentTypeKey: documentTypeKey || null } : {}),
        ...(acknowledgmentDocumentId !== undefined
            ? { acknowledgmentDocumentId: acknowledgmentDocumentId || null }
            : {}),
        ...(requiresSignature !== undefined ? { requiresSignature } : {}),
    });

    const { data: updated, error: updErr } = await supabase
        .from("form_packet_items")
        .update({ metadata })
        .eq("org_id", ctx.orgId)
        .eq("packet_definition_id", packetDefId)
        .eq("id", packetItemId)
        .select("id, sequence_index, form_definition_id, metadata")
        .maybeSingle();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return jsonData(updated);
}
