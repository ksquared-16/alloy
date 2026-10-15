/**
 * THE CROSS-HOUSEHOLD FINANCIAL WORK PROJECTION — selection, never arithmetic.
 *
 * Every canonical financial read in this platform answers about ONE account or ONE charge, because
 * every one of them belongs to a thread that owns a number. A workspace needs something none of them
 * provides: a list, across households, of work an operator could pick up. This is that list, and it
 * is deliberately the smallest thing that can be.
 *
 * ── WHAT IT IS ALLOWED TO KNOW ──
 *
 * Which charges are actionable, who they belong to, where they live, and what to call them. It
 * carries canonical ids so selection can hand off, and it stops there.
 *
 * ── WHAT IT MUST NEVER DO ──
 *
 * Compute outstanding, gross-to-net, responsibility, expected funding, subsidy suppression,
 * collectible-now, payment application, or a balance from journal deltas. Those have owners, and the
 * row deliberately carries none of them: a queue row shows an amount that is ALREADY on the charge,
 * and every derived figure appears after selection, from the thread that owns it. A projection that
 * quietly learned to total things would become a second financial authority by accident, which is
 * the specific failure this file exists to avoid.
 *
 * ── THE COHORT ──
 *
 * Draft childcare charges. `charge.post` is what makes a draft owed, so "draft" IS the eligibility —
 * there is no workspace-only status here and no duplicated rule. Job-vertical charges are excluded
 * because they are not childcare financial work, not because they are inconvenient.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";
import {
    awaitingPostingReason,
    type AwaitingPostingReason,
} from "@/lib/financials/posting/awaitingPostingReason";
import {
    isFinancialWorkVisible,
    resolveFinancialWorkLocation,
    type FinancialWorkLocationScope,
} from "@/lib/financials/workspace/financialWorkLocation";

export type FinancialWorkRow = {
    /** Canonical ids, so selection hands off rather than re-deriving. */
    chargeId: string;
    customerId: string | null;
    customerMemberId: string | null;
    enrollmentAgreementId: string | null;

    householdName: string | null;
    childName: string | null;

    categoryKey: string;
    categoryLabel: string;
    description: string | null;
    /** The amount ALREADY on the charge. Not a balance, not a net, not a total. */
    amountCents: number;
    currencyCode: string;
    serviceDate: string | null;
    periodKey: string | null;

    locationScope: FinancialWorkLocationScope;
    siteLocationId: string | null;
    siteName: string | null;
    locationProvenance: string;

    /**
     * WHY this draft is waiting, classified once on the server.
     *
     * `status = 'draft'` is the eligibility for this queue and says nothing about whether a person
     * is needed. Four unrelated situations share that status, and three of them are not work. The
     * classification travels with the row so a list, a count and a detail panel cannot describe the
     * same draft differently.
     */
    awaiting: AwaitingPostingReason;

    /*
     * ── IDENTITY FOR THE CROSS-ACCOUNT CHARGE INDEX (W7-F021) ─────────────────────────────────
     *
     * The same rows, read for more than drafts. Every field is a stored fact or a configured label —
     * the status as written, the charge type the tenant named, the commercial period the charge is
     * BOUND to (its service date's, never its invoice date's) — so the index needs no second
     * projection and computes no money. Optional: the work queue's draft read does not fetch them.
     */
    status?: string;
    chargeTemplateId?: string | null;
    /** The configured charge type's label, else the category's. */
    typeLabel?: string;
    /** Filter key: the template when there is one, else `category:<key>`. */
    typeKey?: string;
    /** The bound billing period key when bound, else the service month (legacy placement). */
    billingPeriodKey?: string | null;
    billableOn?: string | null;
    dueDate?: string | null;
    postedAt?: string | null;
    voidedAt?: string | null;
    createdAt?: string | null;
};

export type FinancialWorkQueue = {
    rows: FinancialWorkRow[];
    /** From the SAME cohort the rows came from — never a second count query that could disagree. */
    counts: {
        actionable: number;
        siteScoped: number;
        orgScoped: number;
        households: number;
        /**
         * Of the drafts returned, how many a PERSON has to act on — a failure that will not retry,
         * a review boundary, or a draft whose reason was never recorded. A charge waiting for its
         * billing period is excluded: the clock owns it.
         */
        needsAPerson: number;
        /**
         * And how many are waiting on the CALENDAR — a billing period that has not begun. Reported
         * separately so a band can say "nothing for you to do, three charges post next month"
         * instead of one number that means both things at once.
         */
        waitingOnADate: number;
    };
    scope: { siteLocationId: string | null; siteScope: "all" | "restricted" };
};

