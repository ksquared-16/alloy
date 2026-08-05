/**
 * Durable Trust governance-gap record (Phase 1.1 completion).
 *
 * When Processing classifies successfully but the Trust capture fails, the gap
 * must be recoverable — a log line is not a recovery record. This module stores
 * that gap in an **existing Processing-owned durable facility**:
 * `processing_exceptions`.
 *
 * ## Why `processing_exceptions` and not a new table
 *
 * It already provides every property this record needs, and Processing already
 * owns it:
 *
 *  - `org_id` + `case_id`, both FK-scoped, with RLS already correct
 *    (org-role SELECT, service_role write);
 *  - `exception_type` — free text, no CHECK constraint, so a new type needs no
 *    migration;
 *  - `resolved_at` — the resolution state this record needs, already indexed as
 *    `(org_id, exception_type, resolved_at)`, which is exactly the open-gap scan;
 *  - `subject_ref jsonb` — a bounded, versioned snapshot;
 *  - `code` / `message` — failure class and reason;
 *  - `created_at` — first-failure time.
 *
 * The alternatives were inspected and rejected on evidence:
 * `processing_commit_attempts` requires a non-null `plan_id` FK and a
 * classification has no Commit Plan; `mutation_events` models operational state
 * transitions through an opportunity-specific RPC; `workflow_events` is
 * append-only with no resolution state or retry semantics; and
 * `processing_cases.metadata` is the very thing classification overwrites, so it
 * cannot hold replay material.
 *
 * ## One hazard, handled deliberately
 *
 * `loadCaseReview` counts EVERY row in `processing_exceptions` for a case and
 * feeds it to `projectIdentityReadiness` as `hasOpenException`, which forces the
 * identity review lane to `"exception"`. A Trust capture failure must never
 * change what an operator sees, so that count explicitly excludes this type.
 * See `operatorReviewService.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { TRUST_SOURCE_CLASSIFICATION_GAP_TYPE } from "@/lib/pos/trustGovernance/gapExceptionTypes";
import { processingSourceClassificationContractId } from "@/lib/trust/capabilities/processingSourceClassification/adoptionIdentity";
import type { GovernedSourceClassificationV1 } from "./governedClassificationSchema";

/**
 * The discriminator that separates a governance gap from a Processing exception.
 *
 * Delegated to the shared registry so every readiness projection can exclude
 * ALL gap types by list. The export name is unchanged for existing consumers.
 */
export const TRUST_GOVERNANCE_GAP_EXCEPTION_TYPE = TRUST_SOURCE_CLASSIFICATION_GAP_TYPE;

/**
 * `warning`, never `blocker`. The gap does not block Processing — the
 * classification already committed and is authoritative.
 */
export const TRUST_GOVERNANCE_GAP_SEVERITY = "warning" as const;

/** Bumped when the snapshot shape changes. Read before interpreting a stored row. */
export const TRUST_GOVERNANCE_GAP_SCHEMA_VERSION = 1 as const;

/** Failure reasons are bounded so an exception message can never become a payload. */
const MAX_FAILURE_REASON_LENGTH = 500;

/** Why the capture failed. Deliberately coarse — the detail lives in the reason. */
export type TrustGovernanceFailureClass =
    /** The Trust Runtime threw — persistence, composition or an unexpected error. */
    | "trust_capture_failed"
    /** The runtime produced a package, but persisting it did not complete. */
    | "trust_persistence_failed";

/**
 * The bounded, versioned replay snapshot.
 *
 * Everything needed to reproduce the exact governed judgment WITHOUT rereading
 * `processing_cases.metadata`, which classification overwrites. It carries no
 * filename, title, doc type or document content — only the material fingerprint
 * that identifies them — and no provider, command binding or identity plan.
 */
export type TrustGovernanceGapSnapshotV1 = {
    gap_schema_version: typeof TRUST_GOVERNANCE_GAP_SCHEMA_VERSION;
    /** Stable adoption identity. See {@link adoptionKey}. */
    adoption_key: string;
    decision_class_key: string;
    source_kind: string;
    material_input_fingerprint: string;
    material_input_version: string;
    classifier_version: string;
    /** The governed recommendation exactly as it would have been carried. */
    classification: GovernedSourceClassificationV1;
    failure_class: TrustGovernanceFailureClass;
    failure_reason: string;
    first_failed_at: string;
    last_attempt_at: string;
    retry_count: number;
    /** Set only after an authoritative Trust success. */
    contract_id: string | null;
    package_id: string | null;
};

export type TrustGovernanceGapRow = {
    id: string;
    orgId: string;
    caseId: string;
    resolvedAt: string | null;
    snapshot: TrustGovernanceGapSnapshotV1;
};

/**
 * The stable adoption identity: organization, case, decision class, material
 * input fingerprint and classifier version.
 *
 * This is what makes "the same governed decision" a checkable claim. A changed
 * fingerprint or a bumped classifier is a DIFFERENT decision, not a duplicate.
 *
 * It delegates to the canonical derivation rather than restating it, so the
 * value stored on a gap is **the same value** as the Decision Contract id that
 * governs it. One identity, one construction, one number — a gap can therefore
 * be matched to its contract by equality, not by re-deriving anything.
 */
export function adoptionKey(input: {
    orgId: string;
    caseId: string;
    decisionClassKey: string;
    materialInputFingerprint: string;
    classifierVersion: string;
}): string {
    return processingSourceClassificationContractId({
        org_id: input.orgId,
        processing_case_id: input.caseId,
        decision_class_key: input.decisionClassKey,
        material_input_fingerprint: input.materialInputFingerprint,
        classifier_version: input.classifierVersion,
    });
}

