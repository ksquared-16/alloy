/**
 * Capture the governed judgment for every subject in a COMPLETED resolution
 * generation.
 *
 * ## Timing — the whole point
 *
 * This runs only after `runCanonicalIdentityResolution` has durably persisted
 * every subject row and updated the case status. It reads the persisted rows it
 * is handed; it never observes candidate evaluation in flight, never reads
 * transient state, and never runs on an operator decision path.
 *
 * Capturing at generation time also means the judgment is unambiguously the
 * ENGINE's: `decided_by` is `"engine"` and `provisional` carries no
 * `create_new_override`, because an operator has not acted yet. An operator
 * decision mutates the row later, and that mutation is not a capture trigger.
 *
 * ## Independence
 *
 * Subjects are captured **sequentially, in persisted order** — deterministic,
 * bounded, and no unbounded parallel writes. Each subject is independent: one
 * subject's failure produces its own durable gap and never rolls back another
 * subject's package, and no Trust failure can fail the Processing generation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { IdentityCandidate } from "@/lib/identity";
import {
    captureProcessingIdentitySubjectResolution,
    type IdentityCaptureDeps,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/capture";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "../factMaterialProjection";
import { evaluateSubjectEligibility } from "../operator/identityResolutionEligibility";
import type { ProcessingResolutionRow } from "../processingResolutionsDb";
import { buildProcessingIdentityTrustDecisionMaterial } from "./identityTrustDecisionMaterial";
import { processingIdentitySubjectAdoptionId } from "./identityAdoptionIdentity";
import { toGovernedIdentitySubjectRecommendation } from "./governedIdentitySchema";
import { recordIdentityGovernanceGap } from "./identityGovernanceGapDb";

/** The distinct marker for an identity judgment that was not governed. */
export const IDENTITY_GOVERNANCE_GAP_MARKER = "[trust.identity_governance_gap]";

export type SubjectCaptureStatus =
    | { readonly status: "governed"; readonly subjectRef: string; readonly packageId: string }
    | { readonly status: "already_governed"; readonly subjectRef: string; readonly packageId: string }
    | { readonly status: "not_governed"; readonly subjectRef: string; readonly reason: string; readonly gapId: string }
    /** Both the governed record AND its recovery record were lost. */
    | { readonly status: "gap_unrecordable"; readonly subjectRef: string; readonly reason: string; readonly gapError: string }
    /** The row is not a completed engine judgment; nothing to govern. */
    | { readonly status: "skipped_ineligible"; readonly subjectRef: string; readonly reason: string };

export type GenerationCaptureResult = {
    readonly generationId: string;
    readonly subjects: readonly SubjectCaptureStatus[];
};

export type CaptureGenerationDeps = IdentityCaptureDeps & {
    readonly capture?: typeof captureProcessingIdentitySubjectResolution;
    readonly now?: () => string;
};

/**
 * Whether one persisted row is a completed ENGINE judgment worth governing.
 *
 * A row that an operator has already decided is not engine output, and a row
 * from a different generation is not part of this capture.
 */
function isEligibleForCapture(
    row: ProcessingResolutionRow,
    generationId: string,
): { eligible: true } | { eligible: false; reason: string } {
    if (row.generation_id !== generationId) return { eligible: false, reason: "different_generation" };
    if (row.superseded_by) return { eligible: false, reason: "superseded_row" };
    // Operator decisions are Processing acts, not engine judgments. Capturing
    // one would label a human decision as deterministic output.
    if (row.decided_by === "operator") return { eligible: false, reason: "operator_decision_not_engine_output" };
    if (!row.input_facts_hash) return { eligible: false, reason: "incomplete_generation_no_facts_hash" };
    if (!row.subject_ref) return { eligible: false, reason: "incomplete_generation_no_subject" };
    return { eligible: true };
}

/**
 * Capture every eligible subject of one completed generation.
 *
 * Never throws. The Processing generation has already succeeded and stays
 * successful whatever happens here.
 */