export async function resolveFinancialWorkQueue(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        /** The operator's own rights, resolved server-side. Never taken from a client. */
        siteScope: "all" | "restricted";
        allowedSiteLocationIds: readonly string[];
        /** The site the operator selected, or null for org scope. */
        activeSiteLocationId?: string | null;
        limit?: number;
        /**
         * Which stored statuses to read. Omitted, this is the WORK QUEUE — drafts only, oldest service
         * date first, exactly as before. The charge index (W7-F021) asks for every status, newest first.
         */
        statuses?: readonly string[];
    },
): Promise<FinancialWorkQueue> {
    const activeSiteLocationId = args.activeSiteLocationId?.trim() || null;
    const isIndex = Boolean(args.statuses?.length);
    const limit = Math.min(Math.max(args.limit ?? 200, 1), isIndex ? 2000 : 500);

    /*
     * DRAFT CHILDCARE CHARGES. `status = 'draft'` is the eligibility, because `charge.post` is what
     * a draft is waiting for — the action owns the rule and this does not restate it.
     */
    const { data: chargeRows, error } = isIndex
        ? await supabase
              .from("charges")
              .select(
                  "id, billable_source_type, billable_source_id, charge_category, charge_type, description, "
                  + "amount_cents, currency_code, service_date, billable_on, status, metadata, "
                  + "charge_template_id, billing_period_id, due_date, posted_at, voided_at, created_at",
              )
              .eq("org_id", args.orgId)
              .in("status", [...args.statuses!])
              .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
              .order("created_at", { ascending: false, nullsFirst: false })
              .limit(limit)
        : await supabase
              .from("charges")
              .select(
                  "id, billable_source_type, billable_source_id, charge_category, charge_type, description, "
                  + "amount_cents, currency_code, service_date, billable_on, status, metadata",
              )
              .eq("org_id", args.orgId)
              .eq("status", "draft")
              .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
              .order("service_date", { ascending: true, nullsFirst: false })
              .limit(limit);
    if (error) throw new Error(`financial work queue read failed: ${error.message}`);
    const charges = ((chargeRows ?? []) as unknown) as Array<{
        id: string;
        billable_source_type: string;
        billable_source_id: string;
        charge_category: string | null;
        charge_type: string | null;
        description: string | null;
        amount_cents: number;
        currency_code: string;
        service_date: string | null;
        billable_on: string | null;
        metadata: Record<string, unknown> | null;
        status?: string;
        charge_template_id?: string | null;
        billing_period_id?: string | null;
        due_date?: string | null;
        posted_at?: string | null;
        voided_at?: string | null;
        created_at?: string | null;
    }>;

    // ── PROVENANCE: each charge's OWN agreement, never the household's ──────────────────────
    const agreementIds = [
        ...new Set(charges.filter((c) => c.billable_source_type === "enrollment_agreement").map((c) => c.billable_source_id)),
    ];
    const { data: agreementRows } = agreementIds.length
        ? await supabase
              .from("child_enrollment_agreements")
              .select("id, customer_id, customer_member_id, site_location_id")
              .eq("org_id", args.orgId)
              .in("id", agreementIds)
        : { data: [] };
    const agreements = new Map(
        (((agreementRows ?? []) as unknown) as Array<{ id: string; customer_id: string | null; customer_member_id: string | null; site_location_id: string | null }>)
            .map((a) => [a.id, a]),
    );

    const customerIds = [
        ...new Set([
            ...charges.filter((c) => c.billable_source_type === "customer").map((c) => c.billable_source_id),
            ...[...agreements.values()].map((a) => a.customer_id).filter((v): v is string => !!v),
        ]),
    ];
    const { data: customerRows } = customerIds.length
        ? await supabase.from("customers").select("id, name").eq("org_id", args.orgId).in("id", customerIds)
        : { data: [] };
    const customerNames = new Map(
        (((customerRows ?? []) as unknown) as Array<{ id: string; name: string | null }>).map((c) => [c.id, c.name]),
    );

    const memberIds = [...new Set([...agreements.values()].map((a) => a.customer_member_id).filter((v): v is string => !!v))];
    const { data: memberRows } = memberIds.length
        ? await supabase.from("customer_members").select("id, display_name, first_name, last_name").eq("org_id", args.orgId).in("id", memberIds)
        : { data: [] };
    const memberNames = new Map(
        (((memberRows ?? []) as unknown) as Array<Record<string, unknown>>).map((m) => [
            String(m.id),
            String(m.display_name ?? "").trim()
                || [String(m.first_name ?? "").trim(), String(m.last_name ?? "").trim()].filter(Boolean).join(" ")
                || null,
        ]),
    );

    const siteIds = [...new Set([...agreements.values()].map((a) => a.site_location_id).filter((v): v is string => !!v))];
    const { data: siteRows } = siteIds.length
        ? await supabase.from("locations").select("id, label").eq("org_id", args.orgId).in("id", siteIds)
        : { data: [] };
    const siteNames = new Map(
        (((siteRows ?? []) as unknown) as Array<{ id: string; label: string | null }>).map((s) => [s.id, s.label]),
    );

    // ── INDEX ONLY: the configured charge type and the bound period, by id — labels, never money ──
    const templateIds = isIndex ? [...new Set(charges.map((c) => c.charge_template_id).filter((v): v is string => !!v))] : [];
    const { data: templateRows } = templateIds.length
        ? await supabase.from("financial_charge_templates").select("id, label").eq("org_id", args.orgId).in("id", templateIds)
        : { data: [] };
    const templateLabels = new Map(
        (((templateRows ?? []) as unknown) as Array<{ id: string; label: string | null }>).map((t) => [t.id, (t.label ?? "").trim()]),
    );
    const periodIds = isIndex ? [...new Set(charges.map((c) => c.billing_period_id).filter((v): v is string => !!v))] : [];
    const { data: periodRows } = periodIds.length
        ? await supabase.from("financial_billing_periods").select("id, period_key").eq("org_id", args.orgId).in("id", periodIds)
        : { data: [] };
    const periodKeys = new Map(
        (((periodRows ?? []) as unknown) as Array<{ id: string; period_key: string | null }>).map((p) => [p.id, (p.period_key ?? "").trim()]),
    );

    const rows: FinancialWorkRow[] = [];
    for (const charge of charges) {
        const agreement = charge.billable_source_type === "enrollment_agreement"
            ? agreements.get(charge.billable_source_id) ?? null
            : null;

        const location = resolveFinancialWorkLocation({
            billableSourceType: charge.billable_source_type,
            agreementSiteLocationId: agreement?.site_location_id ?? null,
        });
        // Work whose location cannot be resolved is WITHHELD rather than shown somewhere plausible.
        if (!location) continue;

        if (
            !isFinancialWorkVisible({
                location,
                siteScope: args.siteScope,
                allowedSiteLocationIds: args.allowedSiteLocationIds,
                activeSiteLocationId,
            })
        ) {
            continue;
        }

        const customerId = charge.billable_source_type === "customer"
            ? charge.billable_source_id
            : agreement?.customer_id ?? null;
        const categoryKey = charge.charge_category ?? charge.charge_type ?? "one_time";

        rows.push({
            chargeId: charge.id,
            customerId,
            customerMemberId: agreement?.customer_member_id ?? null,
            enrollmentAgreementId: charge.billable_source_type === "enrollment_agreement" ? charge.billable_source_id : null,
            householdName: customerId ? customerNames.get(customerId) ?? null : null,
            childName: agreement?.customer_member_id ? memberNames.get(agreement.customer_member_id) ?? null : null,
            categoryKey,
            categoryLabel: chargeCategoryLabel(categoryKey),
            description: charge.description,
            amountCents: Number(charge.amount_cents),
            currencyCode: charge.currency_code,
            serviceDate: charge.service_date,
            periodKey: charge.service_date ? charge.service_date.slice(0, 7) : null,
            locationScope: location.scope,
            siteLocationId: location.siteLocationId,
            siteName: location.siteLocationId ? siteNames.get(location.siteLocationId) ?? null : null,
            locationProvenance: location.provenance,
            awaiting: awaitingPostingReason(charge.metadata),
            ...(isIndex
                ? {
                      status: charge.status ?? "draft",
                      chargeTemplateId: charge.charge_template_id ?? null,
                      typeLabel:
                          (charge.charge_template_id && templateLabels.get(charge.charge_template_id))
                          || chargeCategoryLabel(categoryKey),
                      typeKey: charge.charge_template_id ? `template:${charge.charge_template_id}` : `category:${categoryKey}`,
                      billingPeriodKey:
                          (charge.billing_period_id && periodKeys.get(charge.billing_period_id))
                          || (charge.service_date ? charge.service_date.slice(0, 7) : null),
                      billableOn: charge.billable_on,
                      dueDate: charge.due_date ?? null,
                      postedAt: charge.posted_at ?? null,
                      voidedAt: charge.voided_at ?? null,
                      createdAt: charge.created_at ?? null,
                  }
                : {}),
        });
    }

    /*
     * COUNTS FROM THE ROWS THEMSELVES. A second query filtered "the same way" is how a workspace
     * comes to show 7 in a tile and 6 in the list, and there is no version of that an operator can
     * be expected to reconcile.
     */
    return {
        rows,
        counts: {
            actionable: rows.length,
            siteScoped: rows.filter((r) => r.locationScope === "site").length,
            orgScoped: rows.filter((r) => r.locationScope === "org").length,
            households: new Set(rows.map((r) => r.customerId).filter(Boolean)).size,
            /*
             * `actionable` has always been the number of DRAFTS, which is not the number of things
             * anyone does. It is kept because callers read it, and this is the honest companion:
             * drafts whose recorded reason says a person is needed.
             */
            needsAPerson: rows.filter((r) => r.awaiting.operatorActionable).length,
            waitingOnADate: rows.filter((r) => r.awaiting.key === "period_not_started").length,
        },
        scope: { siteLocationId: activeSiteLocationId, siteScope: args.siteScope },
    };
}
