/**
 * Durable governance-gap record for one Processing identity SUBJECT.
 *
 * When a resolution generation persists successfully but the Trust capture for
 * one of its subjects fails, that subject's gap is recorded here so it can be
 * reconciled later. A log line is not a recovery record.
 *
 * ## Why a capability-owned store rather than reusing the classification one
 *
 * The storage MECHANICS are the same — `processing_exceptions`, a jsonb
 * snapshot, `resolved_at`, a compare-and-swap on retry count — but the durable
 * SNAPSHOTS differ materially and must version independently: this one is
 * subject-scoped and carries dispositions, ambiguity and conflict categories and
 * a generation identity that classification has no concept of. Coupling two
 * capabilities' durable formats through one module would make either one's
 * version bump a breaking change for the other.
 *
 * What IS shared is extracted: the gap exception-type list that every readiness
 * projection excludes. See `lib/pos/trustGovernance/gapExceptionTypes.ts`.
 *
 * ## Grain
 *
 * One gap per **adoption identity** — org + case + subject + class + facts hash
 * + projection version + resolver version. Two failing subjects in one
 * generation produce two independent gaps, and one subject's failure never
 * touches another's success.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { TRUST_IDENTITY_RESOLUTION_GAP_TYPE } from "@/lib/pos/trustGovernance/gapExceptionTypes";
import type { GovernedIdentitySubjectRecommendationV1 } from "./governedIdentitySchema";

export { TRUST_IDENTITY_RESOLUTION_GAP_TYPE };

/** `warning`, never `blocker`: the generation committed and is authoritative. */
export const IDENTITY_GAP_SEVERITY = "warning" as const;

/** Bumped when the snapshot shape changes. Read before interpreting a row. */
export const IDENTITY_GAP_SCHEMA_VERSION = 1 as const;

const MAX_FAILURE_REASON_LENGTH = 500;

export type IdentityGovernanceFailureClass =
    /** The Trust Runtime threw — persistence, composition or an unexpected error. */
    | "trust_capture_failed"
    /** The runtime produced a package, but persisting it did not complete. */
    | "trust_persistence_failed";

/**
 * The bounded, versioned replay snapshot.
 *
 * Everything needed to replay the exact SAFE judgment without rerunning
 * identity matching or rereading the generation. It carries no raw fact, no
 * candidate, no person record, no name, email, phone, address or date of birth
 * — the governed recommendation is already PII-free by construction, and the
 * schema that validates it screens for PII patterns as well.
 */
export type IdentityGovernanceGapSnapshotV1 = {
    gap_schema_version: typeof IDENTITY_GAP_SCHEMA_VERSION;
    /** The deterministic Decision Contract id. This IS the adoption identity. */
    adoption_id: string;
    decision_class_key: string;
    subject_ref: string;
    /** The resolution generation this judgment belongs to. */
    generation_id: string;
    input_facts_hash: string;
    material_projection_version: string;
    identity_resolver_version: string;
    /** The already-safe governed recommendation, replayed verbatim. */
    recommendation: GovernedIdentitySubjectRecommendationV1;
    failure_class: IdentityGovernanceFailureClass;
    failure_reason: string;
    first_failed_at: string;
    last_attempt_at: string;
    retry_count: number;
    contract_id: string | null;
    package_id: string | null;
};

export type IdentityGovernanceGapRow = {
    id: string;
    orgId: string;
    caseId: string;
    resolvedAt: string | null;
    snapshot: IdentityGovernanceGapSnapshotV1;
};

function boundReason(reason: string): string {
    return reason.length > MAX_FAILURE_REASON_LENGTH
        ? `${reason.slice(0, MAX_FAILURE_REASON_LENGTH)}…`
        : reason;
}

function rowToGap(row: Record<string, unknown>): IdentityGovernanceGapRow | null {
    const snapshot = row.subject_ref as IdentityGovernanceGapSnapshotV1 | null;
    if (!snapshot || typeof snapshot !== "object") return null;
    if (snapshot.gap_schema_version !== IDENTITY_GAP_SCHEMA_VERSION) return null;
    return {
        id: String(row.id),
        orgId: String(row.org_id),
        caseId: String(row.case_id),
        resolvedAt: (row.resolved_at as string | null) ?? null,
        snapshot,
    };
}

type Client = Pick<SupabaseClient, "from">;

/** The single unresolved gap for one adoption identity, if one exists. */
export async function findUnresolvedIdentityGapByAdoptionId(
    supabase: Client,
    input: { orgId: string; caseId: string; adoptionId: string },
): Promise<IdentityGovernanceGapRow | null> {
    const { data, error } = await supabase
        .from("processing_exceptions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("case_id", input.caseId)
        .eq("exception_type", TRUST_IDENTITY_RESOLUTION_GAP_TYPE)
        .is("resolved_at", null)
        .eq("subject_ref->>adoption_id", input.adoptionId)
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`identity_gap_lookup_failed: ${error.message}`);
    return data ? rowToGap(data as Record<string, unknown>) : null;
}

