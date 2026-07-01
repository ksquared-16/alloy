import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrgOperationalMonthToDateForFinancialMtd } from "@/lib/admin/orgLocalDayBounds";
import { fetchOperationalTimezoneForOrg, type OperationalTimezoneSource } from "@/lib/admin/timezoneContract";

import { CANONICAL_DEV_ORG_ID } from "@/lib/fields/canonicalDevOrg";

/**
 * Financials / GL helpers.
 * Prefer `getAdminContext().orgId` in admin API routes and SSR pages.
 */
export const ORG_ID_FINANCIALS = CANONICAL_DEV_ORG_ID;

export type GlAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

/**
 * Normal balance logic for financial statements:
 * - Assets and Expenses: debit-normal (balance = sum(debits) - sum(credits))
 * - Liabilities, Equity, Revenue: credit-normal (balance = sum(credits) - sum(debits))
 * This matches standard double-entry bookkeeping and ensures P&L and Balance Sheet display correctly.
 */
export function balanceCentsForAccountType(
    type: GlAccountType,
    debitCents: number,
    creditCents: number
): number {
    switch (type) {
        case "asset":
        case "expense":
            return debitCents - creditCents;
        case "liability":
        case "equity":
        case "revenue":
            return creditCents - debitCents;
        default:
            return debitCents - creditCents;
    }
}

/** Present on every financial snapshot; aligns MTD with org operational calendar (not server-local dates). */
export type FinancialSnapshotCalendarMeta = {
    calendar_type: "operational_month_to_date";
    timezone_effective: string;
    timezone_source: OperationalTimezoneSource;
    mtd_start_local_date: string;
    mtd_end_local_date: string;
    /** ISO UTC instant: start of `mtd_start_local_date` in org TZ. */
    mtd_start_utc?: string;
    /** ISO UTC instant: exclusive end of MTD (start of day after `mtd_end_local_date` in org TZ). */
    mtd_end_exclusive_utc?: string;
};

export interface FinancialSnapshot {
    /** Inclusive MTD lower bound for `entry_date` (equals `calendar_meta.mtd_start_local_date`). */
    mtd_start: string;
    /** Inclusive MTD upper bound for `entry_date` (equals `calendar_meta.mtd_end_local_date`). */
    mtd_end: string;
    mtd_revenue_cents: number;
    mtd_contractor_cogs_cents: number;
    mtd_stripe_fees_cents: number;
    mtd_discounts_cents: number;
    mtd_net_income_cents: number;
    stripe_clearing_cents: number;
    contractor_payable_cents: number;
    calendar_meta: FinancialSnapshotCalendarMeta;
}

