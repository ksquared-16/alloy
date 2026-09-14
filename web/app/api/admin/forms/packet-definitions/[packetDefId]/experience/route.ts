/**
 * GET /api/admin/forms/packet-definitions/[packetDefId]/experience — what this packet asks of a
 * family, and where it is used.
 *
 * ## Why this exists
 *
 * Packet Studio could describe its own storage and nothing else: which Forms were included, in what
 * order, how many sessions had run. An administrator opening it to ask "what does a family actually
 * do, and which of it does Alloy already know?" had to infer the answer from a list of form names.
 *
 * Every fact here is READ from configuration that already exists — a Form's published schema, a
 * step's stored config, the document a step points at, the stage requirement that uses the packet.
 * Nothing is stored for this view and no setting is invented: the judging lives in
 * `packetExperienceSummary`, which is pure, and this route only gathers.
 *
 * ## Usage is read from the DRAFT as well as the publication
 *
 * A configuration surface must show the configuration the administrator is editing. The stage
 * requirement that points at this packet may exist only in the Business Process draft, so this
 * reports usage from the draft and says plainly whether it has been published — rather than
 * claiming the packet is unused, which is what reading the projection alone would do.
 */

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { loadBusinessProcessEditorState } from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import { deriveDocumentDisplayName } from "@/lib/pos/processingCase/formDraft/deriveDocumentTitle";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
    LIFECYCLE_BUILDER_METADATA_KEY,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { parseFidelityPdfMapping } from "@/lib/forms/pdf/fidelityMappingContract";
import {
    describeStep,
    familyExperienceLines,
    packetIsReady,
    packetReadinessRows,
    summarizeFormQuestions,
    type StepInput,
} from "@/lib/forms/packets/packetExperienceSummary";
import { readPacketStepConfig } from "@/lib/forms/packets/packetStepKind";
import type { FormSchemaV1 } from "@/lib/forms/schema";

export const dynamic = "force-dynamic";

type PacketUsage = {
    processName: string;
    stageName: string;
    level: string;
    blocking: boolean;
    /** False when the requirement exists only in the Business Process draft. */
    published: boolean;
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ packetDefId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { packetDefId: raw } = await params;
    const packetDefId = parseUuidParam(raw, "packetDefId");
    if (packetDefId instanceof NextResponse) return packetDefId;

    const supabase = createAdminClient();

    const { data: items, error: itemsErr } = await supabase
        .from("form_packet_items")
        .select("id, sequence_index, form_definition_id, metadata")
        .eq("org_id", ctx.orgId)
        .eq("packet_definition_id", packetDefId)
        .order("sequence_index", { ascending: true });
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

    const rows = (items ?? []) as Array<{
        id: string;
        sequence_index: number;
        form_definition_id: string | null;
        metadata: unknown;
    }>;

    // --- the Forms behind "collect information" steps -------------------------------------------
    const formIds = [...new Set(rows.map((r) => r.form_definition_id).filter((v): v is string => Boolean(v)))];
    const publishedSchemaByForm = new Map<string, { schema: FormSchemaV1 | null; hasSource: boolean }>();
    if (formIds.length > 0) {
        const { data: versions } = await supabase
            .from("form_definition_versions")
            .select("form_definition_id, schema_json, pdf_mapping_json, status, version_number")
            .eq("org_id", ctx.orgId)
            .eq("status", "published")
            .in("form_definition_id", formIds)
            .order("version_number", { ascending: false });
        for (const v of (versions ?? []) as Array<{
            form_definition_id: string;
            schema_json: unknown;
            pdf_mapping_json: unknown;
        }>) {
            // Highest version first, so the first one seen for a form is the current publication.
            if (publishedSchemaByForm.has(v.form_definition_id)) continue;
            publishedSchemaByForm.set(v.form_definition_id, {
                schema: (v.schema_json ?? null) as FormSchemaV1 | null,
                hasSource: Boolean(parseFidelityPdfMapping(v.pdf_mapping_json)),
            });
        }
    }

    const { data: formDefs } = await supabase
        .from("form_definitions")
        .select("id, name")
        .eq("org_id", ctx.orgId)
        .in("id", formIds.length > 0 ? formIds : ["00000000-0000-0000-0000-000000000000"]);
    const formNameById = new Map((formDefs ?? []).map((f) => [f.id as string, (f.name as string) ?? ""]));

    // --- the documents behind "read & acknowledge" steps ----------------------------------------
    const ackDocIds = [
        ...new Set(
            rows
                .map((r) => readPacketStepConfig(r.metadata).acknowledgmentDocumentId)
                .filter((v): v is string => Boolean(v)),
        ),
    ];
    const docById = new Map<string, { title: string | null; pageCount: number | null }>();
    if (ackDocIds.length > 0) {
        const { data: docs } = await supabase
            .from("documents")
            .select("id, title, original_filename, metadata")
            .eq("org_id", ctx.orgId)
            .in("id", ackDocIds);
        for (const d of (docs ?? []) as Array<{
            id: string;
            title: string | null;
            original_filename: string | null;
            metadata: unknown;
        }>) {
            const meta = d.metadata && typeof d.metadata === "object" ? (d.metadata as Record<string, unknown>) : {};
            const pages = typeof meta.page_count === "number" && meta.page_count > 0 ? meta.page_count : null;
            docById.set(d.id, { title: deriveDocumentDisplayName(d.title, d.original_filename), pageCount: pages });
        }
    }

    const stepInputs: StepInput[] = rows.map((row) => {
        const config = readPacketStepConfig(row.metadata);
        const label = config.label?.trim() || "";

        if (config.kind === "document_acknowledgment") {
            const doc = config.acknowledgmentDocumentId ? docById.get(config.acknowledgmentDocumentId) : undefined;
            return {
                kind: "document_acknowledgment",
                sequence: row.sequence_index,
                title: label || "Read & acknowledge",
                documentTitle: doc?.title ?? null,
                pageCount: doc?.pageCount ?? null,
                requiresSignature: config.requiresSignature,
            };
        }
        if (config.kind === "document_upload") {
            return {
                kind: "document_upload",
                sequence: row.sequence_index,
                title: label || "Upload a document",
                documentTypeKey: config.documentTypeKey || null,
                instructions: config.instructions || null,
            };
        }

        const published = row.form_definition_id ? publishedSchemaByForm.get(row.form_definition_id) : undefined;
        return {
            kind: "form",
            sequence: row.sequence_index,
            title: label || (row.form_definition_id ? formNameById.get(row.form_definition_id) || "Collect information" : "Collect information"),
            questions: summarizeFormQuestions(published?.schema ?? null),
            published: Boolean(published),
            hasSourceDocument: Boolean(published?.hasSource),
        };
    });

    const steps = stepInputs.map(describeStep);

    // --- where this packet is used ---------------------------------------------------------------
    const usage = await findPacketUsage(supabase, ctx.orgId, packetDefId);

    return jsonData({
        steps: steps.map((s, i) => ({
            ...s,
            /** The Form a "collect information" step configures, so the card can open its editor. */
            form_definition_id: stepInputs[i].kind === "form" ? rows[i]?.form_definition_id ?? null : null,
            acknowledgment_document_id:
                stepInputs[i].kind === "document_acknowledgment"
                    ? readPacketStepConfig(rows[i]?.metadata).acknowledgmentDocumentId || null
                    : null,
        })),
        familyExperience: familyExperienceLines(steps),
        readiness: packetReadinessRows(steps),
        ready: packetIsReady(steps),
        usage,
    });
}

