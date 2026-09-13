/**
 * WHERE A PAYMENT MAY GO — the charges a given receipt is allowed to answer.
 *
 * This exists so an operator moving money is offered real choices instead of typing an id. It is a
 * CHOOSER, not a boundary: `applyPaymentToCharge` already refuses a charge belonging to another
 * household, and that refusal is what makes a forged target safe. If this function and that guard
 * ever disagree, the guard is right. Omitting a charge here is a courtesy; refusing it there is the
 * rule.
 *
 * ── WHY THE HOUSEHOLD IS RESOLVED FIRST ──
 *
 * Candidates are narrowed to the payment's own household before any balance is read. That keeps the
 * per-charge balance reads bounded by what one family owes rather than by what the organisation owes,
 * and it means the expensive question is only asked about charges that could legally be answered.
 * Reusing `readChargeBalance` per candidate costs a query each, and is deliberate: outstanding is
 * canonical money arithmetic, and a second implementation of it here is exactly the kind of parallel
 * authority that drifts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveBillableSourceHouseholdId } from "@/lib/financials/billableSourceHousehold";
import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { readChargeBalance } from "@/lib/financials/childcarePaymentService";
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";

export type EligibleTargetCharge = {
    chargeId: string;
    /** What the operator reads on the row. Never an id. */
    label: string;
    serviceDate: string | null;
    outstandingCents: number;
    billableSourceType: string;
    billableSourceId: string;
};

type ChargeCandidate = {
    id: string;
    charge_template_id: string | null;
    billable_source_type: string | null;
    billable_source_id: string | null;
    charge_category: string | null;
    description: string | null;
    service_date: string | null;
    status: string;
};

/**
 * A readable name for a charge, preferring what the charge itself says it is.
 *
 * NO STORED KEYS ON SCREEN. A template-created charge carries no description, so the label falls
 * back to the stored category — and that value is a key. Mounted certification found the chooser
 * offering `registration_fee` to an operator deciding where money goes.
 *
 * The declared vocabulary answers first. It is not enough on its own: the category actually stored
 * on that charge was `registration_fee`, which is not in the vocabulary at all, so looking it up
 * returns the key unchanged. Anything the vocabulary does not know is therefore humanised rather
 * than passed through, which is the difference between a chooser that always reads as language and
 * one that reads as language only for the categories somebody remembered to enumerate.
 */
function labelFor(row: ChargeCandidate, labelByTemplateId: Map<string, string>): string {
    /*
     * `writeTemplateDraftCharge` stores `description: intent.templateKey`, so a template-created
     * charge's stored description is an internal key like `registration_fee`. The tenant already
     * named that template, and the card's read model resolves the same way — without this join the
     * chooser is the one surface in the product that shows the key.
     */
    const templateId = typeof row.charge_template_id === "string" ? row.charge_template_id.trim() : "";
    const configured = templateId ? (labelByTemplateId.get(templateId) ?? "").trim() : "";
    if (configured) return configured;
    const described = typeof row.description === "string" ? row.description.trim() : "";
    if (described) return described;
    const category = typeof row.charge_category === "string" ? row.charge_category.trim() : "";
    if (!category) return "Charge";
    const known = chargeCategoryLabel(category);
    if (known !== category) return known;
    const words = category.replace(/[_-]+/g, " ").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Charge";
}

/**
 * The charges this payment could be applied to, most recent service date first.
 *
 * Returns [] rather than throwing when the payment's household cannot be established: a chooser with
 * nothing in it is the honest presentation of "we cannot tell whose this money is", and the service
 * will refuse anyway if the operator forces a target.
 */
export async function resolveEligibleTargetCharges(
    supabase: SupabaseClient,
    input: { orgId: string; paymentId: string; excludeChargeIds?: readonly string[] },
): Promise<EligibleTargetCharge[]> {
    const orgId = input.orgId?.trim();
    const paymentId = input.paymentId?.trim();
    if (!orgId || !paymentId) return [];

    const { data: paymentRow, error: paymentError } = await supabase
        .from("payments")
        .select("id, billable_source_type, billable_source_id")
        .eq("org_id", orgId)
        .eq("id", paymentId)
        .maybeSingle();
    if (paymentError) return [];
    const payment = paymentRow as
        | { billable_source_type?: string | null; billable_source_id?: string | null }
        | null;
    if (!payment) return [];

    const household = await resolveBillableSourceHouseholdId(
        supabase,
        orgId,
        payment.billable_source_type ?? null,
        payment.billable_source_id ?? null,
    );
    if (!household) return [];

    const { data: chargeRows, error: chargeError } = await supabase
        .from("charges")
        .select(
            "id, charge_template_id, billable_source_type, billable_source_id, charge_category, "
            + "description, service_date, status",
        )
        .eq("org_id", orgId)
        .eq("status", "posted")
        .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES]);
    if (chargeError) return [];

    const exclude = new Set((input.excludeChargeIds ?? []).map((id) => id.trim()).filter(Boolean));
    const candidates = ((chargeRows ?? []) as unknown as ChargeCandidate[]).filter((c) => !exclude.has(c.id));

    /*
     * Household first, balance second. `resolveBillableSourceHouseholdId` is memoised per source here
     * because a family's charges overwhelmingly share one agreement, and asking the same question
     * once per charge is the N+1 this ordering exists to avoid.
     */
    const householdBySource = new Map<string, string | null>();
    const mine: ChargeCandidate[] = [];
    for (const c of candidates) {
        const key = `${c.billable_source_type ?? ""}:${c.billable_source_id ?? ""}`;
        if (!householdBySource.has(key)) {
            householdBySource.set(
                key,
                await resolveBillableSourceHouseholdId(
                    supabase,
                    orgId,
                    c.billable_source_type,
                    c.billable_source_id,
                ),
            );
        }
        if (householdBySource.get(key) === household) mine.push(c);
    }

    /*
     * The labels the tenant configured, in ONE lookup for the whole chooser rather than one per
     * charge. Deliberately not restricted to active templates: retiring a template does not rename
     * the charges it already created, and falling back to the stored description there would put
     * the key back on screen for exactly the charges whose history is oldest.
     */
    const templateIds = [...new Set(mine.map((c) => (c.charge_template_id ?? "").trim()).filter(Boolean))];
    const labelByTemplateId = new Map<string, string>();
    if (templateIds.length) {
        const { data: templateRows } = await supabase
            .from("financial_charge_templates")
            .select("id, label")
            .eq("org_id", orgId)
            .in("id", templateIds);
        for (const row of (templateRows ?? []) as Array<{ id?: string; label?: string | null }>) {
            const id = typeof row?.id === "string" ? row.id : "";
            const label = typeof row?.label === "string" ? row.label.trim() : "";
            if (id && label) labelByTemplateId.set(id, label);
        }
    }

    const eligible: EligibleTargetCharge[] = [];
    for (const c of mine) {
        const balance = await readChargeBalance(supabase, orgId, c.id);
        // A settled charge is not a place money can go.
        if (balance.outstandingCents <= 0) continue;
        eligible.push({
            chargeId: c.id,
            label: labelFor(c, labelByTemplateId),
            serviceDate: c.service_date,
            outstandingCents: balance.outstandingCents,
            billableSourceType: c.billable_source_type ?? "",
            billableSourceId: c.billable_source_id ?? "",
        });
    }

    eligible.sort((a, b) => (b.serviceDate ?? "").localeCompare(a.serviceDate ?? ""));
    return eligible;
}
