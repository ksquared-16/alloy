import type { SupabaseClient } from "@supabase/supabase-js";
import {
    applyCustomerMemberMutationPatch,
    buildCustomerMemberPatchBodyFromFieldKeys,
} from "@/lib/fields/mutation/resolveMutationCapability";
import type { ExistingChildCommitPlan, ExistingChildCommitResult } from "@/lib/pos/processingCase/commit/children/types";

export async function executeExistingChildCommitPlan(args: {
    supabase: SupabaseClient;
    plan: ExistingChildCommitPlan;
}): Promise<ExistingChildCommitResult> {
    const plan = args.plan;
    if (plan.approved_changes.length === 0) {
        return {
            proposal_id: plan.proposal_id,
            record_id: plan.record_id,
            organization_id: plan.organization_id,
            status: plan.skipped_changes.length > 0 ? "blocked" : "noop",
            field_results: [],
            skipped_changes: plan.skipped_changes,
        };
    }

    const patchBody = buildCustomerMemberPatchBodyFromFieldKeys(
        plan.approved_changes.map((change) => ({ field_key: change.canonical_ref.field_key, value: change.proposed_value })),
    );

    const applied = await applyCustomerMemberMutationPatch({
        supabase: args.supabase,
        orgId: plan.organization_id,
        memberId: plan.record_id,
        body: patchBody,
    });

    if (!applied.ok) {
        return {
            proposal_id: plan.proposal_id,
            record_id: plan.record_id,
            organization_id: plan.organization_id,
            status: "blocked",
            field_results: plan.approved_changes.map((change) => ({ ...change, outcome: "failed", message: applied.error })),
            skipped_changes: plan.skipped_changes,
        };
    }

    const hasUnresolved = plan.skipped_changes.some((s) =>
        s.outcome === "deferred" || s.outcome === "stale_conflict" || s.outcome === "invalid" || s.outcome === "unsupported" || s.outcome === "unauthorized" || s.outcome === "failed",
    );
    return {
        proposal_id: plan.proposal_id,
        record_id: plan.record_id,
        organization_id: plan.organization_id,
        status: hasUnresolved ? "partial" : "committed",
        field_results: plan.approved_changes.map((change) => ({ ...change, outcome: "updated" })),
        skipped_changes: plan.skipped_changes,
    };
}
