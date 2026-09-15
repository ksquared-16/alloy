"use client";

/**
 * ACCOUNTS — the households that HAVE a financial account, and what each one's money is doing.
 *
 * ── THE QUESTION THIS SURFACE ANSWERS ──────────────────────────────────────────────────────────
 *
 * "Which household financial accounts can I understand or operate?" — NOT "which households already
 * have posted financial activity". Those are different lists, and the rail used to be the second
 * one wearing the first one's name: it was the position cohort grouped by household, so a family
 * appeared only once somebody had billed them. A household with no transaction yet had no reachable
 * financial surface at all, which is precisely when an operator needs one, because raising the first
 * charge is the work.
 *
 * So the rail is `eligible financial subjects LEFT JOIN current financial position`:
 *
 *   · LEFT  — `/api/admin/financials/subjects`, identity and location, no money.
 *   · RIGHT — `/api/admin/financials/position`, every figure, unchanged.
 *
 * Zero activity is a legitimate financial state and is rendered as one. It is never the same thing
 * as a read that failed: rows are composed only when BOTH reads succeeded, so a $0 on this rail
 * always means "we looked, and there is nothing", never "we could not look".
 *
 * ── STILL NO ARITHMETIC ON MEANING ─────────────────────────────────────────────────────────────
 *
 * Every figure on a row is summed from figures the server produced by `computeCollectiblePosition`.
 * The join adds identity to those figures; it derives none of them, and it invents none for a
 * household that has no charges — a household with no charges has no figures, and zero is what the
 * absence of money looks like, not a number this file computed.
 *
 * ── THE ROW IS SCOPED; THE DETAIL IS NOT, AND IT SAYS SO ──
 *
 * A row's figures obey the site filter, because the charges behind them do, and so does its
 * presence: the subject cohort applies the same location contract at subject grain. The account
 * detail beneath answers for a household ACROSS every site, which is the honest thing for a
 * household to mean — so the detail zone is labelled "Account-wide" rather than being filtered into
 * agreeing with the row above it.
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
import FinancialsAccountWorkspaceDetail from "@/app/adminV2/financials/FinancialsAccountWorkspaceDetail";
import { money, moneyExact } from "@/app/adminV2/financials/financialsFormat";
import type { FinancialsReadState } from "@/app/adminV2/financials/useFinancialsReads";
import { accountState, joinAccounts } from "@/lib/financials/workspace/accountsRail";
import type { FinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";
import type { FinancialSubjectCohort } from "@/lib/financials/workspace/resolveFinancialSubjects";

export default function FinancialsAccounts({
    position,
    subjects,
    scopeLabel,
}: {
    position: FinancialsReadState<FinancialPositionCohort>;
    subjects: FinancialsReadState<FinancialSubjectCohort>;
    scopeLabel: string;
}) {
    const [selected, setSelected] = useState<string | null>(null);

    /*
     * A ROW IS COMPOSED ONLY WHEN BOTH SIDES WERE READ.
     *
     * A $0 row is a claim that the account was looked at and carries nothing. If the position read
     * failed, that claim is false for every household on the rail, and rendering the subject cohort
     * alone would turn an outage into a screen full of families who appear to owe nothing. The
     * failure is surfaced instead — which is the same rule the account detail already keeps.
     */
    const accounts = useMemo(
        () => (subjects.data && position.data ? joinAccounts(subjects.data, position.data) : []),
        [subjects.data, position.data],
    );
    const readError = position.error ?? subjects.error;
    const loading = (position.loading || subjects.loading) && accounts.length === 0;
    const truncated = Boolean(subjects.data?.truncated || position.data?.truncated);
    const selectedAccount = accounts.find((a) => a.customerId === selected) ?? null;

    return (
        <div className="flex min-h-0 flex-1 gap-3" data-testid="financials-accounts-section">
            <WorkspaceSurface className="flex min-h-0 w-[24rem] shrink-0 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto" data-financials-accounts-list="true">
                    {readError ? (
                        <p className="px-3 py-4 text-xs text-alloy-ember" data-financials-accounts-error="true">
                            {readError}
                        </p>
                    ) : loading ? (
                        <p className="px-3 py-4 text-xs text-alloy-midnight/50">Loading accounts…</p>
                    ) : accounts.length === 0 ? (
                        <WorkspaceEmptyState
                            title="No household account in scope"
                            body={`No household has a financial account for ${scopeLabel.toLowerCase()}.`}
                        />
                    ) : (
                        accounts.map((account) => (
                            <button
                                key={account.customerId}
                                type="button"
                                onClick={() => setSelected(account.customerId)}
                                data-financials-account-row={account.customerId}
                                data-financials-account-state={accountState(account)}
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
                                      * THREE ZERO STATES, AND THEY ARE NOT THE SAME SENTENCE.
                                      *
                                      * A settled account has paid what it owed. An account with no
                                      * activity has never been billed — it is open, and the next
                                      * thing that happens on it is a first charge. Rendering either
                                      * as a bare row of zeroes leaves an operator to guess which,
                                      * and guessing wrong on the second one is how a family gets
                                      * chased for money nobody ever raised.
                                      */}
                                    {account.noActivity
                                        ? "No financial activity yet"
                                        : account.outstandingCents <= 0
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
                {truncated ? (
                    /* A cap that is silently hit is how a rail shows a list that is quietly wrong. */
                    <p
                        className="border-t border-alloy-stone/10 px-3 py-2 text-[11px] text-alloy-midnight/50"
                        data-financials-accounts-truncated="true"
                    >
                        More accounts exist than this list was allowed to read. Narrow by site to see them.
                    </p>
                ) : null}
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
                            {/*
                             * THE WORKSPACE GRAIN LEADS.
                             *
                             * This used to render the Focus Panel's compact card, which is the
                             * contextual grain — summary-first, deliberately small, built for
                             * reading financial context while working some OTHER subject. In the
                             * dedicated financial workspace that left a small card marooned in a
                             * large canvas and answered a question nobody had asked here.
                             *
                             * Same truth, different grain: both read `buildFinancialsCardVM`. An
                             * account with nothing on it renders the same bands saying so — $0,
                             * no responsibility arranged, nothing expected, no money received,
                             * nothing charged — and a read that FAILS renders none of them.
                             */}
                            <FinancialsAccountWorkspaceDetail key={selected} customerId={selected} />

                            {/*
                             * THE COMMANDS STILL LIVE ON THE CARD, AND SAY SO.
                             *
                             * Add charge, Add adjustment, Move and Apply payment and the reversals
                             * are implemented there. Re-implementing them here would be a second
                             * action path over the same money, which is exactly what the surface
                             * decision forbids — so the card is composed BENEATH the account
                             * detail as the action region rather than copied. Workspace-native
                             * commands are named follow-up, not quietly skipped.
                             *
                             * OPEN when the account has no activity: on an account carrying
                             * nothing, raising the first charge is the only work there is, and
                             * putting it behind a disclosure would hide the one affordance the
                             * surface exists to offer.
                             */}
                            <details className="mt-4 rounded-xl border border-alloy-stone/15 bg-white/40"
                                open={selectedAccount?.noActivity ?? false}
                                data-financials-account-actions="true"
                                data-financials-account-actions-open={selectedAccount?.noActivity ? "true" : undefined}>
                                <summary className="cursor-pointer px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">
                                    Financial actions
                                </summary>
                                <div className="px-3 pb-3">
                                    <FinancialsAccountDetail
                                        key={`actions-${selected}`}
                                        customerId={selected}
                                        customerMemberId={null}
                                        participationId={null}
                                        displayName={null}
                                    />
                                </div>
                            </details>
                        </div>
                    </div>
                )}
            </WorkspaceSurface>
        </div>
    );
}
