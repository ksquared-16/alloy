/**
 * The ONE canonical writer of Processing execution evidence into Trust.
 *
 * ## Direction, and the reason it is one-way
 *
 * ```text
 * authoritative Processing commit result → bounded Trust execution evidence
 * ```
 *
 * This module is reached only AFTER the Processing executor has run and its
 * commit attempt has been durably persisted. It holds no executor port, no
 * approval, no command runtime and no plan builder — it cannot execute, approve
 * or alter anything even if asked, and a structural control asserts it imports
 * none of them. Trust never initiates.
 *
 * ## Durability is structural, not a convention
 *
 * The entry point takes the DURABLE commit-attempt row id — the value
 * `insertCommitAttempt` returns. A caller cannot hold that id unless the insert
 * came back, so "no observation before a durable commit result" is enforced by
 * the signature rather than by remembering to check.
 *
 * That id is also the honest one. `CommitAttempt.attemptId` means two different
 * things in the existing code: a freshly executed attempt carries the synthetic
 * `${planId}:attempt:${n}`, while one loaded from the database carries the row
 * uuid. Only the row id proves persistence, so only the row id is used as the
 * execution reference.
 *
 * ## Grain
 *
 * One commit attempt binds to every governed judgment its included operations
 * derive from — deduplicated, superseded judgments excluded, and each subject's
 * own operations deciding its own evidence. A partial commit is therefore
 * reported per subject rather than flattened into one attempt-wide verdict.
 *
 * ## Failure
 *
 * The Processing execution is already authoritative and stays so. This module
 * never throws into its caller, never writes a Processing row, and a Trust
 * failure becomes a durable, readiness-neutral execution gap that reconciliation
 * completes later.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    observeProcessingIdentityExecution,
    type ObserveExecutionDeps,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/observeExecution";
import { executionObservationId } from "@/lib/trust/execution/executionObservationIdentity";
import type { CommitAttempt } from "../executor/executorTypes";
import type { CommitPlan } from "../plan/planTypes";
import { planPackageExecutionEvidence } from "./executionOutcomeMapping";
import {
    recordIdentityExecutionGap,
    type IdentityExecutionGapSnapshotV1,
} from "./identityExecutionGapDb";
import {
    resolvePlanPackageLineage,
    type ContributingPackage,
    type PlanLineageDeps,
} from "./planPackageLineage";

/** The distinct marker for execution evidence that is owed but not recorded. */
export const IDENTITY_EXECUTION_GAP_MARKER = "[trust.identity_execution_gap]";

export type PackageExecutionOutcome =
    | { readonly status: "observed"; readonly packageId: string; readonly observationId: string }
    | { readonly status: "already_observed"; readonly packageId: string; readonly observationId: string }
    /** Deterministically refused. Retrying would refuse identically. */
    | { readonly status: "refused"; readonly packageId: string; readonly reason: string }
    /** Not recorded yet. A durable gap carries the owed evidence. */
    | { readonly status: "deferred"; readonly packageId: string; readonly reason: string; readonly gapId: string }
    /** Both the evidence and its recovery record were lost. */
    | { readonly status: "gap_unrecordable"; readonly packageId: string; readonly reason: string };

export type ExecutionBindingResult = {
    readonly commitAttemptId: string;
    readonly packages: readonly PackageExecutionOutcome[];
    /** Subjects that contributed operations but produced no evidence, and why. */
    readonly excluded: readonly { readonly subjectRef: string; readonly reason: string }[];
};

export type ExecutionLineageDeps = ObserveExecutionDeps &
    PlanLineageDeps & {
        readonly observe?: typeof observeProcessingIdentityExecution;
        readonly now?: () => string;
    };

/**
 * Record what Processing's executor did, for every governed judgment the plan
 * derived from.
 *
 * Call ONLY after the commit attempt row is persisted. Never throws.
 */
export async function bindCommitOutcomeToTrust(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        plan: CommitPlan;
        attempt: CommitAttempt;
        /** The durable `processing_commit_attempts.id`. Proof the result persisted. */
        commitAttemptId: string;
        /** Authoritative actor, from server context. Never client-supplied. */
        actorId: string;
        deps?: ExecutionLineageDeps;
    },
): Promise<ExecutionBindingResult> {
    const deps = input.deps ?? {};
    const observe = deps.observe ?? observeProcessingIdentityExecution;
    const now = () => deps.now?.() ?? new Date().toISOString();

    let lineage: Awaited<ReturnType<typeof resolvePlanPackageLineage>>;
    try {
        lineage = await resolvePlanPackageLineage(supabase, {
            orgId: input.orgId,
            plan: input.plan,
            deps,
        });
    } catch (e) {
        // Lineage could not be read, so which packages are affected is unknown.
        // Recording a gap would require naming them; there is nothing honest to
        // record, and the execution itself is unaffected.
        console.warn(
            `${IDENTITY_EXECUTION_GAP_MARKER} case=${input.plan.caseId} plan=${input.plan.planId}`,
            `execution committed but its governed lineage could not be resolved: ${message(e)}`,
        );
        return { commitAttemptId: input.commitAttemptId, packages: [], excluded: [] };
    }

    const packages: PackageExecutionOutcome[] = [];

    // Sequential and deterministic. This is a recovery-friendly audit path, not
    // a throughput path, and unbounded parallel writes would make the retry
    // evidence unreadable.
    for (const contributor of lineage.contributing) {
        packages.push(
            await bindOne(supabase, {
                orgId: input.orgId,
                caseId: input.plan.caseId,
                contributor,
                attempt: input.attempt,
                commitAttemptId: input.commitAttemptId,
                actorId: input.actorId,
                nowIso: now(),
                observe,
                deps,
            }),
        );
    }

    return {
        commitAttemptId: input.commitAttemptId,
        packages,
        excluded: lineage.excluded.map((e) => ({ subjectRef: e.subjectRef, reason: e.reason })),
    };
}

