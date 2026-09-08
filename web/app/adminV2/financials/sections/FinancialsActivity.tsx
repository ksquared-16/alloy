"use client";

/**
 * FINANCIAL ACTIVITY — what happened lately. Explanatory history, and nothing more.
 *
 * ── WHY IT IS NOT CALLED "JOURNAL ENTRIES" ──
 *
 * `financial_journal_entries` is the table. "Journal entries" is what an accountant calls
 * double-entry rows against a chart of accounts, and these are not that: they are a record of
 * consequences — a charge was posted, a payment arrived, an application was reversed — with no
 * debits, no credits and no accounts. Borrowing the accounting word for a non-accounting record
 * is how a UI creates a semantic the data cannot honour. The canonical `entryType` travels on
 * every row for tests and hand-off; the operator reads "Charge posted".
 *
 * ── NO TOTAL APPEARS ON THIS SURFACE ──
 *
 * Each row shows what that single event did to what is owed. There is no running balance and no
 * column sum, because summing an arbitrary recent slice of deltas is not a balance — it happens
 * to equal outstanding only when nothing was ever written outside the journal, and that
 * coincidence is not a contract. An operator shown such a figure beside Thread 8's would have
 * two numbers and no way to choose. The balance stays where it is owned.
 *
 * A receipt has an amount and a delta of ZERO, and the row says both: money arriving is not
 * money applied.
 */

import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import { moneyExact, shortDate, signedMoney } from "@/app/adminV2/financials/financialsFormat";
import type { FinancialsReadState } from "@/app/adminV2/financials/useFinancialsReads";
import type { FinancialActivityFeed } from "@/lib/financials/workspace/resolveFinancialActivity";

export default function FinancialsActivity({
    activity,
    scopeLabel,
}: {
    activity: FinancialsReadState<FinancialActivityFeed>;
    scopeLabel: string;
}) {
    const rows = activity.data?.rows ?? [];
    const unattributed = activity.data?.counts.unattributed ?? 0;

    return (
        <WorkspaceSurface className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="financials-activity-section">
            <div className="min-h-0 flex-1 overflow-y-auto" data-financials-activity-list="true">
                {activity.loading && rows.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-alloy-midnight/50">Loading financial activity…</p>
                ) : activity.error ? (
                    <p className="px-3 py-4 text-xs text-alloy-ember" data-financials-activity-error="true">
                        {activity.error}
                    </p>
                ) : rows.length === 0 ? (
                    <WorkspaceEmptyState
                        title="No recent financial activity"
                        body={`Nothing has been posted, paid or corrected for ${scopeLabel.toLowerCase()}.`}
                    />
                ) : (
                    rows.map((row) => (
                        <div
                            key={row.entryId}
                            className="border-b border-alloy-stone/10 px-3 py-2"
                            data-financials-activity-row={row.entryId}
                            data-financials-activity-entry-type={row.entryType}
                            data-financials-activity-site={row.siteLocationId ?? "org"}
                        >
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-sm text-alloy-midnight">
                                    {row.label}
                                    {row.householdName ? ` · ${row.householdName}` : ""}
                                </span>
                                <span className="shrink-0 text-sm tabular-nums text-alloy-midnight">
                                    {moneyExact(row.amountCents, row.currencyCode)}
                                </span>
                            </div>
                            <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-alloy-midnight/60">
                                <span className="truncate">
                                    {shortDate(row.postedAt)}
                                    {row.accountingPeriodKey ? ` · ${row.accountingPeriodKey}` : ""}
                                    {/* An entry written before the org had a calendar names itself. */}
                                    {row.periodAttribution === "no_calendar" ? " · no accounting period" : ""}
                                    {row.correctsEntryId ? " · corrects an earlier entry" : ""}
                                    {" · "}
                                    {row.locationScope === "site" ? (row.siteName ?? "Site") : "Account-wide"}
                                </span>
                                <span
                                    className="shrink-0 tabular-nums"
                                    data-financials-activity-delta={row.entryId}
                                    title="What this event did to what is owed"
                                >
                                    {/* Zero is a real answer here, not a missing one. */}
                                    {signedMoney(row.obligationDeltaCents, row.currencyCode)} owed
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div
                className="shrink-0 border-t border-alloy-stone/10 px-3 py-2 text-xs text-alloy-midnight/55"
                data-financials-activity-footer="true"
            >
                {scopeLabel} · history only. Balances are shown on the account, not summed from this list.
                {unattributed > 0 ? ` · ${unattributed} entr${unattributed === 1 ? "y has" : "ies have"} no accounting period.` : ""}
            </div>
        </WorkspaceSurface>
    );
}
