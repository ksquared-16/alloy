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
import { sharedValuesToFieldIds } from "@/lib/forms/packets/sharedValuesToFieldIds";
import { validateFormSchema } from "@/lib/forms/schema";

export type ParticipantDocumentRenderResult =
    | {
          readonly ok: true;
          readonly bytes: Uint8Array;
          readonly mapping: FidelityPdfMapping;
          readonly fillReport: { applied: string[]; missed: string[] };
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
async function resolveActiveArtifact(
    supabase: SupabaseClient,
    input: { orgId: string; sessionId: string },
): Promise<
    | {
          ok: true;
          envelope: { schemaJson: unknown; pdfMappingJson: unknown | null };
          formSubmissionId: string | null;
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
        .select("form_definition_id")
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

    return { ok: true, envelope, formSubmissionId: row.form_submission_id ?? null };
}

export async function renderParticipantEnrollmentDocument(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly sessionId: string;
        /** Injected clock — the engine stamps PDF dates, and determinism keeps output hashable. */
        readonly nowIso: string;
    },
): Promise<ParticipantDocumentRenderResult> {
    const artifact = await resolveActiveArtifact(supabase, { orgId: input.orgId, sessionId: input.sessionId });
    if (!artifact.ok) return { ok: false, code: "unavailable", detail: artifact.detail };

    const mapping = parseFidelityPdfMapping(artifact.envelope.pdfMappingJson);
    if (!mapping) {
        // Not an error: most versions have no original document, and the caller falls back to the
        // compiled semantic review.
        return { ok: false, code: "no_document", detail: "This version carries no original document." };
    }

    let schema;
    try {
        schema = validateFormSchema(artifact.envelope.schemaJson);
    } catch {
        return { ok: false, code: "unavailable", detail: "Pinned schema invalid." };
    }

    const { data: sessionRow } = await supabase
        .from("form_packet_sessions")
        .select("shared_values, process_instance_id")
        .eq("id", input.sessionId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (!sessionRow) return { ok: false, code: "unavailable", detail: "Session not found." };

    let draftValues: Record<string, unknown> = {};
    if (artifact.formSubmissionId) {
        const { data: sub } = await supabase
            .from("form_submissions")
            .select("payload")
            .eq("org_id", input.orgId)
            .eq("id", artifact.formSubmissionId)
            .maybeSingle();
        const payload = (sub as { payload?: { values?: Record<string, unknown> } } | null)?.payload;
        draftValues = (payload?.values ?? {}) as Record<string, unknown>;
    }

    const prefill = await participantPrefillValues(
        supabase,
        input.orgId,
        sessionRow as { shared_values?: unknown; process_instance_id?: string | null },
    );
    const values: Record<string, unknown> = {
        ...draftValues,
        ...sharedValuesToFieldIds(schema, prefill),
    };

    const source = await resolveFidelitySourceBytes(supabase, input.orgId, mapping);
    if (!source.ok) return { ok: false, code: "unavailable", detail: source.detail };

    const filled = await fillPdfWithFidelity({
        sourcePdf: source.bytes,
        fieldValues: fidelityFieldValues(mapping, values),
        documentId: source.sourceRef,
        now: input.nowIso,
    });

    return { ok: true, bytes: filled.bytes, mapping, fillReport: { applied: filled.applied, missed: filled.missed } };
}