export async function captureIdentityGenerationJudgments(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        caseId: string;
        generationId: string;
        /** The rows the engine just persisted, in persisted order. */
        resolutionRows: readonly ProcessingResolutionRow[];
        deps?: CaptureGenerationDeps;
    },
): Promise<GenerationCaptureResult> {
    const deps = input.deps ?? {};
    const capture = deps.capture ?? captureProcessingIdentitySubjectResolution;
    const now = () => deps.now?.() ?? deps.nowIso ?? new Date().toISOString();

    const subjects: SubjectCaptureStatus[] = [];

    // Sequential and deterministic. This is a recovery-friendly audit path, not
    // a throughput path, and unbounded parallel writes would make the retry
    // evidence unreadable.
    for (const row of input.resolutionRows) {
        const eligibility = isEligibleForCapture(row, input.generationId);
        if (!eligibility.eligible) {
            subjects.push({
                status: "skipped_ineligible",
                subjectRef: row.subject_ref,
                reason: eligibility.reason,
            });
            continue;
        }

        const resolverVersion = row.resolver_version || IDENTITY_RESOLVER_VERSION;
        const adoptionId = processingIdentitySubjectAdoptionId({
            org_id: input.orgId,
            processing_case_id: input.caseId,
            subject_ref: row.subject_ref,
            decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
            input_facts_hash: row.input_facts_hash,
            material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
            identity_resolver_version: resolverVersion,
        });

        const material = buildProcessingIdentityTrustDecisionMaterial({
            orgId: input.orgId,
            processingCaseId: input.caseId,
            subjectRole: row.subject_role,
            eligibility: evaluateSubjectEligibility(row),
            candidates: (row.candidates ?? []) as IdentityCandidate[],
            // At generation time no operator has acted, so there is no override.
            createNewOverride: null,
            inputFactsHash: row.input_facts_hash,
            materialProjectionVersion: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
            identityResolverVersion: resolverVersion,
        });
        const recommendation = toGovernedIdentitySubjectRecommendation(material);

        const result = await capture(
            {
                org_id: input.orgId,
                processing_case_id: input.caseId,
                adoption_id: adoptionId,
                recommendation: recommendation as unknown as Readonly<Record<string, unknown>>,
            },
            deps,
        );

        if (result.status === "governed" || result.status === "already_governed") {
            subjects.push({
                status: result.status,
                subjectRef: row.subject_ref,
                packageId: result.packageId,
            });
            continue;
        }

        // ---- durable, subject-scoped recovery record ------------------------
        try {
            const gap = await recordIdentityGovernanceGap(supabase, {
                orgId: input.orgId,
                caseId: input.caseId,
                nowIso: now(),
                snapshot: {
                    adoption_id: adoptionId,
                    decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
                    subject_ref: row.subject_ref,
                    generation_id: input.generationId,
                    input_facts_hash: row.input_facts_hash,
                    material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
                    identity_resolver_version: resolverVersion,
                    recommendation,
                    failure_class: "trust_capture_failed",
                    failure_reason: result.reason,
                },
            });
            console.warn(
                `${IDENTITY_GOVERNANCE_GAP_MARKER} case=${input.caseId} subject=${row.subject_ref} gap=${gap.id}`,
                `identity judgment persisted but NOT governed; durable gap recorded: ${result.reason}`,
            );
            subjects.push({
                status: "not_governed",
                subjectRef: row.subject_ref,
                reason: result.reason,
                gapId: gap.id,
            });
        } catch (gapError) {
            const gapReason = gapError instanceof Error ? gapError.message : String(gapError);
            // The one branch where BOTH the governed record and its recovery
            // record are lost. `error`, not `warn` — the loudest signal here.
            console.error(
                `${IDENTITY_GOVERNANCE_GAP_MARKER} case=${input.caseId} subject=${row.subject_ref}`,
                `identity judgment persisted but NOT governed and the durable gap FAILED to persist.`,
                `trust=${result.reason} gap_store=${gapReason}`,
            );
            subjects.push({
                status: "gap_unrecordable",
                subjectRef: row.subject_ref,
                reason: result.reason,
                gapError: gapReason,
            });
        }
    }

    return { generationId: input.generationId, subjects };
}
