/**
 * AFFIRMATIVE RELATIONSHIP POLICY ASSIGNMENT — "this commercial relationship receives this
 * configured policy."
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────
 *
 * A policy's reach is scoped by `scope_type` — org, location, program, offering, variant — and
 * never by relationship. So a child received a discount only by satisfying a RULE: sibling rank
 * and count, or an employee household. An operator who wanted to give one family a configured
 * discount the rules did not already reach had nowhere to say so, and nothing in the model could
 * record that they had decided it.
 *
 * ── WHAT IT CARRIES, AND WHAT IT REFUSES TO CARRY ────────────────────────────────────────────
 *
 * Identity and provenance: which policy, which relationship, from when, by whom. No percentage,
 * no amount, no basis, no cap, no eligibility rule — those are `commercial_policies.value` and
 * stay there. An assignment carrying its own rate would be a second place the discount is worth
 * something, and the two would disagree the first time somebody edited the policy.
 *
 * ── AND WHAT IT DOES NOT DECIDE ──────────────────────────────────────────────────────────────
 *
 * Whether the policy applies to a given CHARGE. The canonical resolver still asks `applies_to`
 * and the category's own discountability before an assignment is ever consulted, so a sibling
 * discount assigned to a child cannot reduce a Registration Fee the policy excludes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "commercial_policy_assignments";

export type PolicyAssignment = {
    id: string;
    policyId: string;
    opportunityCustomerMemberId: string;
    customerMemberId: string;
    effectiveStart: string;
    effectiveEnd: string | null;
    reason: string | null;
    createdBy: string | null;
    createdAt: string;
};

export type AssignmentRefusal =
    | "policy_required"
    | "relationship_required"
    | "member_required"
    | "invalid_effective_start"
    | "already_assigned"
    | "not_assigned"
    | "db_error";

export type AssignmentResult =
    | { ok: true; assignment: PolicyAssignment }
    | { ok: false; code: AssignmentRefusal; message: string };

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);

function toAssignment(row: Record<string, unknown>): PolicyAssignment {
    return {
        id: String(row.id),
        policyId: String(row.policy_id),
        opportunityCustomerMemberId: String(row.opportunity_customer_member_id),
        customerMemberId: String(row.customer_member_id),
        effectiveStart: String(row.effective_start ?? ""),
        effectiveEnd: row.effective_end ? String(row.effective_end) : null,
        reason: row.reason ? String(row.reason) : null,
        createdBy: row.created_by ? String(row.created_by) : null,
        createdAt: String(row.created_at ?? ""),
    };
}

/**
 * Live assignments for these relationships, indexed by `opportunityCustomerMemberId`.
 *
 * ONE QUERY, never per relationship — the eligibility reader asks about a whole household at once
 * and a per-child round trip there would ask the database the same question N times.
 *
 * "Live" means: not superseded, not ended, and covering the date asked about. An assignment that
 * has been ended is history and must not keep granting a discount.
 */
export async function readLivePolicyAssignments(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityCustomerMemberIds: readonly string[]; onDate: string },
): Promise<Map<string, PolicyAssignment[]>> {
    const index = new Map<string, PolicyAssignment[]>();
    const ids = [...new Set(args.opportunityCustomerMemberIds.map(t).filter(Boolean))];
    if (ids.length === 0) return index;

    const { data } = await supabase
        .from(TABLE)
        .select("id, policy_id, opportunity_customer_member_id, customer_member_id, effective_start, effective_end, reason, created_by, created_at")
        .eq("org_id", args.orgId)
        .in("opportunity_customer_member_id", ids)
        .is("superseded_at", null)
        .is("ended_at", null);

    for (const raw of ((data ?? []) as Array<Record<string, unknown>>)) {
        const row = toAssignment(raw);
        /*
         * THE WINDOW IS CHECKED HERE, not in the filter. PostgREST can express the date bounds,
         * but the open-ended case (`effective_end is null`) needs an OR that reads worse than the
         * comparison itself — and getting it wrong would grant a discount outside its window.
         */
        if (row.effectiveStart && row.effectiveStart > args.onDate) continue;
        if (row.effectiveEnd && row.effectiveEnd < args.onDate) continue;
        index.set(row.opportunityCustomerMemberId, [...(index.get(row.opportunityCustomerMemberId) ?? []), row]);
    }
    return index;
}

/**
 * Live assignments for a household's CHILDREN, indexed by `customer_member_id`.
 *
 * The eligibility reader ranks siblings by `customer_members.id` and knows nothing about
 * commercial relationships, so asking it to resolve `opportunity_customer_member_id` first would
 * make it learn a second key for no reason. The table carries the child id alongside the
 * relationship id — denormalised for exactly this, the same way the pricing term does it — so
 * this reads by the key the caller already holds.
 */
