import type { CanonicalRegistryRef } from "@/lib/fields/fieldRegistryReferenceMatrix";

export type ExistingChildCommitFieldState = "clean" | "already_applied" | "stale_conflict" | "invalid_current_record";
export type ExistingChildCommitOutcome = "updated" | "unchanged" | "rejected" | "deferred" | "unsupported" | "invalid" | "stale_conflict" | "unauthorized" | "failed";

export type ExistingChildCommitPlanChange = {
    provider_ref: string;
    canonical_ref: CanonicalRegistryRef;
    old_value: unknown;
    proposed_value: unknown;
    stale_state: ExistingChildCommitFieldState;
};

export type ExistingChildSkippedChange = {
    provider_ref: string;
    reason: string;
    outcome: ExistingChildCommitOutcome;
};

export type ExistingChildCommitPlan = {
    proposal_id: string;
    record_id: string;
    organization_id: string;
    customer_id: string;
    approved_changes: ExistingChildCommitPlanChange[];
    skipped_changes: ExistingChildSkippedChange[];
};

export type ExistingChildFieldResult = ExistingChildCommitPlanChange & {
    outcome: ExistingChildCommitOutcome;
    message?: string;
};

export type ExistingChildCommitResult = {
    proposal_id: string;
    record_id: string;
    organization_id: string;
    status: "committed" | "partial" | "blocked" | "noop";
    field_results: ExistingChildFieldResult[];
    skipped_changes: ExistingChildSkippedChange[];
};
