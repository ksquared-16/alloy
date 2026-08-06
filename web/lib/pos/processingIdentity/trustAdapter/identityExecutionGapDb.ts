/**
 * Durable execution gap — evidence that is owed but not yet recorded.
 *
 * The Processing execution has already committed and is authoritative. The
 * records exist, the operator has been answered, and nothing about the commit is
 * in doubt. All that is outstanding is the Trust-side evidence, so this row is a
 * recovery record and never an operator-facing exception. A log line is not a
 * recovery record.
 *
 * ## Why a store of its own
 *
 * The MECHANICS are the capture and lineage gaps' — `processing_exceptions`, a
 * jsonb snapshot, `resolved_at`, a compare-and-swap on retry count — and those
 * are the proven common mechanics the shared boundary allows. The durable
 * SNAPSHOT is materially different again: this one carries an execution claim
 * bound to a commit attempt, with no governed recommendation and no lineage
 * claim, and it reconciles by appending an `executed`/`outcome` observation.
 * Teaching either existing parser to read it would couple three formats that
 * must version independently.
 *
 * ## Grain
 *
 * One gap per EXECUTION OBSERVATION identity — package + plan + version + hash +
 * commit attempt + kind. One commit attempt touching four subjects produces up
 * to four independent gaps, and one subject's gap never touches another's.
 *
 * ## Readiness
 *
 * `warning`, never `blocker`, and its type is registered in the shared gap list
 * so every readiness projection excludes it. A Trust outage must not change what
 * an operator sees about a commit that succeeded.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { TRUST_IDENTITY_EXECUTION_GAP_TYPE } from "@/lib/pos/trustGovernance/gapExceptionTypes";
import type { AttemptOutcome } from "../executor/executorTypes";

export { TRUST_IDENTITY_EXECUTION_GAP_TYPE };

/** `warning`, never `blocker`: the execution committed and is authoritative. */
export const IDENTITY_EXECUTION_GAP_SEVERITY = "warning" as const;

/** Bumped when the snapshot shape changes. Read before interpreting a row. */
export const IDENTITY_EXECUTION_GAP_SCHEMA_VERSION = 1 as const;

const MAX_FAILURE_REASON_LENGTH = 500;

export type IdentityExecutionFailureClass =
    /** Trust could not record the observation. */
    "trust_execution_observation_failed";

/**
 * The bounded, versioned replay material.
 *
 * Everything needed to append the exact owed observation later, and nothing
 * else. No plan operation, no command payload, no mutation result, no record
 * id, no name, email, phone, address, date of birth, raw fact value or error
 * stack: every field is an opaque identifier, a bounded category or a count.
 */
export type IdentityExecutionGapSnapshotV1 = {
    execution_gap_schema_version: typeof IDENTITY_EXECUTION_GAP_SCHEMA_VERSION;
    /** The deterministic observation id. This IS the exactly-once identity. */
    observation_id: string;
    package_id: string;
    /** The adoption identity of the governed judgment, for audit. */
    adoption_id: string;
    subject_ref: string;
    plan_id: string;
    plan_version: number;
    plan_content_hash: string;
    /** The DURABLE commit-attempt row id. Its existence proves the result persisted. */
    commit_attempt_id: string;
    /** The authoritative Processing verdict, verbatim. */
    processing_outcome: AttemptOutcome;
    observation_kind: "executed" | "outcome";
    execution_reference: string;
    /** Bounded evidence detail, replayed verbatim. Tokens and counts only. */
    detail: Record<string, string | number>;
    actor_type: "operator" | "system" | "automation";
    actor_id: string | null;
    failure_class: IdentityExecutionFailureClass;
    failure_reason: string;
    first_failed_at: string;
    last_attempt_at: string;
    retry_count: number;
    resolved_observation_id: string | null;
};

export type IdentityExecutionGapRow = {
    id: string;
    orgId: string;
    caseId: string;
    resolvedAt: string | null;
    snapshot: IdentityExecutionGapSnapshotV1;
};

