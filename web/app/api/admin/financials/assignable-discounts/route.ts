import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { readPolicies } from "@/lib/commercial/execution/export/readCommercialConfig";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readLivePolicyAssignmentsByMember } from "@/lib/financials/reductions/commercialPolicyAssignmentService";
import { REDUCTION_KINDS } from "@/lib/financials/reductions/resolveFinancialReductions";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/assignable-discounts?customer_id=…
 *
 * WHICH CONFIGURED DISCOUNTS COULD THIS HOUSEHOLD'S CHILDREN BE GIVEN — the options an operator
 * chooses from when adding a discount to a child who does not already receive one.
 *
 * ── WHAT MAKES A POLICY A CANDIDATE ───────────────────────────────────────────────────────────
 *
 * Its TYPE and its LIFE, and nothing else. `REDUCTION_KINDS` is the canonical list of policy
 * types that reduce money — the same constant the forecast filters on — so proration rules,
 * eligibility rules and approval rules never appear in a discount selector. An inactive policy or
 * one whose effective window has closed is not a candidate either.
 *
 * ── WHAT DOES NOT MAKE IT A CANDIDATE ─────────────────────────────────────────────────────────
 *
 * Whether the rules ALREADY reach the child. That is the whole point of assignment: an operator
 * gives a family a configured discount the rules did not reach, and filtering the list by the
 * rules would hide exactly the policies they came here to assign.
 *
 * ── AND WHAT THIS DOES NOT PROMISE ────────────────────────────────────────────────────────────
 *
 * That an assigned policy will reduce any particular charge. The policy's own `applies_to` and
 * the charge category's discountability are asked by the canonical resolver, per charge, and an
 * assignment never overrides them. This route answers "what may I give this child", not "what
 * will it be worth".
 *
 * READ ONLY. `fin.read`, like every other Financials read.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    const customerId = (request.nextUrl.searchParams.get("customer_id") ?? "").trim();
    if (!customerId) return NextResponse.json({ error: "customer_id is required" }, { status: 400 });

    try {
        const today = new Date().toISOString().slice(0, 10);
        const policies = await readPolicies({ supabase, orgId: ctx.orgId } as never);

        const candidates = policies
            .filter((p) => p.isActive)
            .filter((p) => (REDUCTION_KINDS as readonly string[]).includes(p.kind))
            .filter((p) => !p.effective.end || p.effective.end >= today)
            .map((p) => ({
                policyId: p.id,
                label: p.label ?? (p.params?.label as string | undefined) ?? p.kind,
                kind: p.kind,
                /*
                 * THE AUTHORED RATE, READ-ONLY. Carried so a selector can say "Sibling discount ·
                 * 10%" rather than making an operator choose a name with no number beside it. It
                 * is the policy's own value and this route neither computes nor stores it — what
                 * an assignment records is which policy, never what it is worth.
                 */
                basis: typeof p.params?.basis === "string" ? (p.params.basis as string) : null,
                basisValue: typeof p.params?.value === "number" ? (p.params.value as number) : null,
                /* What the policy says it covers, so a surface can be honest about its limits. */
                appliesTo: typeof p.params?.applies_to === "string" ? (p.params.applies_to as string) : null,
            }));

        /*
         * WHAT EACH CHILD ALREADY HAS, so a selector does not offer a discount they already
         * receive — the write would be refused by the unique index anyway, and offering it is
         * how an operator ends up believing they changed something.
         */
        const { data: memberRows } = await supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("customer_id", customerId);
        const memberIds = ((memberRows ?? []) as Array<{ id: string }>).map((m) => m.id);
        const assigned = await readLivePolicyAssignmentsByMember(supabase, {
            orgId: ctx.orgId,
            customerMemberIds: memberIds,
            onDate: today,
        });

        return NextResponse.json({
            customerId,
            candidates,
            assignedByMember: Object.fromEntries(
                [...assigned.entries()].map(([memberId, list]) => [
                    memberId,
                    list.map((a) => ({
                        assignmentId: a.id,
                        policyId: a.policyId,
                        effectiveStart: a.effectiveStart,
                        opportunityCustomerMemberId: a.opportunityCustomerMemberId,
                    })),
                ]),
            ),
        });
    } catch (e) {
        /* FAIL CLOSED: an empty selector reads as "this organisation has no discounts". */
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
