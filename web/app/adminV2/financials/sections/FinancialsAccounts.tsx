"use client";

/**
 * ACCOUNTS — households carrying posted money, and the canonical detail behind each one.
 *
 * The list is the position cohort grouped by household. Every figure on a row came from
 * `computeCollectiblePosition` on the server; this file adds cents that the server already
 * grouped and does not derive anything. Selecting a household opens Thread 2's account card
 * unforked — the same product an operator reaches from anywhere else in the platform.
 *
 * ── THE ROW IS SCOPED; THE DETAIL IS NOT, AND IT SAYS SO ──
 *
 * A row's figures obey the site filter, because the charges behind them do. The account card
 * beneath answers for a household ACROSS every site, which is the honest thing for a household
 * to mean — so the detail zone is labelled "Account-wide" rather than being filtered into
 * agreeing with the row above it. Narrowing an account-wide figure to a site would change what
 * it means without changing what it looks like.
 *
 * ── OUTSTANDING, NOT A/R ──
 *
 * The column is Outstanding: a posted charge less active applications of posted payments. There
 * is no receivables accounting behind it — no ageing buckets, no allowance, no subledger — so
 * the name promises none.
 */

import { useMemo, useState } from "react";

import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import FinancialsAccountDetail from "@/app/adminV2/financials/FinancialsAccountDetail";
import { money, moneyExact } from "@/app/adminV2/financials/financialsFormat";
import type { FinancialsReadState } from "@/app/adminV2/financials/useFinancialsReads";
import type { FinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";

type AccountRow = {
    customerId: string;
    householdName: string | null;
    currencyCode: string;
    outstandingCents: number;
    collectibleCents: number;
    suppressionCents: number;
    varianceCents: number;
    charges: number;
    /** True when at least one charge on the account belongs to no site. */
    hasOrgScoped: boolean;
};

/** Grouping, not arithmetic on meaning: each field is summed from figures the server produced. */
function groupByAccount(cohort: FinancialPositionCohort | null): AccountRow[] {
    if (!cohort) return [];
    const byAccount = new Map<string, AccountRow>();
    for (const row of cohort.rows) {
        if (!row.customerId) continue;
        const existing = byAccount.get(row.customerId) ?? {
            customerId: row.customerId,
            householdName: row.householdName,
            currencyCode: row.position.currencyCode,
            outstandingCents: 0,
            collectibleCents: 0,
            suppressionCents: 0,
            varianceCents: 0,
            charges: 0,
            hasOrgScoped: false,
        };
        existing.outstandingCents += row.position.outstandingCents;
        existing.collectibleCents += row.position.currentlyCollectibleCents;
        existing.suppressionCents += row.position.submittedClaimSuppressionCents;
        existing.varianceCents += row.position.unresolvedVarianceCents;
        existing.charges += 1;
        if (row.locationScope === "org") existing.hasOrgScoped = true;
        byAccount.set(row.customerId, existing);
    }
    /*
     * ── A SETTLED HOUSEHOLD IS STILL A HOUSEHOLD ──
     *
     * This used to drop any account with nothing outstanding, suppressed or in variance, which
     * made the rail a collections queue wearing the word Accounts: a family that had just paid in
     * full vanished from the only surface an operator would think to look them up on, and the
     * answer to "did the Brennans pay?" was an empty list that looks identical to "no such family".
     *
     * So the rail lists every account carrying financial activity, and ORDERS by attention instead
     * of filtering by it — money owed first, then money held with an agency, then the settled ones.
     * Nothing is hidden; what needs a decision simply floats.
     */
    return [...byAccount.values()]
        .filter((a) => a.charges > 0)
        .sort(
            (a, b) =>
                b.outstandingCents - a.outstandingCents
                || b.suppressionCents - a.suppressionCents
                || Math.abs(b.varianceCents) - Math.abs(a.varianceCents)
                || (a.householdName ?? "").localeCompare(b.householdName ?? ""),
        );
}

export default function FinancialsAccounts({
    position,
    scopeLabel,
}: {
    position: FinancialsReadState<FinancialPositionCohort>;
    scopeLabel: string;
}) {
    const [selected, setSelected] = useState<string | null>(null);
    const accounts = useMemo(() => groupByAccount(position.data), [position.data]);

    return (
        <div className="flex min-h-0 flex-1 gap-3" data-testid="financials-accounts-section">
            <WorkspaceSurface className="flex min-h-0 w-[24rem] shrink-0 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto" data-financials-accounts-list="true">
                    {position.loading && accounts.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-alloy-midnight/50">Loading accounts…</p>
                    ) : position.error ? (
                        <p className="px-3 py-4 text-xs text-alloy-ember" data-financials-accounts-error="true">
                            {position.error}
                        </p>
                    ) : accounts.length === 0 ? (
                        <WorkspaceEmptyState
                            title="No account carries financial activity"
                            body={`No posted charges for ${scopeLabel.toLowerCase()}.`}
                        />
                    ) : (
                        accounts.map((account) => (
                            <button
                                key={account.customerId}
                                type="button"
                                onClick={() => setSelected(account.customerId)}
                                data-financials-account-row={account.customerId}
                                data-financials-account-state={
                                    account.outstandingCents > 0
                                        ? "outstanding"
                                        : account.suppressionCents > 0
                                          ? "with_agency"
                                          : account.varianceCents !== 0
                                            ? "variance"
                                            : "settled"
                                }
                                aria-current={selected === account.customerId ? "true" : undefined}
                                className={`block w-full border-b border-alloy-stone/10 px-3 py-2 text-left transition hover:bg-alloy-stone/5 ${
                                    selected === account.customerId ? "bg-alloy-bend-pine/5" : ""
                                }`}
                            >
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-sm text-alloy-midnight">
                                        {account.householdName ?? "Household"}
                                    </span>
                                    <span
                                        className="shrink-0 text-sm tabular-nums text-alloy-midnight"
                                        data-financials-account-outstanding={account.customerId}
                                    >
                                        {moneyExact(account.outstandingCents, account.currencyCode)}
                                    </span>
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-alloy-midnight/60">
                                    {/*
                                     * Collectible is shown beside outstanding, never instead of it: the gap
                                     * between them is a submitted subsidy claim doing its job, and hiding
                                     * one of the two figures is how that gap becomes unexplainable.
                                     */}
                                    {/*
                                      * A settled account says so, rather than reading as a row of
                                      * zeroes an operator has to interpret. "$0.00 collectible now"
                                      * is technically true and tells nobody that this family is
                                      * fine.
                                      */}
                                    {account.outstandingCents <= 0
                                    && account.suppressionCents <= 0
                                    && account.varianceCents === 0
                                        ? `Settled · ${account.charges} ${account.charges === 1 ? "charge" : "charges"}`
                                        : `${money(account.collectibleCents, account.currencyCode)} collectible now`}
                                    {account.suppressionCents > 0
                                        ? ` · ${money(account.suppressionCents, account.currencyCode)} with an agency`
                                        : ""}
                                    {account.varianceCents !== 0 ? " · variance open" : ""}
                                    {account.hasOrgScoped ? " · includes account-wide fees" : ""}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </WorkspaceSurface>

            <WorkspaceSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {!selected ? (
                    <WorkspaceEmptyState
                        title="Select an account"
                        body="Choose a household to see its canonical financial detail."
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col" data-financials-account-detail={selected}>
                        <div className="border-b border-alloy-stone/10 px-3 py-2">
                            {/* SCOPE, SAID OUT LOUD. The list is site-scoped; this is not. */}
                            <p className="text-xs text-alloy-midnight/60" data-financials-detail-scope="account_wide">
                                Account-wide financial detail
                            </p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-3">
                            {/* THREAD 2, UNFORKED. Its own read model, its own numbers. */}
                            <FinancialsAccountDetail
                                key={selected}
                                customerId={selected}
                                customerMemberId={null}
                                participationId={null}
                                displayName={null}
                            />
                        </div>
                    </div>
                )}
            </WorkspaceSurface>
        </div>
    );
}