function boundReason(reason: string): string {
    return reason.length > MAX_FAILURE_REASON_LENGTH
        ? `${reason.slice(0, MAX_FAILURE_REASON_LENGTH)}…`
        : reason;
}

function rowToGap(row: Record<string, unknown>): IdentityExecutionGapRow | null {
    const snapshot = row.subject_ref as IdentityExecutionGapSnapshotV1 | null;
    if (!snapshot || typeof snapshot !== "object") return null;
    if (snapshot.execution_gap_schema_version !== IDENTITY_EXECUTION_GAP_SCHEMA_VERSION) return null;
    return {
        id: String(row.id),
        orgId: String(row.org_id),
        caseId: String(row.case_id),
        resolvedAt: (row.resolved_at as string | null) ?? null,
        snapshot,
    };
}

type Client = Pick<SupabaseClient, "from">;

/**
 * The single unresolved gap for one execution-observation identity.
 *
 * Keyed on `code`, which carries the deterministic observation id — one indexed
 * equality rather than a jsonb scan.
 */
export async function findUnresolvedExecutionGap(
    supabase: Client,
    input: { orgId: string; caseId: string; observationId: string },
): Promise<IdentityExecutionGapRow | null> {
    const { data, error } = await supabase
        .from("processing_exceptions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("case_id", input.caseId)
        .eq("exception_type", TRUST_IDENTITY_EXECUTION_GAP_TYPE)
        .is("resolved_at", null)
        .eq("code", input.observationId)
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`identity_execution_gap_lookup_failed: ${error.message}`);
    return data ? rowToGap(data as Record<string, unknown>) : null;
}

/**
 * Record a gap, or add retry evidence to the one that already exists.
 *
 * Throws on failure. The caller owns the last-resort behaviour: losing both the
 * evidence and its recovery record must be loud.
 */
