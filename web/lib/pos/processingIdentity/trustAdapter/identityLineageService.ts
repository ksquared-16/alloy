/**
 * The ONE canonical writer of identity supersession lineage.
 *
 * Every production path that makes a governed identity judgment non-current
 * calls this module. No route, adapter or service constructs a Trust
 * supersession observation itself, and nothing here writes to
 * `trust_decision_observations` directly — it calls the Trust-owned port, which
 * owns the observation.
 *
 * ## Timing is the design
 *
 * Supersession NEVER runs before the replacing authority is durable.
 *
 * ```text
 * direct operator correction
 *   Processing decision durably commits
 *     → re-read the durable row and CONFIRM it decided
 *       → append superseded, referencing the durable resolution
 *
 * replacement engine generation
 *   new generation durably commits
 *     → replacement subject package captured successfully
 *       → append superseded on the prior subject package, naming the new one
 * ```
 *
 * The re-read is not defensive noise. The input a caller hands in describes what
 * it *asked* for; the durable row is what *happened*, and only the second may
 * justify declaring a governed judgment non-current. A row that does not show an
 * operator decision produces no observation at all.
 *
 * ## Finding the prior judgment
 *
 * By exact adoption identity — org, case, subject, class, input facts hash,
 * material projection version, resolver version — never "the latest package for
 * this case". A case carries several subjects and several generations, and
 * superseding the wrong one would be worse than superseding none.
 *
 * When the exact prior identity cannot be resolved to a package, this reports
 * the missing lineage as a durable gap rather than guessing at a neighbour.
 *
 * ## Failure
 *
 * The Processing correction is already authoritative and stays so. This module
 * never throws into its caller and never rolls anything back; a Trust failure
 * becomes a durable, readiness-neutral lineage gap that reconciliation completes
 * later.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import {
    createSupabaseGovernedIdentityLookup,
    type GovernedIdentityLookup,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/capture";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import {
    supersedeGovernedIdentityJudgment,
    type SupersedeIdentityDeps,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/supersede";
import {
    observeProcessingIdentityOperatorReview,
    type ObserveReviewDeps,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/observeOperatorReview";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "../factMaterialProjection";
import {
    findResolutionById,
    listProcessingResolutionsByCase,
    type ProcessingResolutionRow,
} from "../processingResolutionsDb";
import { processingIdentitySubjectAdoptionId } from "./identityAdoptionIdentity";
import {
    classifyOperatorIdentityDecisionEffect,
    type OperatorDecisionClassification,
} from "./classifyOperatorDecisionEffect";
import {
    identitySupersessionReasonForEffect,
    type IdentitySupersessionReason,
} from "./identitySupersessionReasons";
import {
    recordIdentityLineageGap,
    type IdentityLineageFailureClass,
    type IdentityLineageGapSnapshotV1,
} from "./identityLineageGapDb";

/** The distinct marker for lineage that is owed but not yet recorded. */
export const IDENTITY_LINEAGE_GAP_MARKER = "[trust.identity_lineage_gap]";

export type IdentityLineageOutcome =
    /** One supersession observation was appended. */
    | { readonly status: "superseded"; readonly observationId: string; readonly priorPackageId: string }
    /** An equivalent observation already existed. Nothing was appended. */
    | { readonly status: "already_superseded"; readonly observationId: string; readonly priorPackageId: string }
    /**
     * The operator agreed with the engine, or postponed. The package REMAINS
     * CURRENT and stays eligible for execution binding; one `accepted` or
     * `deferred` observation records the review.
     */
    | {
          readonly status: "reviewed";
          readonly observationId: string;
          readonly priorPackageId: string;
          readonly effect: string;
          readonly observationKind: "accepted" | "deferred";
      }
    /** An equivalent review observation already existed. Nothing was appended. */
    | {
          readonly status: "already_reviewed";
          readonly observationId: string;
          readonly priorPackageId: string;
          readonly effect: string;
          readonly observationKind: "accepted" | "deferred";
      }
    /** Nothing to record, and nothing owed. */
    | { readonly status: "no_lineage"; readonly reason: string }
    /** Deterministically refused on a lineage rule. Retrying would refuse again. */
    | { readonly status: "refused"; readonly reason: string }
    /** Not recorded yet. A durable gap carries the owed lineage. */
    | { readonly status: "deferred"; readonly reason: string; readonly gapId: string }
    /** Both the lineage record and its recovery record were lost. */
    | { readonly status: "gap_unrecordable"; readonly reason: string; readonly gapError: string };

