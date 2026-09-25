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
 * ── THE ROW IS SCOPED; THE DETAIL IS NOT ──
 *
 * A row's figures obey the site filter, because the charges behind them do, and so does its
 * presence: the subject cohort applies the same location contract at subject grain. The account
 * detail beneath answers for a household ACROSS every site, which is the honest thing for a
 * household to mean.
 *
 * That distinction used to be printed over every account as "Account-wide · every site". It is a
 * fact about the PRODUCT, true of every household on every visit, and an operator cannot act on it;
 * restating it forever spent a band of the surface teaching the same sentence. Scope is governed
 * and stated by the workspace's own site context, which is where an operator changes it.
 *
 * ── OUTSTANDING, NOT A/R ──
 *
 * The column is Outstanding: a posted charge less active applications of posted payments. There
 * is no receivables accounting behind it — no ageing buckets, no allowance, no subledger — so
 * the name promises none.
 */

import { Receipt } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

import { AlloySelect } from "@/components/workspace/AlloySelect";
import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import {
    WS_FIELD_SEARCH_CHROME,
    WS_QUEUE_TOOLBAR_CHROME,
} from "@/components/workspace/workspaceTokens";
import FinancialsAccountDetail from "@/app/adminV2/financials/FinancialsAccountDetail";
import { FinancialCommandHost } from "@/components/financials/FinancialCommandChannel";
import { money, moneyExact } from "@/app/adminV2/financials/financialsFormat";
import type { FinancialsReadState } from "@/app/adminV2/financials/useFinancialsReads";
import {
    ACCOUNT_STATE_FILTERS,
    NO_ACCOUNT_FILTER,
    advancedFilterCount,
    filterAccounts,
    isAccountFilterActive,
    programDivides,
    programOptions,
    resolveAccountSelection,
    roomDivides,
    roomOptions,
    stateCounts,
} from "@/lib/financials/workspace/accountQueue";
import { accountMoneyIsKnown, accountState, joinAccounts, type AccountRow } from "@/lib/financials/workspace/accountsRail";
import { financialsCardQuery, prewarmFinancialsCard } from "@/lib/adminV2/runtime/focusPanel/financials/financialsCardRead";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
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
    /*
     * Every branch below reads position money. While that money is unknown the chip must say so
     * rather than fall through to the most reassuring label available.
     */
    if (!accountMoneyIsKnown(account)) {
        const label = account.financialTruth === "unavailable" ? "Balance unavailable" : "Balance pending";
        return (
            <span
                data-financials-account-chip={account.financialTruth}
                className="shrink-0 rounded-full border border-alloy-midnight/15 px-1.5 py-px text-[10.5px] font-semibold text-alloy-midnight/45"
            >
                {label}
            </span>
        );
    }
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

/**
 * ── THE ACCOUNT ROW, IN THE HOUSE QUEUE GRAMMAR ────────────────────────────────────────────────
 *
 * It was a flat divider list with a navy left edge: a financial list that happened to live in a
 * workspace. Processing, the work-unit queue and the configuration rails all render the SAME card
 * shell — `QUEUE_ROW_CARD_SHELL_CLASS`, whose perimeter and elevation come from the Focus Panel
 * card tokens — and selected state there is a Bend Pine perimeter and tint, not a browser focus
 * ring and not a decorative rail. Reusing the shell is what keeps this rail from drifting again the
 * next time the house card treatment changes.
 *
 * The FINANCIAL meaning is preserved, because that is what makes this queue worth scanning:
 * household identity, outstanding, collectible where it differs from outstanding, the state chip,
 * and one line of secondary context. What it stops doing is inventing its own chrome to say them.
 */
