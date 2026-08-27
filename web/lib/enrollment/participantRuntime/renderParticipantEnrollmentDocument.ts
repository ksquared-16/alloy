/**
 * Render the participant's ORIGINAL enrollment document, filled with what has been resolved.
 *
 * This is the presentation half of "I filled out your paperwork": the pinned Form version's
 * `fidelity_v1` mapping names the source document and where each semantic value shows on it; the
 * fidelity engine fills those locations while preserving the document's own layout. Nothing here is
 * a value authority — values come from the same merged view every participant surface uses, and a
 * regenerate after an edit is just this function reading newer state.
 *
 * ## Value precedence (one vocabulary, deliberately reused)
 *
 *   canonical record  ⊂  session shared values          — `participantPrefillValues` (the owner)
 *   → projected onto field ids                          — `sharedValuesToFieldIds` (the owner)
 *   ⊂ the draft submission's own values                 — artifact-specific answers typed below
 *
 * For a BOUND field the shared projection wins over the draft copy: at review, a bound fact is
 * edited only through the shared-value command, so the shared namespace is its freshest truth and
 * the draft may lag one PATCH behind. Artifact-specific fields exist only in the draft.
 *
 * ## D-94
 *
 * Everything is read through the session's pin: the active item names the pinned version, the
 * version's mapping names the document AND its sha256, and `resolveFidelitySourceBytes` refuses
 * drifted bytes. Republishing the Form or replacing the upload cannot change what an in-flight
 * session renders.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fillPdfWithFidelity } from "@/lib/forms/pdf/generation/fidelityEngine";
import {
    fidelityFieldValues,
    parseFidelityPdfMapping,
    resolveFidelitySourceBytes,
    type FidelityPdfMapping,
} from "@/lib/forms/pdf/fidelityMappingContract";
import { loadPublishedFormEnvelope } from "@/lib/public/forms/loadPublishedFormEnvelope";
import { participantPrefillValues } from "@/lib/public/forms/resolvePublicFormEmbedContext";
import { processScopedAnswersToFieldIds, sharedValuesToFieldIds } from "@/lib/forms/packets/sharedValuesToFieldIds";
import { validateFormSchema } from "@/lib/forms/schema";
import { composeGeneratedDocument } from "@/lib/forms/pdf/generation/generatedDocumentComposer";
import { resolveFormDerivedValues } from "@/lib/forms/derived/resolveFormDerivedValues";
import { PDFDocument } from "pdf-lib";
import { downloadDocumentBytesSafe } from "@/lib/pos/processingCase/structure/documentBytes";

/** Page count of rendered bytes — the unified contract reports it for either engine. */
async function pdfPageCount(bytes: Uint8Array): Promise<number> {
    try {
        return (await PDFDocument.load(bytes)).getPageCount();
    } catch {
        return 1;
    }
}

export type ParticipantDocumentRenderResult =
    | {
          readonly ok: true;
          readonly bytes: Uint8Array;
          /** Which engine produced these bytes. Chosen once, here, at the artifact boundary. */
          readonly renderer: "source_fidelity" | "generated_document";
          /** What makes this rendering reproducible: source bytes for one, layout for the other. */
          readonly renderIdentity: string;
          readonly pageCount: number;
          readonly signaturePlacements: readonly { field_id: string; page: number; x: number; y: number; width: number; height: number }[];
          /** True only when the parent is looking at the school's own document. */
          readonly isSourceReplica: boolean;
          readonly mapping: FidelityPdfMapping | null;
          readonly fillReport: { applied: string[]; missed: string[] } | null;
      }
    | { readonly ok: false; readonly code: "no_document" | "unavailable"; readonly detail: string };

type ActiveItemRow = {
    packet_item_id?: string;
    resolved_form_definition_version_id?: string | null;
    form_submission_id?: string | null;
};

/**
 * Resolve the session's active artifact context — the SAME reads the edit route performs, shaped
 * for rendering: the pinned envelope, plus the draft submission id when one exists.
 */
/**
 * The artifact this session is on, with its pinned schema.
 *
 * Exported because it is the ONE place that answers "which document is the parent working on right
 * now" — the upload route needs the same answer, and a second derivation of it would be a second
 * chance to disagree with D-94's pinning.
 */
export async function resolveActiveArtifact(
    supabase: SupabaseClient,
    input: { orgId: string; sessionId: string },
): Promise<
    | {
          ok: true;
          envelope: { schemaJson: unknown; pdfMappingJson: unknown | null };
          formSubmissionId: string | null;
          /** Which Form this artifact is — the home of any process-scoped answer it carries. */
          formDefinitionId: string;
          /** D-94: the version this session reviews, and the provenance a composed record carries. */
          versionId: string | null;
          sourceDocumentId: string | null;
          sourceSha256: string | null;
          sourceTitle: string | null;
      }
    | { ok: false; detail: string }