export type IdentityLineageDeps = SupersedeIdentityDeps &
    ObserveReviewDeps & {
        readonly lookup?: GovernedIdentityLookup;
        readonly supersede?: typeof supersedeGovernedIdentityJudgment;
        readonly observeReview?: typeof observeProcessingIdentityOperatorReview;
        readonly now?: () => string;
    };

/** The adoption identity of one persisted subject row. The prior judgment's name. */
export function adoptionIdForResolutionRow(
    row: Pick<ProcessingResolutionRow, "org_id" | "case_id" | "subject_ref" | "input_facts_hash" | "resolver_version">,
): string {
    return processingIdentitySubjectAdoptionId({
        org_id: row.org_id,
        processing_case_id: row.case_id,
        subject_ref: row.subject_ref,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        input_facts_hash: row.input_facts_hash,
        material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
        identity_resolver_version: row.resolver_version || IDENTITY_RESOLVER_VERSION,
    });
}

// ---------------------------------------------------------------------------
// Direct operator correction
// ---------------------------------------------------------------------------

/**
 * Record what an operator decision DID to the prior engine judgment.
 *
 * Call AFTER the Processing decision has durably committed. The operator
 * decision itself never becomes a Decision Package: it is a Processing act, and
 * minting a package for it would label a human decision as deterministic
 * reasoning. Only its lifecycle consequence reaches Trust.
 *
 * ## Not every operator decision is a supersession
 *
 * The effect is CLASSIFIED by comparing the durable engine judgment against the
 * durable operator result — never inferred from `decided_by`, which says only
 * that someone acted:
 *
 * ```text
 * agreement, or the engine declined to decide → accepted   (package stays current)
 * the operator postponed                      → deferred   (package stays current)
 * the operator replaced the judgment          → superseded
 * anything unrecognised                       → nothing at all
 * ```
 *
 * A package that stays current stays eligible for Phase 1.7 execution binding,
 * which is what makes the normal reviewed path recordable end to end.
 *
 * Never throws. The decision stays authoritative whatever happens here.
 */
export async function recordOperatorDecisionLifecycle(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        caseId: string;
        resolutionId: string;
        /** Authoritative actor, from server context. Never client-supplied. */
        actorId: string;
        deps?: IdentityLineageDeps;
    },
): Promise<IdentityLineageOutcome> {
    const deps = input.deps ?? {};

    // ---- 1. the durable row, not the caller's copy --------------------------
    let row: ProcessingResolutionRow | null;
    try {
        row = await findResolutionById(supabase, {
            orgId: input.orgId,
            caseId: input.caseId,
            resolutionId: input.resolutionId,
        });
    } catch (e) {
        return { status: "no_lineage", reason: `resolution_read_failed: ${message(e)}` };
    }
    if (!row) return { status: "no_lineage", reason: "resolution_not_found" };

    // The correction must have COMMITTED. Anything else is a request, not a fact.
    if (row.decided_by !== "operator") {
        return { status: "no_lineage", reason: "operator_decision_not_durable" };
    }
    if (!row.input_facts_hash || !row.subject_ref) {
        return { status: "no_lineage", reason: "row_carries_no_adoption_identity" };
    }

    // ---- 2. what did the operator actually DO? ------------------------------
    const classification = classifyOperatorIdentityDecisionEffect(row);
    // The durable Processing decision. An opaque id, never operator prose.
    const processingReference = `processing_resolution:${row.id}`;

    if (classification.observationKind === null) {
        // Fail closed. Guessing would either invent a supersession that did not
        // happen or suppress one that did, and of the two available errors,
        // saying nothing is the one that cannot corrupt a lifecycle.
        return { status: "no_lineage", reason: `unclassified_effect:${classification.effect}` };
    }

    if (classification.observationKind !== "superseded") {
        return appendOperatorReview(supabase, {
            orgId: input.orgId,
            caseId: input.caseId,
            row,
            classification,
            observationKind: classification.observationKind,
            processingReference,
            actorId: input.actorId,
            deps,
        });
    }

    return appendSupersession(supabase, {
        orgId: input.orgId,
        caseId: input.caseId,
        priorRow: row,
        source: "external_authority_decision",
        supersedingPackageId: null,
        supersedingReference: processingReference,
        replacementGenerationId: null,
        reason: identitySupersessionReasonForEffect(classification.effect),
        actorType: "operator",
        actorId: input.actorId,
        deps,
    });
}

