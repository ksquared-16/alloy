/**
 * FINANCIAL ACTIVITY — what happened lately, placed and scoped. Explanatory, never authoritative.
 *
 * Thread 5's journal is an append-only record of consequences: a charge was posted, a payment
 * arrived, an application was reversed. It is deliberately NOT a balance authority, and this
 * projection inherits that limit rather than quietly relaxing it:
 *
 *   · rows carry `obligationDeltaCents`, which is what one event DID to what is owed
 *   · nothing here sums those deltas
 *   · no total, movement or balance is returned
 *
 * Summing an arbitrary recent slice of deltas happens to equal outstanding only when nothing was
 * ever written outside the journal. That coincidence is not a contract, and an operator shown
 * such a figure beside Thread 8's would have two numbers and no way to choose. So the section
 * shows a history, and the balance stays where it is owned.
 *
 * ── OPERATOR LANGUAGE ──
 *
 * These are financial activity entries, not "journal entries". The row keeps its canonical
 * `entryType` for tests and hand-off; `label` is what an operator reads.
 *
 * ── LOCATION ──
 *
 * Each entry names the same polymorphic billable source a charge does, so Thread 4's contract
 * applies unchanged. An entry whose location cannot be resolved is withheld rather than shown
 * under a site it may not belong to.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import {
    readRecentJournal,
    type FinancialJournalEntryRow,
    type JournalEntryType,
} from "@/lib/financials/financialJournalService";
import {
    isFinancialWorkVisible,
    resolveFinancialWorkLocation,
    type FinancialWorkLocationScope,
} from "@/lib/financials/workspace/financialWorkLocation";

/** What each consequence is called on screen. The canonical key travels beside it. */
const ACTIVITY_LABELS: Record<JournalEntryType, string> = {
    charge_posted: "Charge posted",
    charge_corrected: "Charge corrected",
    payment_received: "Payment received",
    payment_applied: "Payment applied",
    payment_application_reversed: "Application reversed",
    payment_refunded: "Payment refunded",
};

export type FinancialActivityRow = {
    entryId: string;
    entryType: JournalEntryType;
    label: string;
    /** The event's own amount, always positive. */
    amountCents: number;
    /**
     * What this event did to what is owed. Signed, and reported per row only — a receipt has an
     * amount and a delta of zero, because money arriving is not money applied.
     */
    obligationDeltaCents: number;
    currencyCode: string;
    customerId: string | null;
    householdName: string | null;
    effectiveOn: string;
    postedAt: string;
    billingPeriodKey: string | null;
    accountingPeriodKey: string | null;
    /** `no_calendar` means the org had no accounting calendar when this was written. */
    periodAttribution: string;
    /** The row that caused it, so an operator can be handed off to the thing itself. */
    sourceType: string;
    sourceId: string;
    correctsEntryId: string | null;
    locationScope: FinancialWorkLocationScope;
    siteLocationId: string | null;
    siteName: string | null;
};

export type FinancialActivityFeed = {
    rows: FinancialActivityRow[];
    counts: { entries: number; households: number; unattributed: number };
    scope: { siteLocationId: string | null; siteScope: "all" | "restricted" };
    limit: number;
};

