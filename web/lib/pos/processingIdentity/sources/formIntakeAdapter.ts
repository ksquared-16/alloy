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
import { readStoredOperationalIntent } from "@/lib/forms/operationalIntentTemplates";
import { resolveCaseTitle } from "@/lib/pos/caseTitlePresentation";
import { intentPurposeLabel } from "@/lib/pos/decisionPresentation";
import { REQUESTED_TOUR_METADATA_KEY, type RequestedTourRecord } from "@/lib/tours/publicCalendar/requestedTour";
import {
    INTAKE_MARKETING_CONSENT_METADATA_KEY,
    type IntakeMarketingConsentRecord,
} from "@/lib/communications/preferences/intakeMarketingConsentRecord";

export type IngestPublicFormInput = {
    orgId: string;
    submissionId: string;
    formDefinitionId: string;
    intakeMeta: FormIntakeMeta;
    payload: FormPayload;
    linkMetadata?: Record<string, unknown>;
    /**
     * S7 — a time the family picked on the school's public tour calendar. Pending intent on the
     * case: no booking, no Opportunity, no message. Approval resolves it.
     */
    requestedTour?: RequestedTourRecord | null;
    /**
     * S7 × C1 — the family's optional marketing-consent answer, as evidence. Not a preference until
     * Approve commits it for the resolved person.
     */
    marketingConsent?: IntakeMarketingConsentRecord | null;
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

        // Load the source form once for the routing/naming metadata that rides onto the case:
        //   • admin_category → queue folder routing (keyword match is the fallback)
        //   • case title (name + purpose) from the form's configured title template + intent
        let adminCategory: string | null = null;
        let caseTitle: string | null = null;
        {
            const { data: formRow } = await supabase
                .from("form_definitions")
                .select("name, metadata")
                .eq("id", input.formDefinitionId)
                .maybeSingle();
            const form = formRow as { name?: string | null; metadata?: Record<string, unknown> | null } | null;
            const meta = form?.metadata ?? {};
            const rawCat = meta.admin_category;
            if (typeof rawCat === "string" && rawCat.trim()) adminCategory = rawCat.trim().toLowerCase();

            const intent = readStoredOperationalIntent(meta);
            const g = input.intakeMeta.guardian ?? null;
            const child0 = input.intakeMeta.children?.[0] ?? null;
            const personName = [g?.first_name, g?.last_name].filter(Boolean).join(" ").trim() || null;
            const childName = [child0?.first_name, child0?.last_name].filter(Boolean).join(" ").trim() || null;
            const template = typeof meta.case_title_template === "string" ? meta.case_title_template : null;
            caseTitle = resolveCaseTitle({
                template,
                tokens: {
                    person_name: personName,
                    child_name: childName,
                    form_name: form?.name ?? null,
                    purpose: intentPurposeLabel(intent),
                },
            });
        }

        const metadataWrite = await supabase
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
                    ...(adminCategory ? { admin_category: adminCategory } : {}),
                    ...(caseTitle ? { case_title: caseTitle } : {}),
                    ...(input.requestedTour ? { [REQUESTED_TOUR_METADATA_KEY]: input.requestedTour } : {}),
                    ...(input.marketingConsent ? { [INTAKE_MARKETING_CONSENT_METADATA_KEY]: input.marketingConsent } : {}),
                },
                status: "needs_resolution",
                status_changed_at: new Date().toISOString(),
            })
            .eq("org_id", input.orgId)
            .eq("id", opened.processingCaseId);
        // A requested tour that did not reach the case would be silently lost — the family was told
        // their request was received. Fail the intake instead, so the submission stays a retryable draft.
        const metadataWriteError = (metadataWrite as { error?: { message?: string } | null } | null | undefined)?.error;
        if (input.requestedTour && metadataWriteError) {
            return { ok: false, error: `requested tour not recorded: ${metadataWriteError.message ?? "write failed"}` };
        }
        // Same for a consent answer the family gave: never drop it while telling them it was received.
        if (input.marketingConsent && metadataWriteError) {
            return { ok: false, error: `marketing consent not recorded: ${metadataWriteError.message ?? "write failed"}` };
        }

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
