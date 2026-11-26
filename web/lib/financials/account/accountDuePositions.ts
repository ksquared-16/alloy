/**
 * DUE AND PAST DUE ACROSS HOUSEHOLDS — the Financials card's own classification, for many accounts.
 *
 * BP V2 S6A. The card answers "how much is past due / not yet due" for ONE account by
 * `readAccountChargeLedger` → `deriveAccountChargeLedgerRows` → `readAppliedByChargeId` →
 * `pastDueFor` / `notYetDueFor`. This reader runs exactly that chain for every account that could
 * qualify, in batches, and adds no rule of its own:
 *
 *   1. CANDIDATES — owed charges (`OWED_STATUSES`) with a due date on or before the window's end:
 *      the only charges either answer can count. Paged by id to completion (no silent cap).
 *   2. ACCOUNTS — each candidate's household, by the account ledger's own ownership rule (an
 *      enrollment agreement's household, or the household account itself).
 *   3. FULL LEDGERS — every charge of those households (same select, same id ordering, paged within
 *      each id batch), derived by `deriveAccountChargeLedgerRows`, so reversals and corrections are
 *      read against the same rows the card reads.
 *   4. APPLIED MONEY — `readAppliedByChargeId`, the one balance rule.
 *   5. SCOPE — each charge is kept only if Financials' location rule makes it visible to the actor
 *      (`resolveFinancialWorkLocation` / `isFinancialWorkVisible`): a site-restricted actor's figure
 *      is the figure over the charges they may see. Unrestricted at org scope = the card's figure.
 *   6. CLASSIFY — `pastDueFor` and `dueWithinFor` per account.
 *
 * A read that fails is UNAVAILABLE, never zero. A cohort that reaches a scan cap is returned with
 * `truncated: true`, so a caller states "unknown" instead of a total.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    ACCOUNT_CHARGE_SCAN_CAP,
    ACCOUNT_CHARGE_SELECT,
    deriveAccountChargeLedgerRows,
    readAppliedByChargeId,
    readReductionsByChargeId,
} from "@/lib/financials/account/accountChargeLedger";
import {
    OWED_STATUSES,
    dueWithinFor,
    pastDueChargeIds,
    pastDueFor,
    type FinancialsDueWithin,
    type FinancialsPastDue,
} from "@/lib/financials/account/accountDueClassification";
import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { ID_BATCH, readAllPages, readInBatches } from "@/lib/financials/workspace/resolveFinancialPosition";
import { isFinancialWorkVisible, resolveFinancialWorkLocation } from "@/lib/financials/workspace/financialWorkLocation";

/** Candidate owed charges read per request; beyond this the cohort is reported truncated. */
export const ACCOUNT_DUE_CANDIDATE_CAP = ACCOUNT_CHARGE_SCAN_CAP;

export type AccountDuePosition = {
    customerId: string;
    householdName: string | null;
    /** The site of the account's visible qualifying charges when they share ONE site; null otherwise. */
    siteLocationId: string | null;
    pastDue: FinancialsPastDue | null;
    /** The charges `pastDueFor` counted (positive, still owed), oldest due first. */
    pastDueChargeIds: string[];
    dueWithin: FinancialsDueWithin | null;
};

export type AccountDuePositionsRead =
    | { state: "ok"; accounts: AccountDuePosition[]; truncated: boolean; candidateCharges: number }
    | { state: "unavailable"; reason: string };