> {
    const { data: item } = await supabase
        .from("form_packet_session_items")
        .select("packet_item_id, resolved_form_definition_version_id, form_submission_id")
        .eq("org_id", input.orgId)
        .eq("packet_session_id", input.sessionId)
        .eq("status", "active")
        .maybeSingle();
    const row = item as ActiveItemRow | null;
    if (!row?.packet_item_id) return { ok: false, detail: "No active artifact." };

    const { data: packetItem } = await supabase
        .from("form_packet_items")
        .select("form_definition_id, metadata")
        .eq("org_id", input.orgId)
        .eq("id", row.packet_item_id)
        .maybeSingle();
    const formDefinitionId = (packetItem as { form_definition_id?: string } | null)?.form_definition_id;
    if (!formDefinitionId) return { ok: false, detail: "Artifact definition not found." };

    const envelope = await loadPublishedFormEnvelope(
        supabase,
        input.orgId,
        formDefinitionId,
        row.resolved_form_definition_version_id ?? null,
    );
    if (!envelope) return { ok: false, detail: "Pinned version unavailable." };

    /*
     * Provenance for a COMPOSED record.
     *
     * A filled artifact pins its source through the mapping's sha; a composed one has no mapping, so
     * the document itself must carry where it came from — otherwise the completed record could be
     * mistaken for something Alloy invented rather than something a school asked.
     */
    const { data: sourceDoc } = await supabase
        .from("documents")
        .select("id, title, file_name, checksum_sha256")
        .eq("org_id", input.orgId)
        .eq("id", (packetItem as { metadata?: { source_document_id?: string } } | null)?.metadata?.source_document_id ?? "")
        .maybeSingle();
    const doc = sourceDoc as { id?: string; title?: string; file_name?: string; checksum_sha256?: string } | null;

    return {
        ok: true,
        envelope,
        formSubmissionId: row.form_submission_id ?? null,
        formDefinitionId,
        versionId: row.resolved_form_definition_version_id ?? null,
        sourceDocumentId: doc?.id ?? null,
        sourceSha256: doc?.checksum_sha256 ?? null,
        sourceTitle: doc?.title ?? doc?.file_name ?? null,
    };
}

/**
 * The Forms signature payload, as marks a composer can draw.
 *
 * `validateSubmission` already fixes the shape — drawn carries `drawn_document_id`, typed carries
 * `typed_full_name`, and the two are exclusive — so this reads it and fetches the asset bytes. An
 * asset that cannot be read yields no mark, which leaves the line empty rather than substituting
 * something the participant did not make.
 */
async function composedSignatureMarks(
    supabase: SupabaseClient,
    orgId: string,
    signatures: Record<string, unknown> | undefined,
): Promise<Record<string, { drawnPng?: Uint8Array | null; typedFullName?: string | null }>> {
    const out: Record<string, { drawnPng?: Uint8Array | null; typedFullName?: string | null }> = {};
    if (!signatures || typeof signatures !== "object") return out;
    for (const [fieldId, raw] of Object.entries(signatures)) {
        const entry = raw as { kind?: string; drawn_document_id?: string; typed_full_name?: string } | null;
        if (!entry || typeof entry !== "object") continue;
        if (entry.kind === "drawn" && typeof entry.drawn_document_id === "string" && entry.drawn_document_id) {
            const asset = await downloadDocumentBytesSafe(supabase, { orgId, documentId: entry.drawn_document_id });
            out[fieldId] = { drawnPng: asset?.bytes ?? null };
            continue;
        }
        if (entry.kind === "typed" && typeof entry.typed_full_name === "string") {
            out[fieldId] = { typedFullName: entry.typed_full_name };
        }
    }
    return out;
}

