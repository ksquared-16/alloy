/**
 * THE CROSS-ACCOUNT CHARGE INDEX — find charges across the organization (W7-F021).
 *
 * Accounts answers "how is this household doing?". The Charges workspace answers questions no single
 * account can: which charges across the organization need a person, which are scheduled to post,
 * what was billed for a period or a charge type, and where the tuition that just generated landed.
 *
 * This module only CLASSIFIES and FILTERS rows that `resolveFinancialWorkQueue` already resolved
 * (`statuses` mode). It computes no money: amounts are the stored `amount_cents`, the view is the
 * stored status plus the canonical awaiting-posting reason, and the period is the one the charge is
 * bound to. Counts and filter options come from the same rows the list shows, so a badge can never
 * promise rows the list will not draw.
 */
import { billingPeriodLabel } from "@/lib/financials/billingPeriod";
import type { FinancialWorkRow } from "@/lib/financials/workspace/resolveFinancialWorkQueue";

/** Every stored status the index reads. */
export const CHARGE_INDEX_STATUSES = ["draft", "posted", "partially_paid", "paid", "void"] as const;

export const CHARGE_INDEX_VIEWS = ["scheduled", "attention", "posted", "cancelled", "legacy"] as const;
export type ChargeIndexView = (typeof CHARGE_INDEX_VIEWS)[number];

export const CHARGE_INDEX_VIEW_LABELS: Record<ChargeIndexView, string> = {
    attention: "Needs attention",
    scheduled: "Scheduled",
    posted: "Posted",
    cancelled: "Cancelled",
    legacy: "Legacy drafts",
};

/**
 * WHICH QUESTION A ROW ANSWERS.
 *
 * W7-F027: Needs attention is ONLY a draft a person must decide — a configured review, or a post
 * that failed (nothing retries one). A draft the clock will activate when its period begins is
 * Scheduled. A draft from before automatic posting (no recorded reason) is a LEGACY draft, listed
 * apart so history cannot define the workflow: it is not today's work, and it never auto-activates. Posted, partially paid and paid
 * are all posted obligations — payment state is the Accounts ledger's question, not this one's. A
 * void charge is a cancelled draft, kept and attributed, never deleted.
 */
export function chargeIndexViewOf(row: Pick<FinancialWorkRow, "status" | "awaiting">): ChargeIndexView {
    const status = row.status ?? "draft";
    if (status === "void") return "cancelled";
    if (status !== "draft") return "posted";
    if (row.awaiting.key === "unclassified") return "legacy";
    return row.awaiting.operatorActionable || row.awaiting.key === "post_failed" || row.awaiting.key === "review_required"
        ? "attention"
        : "scheduled";
}

export type ChargeIndexFilters = {
    view: ChargeIndexView;
    /** Household, child or charge type, case-insensitive. */
    query?: string | null;
    /** `template:<id>` or `category:<key>`. */
    typeKey?: string | null;
    /** Billing period key, e.g. `2026-11`. */
    periodKey?: string | null;
};

export type ChargeIndexOption = { value: string; label: string };

export type ChargeIndexResult = {
    rows: FinancialWorkRow[];
    /** Per view, AFTER search/type/period — what each tab would show if chosen. */
    counts: Record<ChargeIndexView, number>;
    /** Every charge type and billing period present in the organization's charges. */
    typeOptions: ChargeIndexOption[];
    periodOptions: ChargeIndexOption[];
};

function matchesQuery(row: FinancialWorkRow, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.householdName, row.childName, row.typeLabel, row.categoryLabel, row.description]
        .some((v) => (v ?? "").toLowerCase().includes(q));
}

/** The date a row is read by, per view: when it posts, when it posted, when it was cancelled. */
function sortKey(row: FinancialWorkRow, view: ChargeIndexView): string {
    if (view === "scheduled" || view === "attention") return row.awaiting.postsOn ?? row.serviceDate ?? "";
    if (view === "cancelled") return row.voidedAt ?? row.createdAt ?? "";
    if (view === "legacy") return row.serviceDate ?? row.createdAt ?? "";
    return row.postedAt ?? row.serviceDate ?? "";
}

export function applyChargeIndex(all: readonly FinancialWorkRow[], filters: ChargeIndexFilters): ChargeIndexResult {
    const query = filters.query?.trim() ?? "";
    const narrowed = all.filter(
        (r) =>
            matchesQuery(r, query)
            && (!filters.typeKey || r.typeKey === filters.typeKey)
            && (!filters.periodKey || r.billingPeriodKey === filters.periodKey),
    );

    const counts: Record<ChargeIndexView, number> = { attention: 0, scheduled: 0, posted: 0, cancelled: 0, legacy: 0 };
    for (const r of narrowed) counts[chargeIndexViewOf(r)] += 1;

    const rows = narrowed
        .filter((r) => chargeIndexViewOf(r) === filters.view)
        .sort((a, b) => {
            const ka = sortKey(a, filters.view);
            const kb = sortKey(b, filters.view);
            /* Scheduled and attention read forwards (next to post first); the record reads backwards. */
            return filters.view === "scheduled" || filters.view === "attention" ? ka.localeCompare(kb) : kb.localeCompare(ka);
        });

    const types = new Map<string, string>();
    for (const r of all) if (r.typeKey) types.set(r.typeKey, r.typeLabel ?? r.categoryLabel);
    const periods = new Set<string>();
    for (const r of all) if (r.billingPeriodKey) periods.add(r.billingPeriodKey);

    return {
        rows,
        counts,
        typeOptions: [...types.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        periodOptions: [...periods]
            .sort((a, b) => b.localeCompare(a))
            .map((value) => ({ value, label: billingPeriodLabel(value) || value })),
    };
}

export function isChargeIndexView(value: unknown): value is ChargeIndexView {
    return typeof value === "string" && (CHARGE_INDEX_VIEWS as readonly string[]).includes(value);
}