export async function getFinancialSnapshot(
    supabase: SupabaseClient,
    orgId: string
): Promise<FinancialSnapshot> {
    const refUtc = new Date();
    const { iana, source } = await fetchOperationalTimezoneForOrg(supabase, orgId);
    const mtd = resolveOrgOperationalMonthToDateForFinancialMtd(iana, refUtc);
    const mtdStart = mtd.mtd_start_local_date;
    const mtdEnd = mtd.mtd_end_local_date;

    const calendar_meta: FinancialSnapshotCalendarMeta = {
        calendar_type: "operational_month_to_date",
        timezone_effective: iana,
        timezone_source: source,
        mtd_start_local_date: mtd.mtd_start_local_date,
        mtd_end_local_date: mtd.mtd_end_local_date,
        mtd_start_utc: mtd.mtd_start_utc,
        mtd_end_exclusive_utc: mtd.mtd_end_exclusive_utc,
    };

    const { data: accounts } = await supabase
        .from("gl_accounts")
        .select("id, code, name, type")
        .eq("org_id", orgId)
        .eq("is_active", true);
    const accountList = (accounts ?? []) as { id: string; code: string; name: string; type: GlAccountType }[];
    const accountById = new Map(accountList.map((a) => [a.id, a]));
    const accountByCode = new Map(accountList.map((a) => [a.code, a]));

    const { data: mappings } = await supabase
        .from("gl_account_mappings")
        .select("key, gl_account_id")
        .eq("org_id", orgId)
        .eq("is_active", true);
    const mappingByKey = new Map((mappings ?? []).map((m) => [(m as { key: string }).key, (m as { gl_account_id: string }).gl_account_id]));

    const { data: mtdEntries } = await supabase
        .from("gl_journal_entries")
        .select("id")
        .eq("org_id", orgId)
        .gte("entry_date", mtdStart)
        .lte("entry_date", mtdEnd)
        .eq("status", "posted");
    const mtdEntryIds = (mtdEntries ?? []).map((e) => (e as { id: string }).id);

    const { data: allEntries } = await supabase
        .from("gl_journal_entries")
        .select("id")
        .eq("org_id", orgId)
        .lte("entry_date", mtdEnd)
        .eq("status", "posted");
    const allEntryIds = (allEntries ?? []).map((e) => (e as { id: string }).id);

    const byAccountMtd = new Map<string, { debitCents: number; creditCents: number }>();
    const byAccountAll = new Map<string, { debitCents: number; creditCents: number }>();

    if (mtdEntryIds.length > 0) {
        const { data: mtdLines } = await supabase
            .from("gl_journal_lines")
            .select("account_id, debit_cents, credit_cents")
            .eq("org_id", orgId)
            .in("entry_id", mtdEntryIds);
        for (const line of mtdLines ?? []) {
            const l = line as { account_id: string; debit_cents: number; credit_cents: number };
            const cur = byAccountMtd.get(l.account_id) ?? { debitCents: 0, creditCents: 0 };
            cur.debitCents += Number(l.debit_cents) || 0;
            cur.creditCents += Number(l.credit_cents) || 0;
            byAccountMtd.set(l.account_id, cur);
        }
    }

    if (allEntryIds.length > 0) {
        const { data: allLines } = await supabase
            .from("gl_journal_lines")
            .select("account_id, debit_cents, credit_cents")
            .eq("org_id", orgId)
            .in("entry_id", allEntryIds);
        for (const line of allLines ?? []) {
            const l = line as { account_id: string; debit_cents: number; credit_cents: number };
            const cur = byAccountAll.get(l.account_id) ?? { debitCents: 0, creditCents: 0 };
            cur.debitCents += Number(l.debit_cents) || 0;
            cur.creditCents += Number(l.credit_cents) || 0;
            byAccountAll.set(l.account_id, cur);
        }
    }

    function mtdCentsForAccountId(accId: string): number {
        const acc = accountById.get(accId);
        const tot = byAccountMtd.get(accId);
        if (!acc || !tot) return 0;
        return balanceCentsForAccountType(acc.type, tot.debitCents, tot.creditCents);
    }

    function balanceCentsForAccountId(accId: string): number {
        const acc = accountById.get(accId);
        const tot = byAccountAll.get(accId);
        if (!acc || !tot) return 0;
        return balanceCentsForAccountType(acc.type, tot.debitCents, tot.creditCents);
    }

    let mtdRevenueCents = 0;
    let mtdExpensesCents = 0;
    byAccountMtd.forEach((tot, accId) => {
        const acc = accountById.get(accId);
        if (!acc) return;
        const amt = balanceCentsForAccountType(acc.type, tot.debitCents, tot.creditCents);
        if (acc.type === "revenue") mtdRevenueCents += amt;
        if (acc.type === "expense") mtdExpensesCents += amt;
    });

    const cogsAccountId = mappingByKey.get("contractor_cogs") ?? mappingByKey.get("cogs");
    const stripeFeesAccountId = mappingByKey.get("stripe_fees") ?? mappingByKey.get("fees");
    const discountsAccountId = mappingByKey.get("discounts");

    const stripeClearingAccount = accountByCode.get("1000");
    const contractorPayableAccount = accountByCode.get("2000");

    return {
        mtd_start: mtdStart,
        mtd_end: mtdEnd,
        mtd_revenue_cents: mtdRevenueCents,
        mtd_contractor_cogs_cents: cogsAccountId ? mtdCentsForAccountId(cogsAccountId) : 0,
        mtd_stripe_fees_cents: stripeFeesAccountId ? mtdCentsForAccountId(stripeFeesAccountId) : 0,
        mtd_discounts_cents: discountsAccountId ? mtdCentsForAccountId(discountsAccountId) : 0,
        mtd_net_income_cents: mtdRevenueCents - mtdExpensesCents,
        stripe_clearing_cents: stripeClearingAccount ? balanceCentsForAccountId(stripeClearingAccount.id) : 0,
        contractor_payable_cents: contractorPayableAccount ? balanceCentsForAccountId(contractorPayableAccount.id) : 0,
        calendar_meta,
    };
}
