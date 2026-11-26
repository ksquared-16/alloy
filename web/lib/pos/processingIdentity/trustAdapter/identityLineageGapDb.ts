/**
 * Durable lineage gap — a supersession that is owed but not yet recorded.
 *
 * The Processing correction has already committed and is authoritative. All that
 * is missing is the Trust-side consequence, so this row is a recovery record,
 * never an operator-facing exception. A log line is not a recovery record.
 *
 * ## Why a store of its own
 *
 * The MECHANICS are the capture gap's — `processing_exceptions`, a jsonb
 * snapshot, `resolved_at`, a compare-and-swap on retry count — and those are the
 * proven common mechanics the shared boundary allows. The durable SNAPSHOT is
 * materially different: this one carries a lineage claim (which prior package,
 * what replaced it, why, by whom) and no governed recommendation at all, and it
 * reconciles by appending one observation rather than by running the capture
 * seam. Teaching the capture parser to read it would couple two formats that
 * must version independently.
 *
 * ## Grain
 *
 * One gap per SUPERSESSION identity — the prior adoption identity plus what
 * replaced it. Two subjects corrected in one operator action produce two
 * independent gaps, and one subject's gap never touches another's.
 *
 * ## Readiness
 *
 * `warning`, never `blocker`, and its exception type is registered in the shared
 * gap list so every readiness projection excludes it. A Trust outage must not
 * change what an operator sees.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { TRUST_IDENTITY_LINEAGE_GAP_TYPE } from "@/lib/pos/trustGovernance/gapExceptionTypes";
import type { IdentitySupersessionReason } from "./identitySupersessionReasons";

export { TRUST_IDENTITY_LINEAGE_GAP_TYPE };

/** `warning`, never `blocker`: the operator correction committed and is authoritative. */
export const IDENTITY_LINEAGE_GAP_SEVERITY = "warning" as const;

/** Bumped when the snapshot shape changes. Read before interpreting a row. */
export const IDENTITY_LINEAGE_GAP_SCHEMA_VERSION = 1 as const;

const MAX_FAILURE_REASON_LENGTH = 500;

export type IdentityLineageFailureClass =
    /** The prior governed judgment has no package yet — its capture gap is still open. */
    | "prior_package_absent"
    /** Trust could not record the supersession. */
    | "trust_supersession_failed";

/**
 * The bounded, versioned replay material.
 *
 * Everything needed to append the exact owed observation later, and nothing
 * else. No candidate, no person record, no name, email, phone, address, date of
 * birth, raw fact value, engine explanation or operator note: the reason is a
 * closed category and every reference is an opaque id.
 */
export type IdentityLineageGapSnapshotV1 = {
    lineage_gap_schema_version: typeof IDENTITY_LINEAGE_GAP_SCHEMA_VERSION;
    /** The deterministic adoption identity of the PRIOR judgment being superseded. */
    prior_adoption_id: string;
    /** Known once the prior package exists; `null` while its capture gap is open. */
    prior_package_id: string | null;
    decision_class_key: string;
    subject_ref: string;
    prior_generation_id: string;
    supersession_source: "replacement_decision_package" | "external_authority_decision";
    /** The replacement package, for engine-replacement lineage. */
    superseding_package_id: string | null;
    /** Durable reference into the deciding Processing authority, for operator lineage. */
    superseding_reference: string | null;
    replacement_generation_id: string | null;
    reason: IdentitySupersessionReason;
    /**
     * Which append is owed.
     *
     * Optional, deliberately. Rows written before operator confirmation was
     * distinguished from supersession carry no such field, and every one of them
     * IS a supersession — so an absent value reads as `"superseded"` rather than
     * orphaning those rows behind a schema-version bump they cannot satisfy.
     */
    observation_kind?: "superseded" | "accepted" | "deferred";
    /** Authoritative actor, captured from server context at correction time. */
    actor_type: "operator" | "system" | "automation";
    actor_id: string | null;
    failure_class: IdentityLineageFailureClass;
    failure_reason: string;
    first_failed_at: string;
    last_attempt_at: string;
    retry_count: number;
    observation_id: string | null;
};

