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
import { accountState, joinAccounts, type AccountRow } from "@/lib/financials/workspace/accountsRail";
import type { FinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";
import type { FinancialSubjectCohort } from "@/lib/financials/workspace/resolveFinancialSubjects";

/**
 * THE ONE STATE A QUEUE ROW ASSERTS.
 *
 * Precedence, not a list: an account can be several of these at once and a row that said so would
 * be a table. The order runs from what needs a decision now down to what needs none, so the chip an
 * operator reads is always the most actionable true thing about the account.
 *
 * Every input is a field the position cohort already produced. Nothing here derives money.
 */
function RailState({ account }: { account: AccountRow }) {
    const { tone, label } =
        account.outstandingCents > 0
            ? { tone: "due" as const, label: "Outstanding" }
            : account.varianceCents !== 0
              ? { tone: "due" as const, label: "Variance open" }
              : account.suppressionCents > 0
                ? { tone: "hold" as const, label: "Funding expected" }
                : account.noActivity
                  ? { tone: "quiet" as const, label: "No financial activity" }
                  : { tone: "ok" as const, label: "Settled" };

    const skin =
        tone === "due" ? "bg-alloy-ember/10 text-alloy-ember"
        : tone === "hold" ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
        : tone === "ok" ? "bg-alloy-midnight/[0.06] text-alloy-midnight/65"
        : "bg-alloy-stone/15 text-alloy-midnight/50";

    return (
        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${skin}`}
            data-financials-rail-state={label.toLowerCase().replace(/ /g, "_")}>
            {label}
        </span>
    );
}

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
            {/*
             * ── THE RAIL IS A QUEUE, NOT A TABLE ───────────────────────────────────────────────
             *
             * It was 24rem of mostly-empty width holding two facts, and the canvas that width cost
             * belonged to the account an operator is actually working. Narrower, and each row now
             * carries what decides whether to open it: the household, what it owes, what can be
             * collected, and the one thing about it that wants attention. Anything further down
             * the hierarchy belongs to the detail, not to a row somebody is scanning.
             */}
            {/*
             * ── THE QUEUE MUST NOT CONSUME HALF THE PRODUCT ────────────────────────────────────
             *
             * Bounded rather than proportional-without-limit: roughly 30% of the surface, and never
             * below 280px or above 360px, so the rail stays a queue at any container width and the
             * account being worked always gets the remaining two thirds.
             */}
            <div
                className="flex min-h-0 shrink-0 flex-col"
                /*
                 * SIZED FROM OUTSIDE, AND IN A STYLE RATHER THAN A CLASS.
                 *
                 * `WorkspaceSurface` hardcodes `flex-1` ahead of whatever className it is given, and
                 * in a flex row `flex: 1 1 0%` beats any width utility — which is why the rail was
                 * measured at 49% of the surface while carrying a 280px class that looked applied.
                 * A width class on that component cannot win; an inline style on a wrapper always
                 * does, and does not depend on which order Tailwind happened to emit two rules in.
                 */
                style={{ width: "clamp(280px, 30%, 360px)" }}
                data-financials-accounts-rail="true"
            >
            <WorkspaceSurface className="flex h-full min-h-0 flex-col overflow-hidden">
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
                                /* A selected row is stated by an edge, not by a wash the eye loses. */
                                className={`block w-full border-b border-alloy-stone/10 px-3 py-2 text-left transition hover:bg-alloy-stone/5 ${
                                    selected === account.customerId
                                        ? "border-l-[3px] border-l-alloy-midnight bg-alloy-midnight/[0.04] pl-[calc(0.75rem-3px)]"
                                        : "border-l-[3px] border-l-transparent"
                                }`}
                            >
                                {/*
                                 * ── ONE ROW, THREE LINES, IN ALLOY'S QUEUE GRAMMAR ─────────────
                                 *
                                 * Household, then the two figures that decide whether to open it,
                                 * then ONE state line where there is something to say. Five metrics
                                 * on every row is a table; this is a queue, and a queue is scanned.
                                 */}
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-[13px] font-medium text-alloy-midnight">
                                        {account.householdName ?? "Household"}
                                    </span>
                                    <span
                                        className="shrink-0 text-[13px] font-medium tabular-nums text-alloy-midnight"
                                        data-financials-account-outstanding={account.customerId}
                                    >
                                        {moneyExact(account.outstandingCents, account.currencyCode)}
                                    </span>
                                </span>
                                {/*
                                 * Collectible sits beside outstanding, never instead of it: the gap
                                 * between them is a submitted subsidy claim doing its job, and
                                 * hiding one of the two is how that gap becomes unexplainable.
                                 */}
                                <span className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-alloy-midnight/55">
                                    <span className="truncate">
                                        {account.noActivity
                                            ? "Open · nothing billed"
                                            : `${account.charges} ${account.charges === 1 ? "charge" : "charges"}`}
                                        {account.hasOrgScoped ? " · account-wide fees" : ""}
                                    </span>
                                    {!account.noActivity ? (
                                        <span className="shrink-0 tabular-nums">
                                            {money(account.collectibleCents, account.currencyCode)} collectible
                                        </span>
                                    ) : null}
                                </span>
                                {/*
                                 * THE ONE THING WORTH SAYING ABOUT THIS ACCOUNT, as a chip in the
                                 * same state vocabulary the rest of the workspace uses. A settled
                                 * account and an account nobody has billed are different facts and
                                 * a row of zeroes tells them apart for nobody.
                                 */}
                                <span className="mt-1 block">
                                    <RailState account={account} />
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
            </div>

            <WorkspaceSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {!selected ? (
                    <WorkspaceEmptyState
                        title="Select an account"
                        body="Choose a household to see its canonical financial detail."
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col" data-financials-account-detail={selected}>
                        {/*
                         * IDENTITY COMMITS AT THE INSTANT OF THE CLICK.
                         *
                         * The household name and the scope of what follows are known from the row;
                         * neither waits on a network read, so the selected account is never a bare
                         * loading card. SCOPE, SAID OUT LOUD: the rail is site-scoped, this is not.
                         */}
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-alloy-stone/10 px-4 py-2">
                            <p className="truncate text-[15px] font-semibold text-alloy-midnight"
                                data-financials-detail-household="true">
                                {selectedAccount?.householdName ?? "Household"}
                            </p>
                            <p className="text-[11px] text-alloy-midnight/55" data-financials-detail-scope="account_wide">
                                Account-wide · every site
                            </p>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                            {/*
                             * ── SUMMARY AND ACTIONS, THEN DETAIL. ONE HIERARCHY. ───────────────
                             *
                             * The Focus Panel's Financials card is the summary object: balance,
                             * past due, responsibility, received, payment state, and the financial
                             * commands. It is COMPOSED rather than reimplemented — one capability,
                             * several placements, one executor — and it is the ONLY summary on this
                             * surface. The detail below used to carry a second metric band saying
                             * the same numbers again; two summaries is not a hierarchy.
                             */}
                            {/*
                             * The command host: when the card enters a command, this presents it as
                             * a focused layer over the account instead of swapping the header for a
                             * form. Presentation only — see `alloy-accounts-command-host`.
                             */}
                            <div className="alloy-accounts-command-host" data-financials-command-host="true">
                            <FinancialsAccountDetail
                                key={`summary-${selected}`}
                                customerId={selected}
                                customerMemberId={null}
                                participationId={null}
                                displayName={selectedAccount?.householdName ?? null}
                                /*
                                 * NO DRILL-DOWN HERE. The operator opened Financials, chose
                                 * Accounts and selected this household; the account's own activity
                                 * is directly below. `Details →` would ask them to request what
                                 * they are already looking at, and opened a scrimmed overlay over
                                 * the surface already showing it.
                                 */
                                showDetailsAction={false}
                            />
                            </div>

                            {/*
                             * DETAIL IS VISIBLE, NOT BEHIND A COMMAND.
                             *
                             * The operator is already in the Financials workspace and has already
                             * chosen an account; making them press Details → to see its ledger asks
                             * them to say so twice. Lenses decide what is emphasised, not whether
                             * anything is shown.
                             *
                             * NO `key` on this one, deliberately: it holds the committed subject and
                             * drops responses for an account no longer selected, which a remount
                             * would throw away along with the rendered structure.
                             */}
                            <FinancialsAccountWorkspaceDetail
                                customerId={selected}
                                householdName={selectedAccount?.householdName ?? null}
                                currencyCode={selectedAccount?.currencyCode}
                            />
                        </div>
                    </div>
                )}
            </WorkspaceSurface>
        </div>
    );
}
