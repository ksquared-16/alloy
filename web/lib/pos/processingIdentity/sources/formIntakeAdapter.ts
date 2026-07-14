/**
 * D5 — Public form canonical Processing intake adapter.
 *
 * Opens/reuses a Processing Case, persists facts/evidence, runs identity resolution.
 * Never creates identity-bearing CRM records — commit occurs through operator review.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import type { FormIntakeMeta } from "@/lib/forms/intake/formLeadCaptureTypes";
import { makeProcessingCaseDbDeps, dbFindPrimaryCaseSourceRowId } from "@/lib/pos/processingCase/processingCaseDb";
import { openProcessingCaseFromSource } from "@/lib/pos/processingCase/openProcessingCaseFromSource";
import { runCanonicalIdentityResolution } from "../canonicalResolutionEngine";
import {
    buildHouseholdFromFormIntakeMeta,
    extractFactsFromFormIntakeMeta,
    formIntakeLocationId,
} from "../formIntakeShadowHelpers";

export type IngestPublicFormInput = {
    orgId: string;
    submissionId: string;
    formDefinitionId: string;
    intakeMeta: FormIntakeMeta;
    payload: FormPayload;
    linkMetadata?: Record<string, unknown>;
};

export type IngestPublicFormResult =
    | { ok: true; processingCaseId: string; created: boolean }
    | { ok: false; error: string };

/** Canonical public-form intake — one case per submission, no CRM identity writes. */
export async function ingestPublicFormThroughProcessing(
    supabase: SupabaseClient,
    input: IngestPublicFormInput,
): Promise<IngestPublicFormResult> {
    try {
        const deps = makeProcessingCaseDbDeps(supabase);
        const opened = await openProcessingCaseFromSource(deps, {
            orgId: input.orgId,
            sourceKind: "form_submission",
            sourceId: input.submissionId,
            caseType: "form_submission",
        });

        const household = buildHouseholdFromFormIntakeMeta(input.intakeMeta, input.submissionId);
        const facts = extractFactsFromFormIntakeMeta(input.intakeMeta, input.submissionId);
        const locationId = formIntakeLocationId(input.intakeMeta);

        const caseSourceRowId = await dbFindPrimaryCaseSourceRowId(supabase, {
            orgId: input.orgId,
            sourceKind: "form_submission",
            sourceId: input.submissionId,
        });
        if (!caseSourceRowId) {
            return { ok: false, error: "form_submission processing source row missing" };
        }

        await supabase
            .from("processing_cases")
            .update({
                metadata: {
                    form_submission_id: input.submissionId,
                    form_definition_id: input.formDefinitionId,
                    intake_meta: input.intakeMeta,
                    payload_snapshot: input.payload,
                    link_metadata: input.linkMetadata ?? {},
                    source_adapter: "public_form_v1",
                    intake_authority: "processing",
                },
                status: "needs_resolution",
                status_changed_at: new Date().toISOString(),
            })
            .eq("org_id", input.orgId)
            .eq("id", opened.processingCaseId);

        await runCanonicalIdentityResolution({
            supabase,
            orgId: input.orgId,
            caseId: opened.processingCaseId,
            sourceId: caseSourceRowId,
            sourceKind: "form_submission",
            sourceRefId: input.submissionId,
            household,
            locationId,
            facts,
        });

        return { ok: true, processingCaseId: opened.processingCaseId, created: opened.created };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "form_processing_intake_failed" };
    }
}