export async function recordIdentityExecutionGap(
    supabase: Client,
    input: {
        orgId: string;
        caseId: string;
        snapshot: Omit<
            IdentityExecutionGapSnapshotV1,
            | "execution_gap_schema_version"
            | "first_failed_at"
            | "last_attempt_at"
            | "retry_count"
            | "resolved_observation_id"
        >;
        nowIso: string;
    },
): Promise<IdentityExecutionGapRow> {
    const existing = await findUnresolvedExecutionGap(supabase, {
        orgId: input.orgId,
        caseId: input.caseId,
        observationId: input.snapshot.observation_id,
    });

    if (existing) {
        const updated: IdentityExecutionGapSnapshotV1 = {
            ...existing.snapshot,
            failure_class: input.snapshot.failure_class,
            failure_reason: boundReason(input.snapshot.failure_reason),
            last_attempt_at: input.nowIso,
            retry_count: existing.snapshot.retry_count + 1,
        };
        const { error } = await supabase
            .from("processing_exceptions")
            .update({ subject_ref: updated, message: boundReason(input.snapshot.failure_reason) })
            .eq("id", existing.id)
            .is("resolved_at", null);
        if (error) throw new Error(`identity_execution_gap_update_failed: ${error.message}`);
        return { ...existing, snapshot: updated };
    }

    const snapshot: IdentityExecutionGapSnapshotV1 = {
        execution_gap_schema_version: IDENTITY_EXECUTION_GAP_SCHEMA_VERSION,
        ...input.snapshot,
        failure_reason: boundReason(input.snapshot.failure_reason),
        first_failed_at: input.nowIso,
        last_attempt_at: input.nowIso,
        retry_count: 0,
        resolved_observation_id: null,
    };

    const { data, error } = await supabase
        .from("processing_exceptions")
        .insert({
            org_id: input.orgId,
            case_id: input.caseId,
            exception_type: TRUST_IDENTITY_EXECUTION_GAP_TYPE,
            severity: IDENTITY_EXECUTION_GAP_SEVERITY,
            code: input.snapshot.observation_id,
            message: boundReason(input.snapshot.failure_reason),
            subject_ref: snapshot,
            evidence_ids: [],
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(`identity_execution_gap_insert_failed: ${error?.message ?? "no_row"}`);
    const gap = rowToGap(data as Record<string, unknown>);
    if (!gap) throw new Error("identity_execution_gap_insert_failed: unreadable_row");
    return gap;
}

/** Unresolved execution gaps, oldest first. */
export async function listUnresolvedIdentityExecutionGaps(
    supabase: Client,
    input: { orgId: string; limit?: number },
): Promise<IdentityExecutionGapRow[]> {
    const { data, error } = await supabase
        .from("processing_exceptions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("exception_type", TRUST_IDENTITY_EXECUTION_GAP_TYPE)
        .is("resolved_at", null)
        .order("created_at", { ascending: true })
        .limit(input.limit ?? 50);
    if (error) throw new Error(`identity_execution_gap_list_failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[])
        .map(rowToGap)
        .filter((g): g is IdentityExecutionGapRow => g !== null);
}

/**
 * Atomically claim a gap for one reconciliation attempt.
 *
 * Compare-and-swap on the observed `retry_count`, and `resolved_at IS NULL` in
 * the same statement — so a gap that has already been resolved cannot be
 * reclaimed by a straggler.
 */
export async function claimIdentityExecutionGap(
    supabase: Client,
    input: { gap: IdentityExecutionGapRow; nowIso: string },
): Promise<IdentityExecutionGapRow | null> {
    const observed = input.gap.snapshot.retry_count;
    const claimed: IdentityExecutionGapSnapshotV1 = {
        ...input.gap.snapshot,
        last_attempt_at: input.nowIso,
        retry_count: observed + 1,
    };
    const { data, error } = await supabase
        .from("processing_exceptions")
        .update({ subject_ref: claimed })
        .eq("id", input.gap.id)
        .is("resolved_at", null)
        .eq("subject_ref->>retry_count", String(observed))
        .select("*");
    if (error) throw new Error(`identity_execution_gap_claim_failed: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    return rowToGap(rows[0]!);
}

/** Mark resolved. Called ONLY after an authoritative observation exists. */
export async function resolveIdentityExecutionGap(
    supabase: Client,
    input: { gap: IdentityExecutionGapRow; observationId: string; nowIso: string },
): Promise<void> {
    const resolved: IdentityExecutionGapSnapshotV1 = {
        ...input.gap.snapshot,
        last_attempt_at: input.nowIso,
        resolved_observation_id: input.observationId,
    };
    const { error } = await supabase
        .from("processing_exceptions")
        .update({ subject_ref: resolved, resolved_at: input.nowIso })
        .eq("id", input.gap.id)
        .is("resolved_at", null);
    if (error) throw new Error(`identity_execution_gap_resolve_failed: ${error.message}`);
}

/**
 * Close a gap that can never succeed.
 *
 * A deterministic refusal — a package in another org, an unsafe detail value —
 * refuses identically on every retry. Leaving it open would grow an unbounded
 * queue of work that cannot progress, so it is closed with the refusal recorded
 * as its own evidence.
 */
export async function abandonIdentityExecutionGap(
    supabase: Client,
    input: { gap: IdentityExecutionGapRow; refusal: string; nowIso: string },
): Promise<void> {
    const abandoned: IdentityExecutionGapSnapshotV1 = {
        ...input.gap.snapshot,
        failure_reason: boundReason(`refused: ${input.refusal}`),
        last_attempt_at: input.nowIso,
    };
    const { error } = await supabase
        .from("processing_exceptions")
        .update({
            subject_ref: abandoned,
            message: boundReason(`refused: ${input.refusal}`),
            resolved_at: input.nowIso,
        })
        .eq("id", input.gap.id)
        .is("resolved_at", null);
    if (error) throw new Error(`identity_execution_gap_abandon_failed: ${error.message}`);
}