function AccountQueueRow({
    onWarm,
    account,
    selected,
    onSelect,
}: {
    account: AccountRow;
    selected: boolean;
    onSelect: (customerId: string) => void;
    /** Start this account's canonical read on intent. Reads only — never selects. */
    onWarm: (customerId: string) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onSelect(account.customerId)}
            /*
             * ── INTENT WARMS THE READ; ONLY THE CLICK SELECTS ──────────────────────────────────
             *
             * The account's canonical read takes ~1.1s, and until now it started at the click, so
             * the operator paid all of it after deciding. Pointer and keyboard focus are the
             * earliest honest signal that this account is the likely next one.
             *
             * It READS and does nothing else: it cannot change the selection, commit truth, run an
             * action or make this account authoritative. That distinction is the repository's own —
             * a prepare/mint is never warmed on intent, because it is a mutation; a canonical read
             * is, which is what the family workspace already does on hover.
             */
            onPointerEnter={() => onWarm(account.customerId)}
            onFocus={() => onWarm(account.customerId)}
            data-financials-account-row={account.customerId}
            data-financials-account-state={accountState(account)}
            data-financials-account-selected={selected ? "true" : "false"}
            aria-pressed={selected}
            aria-current={selected ? "true" : undefined}
            className={`${QUEUE_ROW_CARD_SHELL_CLASS} !px-2.5 !py-2 transition-colors ${
                selected ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
            }`}
        >
            <span className="flex items-baseline gap-1.5">
                <Receipt className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-alloy-midnight/40" aria-hidden strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-alloy-midnight/90">
                    {account.householdName ?? "Household"}
                </span>
                <span
                    className="shrink-0 text-[12.5px] font-semibold tabular-nums text-alloy-midnight/90"
                    data-financials-account-outstanding={account.customerId}
                    data-financials-account-truth={account.financialTruth}
                >
                    {/*
                     * RESERVED, NOT ZERO. An em dash in the same tabular slot keeps the row's
                     * geometry identical before and after position lands, so nothing shifts when
                     * the figure arrives — and it never claims a household owes nothing merely
                     * because nobody has asked yet.
                     */}
                    {accountMoneyIsKnown(account) ? moneyExact(account.outstandingCents, account.currencyCode) : "—"}
                </span>
            </span>
            {/*
             * Collectible sits beside outstanding, never instead of it: the gap between them is a
             * submitted subsidy claim doing its job, and hiding one is how that gap becomes
             * unexplainable.
             */}
            <span className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px] text-alloy-midnight/45">
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
            <span className="mt-1 block">
                <RailState account={account} />
            </span>
        </button>
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
    /*
     * ── SELECTION IS A CONSEQUENCE OF THE COHORT, NOT A CLICK ──────────────────────────────────
     *
     * What is held here is the operator's EXPLICIT choice, which is usually nothing. The account
     * actually open is derived from it and the visible cohort by `resolveAccountSelection`, so the
     * workspace opens on the first account instead of on an empty canvas asking to be begun, and a
     * choice that a filter narrows away is replaced rather than left rendering an account the queue
     * no longer contains. Derivation rather than an effect: an effect that writes selection during
     * render is how the QA harness lost the Director's position twice.
     */
    const [chosen, setChosen] = useState<string | null>(null);
    /*
     * ── THE READ THE DETAILS GUARD ALREADY ASSUMES ─────────────────────────────────────────────
     *
     * F44 holds a strict rule: a Details destination may not be rendered until the deep read its
     * ledger depends on has resolved. That rule is tolerable because the card "reads ahead and is
     * usually ready" — and in this workspace it never did. The card is keyed by account, so the
     * coalescer that shares an in-flight read used to mount and die with each selection, leaving a
     * prewarm nothing to hand its work to.
     *
     * Warming here is the missing half of that contract, not a new mechanism: the same coalesced
     * read the card itself performs, started earlier. A read already in the air when the card
     * mounts is JOINED, never duplicated.
     */
    const warmAccount = useCallback((customerId: string) => {
        prewarmFinancialsCard(financialsCardQuery({ customerId }));
    }, []);
    const [filter, setFilter] = useState(NO_ACCOUNT_FILTER);
    const [filtersOpen, setFiltersOpen] = useState(false);
    /*
     * Typing must never wait on re-filtering two thousand rows. The input stays the operator's;
     * the list catches up. React's own deferral rather than a hand-rolled debounce with a timer
     * nobody owns.
     */
    const deferredSearch = useDeferredValue(filter.search);

    /*
     * A ROW IS COMPOSED ONLY WHEN BOTH SIDES WERE READ.
     *
     * A $0 row is a claim that the account was looked at and carries nothing. If the position read
     * failed, that claim is false for every household on the rail, and rendering the subject cohort
     * alone would turn an outage into a screen full of families who appear to owe nothing. The
     * failure is surfaced instead — which is the same rule the account detail already keeps.
     */
    /*
     * ── SUBJECTS OWNS THE LIST; POSITION DECORATES IT ──────────────────────────────────────────
     *
     * This used to wait for BOTH, which made the list's wait max(subjects, position) even though
     * position cannot add, remove or reorder a row. Measured on deployed staging that was ~685ms
     * of pure gate. The rows now render as soon as subjects answers, and each one says honestly
     * whether its money is known yet.
     */
    const positionTruth = position.data ? "resolved" : position.error ? "unavailable" : "pending";
    const accounts = useMemo(
        () => (subjects.data ? joinAccounts(subjects.data, position.data ?? null, positionTruth) : []),
        [subjects.data, position.data, positionTruth],
    );
    /*
     * A position failure no longer empties the queue — the row stays reachable and wears
     * UNAVAILABLE. Only a subjects failure is an outage for this list, because only subjects can
     * say which households exist.
     */
    const readError = subjects.error;
    const loading = subjects.loading && accounts.length === 0;
    const truncated = Boolean(subjects.data?.truncated || position.data?.truncated);

    /* The facets on offer describe the cohort, not the organisation — see `accountQueue`. */
    const programs = useMemo(() => programOptions(accounts), [accounts]);
    const rooms = useMemo(() => roomOptions(accounts), [accounts]);
    /*
     * Offered when choosing an option would actually narrow the queue — not merely when the cohort
     * holds two distinct values. A centre with one classroom still has families outside it.
     */
    const showProgram = useMemo(() => programDivides(accounts, programs), [accounts, programs]);
    const showRoom = useMemo(() => roomDivides(accounts, rooms), [accounts, rooms]);
    const visible = useMemo(
        () => filterAccounts(accounts, { ...filter, search: deferredSearch }),
        [accounts, filter, deferredSearch],
    );
    const narrowed = isAccountFilterActive({ ...filter, search: deferredSearch });
    const advancedCount = advancedFilterCount(filter);
    const counts = useMemo(() => stateCounts(accounts), [accounts]);

    const selected = resolveAccountSelection(visible, chosen);
    /*
     * THE DEFAULT SELECTION IS A SELECTION. It is resolved from the cohort the moment the list
     * lands, so its read may start then rather than when the Details component later asks for the
     * same truth. Warming the CURRENT selection also covers the click path: the read is already in
     * the air by the time the card for it mounts.
     */
    useEffect(() => {
        if (selected) warmAccount(selected);
    }, [selected, warmAccount]);
    const selectedAccount = visible.find((a) => a.customerId === selected) ?? null;

    return (
        <div className="flex min-h-0 flex-1 gap-2" data-testid="financials-accounts-section">
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
            {/*
             * `padded={false}`: the surface's own `p-4 lg:p-6` put 24px of empty stone inside a
             * 360px rail before the first queue row, and another 24 on the far side of the account
             * pane. Between them they were most of the 40px trench between the rail and the card.
             * The regions set their own, tighter padding — the rail is a queue and the account pane
             * is a single card that should reach the edges of the canvas it was given.
             */}
            <WorkspaceSurface padded={false} className="flex h-full min-h-0 flex-col overflow-hidden">
                {/*
                 * ── THE QUEUE CONTROLS ─────────────────────────────────────────────────────────
                 *
                 * An operator opens Accounts to reach ONE family, and the way they reach it is a
                 * name — usually a child's — or the room the child is in. Scrolling a rail of every
                 * household in the organisation is not a way to reach anybody.
                 *
                 * Narrowing only. See `accountQueue`: these decide which rows are LISTED and can
                 * never change what any household owes. And no site control here — the workspace
                 * already owns site scope, server-side, and a second one would be a second answer.
                 */}
                {/*
                 * ── SEARCH ALWAYS; FILTERS ON REQUEST ──────────────────────────────────────────
                 *
                 * The Program and Room controls used to sit open on the rail permanently, so two
                 * dropdowns an operator rarely touches took height from the queue on every visit.
                 * The house pattern — the work-unit queue's `QueueFilterControls` — is Search plus a
                 * `Filters` button carrying a count, and an inline panel that opens only when asked.
                 * Same chrome tokens, same button grammar, same count badge, same Clear and the same
                 * "N of M" caption, because a Financials-only filter drawer is exactly the drift
                 * this pass exists to end.
                 */}
                <div className={`flex flex-col gap-1.5 px-2 py-2 ${WS_QUEUE_TOOLBAR_CHROME}`}
                    data-financials-accounts-controls="true">
                    <div className="flex items-center gap-2">
                        <input
                            type="search"
                            value={filter.search}
                            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                            placeholder="Search household, child or contact"
                            aria-label="Search accounts"
                            data-financials-account-search="true"
                            className={`min-w-0 flex-1 ${WS_FIELD_SEARCH_CHROME}`}
                        />
                        <button
                            type="button"
                            onClick={() => setFiltersOpen((v) => !v)}
                            aria-expanded={filtersOpen}
                            data-financials-account-filters-toggle="true"
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold shadow-[0_1px_3px_rgba(24,39,58,0.06)] transition-colors ${
                                filtersOpen || advancedCount > 0
                                    ? "border-alloy-bend-pine/50 bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                    : "border-alloy-stone/55 bg-white text-alloy-midnight/70 hover:border-alloy-bend-pine/40 hover:text-alloy-bend-pine"
                            }`}
                        >
                            Filters
                            {advancedCount > 0 ? (
                                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-alloy-pine px-1 text-[10px] font-bold tabular-nums text-white">
                                    {advancedCount}
                                </span>
                            ) : null}
                        </button>
                        {narrowed ? (
                            <button
                                type="button"
                                onClick={() => setFilter(NO_ACCOUNT_FILTER)}
                                data-financials-account-filters-clear="true"
                                className="shrink-0 rounded-md px-2 py-1.5 text-[12px] font-semibold text-alloy-pine hover:bg-alloy-pine/10"
                            >
                                Clear
                            </button>
                        ) : null}
                    </div>

                    {narrowed ? (
                        <p className="text-[11px] tabular-nums text-alloy-midnight/45"
                            data-financials-account-filter-caption="true">
                            {visible.length} of {accounts.length}
                        </p>
                    ) : null}

                    {filtersOpen ? (
                        <div className="flex flex-col gap-1.5 rounded-lg border border-alloy-stone/25 bg-alloy-stone/[0.04] px-2.5 py-2"
                            data-financials-account-filters-panel="true">
                            {/*
                             * FINANCIAL STATE, in the rail's own canonical vocabulary — the same
                             * `accountState` precedence the rows wear as chips, so the filter and
                             * the badge can never disagree about what an account IS.
                             */}
                            <span className="block">
                                <span className="mb-1 block text-[10px] uppercase tracking-wide text-alloy-midnight/45">
                                    Financial state
                                </span>
                                <span className="flex flex-wrap gap-1">
                                    {ACCOUNT_STATE_FILTERS.map((option) => {
                                        const on = filter.state === option.value;
                                        const count = counts[option.value];
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                data-financials-account-state-filter={option.value}
                                                aria-pressed={on}
                                                disabled={count === 0 && !on}
                                                onClick={() =>
                                                    setFilter((f) => ({ ...f, state: on ? null : option.value }))
                                                }
                                                className={`rounded-md px-2 py-1 text-[11.5px] font-medium transition disabled:opacity-35 ${
                                                    on
                                                        ? "bg-alloy-bend-pine text-white"
                                                        : "bg-white text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                                }`}
                                            >
                                                {option.label}
                                                <span className={`ml-1.5 tabular-nums ${on ? "text-white/80" : "text-alloy-midnight/40"}`}>
                                                    {count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </span>
                            </span>

                            {showProgram || showRoom ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {showProgram ? (
                                        <span className="min-w-0 flex-1">
                                            <AlloySelect
                                                value={filter.programId ?? ""}
                                                onChange={(v) => setFilter((f) => ({ ...f, programId: v || null }))}
                                                options={programs.map((p) => ({ value: p.id, label: p.label }))}
                                                placeholder="All programs"
                                                density="compact"
                                                aria-label="Filter by program"
                                                testId="financials-account-program"
                                            />
                                        </span>
                                    ) : null}
                                    {showRoom ? (
                                        <span className="min-w-0 flex-1">
                                            <AlloySelect
                                                value={filter.roomId ?? ""}
                                                onChange={(v) => setFilter((f) => ({ ...f, roomId: v || null }))}
                                                options={rooms.map((r) => ({ value: r.id, label: r.label }))}
                                                placeholder="All rooms"
                                                density="compact"
                                                aria-label="Filter by room"
                                                testId="financials-account-room"
                                            />
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5" data-financials-accounts-list="true">
                    {readError ? (
                        <p className="px-3 py-4 text-xs text-alloy-ember" data-financials-accounts-error="true">
                            {readError}
                        </p>
                    ) : loading ? (
                        <p className="px-3 py-4 text-xs text-alloy-midnight/50">Loading accounts…</p>
                    ) : visible.length === 0 ? (
                        /*
                         * TWO DIFFERENT EMPTIES. "Nothing matched what you typed" is recoverable by
                         * clearing the box; "no household has an account in this scope" is not, and
                         * telling an operator the second when the first is true sends them looking
                         * for a data problem that does not exist.
                         */
                        narrowed ? (
                            <WorkspaceEmptyState
                                title="No account matches these filters"
                                body="Clear the search or the program and room filters to see the full queue."
                            />
                        ) : (
                            <WorkspaceEmptyState
                                title="No household account in scope"
                                body={`No household has a financial account for ${scopeLabel.toLowerCase()}.`}
                            />
                        )
                    ) : (
                        visible.map((account) => (
                            <AccountQueueRow
                                key={account.customerId}
                                account={account}
                                selected={selected === account.customerId}
                                onSelect={setChosen}
                                onWarm={warmAccount}
                            />
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

            <WorkspaceSurface padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
                {!selected ? (
                    <WorkspaceEmptyState
                        title="Select an account"
                        body="Choose a household to see its canonical financial detail."
                    />
                ) : (
                    <div
                        className="flex min-h-0 flex-1 flex-col"
                        data-financials-account-detail={selected}
                        role="region"
                        aria-label={`Financials — ${selectedAccount?.householdName ?? "Household"}`}
                        data-financials-account-household={selectedAccount?.householdName ?? "Household"}
                    >
                        {/*
                         * IDENTITY COMMITS AT THE INSTANT OF THE CLICK.
                         *
                         * The household name and the scope of what follows are known from the row;
                         * neither waits on a network read, so the selected account is never a bare
                         * loading card. SCOPE, SAID OUT LOUD: the rail is site-scoped, this is not.
                         */}
                        {/*
                         * ── THE HOUSEHOLD IS NAMED ONCE ────────────────────────────────────────
                         *
                         * It was named twice: in the selected queue row on the left, and again as a
                         * large heading directly beside it. The selected row IS the statement of
                         * which account is open — that is what selection means — and a second copy
                         * of the same name spent a band of the operating surface saying nothing new.
                         *
                         * Identity does NOT disappear: the region is labelled with the household's
                         * name for assistive technology, and the name is still on screen in the row
                         * that is selected. What went is the duplicate visual heading.
                         *
                         * "Account-wide · every site" went with it. Scope is governed by the
                         * workspace's own site context and stated there; restating it over every
                         * account taught an operator nothing they could act on, and it is not
                         * replaced by another explanatory sentence.
                         */}
                        {/*
                         * ── THE CARD TAKES THE CANVAS ──────────────────────────────────────────
                         *
                         * A 12px pad around a surface that owns the whole right pane, rather than
                         * the 16-20px of gutter that used to sit between the rail and the account.
                         * The ledger is eight columns wide; every pixel spent on empty canvas here
                         * is a pixel the Description column does not get.
                         *
                         * This element no longer OWNS the scroll — see the sticky note on the card
                         * shell. The summary, the commands and the lenses stay put; the financial
                         * activity beneath them is what moves.
                         */}
                        <div className="flex min-h-0 flex-1 flex-col">
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
                            {/*
                             * ── ONE FINANCIALS OBJECT, EXPANDED ────────────────────────────────
                             *
                             * The lenses and the account's activity are the card's own lower body,
                             * passed in and rendered inside it. They used to sit in a second panel
                             * beneath the card, which gave the operator two objects to reconcile
                             * where the product has one — and made the summary look like a header
                             * for something else rather than the top of this account.
                             *
                             * The Focus Panel passes no body and stays compact. Same card, same
                             * truth, same commands; only the depth this placement may show differs.
                             */}
                            {/*
                             * ── ONE FINANCIALS OBJECT, EXPANDED ────────────────────────────────
                             *
                             * Summary, divider, lenses and activity are one bordered surface: the
                             * account's Financials card, opened to its full depth because the
                             * operator is already in the dedicated financial workspace. The lenses
                             * used to sit in a second panel below a second border, which gave them
                             * two objects to reconcile where the product has one.
                             *
                             * SIBLINGS RATHER THAN NESTED, deliberately. `FinancialsCard` enters a
                             * command by RETURNING a different tree, so a body rendered inside it
                             * unmounts the moment Add Charge opens — and comes back with its lens
                             * and scroll reset, which is precisely the state Cancel is supposed to
                             * restore. Side by side under one surface, the body is never unmounted
                             * and the command has nothing to take away from it. The shared border
                             * is drawn here and suppressed on the card, so it still reads as one.
                             */}
                            {/*
                              * ONE COMMAND HOST AROUND BOTH SIBLINGS. The card owns the Financials
                              * command shell; the ledger beneath it owns the rows. The channel lets
                              * a row raise the card's command instead of the workspace growing a
                              * second Reverse, Adjust and Post of its own.
                              */}
                            <FinancialCommandHost>
                            <div className="alloy-accounts-account-card alloy-accounts-command-host"
                                data-financials-account-card="true"
                                data-financials-command-host="true">
                                <FinancialsAccountDetail
                                    key={`account-${selected}`}
                                    customerId={selected}
                                    customerMemberId={null}
                                    participationId={null}
                                    displayName={selectedAccount?.householdName ?? null}
                                    showDetailsAction={false}
                                    summaryVariant="account"
                                />
                                {/*
                                  * ── THE LEDGER COMES WITH THE ACCOUNT NOW ────────────────────
                                  *
                                  * `FinancialsAccountWorkspaceDetail` was a second ledger: its own
                                  * lens bar, its own period grouping, its own rows and an inline
                                  * Responsibility editor — roughly a thousand lines answering
                                  * questions the shared Details surface already answers, from the
                                  * same canonical view model.
                                  *
                                  * It existed because this host passed `showDetailsAction={false}`,
                                  * which left the shared surface unreachable. The card above now
                                  * OPENS on Details, so the ledger, the lenses, the relationship
                                  * row and all three management doors arrive with it — one
                                  * implementation, two hosts, and no way for them to drift apart
                                  * again.
                                  */}
                            </div>
                            </FinancialCommandHost>
                        </div>
                    </div>
                )}
            </WorkspaceSurface>
        </div>
    );
}
