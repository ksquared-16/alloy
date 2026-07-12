/**
 * C1 — Public form identity resolution shadow mode (non-authoritative).
 *
 * Runs alongside legacy applyFormIntakeSafe. Never mutates persons/customers/children/opportunities.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplyFormIntakeSafeResult } from "@/lib/forms/intake/applyFormIntakeSafe";
import type { FormIntakeMeta } from "@/lib/forms/intake/formLeadCaptureTypes";
import { makeProcessingCaseDbDeps } from "@/lib/pos/processingCase/processingCaseDb";
import { openProcessingCaseFromSource } from "@/lib/pos/processingCase/openProcessingCaseFromSource";
import { runCanonicalIdentityResolution } from "./canonicalResolutionEngine";
import { isProcessingShadowFormsEnabled } from "./featureFlags";
import {
    buildHouseholdFromFormIntakeMeta,
    extractFactsFromFormIntakeMeta,
    formIntakeLocationId,
    formSubmissionIdempotencyKey,
} from "./formIntakeShadowHelpers";
import { stableGenerationIdFromKey } from "./processingFactsDb";
import { buildShadowComparisonRecord, type ShadowComparisonRecord } from "./shadowComparison";

export type FormIdentityShadowResult = {
    skipped: boolean;
    reason?: string;
    processingCaseId?: string;
    comparison?: ShadowComparisonRecord;
    generationId?: string;
};

async function findExistingShadowComparison(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string,
    submissionId: string,
): Promise<ShadowComparisonRecord | null> {
    const { data, error } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("id", caseId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    const meta = (data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const shadow = meta.identity_shadow as Record<string, unknown> | undefined;
    if (!shadow || shadow.submission_id !== submissionId) return null;
    return shadow.comparison as ShadowComparisonRecord;
}

async function persistShadowComparison(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        caseId: string;
        submissionId: string;
        comparison: ShadowComparisonRecord;
        generationId: string;
    },
): Promise<void> {
    const { data: existing, error: readErr } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", input.orgId)
        .eq("id", input.caseId)
        .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const baseMeta = ((existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<
        string,
        unknown
    >;
    const metadata = {
        ...baseMeta,
        identity_shadow: {
            submission_id: input.submissionId,
            generation_id: input.generationId,
            comparison: input.comparison,
            recorded_at: new Date().toISOString(),
        },
    };
    const { error } = await supabase
        .from("processing_cases")
        .update({ metadata })
        .eq("org_id", input.orgId)
        .eq("id", input.caseId);
    if (error) throw new Error(error.message);
}

/**
 * Best-effort shadow identity resolution for eligible public form submissions.
 * Never throws — failures are recorded in comparison.errors.
 */
export async function maybeRunFormIdentityShadowSafe(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        submissionId: string;
        intakeMeta: FormIntakeMeta | null;
        legacyResult: ApplyFormIntakeSafeResult;
        locationId?: string | null;
    },
): Promise<FormIdentityShadowResult> {
    if (!isProcessingShadowFormsEnabled(input.orgId)) {
        return { skipped: true, reason: "feature_disabled" };
    }
    if (!input.intakeMeta) {
        return { skipped: true, reason: "no_intake_meta" };
    }

    const started = Date.now();
    const errors: string[] = [];

    try {
        const deps = makeProcessingCaseDbDeps(supabase);
        const opened = await openProcessingCaseFromSource(deps, {
            orgId: input.orgId,
            sourceKind: "form_submission",
            sourceId: input.submissionId,
        });

        const existingComparison = await findExistingShadowComparison(
            supabase,
            input.orgId,
            opened.processingCaseId,
            input.submissionId,
        );
        if (existingComparison) {
            return {
                skipped: false,
                processingCaseId: opened.processingCaseId,
                comparison: existingComparison,
                reason: "idempotent_replay",
            };
        }

        const generationId = stableGenerationIdFromKey(formSubmissionIdempotencyKey(input.submissionId));
        const household = buildHouseholdFromFormIntakeMeta(input.intakeMeta, input.submissionId);
        const facts = extractFactsFromFormIntakeMeta(input.intakeMeta, input.submissionId);

        const resolution = await runCanonicalIdentityResolution({
            supabase,
            orgId: input.orgId,
            caseId: opened.processingCaseId,
            sourceKind: "form_submission",
            sourceRefId: input.submissionId,
            household,
            locationId: input.locationId ?? formIntakeLocationId(input.intakeMeta),
            facts,
            generationId,
            forcePersistFacts: true,
            forcePersistResolutions: true,
        });

        const comparison = buildShadowComparisonRecord({
            legacy: input.legacyResult,
            resolution,
            durationMs: Date.now() - started,
            errors,
        });

        await persistShadowComparison(supabase, {
            orgId: input.orgId,
            caseId: opened.processingCaseId,
            submissionId: input.submissionId,
            comparison,
            generationId,
        });

        return {
            skipped: false,
            processingCaseId: opened.processingCaseId,
            comparison,
            generationId,
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(msg.slice(0, 500));
        const comparison = buildShadowComparisonRecord({
            legacy: input.legacyResult,
            resolution: {
                generationId: stableGenerationIdFromKey(formSubmissionIdempotencyKey(input.submissionId)),
                inputFactsHash: "",
                intakeResult: {
                    source_kind: "form_submission",
                    candidates: [],
                    proposals: [],
                    summary: {
                        auto_link_count: 0,
                        review_required_count: 0,
                        create_new_count: 0,
                        conflict_count: 0,
                    },
                },
                graph: { parents: [], children: [], household: [], leads: [], graph: { orgId: input.orgId, householdRef: "", parentCandidates: [], childCandidates: [] } },
                resolutionRows: [],
                factsPersisted: false,
                resolutionsPersisted: false,
            },
            durationMs: Date.now() - started,
            errors,
        });
        return { skipped: false, comparison, reason: "shadow_error" };
    }
}