/**
 * Backwards-compatible alias.
 *
 * The old name asserted the outcome before classifying it — which is precisely
 * the defect this corrects. Kept so no caller breaks mid-migration.
 *
 * @deprecated Use {@link recordOperatorDecisionLifecycle}.
 */
export const supersedeForOperatorDecision = recordOperatorDecisionLifecycle;

/**
 * Append the review observation for a decision that did NOT replace the
 * judgment, and leave the package current.
 *
 * Structurally parallel to {@link appendSupersession}: same prior-package
 * lookup by exact adoption identity, same durable-gap-on-failure contract, same
 * refusal handling. What differs is only the kind appended and the fact that no
 * lineage claim is made.
 */
async function appendOperatorReview(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        caseId: string;
        row: ProcessingResolutionRow;
        classification: OperatorDecisionClassification;
        observationKind: "accepted" | "deferred";
        processingReference: string;
        actorId: string;
        deps: IdentityLineageDeps;
    },
): Promise<IdentityLineageOutcome> {
    const { deps, row, classification } = input;
    const lookup = deps.lookup ?? createSupabaseGovernedIdentityLookup();
    const observeReview = deps.observeReview ?? observeProcessingIdentityOperatorReview;
    const now = () => deps.now?.() ?? new Date().toISOString();

    const priorAdoptionId = adoptionIdForResolutionRow(row);

    const gapBase = {
        prior_adoption_id: priorAdoptionId,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        subject_ref: row.subject_ref,
        prior_generation_id: row.generation_id,
        supersession_source: "external_authority_decision" as const,
        superseding_package_id: null,
        superseding_reference: input.processingReference,
        replacement_generation_id: null,
        // The review effect, carried in the supersession-reason slot so the gap
        // snapshot stays ONE shape. `observation_kind` is what tells a
        // reconciler which append to replay.
        reason: identitySupersessionReasonForEffect(classification.effect),
        observation_kind: input.observationKind,
        actor_type: "operator" as const,
        actor_id: input.actorId,
    };

    let prior: { contract_id: string; package_id: string } | null;
    try {
        prior = await lookup({ org_id: input.orgId, contract_id: priorAdoptionId });
    } catch (e) {
        return defer(supabase, {
            orgId: input.orgId,
            caseId: input.caseId,
            subjectRef: row.subject_ref,
            priorPackageId: null,
            failureClass: "trust_supersession_failed",
            failureReason: `prior_package_lookup_failed: ${message(e)}`,
            gapBase,
            nowIso: now(),
        });
    }
    if (!prior) {
        // Never governed, or its capture gap is still open. Reconciliation
        // completes this once the package lands.
        return defer(supabase, {
            orgId: input.orgId,
            caseId: input.caseId,
            subjectRef: row.subject_ref,
            priorPackageId: null,
            failureClass: "prior_package_absent",
            failureReason: "no_governed_package_for_prior_adoption_identity",
            gapBase,
            nowIso: now(),
        });
    }

    const result = await observeReview(
        {
            org_id: input.orgId,
            package_id: prior.package_id,
            observation_kind: input.observationKind,
            processing_reference: input.processingReference,
            effect: classification.effect,
            detail: {
                processing_case_id: input.caseId,
                subject_ref: row.subject_ref,
                generation_id: row.generation_id,
                engine_action: classification.engine.action,
                operator_action: classification.operatorAction ?? "none",
            },
            actor_type: "operator",
            actor_id: input.actorId,
            channel: "system",
            correlation_id: input.caseId,
        },
        deps,
    );

    if (result.status === "observed" || result.status === "already_observed") {
        return {
            status: result.status === "observed" ? "reviewed" : "already_reviewed",
            observationId: result.observationId,
            priorPackageId: prior.package_id,
            effect: classification.effect,
            observationKind: input.observationKind,
        };
    }
    if (result.status === "refused") {
        console.warn(
            `${IDENTITY_LINEAGE_GAP_MARKER} case=${input.caseId} subject=${row.subject_ref}`,
            `operator review observation REFUSED and not retried: ${result.reason}`,
        );
        return { status: "refused", reason: result.reason };
    }

    return defer(supabase, {
        orgId: input.orgId,
        caseId: input.caseId,
        subjectRef: row.subject_ref,
        priorPackageId: prior.package_id,
        failureClass: "trust_supersession_failed",
        failureReason: result.reason,
        gapBase,
        nowIso: now(),
    });
}

