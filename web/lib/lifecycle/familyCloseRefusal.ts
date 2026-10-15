/**
 * A FAMILY CASE CANNOT CLOSE OUT FROM UNDER ITS CHILDREN — ONE RULE FOR EVERY CLOSE PATH (E2E-09).
 *
 * The invariant used to be enforced in exactly one place, the `update_family_case_status` branch of
 * the outcome target executor. Other paths write the same "close this lead" meaning and did not
 * ask:
 *
 *   - the Mutation Runtime `update_lead_status` / `close_lead` commands (BOS, and Manage), which
 *     write `opportunities.status_key` through `execute_lead_status_mutation`;
 *   - the case grain of the enrollment-status transition ("Update Status" → Closed Lost), which
 *     writes through `updateOpportunityStatusWithEvent`;
 *   - the Action runtime's `update_status`, which writes through the same helper;
 *   - the legacy definition-driven executor (`executeAdminAction` — `update_status` and `open_form`
 *     with a status submit or `after.update_status_key`), which `POST /api/admin/actions/execute`
 *     falls back to for any key that is not a registered capability, and which writes
 *     `opportunities.status_key` directly from a tenant `action_definitions` row.
 *
 * Each could close a family whose waitlisted or enrolled child tracks were still live. The governed
 * family close (`executeGovernedFamilyClose`) closes those children FIRST, so it passes this rule on
 * the evidence; every other path now refuses with the same reasons.
 *
 * Only closes are asked. A write that leaves the case open costs nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    describeFamilyCloseBlock,
    evaluateFamilyCloseGuard,
    type FamilyCloseBlockedReason,
} from "@/lib/lifecycle/familyCloseGuard";
import { isConfiguredClosedStatus } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import { readEnrollmentInstancesForLead, type ProcessInstanceRow } from "@/lib/process/processInstances";
import { TERMINAL_CHILD_STATUS_KEYS } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

/** Participation outcomes that are themselves a live Enrollment answer for the child. */
const ACTIVE_PARTICIPATION_OUTCOMES: readonly string[] = ["waitlisted", "enrolling", "enrolled"];

/**
 * Each journey's state as the DURABLE OWNER states it.
 *
 * The child's durable Enrollment state is the participation's `outcome_status_key`; the process
 * instance owns execution state (`status-and-state-system.md`, `enrollmentDurableStateOwnership`).
 * Reading only the instance read a non-owner that the exit paths do not converge: measured on
 * deployed staging, a child withdrawn through the canonical child transition kept an `enrolling`
 * journey, and the family could then never close. So the owner speaks first — a concluded or live
 * participation outcome is the child's state — and the journey's own state decides only when the
 * participation carries neither (`new_inquiry`, null). A participation read that fails refuses.
 */
async function withOwnerState(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    rows: readonly ProcessInstanceRow[],
): Promise<{ ok: true; rows: ProcessInstanceRow[] } | { ok: false; error: string }> {
    if (!rows.length) return { ok: true, rows: [] };
    const { data, error } = await supabase
        .from("opportunity_customer_members")
        .select("id, customer_member_id, outcome_status_key")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);
    if (error) return { ok: false, error: `participation read failed: ${error.message}` };
    if (!Array.isArray(data)) return { ok: false, error: "participations unreadable" };
    const byId = new Map<string, string | null>();
    const byMember = new Map<string, string | null>();
    for (const p of data as { id: string; customer_member_id: string | null; outcome_status_key: string | null }[]) {
        byId.set(String(p.id), p.outcome_status_key ?? null);
        if (p.customer_member_id) byMember.set(String(p.customer_member_id), p.outcome_status_key ?? null);
    }
    return {
        ok: true,
        rows: rows.map((row) => {
            const outcome = (byId.get(String(row.context_id ?? "")) ?? byMember.get(String(row.subject_id ?? "")) ?? "")
                .trim();
            const owned = TERMINAL_CHILD_STATUS_KEYS.includes(outcome) || ACTIVE_PARTICIPATION_OUTCOMES.includes(outcome);
            return owned ? { ...row, state: outcome } : row;
        }),
    };
}

/**
 * Does this family case status close the case?
 *
 * Uses the SHARED closed-status predicate rather than a local `=== "closed"`, so the guard agrees
 * with Organization → Statuses and the Business Process editor by construction.
 *
 * Deliberately pure. An earlier version read the org's status catalog first, which was more
 * configurable in theory and wrong in practice: it pulled `createAdminClient` onto a code path
 * that outcome execution reaches with an injected client, and it charged every family status write
 * — including the `open` ones — an extra query to answer a question the canonical case domain
 * already settles. `opportunities.status_key` is `open | closed` by migration doctrine, which is
 * exactly the key-level resolution this predicate applies for the opportunity grain.
 */
export function familyCaseStatusCloses(statusKey: string): boolean {
    return isConfiguredClosedStatus({
        status_key: statusKey,
        status_label: statusKey,
        entity_type: "opportunities",
        is_active: true,
        metadata: null,
    });
}

export type FamilyCloseRefusal = {
    error: string;
    blocked_reasons: FamilyCloseBlockedReason[];
};

/**
 * Null when this status write may proceed: it does not close the case, or no child track is live.
 * Otherwise the refusal, with structured reasons a command surface can name. A failed read of the
 * children refuses — "could not read" is never "no children".
 */
export async function familyCloseRefusal(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        opportunityId: string;
        targetStatusKey: string;
        /**
         * The caller's action IS a close, whatever status string it writes. Case-grain "Lost /
         * Withdrawn" resolves `withdrawn`, legacy `mark_lost` writes `lost`, and `close_lead` lets
         * the operator pick any active status — each closes the case, and keying the refusal on the
         * status string alone let them through on a tenant where those keys are active (measured on
         * the certification tenant: case-grain Lost / Withdrawn wrote `withdrawn` over a waitlisted
         * child). The refusal follows the close INTENT; what each path writes is unchanged.
         */
        closesCase?: boolean;
    },
): Promise<FamilyCloseRefusal | null> {
    if (args.closesCase !== true && !familyCaseStatusCloses(args.targetStatusKey)) return null;
    const journeys = await readEnrollmentInstancesForLead(supabase, {
        orgId: args.orgId,
        opportunityId: args.opportunityId,
    });
    const read = journeys.ok
        ? await withOwnerState(supabase, args.orgId, args.opportunityId, journeys.rows)
        : journeys;
    const decision = evaluateFamilyCloseGuard(read);
    if (decision.allowed) return null;
    return {
        error:
            "This lead cannot be closed while child enrollment tracks are still active ("
            + describeFamilyCloseBlock(decision)
            + ").",
        blocked_reasons: decision.reasons,
    };
}