export async function readLivePolicyAssignmentsByMember(
    supabase: SupabaseClient,
    args: { orgId: string; customerMemberIds: readonly string[]; onDate: string },
): Promise<Map<string, PolicyAssignment[]>> {
    const index = new Map<string, PolicyAssignment[]>();
    const ids = [...new Set(args.customerMemberIds.map(t).filter(Boolean))];
    if (ids.length === 0) return index;

    const { data } = await supabase
        .from(TABLE)
        .select("id, policy_id, opportunity_customer_member_id, customer_member_id, effective_start, effective_end, reason, created_by, created_at")
        .eq("org_id", args.orgId)
        .in("customer_member_id", ids)
        .is("superseded_at", null)
        .is("ended_at", null);

    for (const raw of ((data ?? []) as Array<Record<string, unknown>>)) {
        const row = toAssignment(raw);
        if (row.effectiveStart && row.effectiveStart > args.onDate) continue;
        if (row.effectiveEnd && row.effectiveEnd < args.onDate) continue;
        index.set(row.customerMemberId, [...(index.get(row.customerMemberId) ?? []), row]);
    }
    return index;
}

/** Every assignment ever made for one relationship, newest first. History, not current state. */
export async function readAssignmentHistory(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityCustomerMemberId: string },
): Promise<PolicyAssignment[]> {
    const { data } = await supabase
        .from(TABLE)
        .select("id, policy_id, opportunity_customer_member_id, customer_member_id, effective_start, effective_end, reason, created_by, created_at")
        .eq("org_id", args.orgId)
        .eq("opportunity_customer_member_id", t(args.opportunityCustomerMemberId))
        .order("effective_start", { ascending: false });
    return ((data ?? []) as Array<Record<string, unknown>>).map(toAssignment);
}

/**
 * Give one relationship one configured policy.
 *
 * The unique index refuses a duplicate live assignment for the same policy, relationship and
 * start date, so a double submit cannot leave two. This reads first for a useful message and
 * relies on the index for the guarantee — a check alone races with itself.
 */
export async function assignPolicyToRelationship(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        policyId: string;
        opportunityCustomerMemberId: string;
        customerMemberId: string;
        effectiveStart: string;
        reason?: string | null;
        actorUserId?: string | null;
    },
): Promise<AssignmentResult> {
    if (!t(args.policyId)) return { ok: false, code: "policy_required", message: "Name the discount to add." };
    if (!t(args.opportunityCustomerMemberId)) {
        return { ok: false, code: "relationship_required", message: "Name the child this is for." };
    }
    if (!t(args.customerMemberId)) {
        return { ok: false, code: "member_required", message: "Name the child this is for." };
    }
    if (!isDate(t(args.effectiveStart))) {
        return { ok: false, code: "invalid_effective_start", message: "Name the date this discount starts." };
    }

    const live = await readLivePolicyAssignments(supabase, {
        orgId: args.orgId,
        opportunityCustomerMemberIds: [args.opportunityCustomerMemberId],
        onDate: t(args.effectiveStart),
    });
    if ((live.get(t(args.opportunityCustomerMemberId)) ?? []).some((a) => a.policyId === t(args.policyId))) {
        return { ok: false, code: "already_assigned", message: "This child already receives that discount." };
    }

    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            org_id: args.orgId,
            policy_id: t(args.policyId),
            opportunity_customer_member_id: t(args.opportunityCustomerMemberId),
            customer_member_id: t(args.customerMemberId),
            effective_start: t(args.effectiveStart),
            reason: t(args.reason ?? "") || null,
            created_by: args.actorUserId ?? null,
        })
        .select("id, policy_id, opportunity_customer_member_id, customer_member_id, effective_start, effective_end, reason, created_by, created_at")
        .single();
    if (error) {
        /* The index speaking is the same refusal the read above gives, arriving a moment later. */
        if (/duplicate key|unique/i.test(error.message)) {
            return { ok: false, code: "already_assigned", message: "This child already receives that discount." };
        }
        return { ok: false, code: "db_error", message: error.message };
    }
    return { ok: true, assignment: toAssignment(data as Record<string, unknown>) };
}

/**
 * Stop a relationship receiving a policy, from a date.
 *
 * ENDED, NEVER DELETED. The row is the record that somebody gave this family this discount and
 * for how long; removing it would make the money that was already reduced unexplainable. The
 * resolver stops consulting it the day after `effective_end`.
 */
export async function endPolicyAssignment(
    supabase: SupabaseClient,
    args: { orgId: string; assignmentId: string; effectiveEnd: string; actorUserId?: string | null },
): Promise<AssignmentResult> {
    const id = t(args.assignmentId);
    if (!id) return { ok: false, code: "not_assigned", message: "Name the discount being removed." };
    if (!isDate(t(args.effectiveEnd))) {
        return { ok: false, code: "invalid_effective_start", message: "Name the date this discount ends." };
    }

    const { data, error } = await supabase
        .from(TABLE)
        .update({
            effective_end: t(args.effectiveEnd),
            ended_at: new Date().toISOString(),
            ended_by: args.actorUserId ?? null,
        })
        .eq("org_id", args.orgId)
        .eq("id", id)
        /* Only an assignment that still stands can be ended; ending an ended one moves no money. */
        .is("ended_at", null)
        .select("id, policy_id, opportunity_customer_member_id, customer_member_id, effective_start, effective_end, reason, created_by, created_at")
        .maybeSingle();
    if (error) return { ok: false, code: "db_error", message: error.message };
    if (!data) {
        return {
            ok: false,
            code: "not_assigned",
            message: "That discount is not in force — it was already removed, or it is not this organisation's.",
        };
    }
    return { ok: true, assignment: toAssignment(data as Record<string, unknown>) };
}