// ---------------------------------------------------------------------------
// Replacement engine generation
// ---------------------------------------------------------------------------

/**
 * Record that a replacement subject package made an older one non-current.
 *
 * Call only once the replacement package EXISTS. A generation that recomputed
 * but whose capture produced a governance gap supersedes nothing — reconciliation
 * completes that lineage after the package lands.
 *
 * Scoped to one subject: the prior judgment for THIS `subject_ref` and no other.
 * Never throws.
 */
export async function supersedeForReplacementPackage(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        caseId: string;
        subjectRef: string;
        /** The generation that produced the replacement. */
        replacementGenerationId: string;
        /** The replacement package. Its existence is the precondition for this call. */
        replacementPackageId: string;
        deps?: IdentityLineageDeps;
    },
): Promise<IdentityLineageOutcome> {
    const deps = input.deps ?? {};

    let rows: ProcessingResolutionRow[];
    try {
        rows = await listProcessingResolutionsByCase(supabase, input.orgId, input.caseId);
    } catch (e) {
        return { status: "no_lineage", reason: `resolution_read_failed: ${message(e)}` };
    }

    // The most recent row for THIS subject from an EARLIER generation. Ordering
    // by created_at is the same lineage convention `pickLatestResolutionPerSubject`
    // uses, so "prior" means the same thing across Processing.
    const prior = rows
        .filter(
            (r) =>
                r.subject_ref === input.subjectRef &&
                r.generation_id !== input.replacementGenerationId &&
                Boolean(r.input_facts_hash),
        )
        .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0];

    if (!prior) return { status: "no_lineage", reason: "no_prior_generation_for_subject" };

    return appendSupersession(supabase, {
        orgId: input.orgId,
        caseId: input.caseId,
        priorRow: prior,
        source: "replacement_decision_package",
        supersedingPackageId: input.replacementPackageId,
        supersedingReference: null,
        replacementGenerationId: input.replacementGenerationId,
        reason: "replacement_engine_generation",
        actorType: "system",
        actorId: null,
        deps,
    });
}

// ---------------------------------------------------------------------------
// The one shared body
// ---------------------------------------------------------------------------