function boundReason(reason: string): string {
    return reason.length > MAX_FAILURE_REASON_LENGTH
        ? `${reason.slice(0, MAX_FAILURE_REASON_LENGTH)}…`
        : reason;
}

function rowToGap(row: Record<string, unknown>): TrustGovernanceGapRow | null {
    const snapshot = row.subject_ref as TrustGovernanceGapSnapshotV1 | null;
    if (!snapshot || typeof snapshot !== "object") return null;
    if (snapshot.gap_schema_version !== TRUST_GOVERNANCE_GAP_SCHEMA_VERSION) return null;
    return {
        id: String(row.id),
        orgId: String(row.org_id),
        caseId: String(row.case_id),
        resolvedAt: (row.resolved_at as string | null) ?? null,
        snapshot,
    };
}

type Client = Pick<SupabaseClient, "from">;

/** The single unresolved gap for an adoption identity, if one exists. */
export async function findUnresolvedGapByAdoptionKey(
    supabase: Client,
    input: { orgId: string; caseId: string; adoptionKey: string },
): Promise<TrustGovernanceGapRow | null> {
    const { data, error } = await supabase
        .from("processing_exceptions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("case_id", input.caseId)
        .eq("exception_type", TRUST_GOVERNANCE_GAP_EXCEPTION_TYPE)
        .is("resolved_at", null)
        .eq("subject_ref->>adoption_key", input.adoptionKey)
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`governance_gap_lookup_failed: ${error.message}`);
    return data ? rowToGap(data as Record<string, unknown>) : null;
}

/**
 * Record a gap, or add retry evidence to the one that already exists.
 *
 * Repeated production failures for the same material input do not accumulate
 * rows — they accumulate retry evidence on one row, which is what makes the
 * retry count meaningful.
 *
 * Throws on failure. The caller is responsible for the last-resort behaviour,
 * because losing both the governed record AND its recovery record must be loud.
 */
export async function recordTrustGovernanceGap(
    supabase: Client,
    input: {
        orgId: string;
        caseId: string;
        snapshot: Omit<
            TrustGovernanceGapSnapshotV1,
            "gap_schema_version" | "first_failed_at" | "last_attempt_at" | "retry_count" | "contract_id" | "package_id"
        >;
        nowIso: string;
    },
): Promise<TrustGovernanceGapRow> {
    const existing = await findUnresolvedGapByAdoptionKey(supabase, {
        orgId: input.orgId,
        caseId: input.caseId,
        adoptionKey: input.snapshot.adoption_key,
    });

    if (existing) {
        const updated: TrustGovernanceGapSnapshotV1 = {
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
        if (error) throw new Error(`governance_gap_update_failed: ${error.message}`);
        return { ...existing, snapshot: updated };
    }

    const snapshot: TrustGovernanceGapSnapshotV1 = {
        gap_schema_version: TRUST_GOVERNANCE_GAP_SCHEMA_VERSION,
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
            exception_type: TRUST_GOVERNANCE_GAP_EXCEPTION_TYPE,
            severity: TRUST_GOVERNANCE_GAP_SEVERITY,
            code: input.snapshot.failure_class,
            message: boundReason(input.snapshot.failure_reason),
            subject_ref: snapshot,
            evidence_ids: [],
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(`governance_gap_insert_failed: ${error?.message ?? "no_row"}`);
    const gap = rowToGap(data as Record<string, unknown>);
    if (!gap) throw new Error("governance_gap_insert_failed: unreadable_row");
    return gap;
}

/** Unresolved gaps, oldest first. The scan the open-gap index was built for. */
export async function listUnresolvedTrustGovernanceGaps(
    supabase: Client,
    input: { orgId: string; limit?: number },
): Promise<TrustGovernanceGapRow[]> {
    const { data, error } = await supabase
        .from("processing_exceptions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("exception_type", TRUST_GOVERNANCE_GAP_EXCEPTION_TYPE)
        .is("resolved_at", null)
        .order("created_at", { ascending: true })
        .limit(input.limit ?? 50);
    if (error) throw new Error(`governance_gap_list_failed: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[])
        .map(rowToGap)
        .filter((g): g is TrustGovernanceGapRow => g !== null);
}

/**
 * Atomically claim a gap for one reconciliation attempt.
 *
 * Compare-and-swap on the observed `retry_count` inside a single conditional
 * UPDATE. Two concurrent reconcilers observing the same count cannot both
 * succeed, so a governed decision cannot be produced twice by a race — this is
 * the same optimistic-concurrency shape the Commit Plan executor already uses
 * for `preconditionRecordVersion`.
 *
 * Returns `null` when the claim was lost or the gap was resolved meanwhile.
 */
export async function claimTrustGovernanceGap(
    supabase: Client,
    input: { gap: TrustGovernanceGapRow; nowIso: string },
): Promise<TrustGovernanceGapRow | null> {
    const observed = input.gap.snapshot.retry_count;
    const claimed: TrustGovernanceGapSnapshotV1 = {
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
    if (error) throw new Error(`governance_gap_claim_failed: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    return rowToGap(rows[0]!);
}

/**
 * Mark a gap resolved. Called ONLY after an authoritative Trust success, with
 * the identifiers that prove it.
 */
export async function resolveTrustGovernanceGap(
    supabase: Client,
    input: { gap: TrustGovernanceGapRow; contractId: string; packageId: string; nowIso: string },
): Promise<void> {
    const resolved: TrustGovernanceGapSnapshotV1 = {
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
    if (error) throw new Error(`governance_gap_resolve_failed: ${error.message}`);
}
