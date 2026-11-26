/**
 * After Processing Create Lead commit, apply layout-runtime side writes that the
 * identity plan does not cover (mailing address, role contacts, child-scoped contacts).
 *
 * Intake snapshot lives on `processing_cases.metadata.create_lead_intake`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyCreateLeadLayoutRuntimePersistence } from "@/lib/admin/actions/applyCreateLeadLayoutRuntimePersistence";
import { readCreateLeadCommitSelectionFromPayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import type { CommitAttempt } from "../executor/executorTypes";
import { IDENTITY_COMMAND_KEYS } from "../commands/commandKeys";

function committedRecordId(
    attempt: CommitAttempt,
    commandKey: string,
): string | null {
    const op = attempt.operations.find(
        (o) => o.commandKey === commandKey && o.status === "committed" && o.recordId,
    );
    return op?.recordId ? String(op.recordId) : null;
}

/** Best-effort post-commit persistence; never fails the identity commit itself. */
export async function applyCreateLeadPostCommitPersistence(
    supabase: SupabaseClient,
    input: { orgId: string; caseId: string; attempt: CommitAttempt },
): Promise<void> {
    const { attempt } = input;
    if (attempt.outcome !== "committed" && attempt.outcome !== "partially_committed") return;

    const opportunityId = committedRecordId(attempt, IDENTITY_COMMAND_KEYS.createLead);
    const customerId = committedRecordId(attempt, IDENTITY_COMMAND_KEYS.createHousehold);
    const primaryPersonId = committedRecordId(attempt, IDENTITY_COMMAND_KEYS.createPerson);
    if (!opportunityId || !customerId || !primaryPersonId) return;

    const { data: caseRow, error } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", input.orgId)
        .eq("id", input.caseId)
        .maybeSingle();
    if (error || !caseRow) return;

    const metadata = (caseRow as { metadata?: Record<string, unknown> | null }).metadata ?? {};
    const intake = (metadata.create_lead_intake ?? null) as Record<string, unknown> | null;
    if (!intake) return;

    const merged = (intake.merged ?? {}) as Record<string, unknown>;
    const selection = readCreateLeadCommitSelectionFromPayload(merged);

    try {
        await applyCreateLeadLayoutRuntimePersistence(supabase, {
            orgId: input.orgId,
            customerId,
            opportunityId,
            primaryPersonId,
            merged,
            selection,
        });
    } catch (e) {
        console.error("[create_lead] post-commit layout persistence failed", {
            caseId: input.caseId,
            opportunityId,
            message: e instanceof Error ? e.message : String(e),
        });
    }
}