async function bindOne(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        caseId: string;
        contributor: ContributingPackage;
        attempt: CommitAttempt;
        commitAttemptId: string;
        actorId: string;
        nowIso: string;
        observe: typeof observeProcessingIdentityExecution;
        deps: ExecutionLineageDeps;
    },
): Promise<PackageExecutionOutcome> {
    const { contributor, attempt } = input;
    const evidence = planPackageExecutionEvidence({ attempt, contributor });

    const observationId = executionObservationId({
        org_id: input.orgId,
        package_id: contributor.packageId,
        plan_id: attempt.planId,
        plan_version: attempt.planVersion,
        plan_content_hash: attempt.planContentHash,
        commit_attempt_id: input.commitAttemptId,
        observation_kind: evidence.observationKind,
    });

    const result = await input.observe(
        {
            org_id: input.orgId,
            package_id: contributor.packageId,
            observation_kind: evidence.observationKind,
            commit_attempt_id: input.commitAttemptId,
            plan_id: attempt.planId,
            plan_version: attempt.planVersion,
            plan_content_hash: attempt.planContentHash,
            // The authoritative commit-attempt identifier, and nothing derived
            // from it. Evidence that an execution authority acted.
            execution_reference: input.commitAttemptId,
            detail: { ...evidence.detail, commit_attempt_id: input.commitAttemptId },
            // Execution is Processing's act. The operator authorized the commit;
            // the system observed its result.
            actor_type: "system",
            actor_id: null,
            channel: "system",
            correlation_id: input.caseId,
        },
        input.deps,
    );

    if (result.status === "observed" || result.status === "already_observed") {
        return { status: result.status, packageId: contributor.packageId, observationId: result.observationId };
    }
    if (result.status === "refused") {
        // Deterministic. A durable gap would queue work that can never succeed.
        console.warn(
            `${IDENTITY_EXECUTION_GAP_MARKER} case=${input.caseId} package=${contributor.packageId}`,
            `execution observation REFUSED and not retried: ${result.reason}`,
        );
        return { status: "refused", packageId: contributor.packageId, reason: result.reason };
    }

    // ---- durable, package-scoped recovery record ---------------------------
    const snapshot: Omit<
        IdentityExecutionGapSnapshotV1,
        | "execution_gap_schema_version"
        | "first_failed_at"
        | "last_attempt_at"
        | "retry_count"
        | "resolved_observation_id"
    > = {
        observation_id: observationId,
        package_id: contributor.packageId,
        adoption_id: contributor.adoptionId,
        subject_ref: contributor.subjectRef,
        plan_id: attempt.planId,
        plan_version: attempt.planVersion,
        plan_content_hash: attempt.planContentHash,
        commit_attempt_id: input.commitAttemptId,
        processing_outcome: attempt.outcome,
        observation_kind: evidence.observationKind,
        execution_reference: input.commitAttemptId,
        detail: { ...evidence.detail, commit_attempt_id: input.commitAttemptId },
        actor_type: "system",
        actor_id: null,
        failure_class: "trust_execution_observation_failed",
        failure_reason: result.reason,
    };

    try {
        const gap = await recordIdentityExecutionGap(supabase, {
            orgId: input.orgId,
            caseId: input.caseId,
            nowIso: input.nowIso,
            snapshot,
        });
        console.warn(
            `${IDENTITY_EXECUTION_GAP_MARKER} case=${input.caseId} package=${contributor.packageId} gap=${gap.id}`,
            `Processing execution is authoritative but its outcome is NOT observed; durable gap saved: ${result.reason}`,
        );
        return {
            status: "deferred",
            packageId: contributor.packageId,
            reason: result.reason,
            gapId: gap.id,
        };
    } catch (gapError) {
        // The one branch where BOTH the evidence and its recovery record are
        // lost. `error`, not `warn` — the loudest signal available here.
        console.error(
            `${IDENTITY_EXECUTION_GAP_MARKER} case=${input.caseId} package=${contributor.packageId}`,
            `execution outcome NOT observed and the durable gap FAILED to persist.`,
            `trust=${result.reason} gap_store=${message(gapError)}`,
        );
        return { status: "gap_unrecordable", packageId: contributor.packageId, reason: result.reason };
    }
}

function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