/**
 * Which process stage requires this packet.
 *
 * Read per department because that is where a Business Process lives; the draft is overlaid on the
 * publication exactly as the builder does, so a requirement an administrator has saved but not yet
 * published is reported as configured-but-unpublished rather than absent.
 */
async function findPacketUsage(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    packetDefId: string,
): Promise<PacketUsage[]> {
    const { data: departments } = await supabase.from("departments").select("id, metadata").eq("org_id", orgId);
    const out: PacketUsage[] = [];

    for (const dept of (departments ?? []) as Array<{ id: string; metadata: unknown }>) {
        const metadata = dept.metadata && typeof dept.metadata === "object" ? (dept.metadata as Record<string, unknown>) : {};
        const publishedIds = collectPacketRequirementIds(metadata);

        let draftMetadata: Record<string, unknown> = metadata;
        try {
            const editorState = await loadBusinessProcessEditorState(supabase, {
                orgId,
                departmentId: dept.id,
                readOnly: true,
            });
            if (editorState) draftMetadata = { ...metadata, [LIFECYCLE_BUILDER_METADATA_KEY]: editorState.draft_payload };
        } catch (e) {
            // A department with no draft is the ordinary case; a FAILURE to read one is not, and
            // silently falling back to the publication would report a configured packet as unused.
            console.warn("[packet-experience] draft read failed", { departmentId: dept.id, error: String(e) });
        }
        for (const hit of collectPacketRequirements(draftMetadata, packetDefId)) {
            out.push({ ...hit, published: publishedIds.has(`${hit.stageName}:${packetDefId}`) });
        }
    }

    return out;
}

function collectPacketRequirements(
    metadata: Record<string, unknown>,
    packetDefId: string,
): Array<Omit<PacketUsage, "published">> {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = activeLifecycleProcess(builder);
    if (!process) return [];

    const out: Array<Omit<PacketUsage, "published">> = [];
    for (const stage of process.stages ?? []) {
        for (const requirement of stage.requirements_v1?.requirements ?? []) {
            if (requirement.ref.kind !== "packet" || requirement.ref.packet_definition_id !== packetDefId) continue;
            out.push({
                processName: process.name || "Business Process",
                stageName: stage.label || stage.key,
                level: requirement.level,
                blocking: requirement.enforcement === "blocking",
            });
        }
    }
    return out;
}

/** The same scan against the publication, keyed so a draft hit can say whether it is published. */
function collectPacketRequirementIds(metadata: Record<string, unknown>): Set<string> {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = activeLifecycleProcess(builder);
    const keys = new Set<string>();
    if (!process) return keys;
    for (const stage of process.stages ?? []) {
        for (const requirement of stage.requirements_v1?.requirements ?? []) {
            if (requirement.ref.kind !== "packet") continue;
            keys.add(`${stage.label || stage.key}:${requirement.ref.packet_definition_id}`);
        }
    }
    return keys;
}
