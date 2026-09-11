/**
 * ONE OBLIGATION, ANSWERED ONCE — the canonical read behind charge detail.
 *
 * ── WHY THIS EXISTS ──
 *
 * Financials had no charge-detail surface. The Charges section lists a work queue of drafts, and a
 * queue row is a preview: it carries the amount ALREADY on the charge and says so, explicitly not a
 * balance, a net or a total. Building a detail view on top of those rows would have meant deriving
 * the money in a component — which is how a presentation layer becomes a second financial
 * authority, and the failure this whole thread has been unpicking.
 *
 * So nothing here decides anything about money. Every figure is asked of the service that already
 * owns it and passed through:
 *
 *   * `resolveFamilyCollectible` — gross, reductions, net, applied, outstanding, expected subsidy,
 *     submitted-claim suppression and collectible-now for THIS charge (Threads 8, 9 and 10);
 *   * `readResponsibility` — the named parties and the unassigned amount (Thread 6), the same
 *     reader the account card uses, so the two cannot answer differently;
 *   * the charge row and its billable source — identity, dates, lifecycle and attribution
 *     (Thread 1).
 *
 * This composition adds no arithmetic of its own. It joins.
 *
 * ── ATTRIBUTION ──
 *
 * A charge billed from an enrolment agreement is about that agreement's child. A charge billed from
 * the household is about the household and has no child — `customerMemberId` is null and that null
 * is an answer, not a gap to fill. Nothing here reaches for "the family's first child" when the
 * charge does not name one.
 *
 * ── PERIOD ──
 *
 * The charge's own service date, not today's billing period. The account card is deliberately
 * scoped to the current period and says so on its face; a selected obligation is not, and an
 * October charge opened in September is still an October charge.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { readResponsibility } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";
import {
    readAccountArrangement,
    type AccountArrangement,
} from "@/lib/financials/responsibility/readAccountArrangement";
import type { CollectiblePosition } from "@/lib/financials/subsidy/collectiblePosition";

/** One payment that satisfied part of this charge, as the operator needs to read it. */
export type ChargeDetailApplication = {
    paymentId: string;
    allocatedAmountCents: number;
    /** What the payer actually did — cash, check, card, bank debit. Never inferred. */
    method: string | null;
    /** The payment's own status, so money still in flight is not shown as settled. */
    paymentStatus: string | null;
    /**
     * THE APPLICATION'S OWN STATUS, and the reason it is here.
     *
     * An allocation can be reversed while the payment that made it stands. The collectible position
     * stops counting a reversed allocation — correctly — so a surface that lists every allocation
     * as applied money shows a family paying for something the balance says they still owe. The
     * status travels with the row so the presentation can tell the two apart instead of implying
     * one from the other.
     */
    status: string | null;
    receivedAt: string | null;
    referenceNumber: string | null;
};

export type ChargeDetail = {
    chargeId: string;
    orgId: string;

    /** IDENTITY — what an operator is looking at, before any money. */
    label: string | null;
    description: string | null;
    currencyCode: string;
    /** "posted" | "draft" | "void" | whatever the spine says. Never re-derived here. */
    status: string;
    serviceDate: string | null;
    postedAt: string | null;

    /** ATTRIBUTION — the child this is about, or null when it is genuinely the household's. */
    customerId: string | null;
    customerMemberId: string | null;
    householdName: string | null;
    childName: string | null;
    /** How the charge came to exist: an agreement, or the household itself. */
    billableSourceType: string;
    billableSourceId: string;
    enrollmentAgreementId: string | null;

    /**
     * THE MONEY, ENTIRELY FROM THE CANONICAL RESOLVER.
     *
     * Null only when the resolver declines to speak for this charge — a draft owes nothing yet, and
     * a reduction row is not an obligation. A caller must render the identity above and say the
     * money is not applicable, rather than substituting zeros that read as "nothing is owed".
     */
    position: CollectiblePosition | null;

    /** WHO OWES IT — Thread 6's persisted allocations, named. */
    responsibility: {
        allocatedCents: number;
        unassignedCents: number;
        parties: { personId: string | null; name: string; assignedCents: number }[];
    };
    /** Funding expected against it. An expectation, never money received. */
    expectedFunding: { label: string; sourceType: string; expectedCents: number | null }[];

    /** WHAT HAS ACTUALLY BEEN PAID AGAINST IT. */
    applications: ChargeDetailApplication[];

    /*
     * THE ACCOUNT'S ARRANGEMENT, WHICH IS NOT THIS CHARGE'S ALLOCATION.
     *
     * `responsibility` above says who bears THIS obligation. This says who bears the ACCOUNT, from
     * a date. A posted charge is not re-divided when an arrangement is configured — Thread 6
     * refuses to move billed money without an explicit decision — so the two can legitimately
     * disagree, and a surface that knows only the first tells an operator who has just created an
     * arrangement that there isn't one.
     */
    accountArrangement: AccountArrangement | null;
};

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/**
 * Resolve everything an operator needs to understand one charge.
 *
 * Returns null when the charge does not exist in this org — the caller's 404. Tenancy is enforced
 * by the org filter on every read here, not by the surface that called it.
 */