export async function resolveFinancialActivity(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        siteScope: "all" | "restricted";
        allowedSiteLocationIds: readonly string[];
        activeSiteLocationId?: string | null;
        entryTypes?: readonly JournalEntryType[];
        limit?: number;
    },
): Promise<FinancialActivityFeed> {
    const activeSiteLocationId = args.activeSiteLocationId?.trim() || null;
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
    const scope = { siteLocationId: activeSiteLocationId, siteScope: args.siteScope };

    const entries = await readRecentJournal(supabase, {
        orgId: args.orgId,
        limit,
        entryTypes: args.entryTypes,
    });
    const childcare = entries.filter((e) =>
        (CHILDCARE_BILLABLE_SOURCE_TYPES as readonly string[]).includes(e.billable_source_type ?? ""),
    );
    if (childcare.length === 0) {
        return { rows: [], counts: { entries: 0, households: 0, unattributed: 0 }, scope, limit };
    }

    const agreementIds = [
        ...new Set(
            childcare
                .filter((e) => e.billable_source_type === "enrollment_agreement")
                .map((e) => e.billable_source_id)
                .filter((v): v is string => !!v),
        ),
    ];
    const { data: agreementRows } = agreementIds.length
        ? await supabase
              .from("child_enrollment_agreements")
              .select("id, customer_id, site_location_id")
              .eq("org_id", args.orgId)
              .in("id", agreementIds)
        : { data: [] };
    const agreements = new Map(
        (((agreementRows ?? []) as unknown) as Array<{ id: string; customer_id: string | null; site_location_id: string | null }>)
            .map((a) => [a.id, a]),
    );

    const placed: Array<{ entry: FinancialJournalEntryRow; customerId: string | null; scope: FinancialWorkLocationScope; siteLocationId: string | null }> = [];
    for (const entry of childcare) {
        const agreement = entry.billable_source_type === "enrollment_agreement" && entry.billable_source_id
            ? agreements.get(entry.billable_source_id) ?? null
            : null;
        const location = resolveFinancialWorkLocation({
            billableSourceType: entry.billable_source_type,
            agreementSiteLocationId: agreement?.site_location_id ?? null,
        });
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
        placed.push({
            entry,
            customerId: entry.customer_id ?? agreement?.customer_id ?? null,
            scope: location.scope,
            siteLocationId: location.siteLocationId,
        });
    }
    if (placed.length === 0) {
        return { rows: [], counts: { entries: 0, households: 0, unattributed: 0 }, scope, limit };
    }

    const customerIds = [...new Set(placed.map((p) => p.customerId).filter((v): v is string => !!v))];
    const { data: customerRows } = customerIds.length
        ? await supabase.from("customers").select("id, name").eq("org_id", args.orgId).in("id", customerIds)
        : { data: [] };
    const customerNames = new Map(
        (((customerRows ?? []) as unknown) as Array<{ id: string; name: string | null }>).map((c) => [c.id, c.name]),
    );

    const siteIds = [...new Set(placed.map((p) => p.siteLocationId).filter((v): v is string => !!v))];
    const { data: siteRows } = siteIds.length
        ? await supabase.from("locations").select("id, label").eq("org_id", args.orgId).in("id", siteIds)
        : { data: [] };
    const siteNames = new Map(
        (((siteRows ?? []) as unknown) as Array<{ id: string; label: string | null }>).map((s) => [s.id, s.label]),
    );

    const rows: FinancialActivityRow[] = placed.map(({ entry, customerId, scope: locationScope, siteLocationId }) => ({
        entryId: entry.id,
        entryType: entry.entry_type,
        label: ACTIVITY_LABELS[entry.entry_type] ?? entry.entry_type,
        amountCents: Number(entry.amount_cents),
        obligationDeltaCents: Number(entry.obligation_delta_cents),
        currencyCode: entry.currency,
        customerId,
        householdName: customerId ? customerNames.get(customerId) ?? null : null,
        effectiveOn: entry.effective_on,
        postedAt: entry.posted_at,
        billingPeriodKey: entry.billing_period_key,
        accountingPeriodKey: entry.accounting_period_key,
        periodAttribution: entry.period_attribution,
        sourceType: entry.source_type,
        sourceId: entry.source_id,
        correctsEntryId: entry.reverses_entry_id,
        locationScope,
        siteLocationId,
        siteName: siteLocationId ? siteNames.get(siteLocationId) ?? null : null,
    }));

    return {
        rows,
        counts: {
            entries: rows.length,
            households: new Set(rows.map((r) => r.customerId).filter(Boolean)).size,
            /* Entries written before the org had an accounting calendar — named, not hidden. */
            unattributed: rows.filter((r) => r.periodAttribution === "no_calendar").length,
        },
        scope,
        limit,
    };
}
