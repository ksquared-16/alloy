import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readAssignmentDiscountPosition } from "@/lib/financials/reductions/readAssignmentDiscountPosition";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/family-discount-position?customer_id=…
 *
 * WHAT DISCOUNTS AFFECT THIS FAMILY'S FINANCIAL POSITION — the question the account surface asks,
 * which is a different question from the one an Assignment asks about one child.
 *
 * ── WHY THIS EXISTS AND WHAT IT IS NOT ────────────────────────────────────────────────────────
 *
 * An operator looking at a family's finances had to open each child's Assignment to learn what
 * discount was expected, or travel to organization configuration to read a policy that says
 * nothing about THIS family. The position belongs where the money is.
 *
 * It is NOT a second eligibility engine. Every figure below comes from
 * `readAssignmentDiscountPosition`, the same one call into `forecastAssignmentReductions` that the
 * assignment-grain route makes. This route decides which relationships to ask about and groups the
 * answers by policy; it resolves no eligibility, applies no rate and sums no discount.
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
        /*
         * The household's commercial relationships. An agreement carries the household and the
         * child; the forecast is asked per relationship because that is the grain a discount is
         * actually resolved at — a sibling policy means different money for different children.
         */
        const { data: agreements } = await supabase
            .from("child_enrollment_agreements")
            .select("id, customer_id, customer_member_id, opportunity_customer_member_id")
            .eq("org_id", ctx.orgId)
            .eq("customer_id", customerId);

        const rows = (agreements ?? []) as {
            opportunity_customer_member_id: string | null;
            customer_member_id: string | null;
        }[];
        const ocmIds = [...new Set(rows.map((r) => r.opportunity_customer_member_id).filter(Boolean))] as string[];

        const positions = await Promise.all(
            ocmIds.map((ocmId) => readAssignmentDiscountPosition(supabase, { orgId: ctx.orgId, opportunityCustomerMemberId: ocmId })),
        );

        /*
         * ── GROUPED BY POLICY, BECAUSE THAT IS WHAT THE OPERATOR IS LOOKING AT ────────────────
         *
         * "Sibling discount, 10%, Certa $18.50, Certb $145.00" is one policy affecting two
         * children — not two unrelated discounts. The grouping is presentation of the forecast's
         * own lines; the amounts are carried through exactly as the forecast stated them.
         */
        const byPolicy = new Map<string, {
            policyId: string;
            policyKind: string;
            label: string;
            /** The forecast's own words for HOW it was derived — never re-derived here. */
            explanation: string | null;
            subjects: {
                opportunityCustomerMemberId: string;
                customerMemberId: string | null;
                expectedCents: number;
                currencyCode: string;
                /*
                 * THE AUTHORED RATE, per subject, carried from the resolver that computed it.
                 * A reader must be able to see "10%" without dividing the expected amount by a
                 * basis it was never given — and two children on one policy at one rate cannot be
                 * recognised as the SAME answer unless the rate itself travels.
                 */
                basis: "percentage" | "amount" | null;
                basisValue: number | null;
                /*
                 * THE BASIS IS PER RELATIONSHIP, NOT PER POLICY. One sibling policy produced
                 * "10% of $185.00" for one child and "10% of $1,450.00" for the other; carrying
                 * the first at the policy header stated one child's basis as if it were the
                 * policy's. The forecast says it per outcome, so it is kept per subject.
                 */
                explanation: string | null;
            }[];
        }>();
        /* Why a relationship expects nothing — the sentence an operator needs when a discount is absent. */
        const notExpected: { opportunityCustomerMemberId: string; reason: string }[] = [];

        for (const p of positions) {
            for (const outcome of p.forecast?.outcomes ?? []) {
                if (outcome.kind === "expected") {
                    const entry = byPolicy.get(outcome.policyId) ?? {
                        policyId: outcome.policyId,
                        policyKind: outcome.policyKind,
                        label: outcome.label,
                        explanation: outcome.explanation ?? null,
                        subjects: [],
                    };
                    entry.subjects.push({
                        opportunityCustomerMemberId: p.opportunityCustomerMemberId,
                        customerMemberId: p.customerMemberId,
                        /* Carried through exactly as the forecast stated it. Nothing is summed here. */
                        expectedCents: outcome.amountCents,
                        currencyCode: p.forecast?.currencyCode ?? p.currencyCode ?? "USD",
                        basis: outcome.basis ?? null,
                        basisValue: outcome.basisValue ?? null,
                        explanation: outcome.explanation ?? null,
                    });
                    byPolicy.set(outcome.policyId, entry);
                    continue;
                }
                notExpected.push({
                    opportunityCustomerMemberId: p.opportunityCustomerMemberId,
                    reason: outcome.kind === "not_expected" ? outcome.reason : outcome.reason,
                });
            }
        }

        return NextResponse.json({
            ok: true,
            customerId,
            relationships: positions.length,
            /* Every policy expected to affect this family, with the per-child effect the forecast stated. */
            policies: [...byPolicy.values()],
            /* And why a relationship expects nothing, in the forecast's own words. */
            notExpected,
            /* Exceptions are provenance-bearing decisions, carried per relationship, never summed. */
            exceptions: positions.flatMap((p) =>
                p.exceptions.map((e) => ({ ...e, opportunityCustomerMemberId: p.opportunityCustomerMemberId })),
            ),
            /* Relationships the forecast could say nothing about, and why — never silently dropped. */
            withoutForecast: positions.filter((p) => p.reason).map((p) => ({
                opportunityCustomerMemberId: p.opportunityCustomerMemberId,
                reason: p.reason,
            })),
        });
    } catch (e) {
        /* FAIL CLOSED: "no discount expected" is a claim an operator acts on. */
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