export async function resolveChargeDetail(
    supabase: SupabaseClient,
    args: { orgId: string; chargeId: string },
): Promise<ChargeDetail | null> {
    const chargeId = t(args.chargeId);
    if (!chargeId) return null;

    const { data: chargeRow, error } = await supabase
        .from("charges")
        .select(
            "id, billable_source_type, billable_source_id, amount_cents, currency_code, status, "
            + "service_date, posted_at, description, charge_template_id",
        )
        .eq("org_id", args.orgId)
        .eq("id", chargeId)
        .maybeSingle();
    if (error) throw new Error(`charge detail: the charge could not be read (${error.message.trim()})`);
    if (!chargeRow) return null;

    const charge = chargeRow as unknown as {
        id: string;
        billable_source_type: string;
        billable_source_id: string;
        amount_cents: number;
        currency_code: string | null;
        status: string;
        service_date: string | null;
        posted_at: string | null;
        description: string | null;
        charge_template_id: string | null;
    };

    /*
     * PROVENANCE DECIDES ATTRIBUTION. The agreement names both the household and the child; the
     * household source names only the household, and correctly so.
     */
    let customerId: string | null = null;
    let customerMemberId: string | null = null;
    let enrollmentAgreementId: string | null = null;
    if (charge.billable_source_type === "enrollment_agreement") {
        enrollmentAgreementId = charge.billable_source_id;
        const { data: agreement, error: agreementError } = await supabase
            .from("child_enrollment_agreements")
            .select("id, customer_id, customer_member_id")
            .eq("org_id", args.orgId)
            .eq("id", charge.billable_source_id)
            .maybeSingle();
        if (agreementError) {
            throw new Error(`charge detail: the agreement could not be read (${agreementError.message.trim()})`);
        }
        const a = agreement as unknown as { customer_id: string | null; customer_member_id: string | null } | null;
        customerId = a?.customer_id ?? null;
        customerMemberId = a?.customer_member_id ?? null;
    } else {
        customerId = charge.billable_source_id;
    }

    const [householdName, childName] = await Promise.all([
        (async () => {
            if (!customerId) return null;
            const { data } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
            return (data as unknown as { name: string | null } | null)?.name ?? null;
        })(),
        (async () => {
            if (!customerMemberId) return null;
            const { data } = await supabase
                .from("customer_members")
                .select("display_name")
                .eq("id", customerMemberId)
                .maybeSingle();
            return (data as unknown as { display_name: string | null } | null)?.display_name ?? null;
        })(),
    ]);

    /*
     * THE MONEY. A resolver refusal is not an error here: a draft owes nothing yet and a reduction
     * row is not an obligation, and both legitimately have no collectible position. The caller is
     * told so by a null rather than by zeros that would read as a settled balance.
     */
    let position: CollectiblePosition | null = null;
    try {
        position = await resolveFamilyCollectible(supabase, { orgId: args.orgId, chargeId } as never);
    } catch {
        position = null;
    }

    const responsibilityRead = await readResponsibility(supabase, args.orgId, [chargeId]);
    const accountArrangement = await readAccountArrangement(supabase, { orgId: args.orgId, customerId });

    const { data: allocationRows, error: allocationError } = await supabase
        .from("payment_allocations")
        .select("payment_id, allocated_amount_cents, status")
        .eq("charge_id", chargeId);
    if (allocationError) {
        throw new Error(`charge detail: applied payments could not be read (${allocationError.message.trim()})`);
    }
    const allocations = ((allocationRows ?? []) as unknown) as Array<{
        payment_id: string;
        allocated_amount_cents: number;
        status: string | null;
    }>;

    const paymentIds = [...new Set(allocations.map((a) => a.payment_id).filter(Boolean))];
    const paymentById = new Map<string, { status: string | null; method: string | null; receivedAt: string | null; reference: string | null }>();
    if (paymentIds.length > 0) {
        const { data: paymentRows, error: paymentError } = await supabase
            .from("payments")
            .select("id, status, payment_method, received_at, reference_number")
            .eq("org_id", args.orgId)
            .in("id", paymentIds);
        if (paymentError) {
            throw new Error(`charge detail: the payments behind applied money could not be read (${paymentError.message.trim()})`);
        }
        for (const row of ((paymentRows ?? []) as unknown) as Array<Record<string, unknown>>) {
            paymentById.set(t(row.id), {
                status: t(row.status) || null,
                method: t(row.payment_method) || null,
                receivedAt: t(row.received_at) || null,
                reference: t(row.reference_number) || null,
            });
        }
    }

    return {
        chargeId: charge.id,
        orgId: args.orgId,
        label: t(charge.description) || null,
        description: t(charge.description) || null,
        currencyCode: t(charge.currency_code) || "USD",
        status: t(charge.status),
        serviceDate: charge.service_date,
        postedAt: charge.posted_at,
        customerId,
        customerMemberId,
        householdName,
        childName,
        billableSourceType: charge.billable_source_type,
        billableSourceId: charge.billable_source_id,
        enrollmentAgreementId,
        position,
        responsibility: {
            allocatedCents: responsibilityRead.responsibility.allocatedCents,
            unassignedCents: responsibilityRead.responsibility.unassignedCents,
            parties: responsibilityRead.responsibility.parties.map((p) => ({
                personId: p.personId ?? null,
                name: p.name,
                assignedCents: p.assignedCents,
            })),
        },
        accountArrangement,
        expectedFunding: responsibilityRead.expectedFunding.map((f) => ({
            label: f.label,
            sourceType: f.sourceType,
            expectedCents: f.expectedCents,
        })),
        applications: allocations.map((a) => {
            const payment = paymentById.get(a.payment_id);
            return {
                paymentId: a.payment_id,
                allocatedAmountCents: Number(a.allocated_amount_cents) || 0,
                status: a.status ?? null,
                method: payment?.method ?? null,
                paymentStatus: payment?.status ?? null,
                receivedAt: payment?.receivedAt ?? null,
                referenceNumber: payment?.reference ?? null,
            };
        }),
    };
}