async function appendSupersession(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        caseId: string;
        priorRow: ProcessingResolutionRow;
        source: "external_authority_decision" | "replacement_decision_package";
        supersedingPackageId: string | null;
        supersedingReference: string | null;
        replacementGenerationId: string | null;
        reason: IdentitySupersessionReason;
        actorType: "operator" | "system";
        actorId: string | null;
        deps: IdentityLineageDeps;
    },
): Promise<IdentityLineageOutcome> {
    const { deps, priorRow } = input;
    const lookup = deps.lookup ?? createSupabaseGovernedIdentityLookup();
    const supersede = deps.supersede ?? supersedeGovernedIdentityJudgment;
    const now = () => deps.now?.() ?? new Date().toISOString();

    const priorAdoptionId = adoptionIdForResolutionRow(priorRow);

    const gapBase = {
        prior_adoption_id: priorAdoptionId,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        subject_ref: priorRow.subject_ref,
        prior_generation_id: priorRow.generation_id,
        supersession_source: input.source,
        superseding_package_id: input.supersedingPackageId,
        superseding_reference: input.supersedingReference,
        replacement_generation_id: input.replacementGenerationId,
        reason: input.reason,
        actor_type: input.actorType,
        actor_id: input.actorId,
    } satisfies Omit<
        IdentityLineageGapSnapshotV1,
        | "lineage_gap_schema_version"
        | "prior_package_id"
        | "failure_class"
        | "failure_reason"
        | "first_failed_at"
        | "last_attempt_at"
        | "retry_count"
        | "observation_id"
    >;

    // ---- 1. the prior GOVERNED judgment, by exact adoption identity ---------
    let prior: { contract_id: string; package_id: string } | null;
    try {
        prior = await lookup({ org_id: input.orgId, contract_id: priorAdoptionId });
    } catch (e) {
        return defer(supabase, {
            ...common(input),
            priorPackageId: null,
            failureClass: "trust_supersession_failed",
            failureReason: `prior_package_lookup_failed: ${message(e)}`,
            gapBase,
            nowIso: now(),
        });
    }

    if (!prior) {
        // The judgment was never governed, or its capture gap is still open.
        // Either way there is nothing to supersede YET — and guessing at a
        // neighbouring package would be worse than waiting. Reconciliation
        // completes this once the package lands.
        return defer(supabase, {
            ...common(input),
            priorPackageId: null,
            failureClass: "prior_package_absent",
            failureReason: "no_governed_package_for_prior_adoption_identity",
            gapBase,
            nowIso: now(),
        });
    }

    // A replacement whose adoption identity equals the prior one is the SAME
    // governed judgment recaptured, not a replacement. Refuse before Trust sees it.
    if (input.supersedingPackageId && input.supersedingPackageId === prior.package_id) {
        return { status: "refused", reason: "identical_adoption_identity" };
    }

    // ---- 2. the Trust-owned port. Processing never writes the observation ---
    const result = await supersede(
        {
            org_id: input.orgId,
            prior_package_id: prior.package_id,
            supersession_source: input.source,
            superseding_package_id: input.supersedingPackageId,
            superseding_reference: input.supersedingReference,
            reason: input.reason,
            actor_type: input.actorType,
            actor_id: input.actorId,
            channel: "system",
            correlation_id: input.caseId,
            context: {
                processing_case_id: input.caseId,
                subject_ref: priorRow.subject_ref,
                prior_generation_id: priorRow.generation_id,
                ...(input.replacementGenerationId
                    ? { replacement_generation_id: input.replacementGenerationId }
                    : {}),
            },
        },
        deps,
    );

    if (result.status === "superseded" || result.status === "already_superseded") {
        return { status: result.status, observationId: result.observationId, priorPackageId: prior.package_id };
    }
    if (result.status === "refused") {
        // Deterministic. A durable gap would queue work that can never succeed.
        console.warn(
            `${IDENTITY_LINEAGE_GAP_MARKER} case=${input.caseId} subject=${priorRow.subject_ref}`,
            `supersession REFUSED and not retried: ${result.reason}`,
        );
        return { status: "refused", reason: result.reason };
    }

    return defer(supabase, {
        ...common(input),
        priorPackageId: prior.package_id,
        failureClass: "trust_supersession_failed",
        failureReason: result.reason,
        gapBase,
        nowIso: now(),
    });
}

function common(input: { orgId: string; caseId: string; priorRow: ProcessingResolutionRow }) {
    return { orgId: input.orgId, caseId: input.caseId, subjectRef: input.priorRow.subject_ref };
}

/** Persist the owed lineage durably, or report that even that was lost. */
async function defer(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        caseId: string;
        subjectRef: string;
        priorPackageId: string | null;
        failureClass: IdentityLineageFailureClass;
        failureReason: string;
        gapBase: Omit<
            IdentityLineageGapSnapshotV1,
            | "lineage_gap_schema_version"
            | "prior_package_id"
            | "failure_class"
            | "failure_reason"
            | "first_failed_at"
            | "last_attempt_at"
            | "retry_count"
            | "observation_id"
        >;
        nowIso: string;
    },
): Promise<IdentityLineageOutcome> {
    try {
        const gap = await recordIdentityLineageGap(supabase, {
            orgId: input.orgId,
            caseId: input.caseId,
            nowIso: input.nowIso,
            snapshot: {
                ...input.gapBase,
                prior_package_id: input.priorPackageId,
                failure_class: input.failureClass,
                failure_reason: input.failureReason,
            },
        });
        console.warn(
            `${IDENTITY_LINEAGE_GAP_MARKER} case=${input.caseId} subject=${input.subjectRef} gap=${gap.id}`,
            `Processing correction is authoritative but its supersession is NOT recorded; durable gap saved: ${input.failureReason}`,
        );
        return { status: "deferred", reason: input.failureReason, gapId: gap.id };
    } catch (gapError) {
        const gapReason = message(gapError);
        // Both the lineage record and its recovery record are lost. `error`, not
        // `warn` — the loudest signal available here.
        console.error(
            `${IDENTITY_LINEAGE_GAP_MARKER} case=${input.caseId} subject=${input.subjectRef}`,
            `supersession NOT recorded and the durable gap FAILED to persist.`,
            `trust=${input.failureReason} gap_store=${gapReason}`,
        );
        return { status: "gap_unrecordable", reason: input.failureReason, gapError: gapReason };
    }
}

function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