export async function renderParticipantEnrollmentDocument(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly sessionId: string;
        /** Injected clock — the engine stamps PDF dates, and determinism keeps output hashable. */
        readonly nowIso: string;
        /** The organisation's zone, for derived execution dates. */
        readonly timeZone?: string;
    },
): Promise<ParticipantDocumentRenderResult> {
    // The artifact chain and the session row are independent — one wave, not two.
    const [artifact, sessionResult] = await Promise.all([
        resolveActiveArtifact(supabase, { orgId: input.orgId, sessionId: input.sessionId }),
        supabase
            .from("form_packet_sessions")
            .select("shared_values, process_instance_id")
            .eq("id", input.sessionId)
            .eq("org_id", input.orgId)
            .maybeSingle(),
    ]);
    if (!artifact.ok) return { ok: false, code: "unavailable", detail: artifact.detail };

    /*
     * ONE CHOICE, MADE HERE.
     *
     * A mapping means the source is a real form with real boxes, so it is FILLED. No mapping means
     * the source was a hosted form with no placements to recover, so the completed record is
     * COMPOSED. This used to be where the parent fell back to compiled HTML — a null mapping read
     * as "we have nothing to show you", when it actually means "this artifact is generated".
     * Everything downstream now receives a real document either way.
     */
    const mapping = parseFidelityPdfMapping(artifact.envelope.pdfMappingJson);

    let schema;
    try {
        schema = validateFormSchema(artifact.envelope.schemaJson);
    } catch {
        return { ok: false, code: "unavailable", detail: "Pinned schema invalid." };
    }

    const sessionRow = sessionResult.data;
    if (!sessionRow) return { ok: false, code: "unavailable", detail: "Session not found." };

    // Draft, canonical prefill and the sha-pinned source bytes have no ordering between them.
    const [draftResult, prefill, source] = await Promise.all([
        artifact.formSubmissionId
            ? supabase
                  .from("form_submissions")
                  .select("payload")
                  .eq("org_id", input.orgId)
                  .eq("id", artifact.formSubmissionId)
                  .maybeSingle()
            : Promise.resolve({ data: null }),
        participantPrefillValues(
            supabase,
            input.orgId,
            sessionRow as { shared_values?: unknown; process_instance_id?: string | null },
        ),
        mapping ? resolveFidelitySourceBytes(supabase, input.orgId, mapping) : Promise.resolve(null),
    ]);
    const payload = (draftResult.data as {
        payload?: { values?: Record<string, unknown>; signatures?: Record<string, unknown> };
    } | null)?.payload;
    const draftValues = (payload?.values ?? {}) as Record<string, unknown>;
    /*
     * THE DRAFT IS THE ARTIFACT'S OWN CURRENT STATE, AND IT WINS.
     *
     * Prefill used to be spread OVER the draft, so a correction made at the review surface never
     * reached the document: the parent retyped "Parent/Guardian #2 Name", the draft stored it, and
     * the render put the conversation's older answer back on the page. The correction was real and
     * invisible, which is the worst of the three possible outcomes.
     *
     * Prefill's job is to fill what this artifact does not have — a fact the parent settled in
     * conversation, a value from the canonical record. Where the artifact already holds a value,
     * that value is the answer, because it is the one the parent last gave.
     *
     * A process-scoped answer belongs to exactly one destination on exactly this Form. It fills that
     * box and nothing else — the reason it can be collected without becoming canonical.
     */
    const values: Record<string, unknown> = { ...draftValues };
    const prefilled = {
        ...sharedValuesToFieldIds(schema, prefill),
        ...processScopedAnswersToFieldIds(schema, prefill, artifact.formDefinitionId),
    };
    for (const [fieldId, value] of Object.entries(prefilled)) {
        const held = values[fieldId];
        const alreadyAnswered = typeof held === "string" ? held.trim().length > 0 : held != null;
        if (!alreadyAnswered) values[fieldId] = value;
    }
    /*
     * Derived destinations are filled at render — but never OVER a value that was already recorded.
     *
     * Before submission there is nothing stored and today's date is the honest preview: the artifact
     * has not been executed yet. After submission the submitted payload holds the day the family
     * actually signed, and recomputing would quietly restamp a completed document to whenever
     * someone last opened it. "Today's Date" on a signed form means the day it was signed.
     */
    const derived = resolveFormDerivedValues(schema, values, {
        executedAtIso: input.nowIso,
        timeZone: input.timeZone ?? "UTC",
    });
    for (const [fieldId, value] of Object.entries(derived)) {
        const held = values[fieldId];
        if (typeof held === "string" && held.trim()) continue;
        values[fieldId] = value;
    }

    if (!mapping) {
        /*
         * COMPOSED. Alloy's completed record of an intake whose source had no layout to recover:
         * authoritative as what was collected, never presented as a replica of the original.
         */
        /*
         * The marks this composed document already carries.
         *
         * Read from the SAME draft payload the values came from, so the preview a parent sees while
         * signing and the record they finish with are one rendering. The bytes of a drawn mark come
         * from the evidence's own document reference — never re-drawn, never substituted.
         */
        const signatures = await composedSignatureMarks(supabase, input.orgId, payload?.signatures);
        const composed = await composeGeneratedDocument({
            schema,
            values,
            signatures,
            provenance: {
                form_definition_id: artifact.formDefinitionId,
                form_definition_version_id: artifact.versionId ?? "",
                source_document_id: artifact.sourceDocumentId ?? null,
                source_sha256: artifact.sourceSha256 ?? null,
                source_title: artifact.sourceTitle ?? null,
            },
        });
        return {
            ok: true,
            bytes: composed.bytes,
            renderer: "generated_document",
            renderIdentity: composed.composerVersion,
            pageCount: composed.pageCount,
            signaturePlacements: composed.signaturePlacements,
            isSourceReplica: false,
            mapping: null,
            fillReport: null,
        };
    }

    if (!source || !source.ok) return { ok: false, code: "unavailable", detail: source?.detail ?? "Source bytes unavailable." };

    const filled = await fillPdfWithFidelity({
        sourcePdf: source.bytes,
        fieldValues: fidelityFieldValues(mapping, values),
        documentId: source.sourceRef,
        now: input.nowIso,
    });

    return {
        ok: true,
        bytes: filled.bytes,
        renderer: "source_fidelity",
        renderIdentity: mapping.source_sha256,
        pageCount: await pdfPageCount(filled.bytes),
        signaturePlacements: mapping.signature_placements,
        isSourceReplica: true,
        mapping,
        fillReport: { applied: filled.applied, missed: filled.missed },
    };
}