export type IdentityLineageGapRow = {
    id: string;
    orgId: string;
    caseId: string;
    resolvedAt: string | null;
    snapshot: IdentityLineageGapSnapshotV1;
};

/**
 * The stable key one gap row is claimed by.
 *
 * Prior identity + what happened to it + which append is owed. The KIND is in
 * the key because one package can legitimately owe an `accepted` and later a
 * `superseded`; without it the second would be mistaken for a retry of the
 * first. An absent kind hashes as `superseded`, so keys computed before the
 * field existed still match their rows.
 */
export function lineageGapKey(snapshot: {
    prior_adoption_id: string;
    superseding_package_id: string | null;
    superseding_reference: string | null;
    reason: string;
    observation_kind?: string;
}): string {
    return [
        snapshot.prior_adoption_id,
        snapshot.superseding_package_id ?? "",
        snapshot.superseding_reference ?? "",
        snapshot.reason,
        snapshot.observation_kind ?? "superseded",
    ].join("\u001f");
}

function boundReason(reason: string): string {
    return reason.length > MAX_FAILURE_REASON_LENGTH
        ? `${reason.slice(0, MAX_FAILURE_REASON_LENGTH)}…`
        : reason;
}

function rowToGap(row: Record<string, unknown>): IdentityLineageGapRow | null {
    const snapshot = row.subject_ref as IdentityLineageGapSnapshotV1 | null;
    if (!snapshot || typeof snapshot !== "object") return null;
    if (snapshot.lineage_gap_schema_version !== IDENTITY_LINEAGE_GAP_SCHEMA_VERSION) return null;
    return {
        id: String(row.id),
        orgId: String(row.org_id),
        caseId: String(row.case_id),
        resolvedAt: (row.resolved_at as string | null) ?? null,
        snapshot,
    };
}

type Client = Pick<SupabaseClient, "from">;

/** The single unresolved lineage gap for one supersession identity, if one exists. */
export async function findUnresolvedLineageGap(
    supabase: Client,
    input: { orgId: string; caseId: string; key: string },
): Promise<IdentityLineageGapRow | null> {
    const { data, error } = await supabase
        .from("processing_exceptions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("case_id", input.caseId)
        .eq("exception_type", TRUST_IDENTITY_LINEAGE_GAP_TYPE)
        .is("resolved_at", null)
        .eq("code", input.key)
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`identity_lineage_gap_lookup_failed: ${error.message}`);
    return data ? rowToGap(data as Record<string, unknown>) : null;
}

/**
 * Record a lineage gap, or add retry evidence to the one that already exists.
 *
 * Repeated failures for the same supersession accumulate on ONE row, which is
 * what makes the retry count meaningful.
 *
 * Throws on failure. The caller owns the last-resort behaviour: losing both the
 * lineage record and its recovery record must be loud.
 */