const t = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export async function readAccountDuePositions(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        /** The org-local business date. */
        today: string;
        /** Inclusive end of the due-within window (today + 6 for a seven-day window). */
        windowEnd: string;
        siteScope: "all" | "restricted";
        allowedSiteLocationIds: readonly string[];
        activeSiteLocationId: string | null;
        candidateCap?: number;
    },
): Promise<AccountDuePositionsRead> {
    const cap = Math.min(Math.max(args.candidateCap ?? ACCOUNT_DUE_CANDIDATE_CAP, 1), ACCOUNT_DUE_CANDIDATE_CAP);
    try {
        // 1. Candidates.
        const candidates = await readAllPages<{ id: string; billable_source_type: string; billable_source_id: string }>(
            "owed charges with a due date",
            cap,
            (fromIndex, toIndex) =>
                supabase
                    .from("charges")
                    .select("id, billable_source_type, billable_source_id")
                    .eq("org_id", args.orgId)
                    .in("status", [...OWED_STATUSES])
                    .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
                    .not("due_date", "is", null)
                    .lte("due_date", args.windowEnd)
                    .order("id", { ascending: true })
                    .range(fromIndex, toIndex) as never,
        );

        // 2. Their accounts, by the ledger's ownership rule.
        const agreementIds = [...new Set(candidates.rows.filter((c) => c.billable_source_type === "enrollment_agreement").map((c) => t(c.billable_source_id)))].filter(Boolean);
        const candidateAgreements = await readInBatches<{ id: string; customer_id: string | null }>(
            "candidate agreements",
            agreementIds,
            (batch) => supabase.from("child_enrollment_agreements").select("id, customer_id").eq("org_id", args.orgId).in("id", batch) as never,
        );
        const households = new Set<string>();
        for (const a of candidateAgreements) if (t(a.customer_id)) households.add(t(a.customer_id));
        for (const c of candidates.rows) if (c.billable_source_type === "customer" && t(c.billable_source_id)) households.add(t(c.billable_source_id));
        if (households.size === 0) return { state: "ok", accounts: [], truncated: candidates.truncated, candidateCharges: candidates.rows.length };

        // 3. Full ledgers for those accounts.
        const accountAgreements = await readInBatches<{ id: string; customer_id: string | null; site_location_id: string | null }>(
            "account agreements",
            [...households],
            (batch) => supabase.from("child_enrollment_agreements").select("id, customer_id, site_location_id").eq("org_id", args.orgId).in("customer_id", batch) as never,
        );
        const householdOfSource = new Map<string, string>();
        const siteOfAgreement = new Map<string, string | null>();
        for (const a of accountAgreements) {
            if (!t(a.customer_id)) continue;
            householdOfSource.set(t(a.id), t(a.customer_id));
            siteOfAgreement.set(t(a.id), t(a.site_location_id) || null);
        }
        for (const h of households) householdOfSource.set(h, h);
        const sourceIds = [...householdOfSource.keys()];
        const charges: Record<string, unknown>[] = [];
        let truncated = candidates.truncated;
        for (let i = 0; i < sourceIds.length; i += ID_BATCH) {
            const batch = sourceIds.slice(i, i + ID_BATCH);
            const page = await readAllPages<Record<string, unknown>>(
                "account charges",
                ACCOUNT_CHARGE_SCAN_CAP,
                (fromIndex, toIndex) =>
                    supabase
                        .from("charges")
                        .select(ACCOUNT_CHARGE_SELECT)
                        .eq("org_id", args.orgId)
                        .in("billable_source_id", batch)
                        .order("id", { ascending: true })
                        .range(fromIndex, toIndex) as never,
            );
            if (page.truncated) truncated = true;
            charges.push(...page.rows);
        }

        // 4. Applied money.
        const applied = await readAppliedByChargeId(supabase, { orgId: args.orgId, chargeIds: charges.map((c) => t(c.id)) });
        if (applied.state !== "ok") return { state: "unavailable", reason: applied.reason };
        /* W7-F053: a discounted charge owes its net, not its gross. */
        const reductions = await readReductionsByChargeId(supabase, { orgId: args.orgId, chargeIds: charges.map((c) => t(c.id)) });
        if (reductions.state !== "ok") return { state: "unavailable", reason: reductions.reason };

        // 5. Scope, per charge, by Financials' location rule; group by account.
        const byHousehold = new Map<string, { raw: Record<string, unknown>[]; sites: Set<string | null> }>();
        for (const c of charges) {
            const household = householdOfSource.get(t(c.billable_source_id));
            if (!household) continue;
            const location = resolveFinancialWorkLocation({
                billableSourceType: t(c.billable_source_type) || null,
                agreementSiteLocationId: siteOfAgreement.get(t(c.billable_source_id)) ?? null,
            });
            if (!location) continue;
            if (!isFinancialWorkVisible({ location, siteScope: args.siteScope, allowedSiteLocationIds: args.allowedSiteLocationIds, activeSiteLocationId: args.activeSiteLocationId })) continue;
            const g = byHousehold.get(household) ?? { raw: [], sites: new Set<string | null>() };
            g.raw.push(c);
            g.sites.add(location.siteLocationId);
            byHousehold.set(household, g);
        }

        // 6. Classify with the card's functions.
        const names = new Map<string, string>();
        const named = await readInBatches<{ id: string; name: string | null }>(
            "household names",
            [...byHousehold.keys()],
            (batch) => supabase.from("customers").select("id, name").eq("org_id", args.orgId).in("id", batch) as never,
        );
        for (const n of named) if (t(n.name)) names.set(t(n.id), t(n.name));
        const accounts: AccountDuePosition[] = [];
        for (const [customerId, g] of byHousehold) {
            const rows = deriveAccountChargeLedgerRows(g.raw, args.today);
            const pastDue = pastDueFor(rows, args.today, applied.appliedByChargeId, reductions.reductionByChargeId);
            const dueWithin = dueWithinFor(rows, args.today, args.windowEnd, applied.appliedByChargeId, reductions.reductionByChargeId);
            if (!pastDue && !dueWithin) continue;
            accounts.push({
                customerId,
                householdName: names.get(customerId) ?? null,
                siteLocationId: g.sites.size === 1 ? [...g.sites][0] ?? null : null,
                pastDue,
                pastDueChargeIds: pastDue ? pastDueChargeIds(rows, args.today, applied.appliedByChargeId, reductions.reductionByChargeId) : [],
                dueWithin,
            });
        }
        return { state: "ok", accounts, truncated, candidateCharges: candidates.rows.length };
    } catch (e) {
        return { state: "unavailable", reason: e instanceof Error ? e.message : String(e) };
    }
}