/**
 * Record a gap, or add retry evidence to the one that already exists.
 *
 * Repeated failures for the same subject and material accumulate evidence on
 * ONE row rather than accumulating rows, which is what makes the retry count
 * meaningful.
 *
 * Throws on failure. The caller owns the last-resort behaviour, because losing
 * both the governed record and its recovery record must be loud.
 */
export async function recordIdentityGovernanceGap(
    supabase: Client,
    input: {
        orgId: string;
        caseId: string;
        snapshot: Omit<
            IdentityGovernanceGapSnapshotV1,
            "gap_schema_version" | "first_failed_at" | "last_attempt_at" | "retry_count" | "contract_id" | "package_id"
        >;
        nowIso: string;
    },
): Promise<IdentityGovernanceGapRow> {
    const existing = await findUnresolvedIdentityGapByAdoptionId(supabase, {
        orgId: input.orgId,
        caseId: input.caseId,
        adoptionId: input.snapshot.adoption_id,
    });

    if (existing) {
        const updated: IdentityGovernanceGapSnapshotV1 = {
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
        if (error) throw new Error(`identity_gap_update_failed: ${error.message}`);
        return { ...existing, snapshot: updated };
    }

    const snapshot: IdentityGovernanceGapSnapshotV1 = {
        gap_schema_version: IDENTITY_GAP_SCHEMA_VERSION,
        ...input.snapshot,
        failure_reason: boundReason(input.snapshot.failure_reason),
        first_failed_at: input.nowIso,
        last_attempt_at: input.nowIso,
        retry_count: 0,
        contract_id: null,
        package_id: null,
    };

    const { data, error } = await supabase
        .from("processing_exceptions")
        .insert({
            org_id: input.orgId,
            case_id: input.caseId,
            exception_type: TRUST_IDENTITY_RESOLUTION_GAP_TYPE,
            severity: IDENTITY_GAP_SEVERITY,
            code: input.snapshot.failure_class,
            message: boundReason(input.snapshot.failure_reason),
            subject_ref: snapshot,
            evidence_ids: [],
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(`identity_gap_insert_failed: ${error?.message ?? "no_row"}`);
    const gap = rowToGap(data as Record<string, unknown>);
    if (!gap) throw new Error("identity_gap_insert_failed: unreadable_row");
    return gap;
}

/** Unresolved identity gaps, oldest first. */
export async function listUnresolvedIdentityGovernanceGaps(
    supabase: Client,
    input: { orgId: string; limit?: number },
): Promise<IdentityGovernanceGapRow[]> {
    const { data, error } = await supabase
        .from("processing_exceptions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("exception_type", TRUST_IDENTITY_RESOLUTION_GAP_TYPE)
        .is("resolved_at", null)
        .order("created_at", { ascending: true })
        .limit(input.limit ?? 50);
    if (error) throw new Error(`identity_gap_list_failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[])
        .map(rowToGap)
        .filter((g): g is IdentityGovernanceGapRow => g !== null);
}

/**
 * Atomically claim a gap for one reconciliation attempt.
 *
 * Compare-and-swap on the observed `retry_count` in a single conditional
 * UPDATE, so two concurrent reconcilers cannot both proceed — the same
 * optimistic-concurrency shape the Commit Plan executor uses for
 * `preconditionRecordVersion`.
 */
export async function claimIdentityGovernanceGap(
    supabase: Client,
    input: { gap: IdentityGovernanceGapRow; nowIso: string },
): Promise<IdentityGovernanceGapRow | null> {
    const observed = input.gap.snapshot.retry_count;
    const claimed: IdentityGovernanceGapSnapshotV1 = {
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
    if (error) throw new Error(`identity_gap_claim_failed: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    return rowToGap(rows[0]!);
}

/** Mark resolved. Called ONLY after an authoritative governed result exists. */
export async function resolveIdentityGovernanceGap(
    supabase: Client,
    input: { gap: IdentityGovernanceGapRow; contractId: string; packageId: string; nowIso: string },
): Promise<void> {
    const resolved: IdentityGovernanceGapSnapshotV1 = {
        ...input.gap.snapshot,
        last_attempt_at: input.nowIso,
        contract_id: input.contractId,
        package_id: input.packageId,
    };
    const { error } = await supabase
        .from("processing_exceptions")
        .update({ subject_ref: resolved, resolved_at: input.nowIso })
        .eq("id", input.gap.id)
        .is("resolved_at", null);
    if (error) throw new Error(`identity_gap_resolve_failed: ${error.message}`);
}