export async function recordIdentityLineageGap(
    supabase: Client,
    input: {
        orgId: string;
        caseId: string;
        snapshot: Omit<
            IdentityLineageGapSnapshotV1,
            | "lineage_gap_schema_version"
            | "first_failed_at"
            | "last_attempt_at"
            | "retry_count"
            | "observation_id"
        >;
        nowIso: string;
    },
): Promise<IdentityLineageGapRow> {
    const key = lineageGapKey(input.snapshot);
    const existing = await findUnresolvedLineageGap(supabase, {
        orgId: input.orgId,
        caseId: input.caseId,
        key,
    });

    if (existing) {
        const updated: IdentityLineageGapSnapshotV1 = {
            ...existing.snapshot,
            // The prior package may have appeared since the first attempt.
            prior_package_id: input.snapshot.prior_package_id ?? existing.snapshot.prior_package_id,
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
        if (error) throw new Error(`identity_lineage_gap_update_failed: ${error.message}`);
        return { ...existing, snapshot: updated };
    }

    const snapshot: IdentityLineageGapSnapshotV1 = {
        lineage_gap_schema_version: IDENTITY_LINEAGE_GAP_SCHEMA_VERSION,
        ...input.snapshot,
        failure_reason: boundReason(input.snapshot.failure_reason),
        first_failed_at: input.nowIso,
        last_attempt_at: input.nowIso,
        retry_count: 0,
        observation_id: null,
    };

    const { data, error } = await supabase
        .from("processing_exceptions")
        .insert({
            org_id: input.orgId,
            case_id: input.caseId,
            exception_type: TRUST_IDENTITY_LINEAGE_GAP_TYPE,
            severity: IDENTITY_LINEAGE_GAP_SEVERITY,
            // `code` carries the claim key so the unresolved lookup is one
            // indexed equality rather than a jsonb scan.
            code: key,
            message: boundReason(input.snapshot.failure_reason),
            subject_ref: snapshot,
            evidence_ids: [],
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(`identity_lineage_gap_insert_failed: ${error?.message ?? "no_row"}`);
    const gap = rowToGap(data as Record<string, unknown>);
    if (!gap) throw new Error("identity_lineage_gap_insert_failed: unreadable_row");
    return gap;
}

/** Unresolved lineage gaps, oldest first. */
export async function listUnresolvedIdentityLineageGaps(
    supabase: Client,
    input: { orgId: string; limit?: number },
): Promise<IdentityLineageGapRow[]> {
    const { data, error } = await supabase
        .from("processing_exceptions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("exception_type", TRUST_IDENTITY_LINEAGE_GAP_TYPE)
        .is("resolved_at", null)
        .order("created_at", { ascending: true })
        .limit(input.limit ?? 50);
    if (error) throw new Error(`identity_lineage_gap_list_failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[])
        .map(rowToGap)
        .filter((g): g is IdentityLineageGapRow => g !== null);
}

/**
 * Atomically claim a gap for one reconciliation attempt.
 *
 * Compare-and-swap on the observed `retry_count` in a single conditional UPDATE,
 * so two concurrent reconcilers cannot both proceed.
 */
export async function claimIdentityLineageGap(
    supabase: Client,
    input: { gap: IdentityLineageGapRow; nowIso: string },
): Promise<IdentityLineageGapRow | null> {
    const observed = input.gap.snapshot.retry_count;
    const claimed: IdentityLineageGapSnapshotV1 = {
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
    if (error) throw new Error(`identity_lineage_gap_claim_failed: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    return rowToGap(rows[0]!);
}

/** Mark resolved. Called ONLY after an authoritative observation exists. */
export async function resolveIdentityLineageGap(
    supabase: Client,
    input: {
        gap: IdentityLineageGapRow;
        observationId: string;
        priorPackageId: string;
        nowIso: string;
    },
): Promise<void> {
    const resolved: IdentityLineageGapSnapshotV1 = {
        ...input.gap.snapshot,
        prior_package_id: input.priorPackageId,
        last_attempt_at: input.nowIso,
        observation_id: input.observationId,
    };
    const { error } = await supabase
        .from("processing_exceptions")
        .update({ subject_ref: resolved, resolved_at: input.nowIso })
        .eq("id", input.gap.id)
        .is("resolved_at", null);
    if (error) throw new Error(`identity_lineage_gap_resolve_failed: ${error.message}`);
}

/**
 * Close a gap that can never succeed.
 *
 * A deterministic refusal — self-supersession, cross-org, a cycle, a conflicting
 * claim already recorded — will refuse identically on every retry. Leaving it
 * unresolved would grow an unbounded queue of work that cannot progress, so it
 * is closed with the refusal recorded as its own evidence.
 */
export async function abandonIdentityLineageGap(
    supabase: Client,
    input: { gap: IdentityLineageGapRow; refusal: string; nowIso: string },
): Promise<void> {
    const abandoned: IdentityLineageGapSnapshotV1 = {
        ...input.gap.snapshot,
        failure_class: "trust_supersession_failed",
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
    if (error) throw new Error(`identity_lineage_gap_abandon_failed: ${error.message}`);
}
