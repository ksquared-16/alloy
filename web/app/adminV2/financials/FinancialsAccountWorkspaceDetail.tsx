"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import FinancialsResponsibilityPanel from "@/app/adminV2/financials/FinancialsResponsibilityPanel";

import { money, moneyExact, shortDate } from "@/app/adminV2/financials/financialsFormat";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import {
    FinancialsLedgerPeriod,
    RowAction,
    type FinancialsLedgerRowView,
} from "@/components/operationalCards/FinancialsLedger";
import { financialRowConceptLabel } from "@/lib/financials/reductions/reductionProvenance";
import { financialResponsibilityEligibility, financialTransactionEligibility } from "@/lib/financials/commands/financialTransactionCommands";
import { useFinancialCommandChannel } from "@/components/financials/FinancialCommandChannel";
import { billingPeriodLabel } from "@/lib/financials/billingPeriod";
import {
    ACCOUNT_LENSES,
    ACCOUNT_LENS_LABELS,
    NO_FILTER,
    filterLedger,
    filterPayments,
    hasChoice,
    lensCounts,
    payerOptions,
    responsiblePartyOptions,
    periodOptions,
    subjectOptions,
    type AccountLens,
} from "@/lib/financials/workspace/accountLenses";

/**
 * THE ACCOUNT, AS AN OPERATING SURFACE.
 *
 * ── THE SIX QUESTIONS THIS ANSWERS, IN THIS ORDER ──────────────────────────────────────────────
 *
 *   1  What is this account's current financial state?   → the state band, first thing on screen
 *   2  Who and what does it belong to?                   → the same band: household, children, period
 *   3  What can I do next?                               → actions, above the record rather than under it
 *   4  What money makes up that state?                   → lenses over the canonical rows
 *   5  Which part of it do I care about?                 → child, period and payer filters
 *   6  Who owes it and who is funding it?                → responsibility, kept whole and compact
 *
 * It optimises for select → understand → filter → act. It previously optimised for select → read a
 * long report → open another detail → find an action, which is a report surface wearing a
 * workspace's name.
 *
 * ── SELECTION IS IMMEDIATE; MONEY ARRIVES AFTER ────────────────────────────────────────────────
 *
 * Selecting an account used to replace the entire surface with "Reading the account…" for as long
 * as the read took. Everything except the money was already known at the instant of the click — the
 * household, the identity, the section structure — so a whole screen was being withheld on account
 * of the part that genuinely had to be fetched.
 *
 * Now: the identity commits synchronously, the shell renders at once, and only the figures wait,
 * as placeholders INSIDE the regions that will hold them. Two rules make that safe.
 *
 *   · NO INVENTED MONEY. A placeholder is visibly a placeholder. The rail's own figures are NOT
 *     borrowed to fill these in: a row is site-scoped and this surface is account-wide, so the two
 *     legitimately differ, and seeding one from the other would show a wrong number confidently.
 *
 *   · NO STALE SUBJECT. Clicking three accounts quickly means three reads in flight. Each response
 *     is checked against the account still selected and dropped if it is not; a late payload may
 *     never land under a different household's name.
 *
 * ── AND STILL NO SECOND FINANCIAL ANSWER ───────────────────────────────────────────────────────
 *
 * Every figure below is a field `buildFinancialsCardVM` already produced, reached through
 * `/api/admin/financials/card`. The lenses filter those rows; they never total them. This file
 * computes no money.
 */

type Row = Record<string, any>;
type Vm = {
    account?: Row; period?: Row; payers?: Row[]; rows?: Row[]; reductions?: Row[]; payments?: Row[];
    /** The reader's own period grouping, with its own totals. Read, never recomputed. */
    ledgerPeriods?: Row[];
    reconciliation?: Record<string, number>; collectible?: Record<string, number>;
    responsibility?: { parties?: Row[]; allocatedCents?: number; unassignedCents?: number };
    expectedFunding?: Row[]; subjects?: Row[]; pastDue?: Row; achAvailable?: boolean;
    paymentCapabilities?: {
        recordPayment?: { state: string; reason: string | null };
        takePaymentCard?: { state: string; reason: string | null };
        takePaymentAch?: { state: string; reason: string | null };
        manageMethods?: { state: string; reason: string | null };
        autopay?: { state: string; reason: string | null };
        methodsOnFile?: Array<{ id: string; brand: string | null; last4: string | null; isDefault: boolean }>;
        summaryLine?: string | null;
    } | null;
    unavailable?: Row[]; unavailableReason?: string | null;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export default function FinancialsAccountWorkspaceDetail({
    customerId,
    householdName = null,
    currencyCode = "USD",
}: {
    customerId: string;
    /** Known at the instant of the click. The name never waits on a network read. */
    householdName?: string | null;
    currencyCode?: string;
}) {
    const [vm, setVm] = useState<Vm | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lens, setLens] = useState<AccountLens>("all");
    /*
     * The account card above this ledger owns the Financials command shell. A row asks it; this
     * surface performs nothing — there is no financial mutation anywhere in this file.
     */
    const [subject, setSubject] = useState<string | null>(null);
    const [periodKey, setPeriodKey] = useState<string | null>(null);
    const [payer, setPayer] = useState<string | null>(null);
    const [responsibleParty, setResponsibleParty] = useState<string | null>(null);
    /*
     * ── TWO CONTROLS, TWO QUESTIONS ───────────────────────────────────────────────────────────
     *
     * The Responsible party dropdown FILTERS the ledger: show me the rows this person owes. The
     * gear CONFIGURES: decide who owes, from a date. They sit next to each other because an
     * operator asking the first often wants the second, and they stay separate controls because
     * folding configuration into a filter would make selecting a name a money decision.
     *
     * `manageOpen` is the card's own depth state. Nothing about the ledger below changes while it
     * is open, so dismissing it lands back on exactly the account, lens, filters and scroll the
     * operator left.
     */
    const [manageOpen, setManageOpen] = useState(false);
    /* The gear that opened the card, so dismissing it returns focus there and not to <body>. */
    const manageGearRef = useRef<HTMLButtonElement | null>(null);
    const closeManage = useCallback(() => {
        setManageOpen(false);
        manageGearRef.current?.focus();
    }, []);
    const [scopeMembers, setScopeMembers] = useState<{ customerMemberId: string; label: string }[]>([]);
    useEffect(() => {
        /* Canonical household membership, read when the operator asks to administer — not on every
           account open, because the ledger does not need it. */
        if (!manageOpen || !customerId || scopeMembers.length > 0) return;
        let cancelled = false;
        void fetch(`/api/admin/financials/responsibility-scopes?customer_id=${encodeURIComponent(customerId)}`, {
            credentials: "include",
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((b: { members?: { customerMemberId: string; label: string }[] } | null) => {
                if (!cancelled && b?.members) setScopeMembers(b.members);
            })
            .catch(() => {
                /* The card still administers the household; it simply cannot offer a child. */
            });
        return () => {
            cancelled = true;
        };
    }, [manageOpen, customerId, scopeMembers.length]);

    /* The account still selected. Every response is checked against it before it is allowed to land. */
    const wantedRef = useRef(customerId);

    /*
     * ── RE-READING IS NOT SWITCHING ACCOUNTS ──────────────────────────────────────────────────
     *
     * Opening a different account clears the lens and every filter, because the previous family's
     * view means nothing here. Re-reading the SAME account after a command must not: an operator
     * who configured responsibility while looking at October under one child expects October and
     * that child still selected when the card closes. The fetch is therefore separate from the
     * reset, and only the account change performs both.
     */
    const reload = useCallback(async () => {
        const wanted = customerId;
        wantedRef.current = wanted;
        try {
            const res = await fetch(`/api/admin/financials/card?customer_id=${wanted}`, { cache: "no-store" });
            const json = (await res.json()) as { vm?: Vm; error?: string };
            if (wantedRef.current !== wanted) return;
            /*
             * A FAILED READ IS NOT A ZERO BALANCE. The surface says it could not look rather
             * than rendering an account that owes nothing — the two are different answers and
             * only one of them is safe to act on.
             */
            if (!res.ok || !json.vm) { setError(json.error ?? `The account could not be read (${res.status}).`); return; }
            setVm(json.vm);
        } catch (e) {
            if (wantedRef.current !== wanted) return;
            setError(e instanceof Error ? e.message : "The account could not be read.");
        }
    }, [customerId]);

    useEffect(() => {
        /* The previous account's money must not sit under this one's name for even a frame. */
        setVm(null);
        setError(null);
        setLens("all");
        setSubject(null);
        setPeriodKey(null);
        setPayer(null);
        setManageOpen(false);
        setScopeMembers([]);
        void reload();
    }, [customerId, reload]);

    const rows = useMemo(() => (vm?.rows ?? []) as Row[], [vm]);
    const payments = useMemo(() => (vm?.payments ?? []) as Row[], [vm]);

    const subjects = useMemo(() => subjectOptions(rows as never), [rows]);
    const periods = useMemo(() => periodOptions(rows as never), [rows]);
    const payers = useMemo(() => payerOptions(payments as never), [payments]);
    /* Who is OBLIGATED — a different question from whose child it is, and from who paid. */
    const responsibleParties = useMemo(() => responsiblePartyOptions(rows as never), [rows]);
    const counts = useMemo(
        () => lensCounts(rows as never, payments as never, { subject, periodKey, responsibleParty }),
        [rows, payments, subject, periodKey, responsibleParty],
    );

    const ledger = useMemo(
        () =>
            filterLedger(rows as never, { ...NO_FILTER, lens, subject, periodKey, responsibleParty })
                .slice()
                .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))),
        [rows, lens, subject, periodKey, responsibleParty],
    );
    const visiblePayments = useMemo(
        () => filterPayments(payments as never, { payerLabel: payer }) as unknown as Row[],
        [payments, payer],
    );

    /*
     * THE SERVER'S OWN PERIOD TOTALS — offered to the ledger only while the view is UNFILTERED.
     *
     * `vm.ledgerPeriods` is the grouping the account reader already produced, with its own totals.
     * The moment a lens or a subject filter is on, those totals describe more rows than are on
     * screen, so handing them to a filtered ledger would label a subset with the whole's balance.
     * Null then, and the ledger states a row count instead. No subtotal is ever computed here.
     */
    const canonicalPeriodTotals = useMemo(() => {
        const unfiltered = lens === "all" && !subject && !periodKey;
        if (!unfiltered) return null;
        const groups = (vm?.ledgerPeriods ?? []) as Row[];
        const byKey = new Map<string, number>();
        for (const g of groups) {
            const key = String((g.period as Row | undefined)?.key ?? "");
            if (!key) continue;
            byKey.set(key, n(g.totalCents));
        }
        return byKey;
    }, [vm, lens, subject, periodKey]);

    if (error) {
        return (
            <p className="px-4 py-6 text-sm text-alloy-ember" data-financials-detail-error="true">{error}</p>
        );
    }

    const r = vm?.reconciliation ?? {};
    const c = vm?.collectible ?? {};
    const cur = String((vm?.rows ?? [])[0]?.currencyCode ?? currencyCode);
    const pastDueCents = n(vm?.pastDue?.amountCents);
    const loading = !vm;
    const name = householdName ?? String(vm?.account?.label ?? "") ?? null;

    return (
        /*
         * ── ONE SCROLL OWNER, AND IT IS NOT THE ACCOUNT ────────────────────────────────────────
         *
         * The controls an operator works an account WITH — the balance, the two commands, the
         * lenses and the context filters — used to scroll away the moment a family had a year of
         * history, so reading September meant losing the Payment button. The card above this and
         * the lens bar below stay put; the financial activity is what moves.
         *
         * A flex column with a min-height of zero and exactly ONE `overflow-y-auto` inside it,
         * rather than sticky offsets that would need the summary's height as a magic number, and
         * rather than a second scroller nested in the first.
         */
        <div className="flex min-h-0 flex-1 flex-col" data-financials-workspace-detail={customerId}
            data-financials-detail-hydrated={loading ? "false" : "true"}>

            {/*
             * NO SUMMARY HERE. The Financials card composed directly above this is the account's
             * one summary — balance, past due, responsibility, received, payment state, actions.
             * This band used to repeat those figures under different labels, which gave the surface
             * two summaries and no hierarchy. What follows is DETAIL, and only detail.
             */}
            {/* ── 3 · THE MONEY, THROUGH ONE LENS AT A TIME ─────────────────────────────────────── */}
            {/*
             * A DIVIDER, NOT A NEW SURFACE. This region is the lower half of the Financials card it
             * is rendered inside, so it draws no border of its own — a bordered panel here would put
             * a card inside a card and reintroduce the two-object reading this pass removed.
             */}
            <section className="flex min-h-0 flex-1 flex-col border-t border-alloy-stone/15 pt-1" data-financials-lenses="true">
                <div className="flex shrink-0 flex-wrap items-center gap-1 px-1 pb-1"
                    data-financials-lensbar="true">
                    {ACCOUNT_LENSES.map((key) => (
                        <button
                            key={key}
                            type="button"
                            data-financials-lens={key}
                            aria-pressed={lens === key}
                            onClick={() => setLens(key)}
                            disabled={loading}
                            className={`rounded-md px-2.5 py-1 text-[12px] transition disabled:opacity-40 ${
                                /* Bend Pine is the product's active operational control; navy read
                                   as a neutral chip rather than a live selection. Token, not a hex. */
                                lens === key
                                    ? "bg-alloy-bend-pine text-white"
                                    : "text-alloy-midnight/70 hover:bg-alloy-stone/10"
                            }`}
                        >
                            {ACCOUNT_LENS_LABELS[key]}
                            {/*
                             * The count SLOT is always present, so the lens bar is the same width
                             * before and after the read. It used to appear with the data and shift
                             * every lens to its right — a control moving under the cursor at the
                             * moment an operator reaches for it.
                             */}
                            <span className={`ml-1.5 inline-block min-w-[1.25ch] text-center tabular-nums ${lens === key ? "text-white/80" : "text-alloy-midnight/40"}`}>
                                {loading ? "·" : counts[key]}
                            </span>
                        </button>
                    ))}

                    {/*
                     * A FILTER IS OFFERED ONLY WHEN IT DIVIDES SOMETHING. One child, one period or
                     * one payer would be a dropdown with a single choice, which reads as a
                     * capability this surface does not have. Every control shown here works.
                     */}
                    {/*
                     * The filter row keeps its height while the account reads, for the same reason,
                     * and stays on ONE line beside the lenses. It wrapped to a second row and then
                     * stacked its two controls vertically, which read as a separate panel floating
                     * to the right of the lens bar rather than as part of it.
                     */}
                    <span className="ml-auto flex min-h-[1.6rem] shrink-0 flex-nowrap items-center gap-1.5"
                        data-financials-filter-slot="true">
                        {!loading && lens !== "payments" && hasChoice(subjects) ? (
                            <Filter
                                testId="subject"
                                value={subject ?? ""}
                                onChange={(v) => setSubject(v || null)}
                                placeholder="Everyone"
                                options={subjects}
                            />
                        ) : null}
                        {!loading && lens !== "payments" && hasChoice(periods) ? (
                            <Filter
                                testId="period"
                                value={periodKey ?? ""}
                                onChange={(v) => setPeriodKey(v || null)}
                                placeholder="All periods"
                                options={periods}
                            />
                        ) : null}
                        {/*
                          * WHO OWES IT — offered beside the subject, never instead of it. A row can
                          * concern Ana while responsibility belongs to a parent; those are two
                          * questions and the ledger answers them from two authorities.
                          *
                          * Hidden under the Payments lens for the same reason the subject filter is:
                          * a receipt is not an obligation, and responsibility is a fact about the
                          * obligation. Payer is the question there, and it already has the control.
                          */}
                        {!loading && lens !== "payments" && hasChoice(responsibleParties) ? (
                            <Filter
                                testId="responsible-party"
                                value={responsibleParty ?? ""}
                                onChange={(v) => setResponsibleParty(v || null)}
                                placeholder="Anyone responsible"
                                options={responsibleParties}
                            />
                        ) : null}
                        {/*
                          * MANAGE, beside FILTER. Quiet: an icon at the filters' own size, in the
                          * filters' own row, with no fill and no border — it must not turn the
                          * filter row into a command footer. Its accessible name says what it
                          * does, because an icon shape is not a sentence.
                          */}
                        {!loading && lens !== "payments" ? (
                            <button
                                type="button"
                                ref={manageGearRef}
                                onClick={() => setManageOpen(true)}
                                aria-label="Manage responsibility"
                                title="Manage responsibility — who contractually owes, from a date"
                                data-financials-manage-responsibility="gear"
                                className="inline-flex h-[1.6rem] w-[1.6rem] shrink-0 items-center justify-center rounded text-alloy-midnight/45 transition hover:bg-alloy-stone/15 hover:text-alloy-bend-pine focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40"
                            >
                                <Settings2 aria-hidden size={14} strokeWidth={1.9} />
                            </button>
                        ) : null}
                        {!loading && lens === "payments" && hasChoice(payers) ? (
                            <Filter
                                testId="payer"
                                value={payer ?? ""}
                                onChange={(v) => setPayer(v || null)}
                                placeholder="Any payer"
                                options={payers}
                            />
                        ) : null}
                    </span>
                </div>

                {/*
                  * ── THE DEPTH CARD, ABOVE THE ACTIVITY AND INSIDE THIS SURFACE ──────────────
                  *
                  * Not a route, not a second modal system, and not a replacement for the ledger:
                  * it opens in place, directly under the controls it was raised from, and the
                  * account, lens, filters, period expansion and scroll beneath it are untouched.
                  * Dismissal is therefore not a restoration — there is nothing to restore, which
                  * is the only way to be certain the operator lands where they left.
                  *
                  * The panel is the one that already exists. `memberOptions` is what turns it
                  * from "this charge's child" into account administration; the writer, the
                  * preview and the refusal path are unchanged.
                  */}
                {/*
                  * ── ESCAPE DISMISSES THE CARD, NOT THE ACCOUNT ─────────────────────────────
                  *
                  * MEASURED: Escape closed the whole Financials surface. The workspace modal
                  * listens for it, and a depth card that does not answer first hands its own
                  * dismissal to its host — so an operator closing a panel lost the account, the
                  * lens, the filters and their place in the ledger.
                  *
                  * The card is the innermost open thing, so it answers and stops there.
                  */}
                {manageOpen ? (
                    <div
                        className="px-0.5 pt-2"
                        data-financials-manage-responsibility="depth-card"
                        onKeyDown={(e) => {
                            if (e.key !== "Escape") return;
                            e.stopPropagation();
                            e.preventDefault();
                            closeManage();
                        }}
                    >
                        <FinancialsResponsibilityPanel
                            customerId={customerId}
                            customerMemberId={null}
                            subjectLabel={householdName}
                            parties={(vm?.responsibility?.parties ?? []) as { personId: string | null; name: string }[]}
                            memberOptions={scopeMembers}
                            hostedOpen={manageOpen}
                            onHostedClose={closeManage}
                            onCommitted={async () => {
                                /* Committed truth is re-read; the card does not report its own success. */
                                await reload();
                                setManageOpen(false);
                            }}
                        />
                    </div>
                ) : null}

                {/* THE SCROLL REGION BEGINS HERE — with the activity, never with the controls. */}
                <div className="min-h-0 flex-1 overflow-y-auto pt-0.5" data-financials-activity-scroll="true">
                    {loading ? (
                        <LedgerSkeleton />
                    ) : lens === "payments" ? (
                        <PaymentsLens
                            payments={visiblePayments}
                            cur={cur}
                            capabilities={vm?.paymentCapabilities ?? null}
                        />
                    ) : ledger.length === 0 ? (
                        <Empty>
                            {lens === "all"
                                ? "Nothing charged yet"
                                : `No ${ACCOUNT_LENS_LABELS[lens].toLowerCase()} in this view.`}
                        </Empty>
                    ) : (
                        <LedgerPeriods
                            rows={ledger as unknown as Row[]}
                            cur={cur}
                            canonicalTotals={canonicalPeriodTotals}
                        />
                    )}
            {/*
             * ── 4 · FUNDING, UNDER THE FUNDING LENS ────────────────────────────────────────────
             *
             * This band used to sit under EVERY ledger, on every account, permanently: "Who owes
             * it / No responsibility assigned / Expected funding / No expected funding / Not
             * claimed here: autopay, payer_split". Four of those five lines were an absence, and
             * the fifth named two database fields. An operator scrolled a year of real activity to
             * arrive at a footer telling them nothing had been arranged and that two facts were
             * unclaimed.
             *
             * Neither concept left the product. WHO OWES IT is now on every row, at the grain the
             * model actually has — the Responsible party column — which is where the question is
             * asked and where an unassigned charge is visible rather than summarised into
             * "No responsibility assigned". EXPECTED FUNDING keeps its own lens: it is an
             * expectation rather than activity, it must never be read as money received, and an
             * operator asks for it deliberately.
             *
             * "Not claimed here" is gone outright. Which facts this surface does not carry is a
             * statement about our implementation, not about the family whose account is open.
             */}
            {lens === "funding" ? (
            <section className="mt-2.5 border-t border-alloy-stone/15 pt-2.5" data-financials-arrangements="true">
                <Sub title="An expectation, not money received. It does not reduce what is owed.">
                    Expected funding
                </Sub>
                {loading ? (
                    <Skeleton w="12rem" />
                ) : (vm?.expectedFunding ?? []).length === 0 ? (
                    <Empty>Nothing is expected from a third party</Empty>
                ) : (
                    <ul className="space-y-1">
                        {(vm?.expectedFunding ?? []).map((f, i) => (
                            <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="text-alloy-midnight">{String(f.label)}</span>
                                <span className="tabular-nums text-alloy-midnight">{moneyExact(n(f.expectedCents), cur)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            ) : null}
                </div>
            </section>
        </div>
    );
}

// ── LENS CONTENT ────────────────────────────────────────────────────────────────────────────────

/**
 * THE LEDGER — Focus Panel → Financials → Details' anatomy, rendered over the workspace's rows.
 *
 * This surface used to draw its own `<table>`: its own header typography, its own row density, its
 * own GL treatment, its own flat chronological order with a Period COLUMN. Details groups by
 * period, heads each group, and lays eight fixed columns on a grid. Two Financials ledgers with two
 * different anatomies is the thing this pass exists to end, so the workspace now renders the
 * canonical one — the same `alloy-os-billingdetail__*` classes, so the typography is literally
 * shared rather than approximated.
 *
 * ── THE PERIOD SUMMARY IS THE SERVER'S FIGURE OR IT IS A COUNT ─────────────────────────────────
 *
 * Details states a period balance because it renders the server's own groups, whole. Here the rows
 * have been through a lens and possibly a subject filter, and summing a SUBSET would be this
 * component quietly becoming a second opinion about money — the exact thing `accountLenses` refuses
 * to do. So: unfiltered, the canonical `ledgerPeriods[].totalCents` the server already computed;
 * filtered, a count of rows. A number on screen is either canonical or it is a row count, never a
 * subtotal invented by a presentation layer.
 */
/**
 * THE WORKSPACE LEDGER — the same primitive the Focus Panel renders through.
 *
 * This file used to carry its own copy of the row markup: the same eight columns, written twice, in
 * two components, against one CSS grid. Two copies of a grid drift the moment one is edited, and
 * the only thing keeping them identical was that nobody had edited one. The markup now lives in
 * `FinancialsLedger` and both surfaces map their own canonical rows into its row shape.
 *
 * ── THE PERIOD SUMMARY IS THE SERVER'S FIGURE OR IT IS A COUNT ─────────────────────────────────
 *
 * Unfiltered, the canonical `ledgerPeriods[].totalCents` the server already computed; filtered, a
 * count of rows. Summing a subset here would be this component quietly becoming a second opinion
 * about money — the exact thing `accountLenses` refuses to do. A number on screen is either
 * canonical or it is a row count, never a subtotal invented by a presentation layer.
 */
/*
 * ── PROVENANCE, READ THE SAME WAY ON BOTH SURFACES ─────────────────────────────────────────────
 *
 * The projection already decided what this reduction is and how its number was reached; these only
 * reach into the row for it. The preview is the same short line the Focus Panel's detail card
 * builds — basis, recurrence, and the sentence somebody wrote — because a row that meant one thing
 * here and another there would be exactly the semantic fork the convergence forbids.
 */
type RowReduction = {
    conceptLabel?: string;
    basisSummary?: string | null;
    recurrenceLabel?: string;
    explanation?: string | null;
};

function reductionOf(row: Record<string, unknown>): RowReduction | null {
    const r = row.reduction as RowReduction | null | undefined;
    return r ?? null;
}

function reductionPreviewOf(row: Record<string, unknown>): string | null {
    const r = reductionOf(row);
    if (!r) return null;
    const label = row.description == null ? "" : String(row.description);
    /* Same rule as the Focus Panel: an explanation that already carries the basis is not repeated. */
    const basis = r.basisSummary ?? null;
    const explanation =
        basis && r.explanation && String(r.explanation).includes(basis) ? null : r.explanation;
    const parts = [basis, r.recurrenceLabel || null, explanation].filter(
        (v): v is string => Boolean(v && String(v).trim()),
    );
    if (!parts.length) return label || null;
    /* Same rule as the Focus Panel: the TYPE column already states the concept. */
    const concept = String(r.conceptLabel ?? "");
    const redundant = label.toLowerCase() === concept.toLowerCase();
    return (redundant ? parts : [label, ...parts]).filter(Boolean).join(" · ");
}

function LedgerPeriods({
    rows,
    cur,
    canonicalTotals,
}: {
    rows: Row[];
    cur: string;
    /** period key → the server's own total for that period, when the view is unfiltered. */
    canonicalTotals: Map<string, number> | null;
}) {
    /*
     * The channel is context, so the component that renders the rows reads it directly rather than
     * having it threaded down as a prop. Null outside a command host, and the rows then offer none.
     */
    const channel = useFinancialCommandChannel();
    const commandRequest = channel ? channel.request : null;
    const groups = useMemo(() => {
        const byKey = new Map<string, Row[]>();
        for (const row of rows) {
            const key = String(row.periodKey ?? "");
            const found = byKey.get(key);
            if (found) found.push(row);
            else byKey.set(key, [row]);
        }
        /* Newest period first — an operator is nearly always working the current one. */
        return [...byKey.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    }, [rows]);

    return (
        <div className="alloy-os-billingdetail__ledgerband" data-financials-ledger="true">
            {groups.map(([key, groupRows]) => {
                const total = canonicalTotals?.get(key);
                return (
                    <FinancialsLedgerPeriod
                        key={key || "unplaced"}
                        label={periodLabel(key)}
                        /* Never "Closed" — a zero total is a balance of zero, not a closed
                           accounting period, which is a different and configured fact. */
                        summary={
                            total != null
                                ? `Balance ${moneyExact(total, cur)}`
                                : `${groupRows.length} ${groupRows.length === 1 ? "entry" : "entries"}`
                        }
                        open
                        rows={groupRows.map((row) => ({
                            ...ledgerRowFromWorkspaceRow(row, cur),
                            actions: workspaceRowActions(row, commandRequest),
                        }))}
                    />
                );
            })}
        </div>
    );
}

/**
 * One canonical account row → the shared ledger's row shape.
 *
 * Every value is read. The GL pair is joined for display exactly as the detail card joins it; the
 * correction lineage the read model already decided becomes the row's title rather than a column of
 * its own; and the outstanding note appears only when money has been applied to the charge.
 */
/**
 * ── THE SAME ACTIONS, RAISED THROUGH THE CARD THAT OWNS THEM ───────────────────────────────────
 *
 * Eligibility is the read model's answer via the shared `financialTransactionEligibility`, the icons
 * are the shared `RowAction`, and the command is raised on the channel the account card registered
 * against. Nothing here writes, previews, or decides what a charge may do — this file contains no
 * financial mutation at all, which is the point.
 */
function workspaceRowActions(
    row: Row,
    request: ((r: {
        kind: "adjust" | "reverse" | "post" | "resolveResponsibility" | "reallocateResponsibility";
        chargeId: string; label: string;
    }) => void) | null,
) {
    const chargeId = row.chargeId ? String(row.chargeId) : null;
    if (!request || !chargeId) return undefined;
    const label = String(row.description ?? row.categoryLabel ?? chargeId);
    const eligible = financialTransactionEligibility({
        chargeId,
        offersPost: Boolean(row.offersPost),
        offersReverse: Boolean(row.offersReverse),
    });
    /*
     * WHO OWES IT — the same shared rule the Focus Panel applies, read from the same row fields.
     * The workspace does not decide this and does not perform it: it asks on the channel, and the
     * account card raises the canonical command. A workspace-only resolve would be the second
     * writer this whole architecture exists to prevent.
     */
    const responsibility = financialResponsibilityEligibility({
        chargeId,
        /*
         * A reduction is not an obligation — its responsibility belongs to the charge it reduces.
         * The Focus Panel derives this the same way, from the same reduction fact, so neither host
         * can end up offering to divide a discount while the other refuses.
         */
        responsibilityApplies: !reductionOf(row),
        responsibleParty: row.responsiblePartyName ? String(row.responsiblePartyName) : null,
    });
    if (!eligible.post && !eligible.reverse && !eligible.adjust
        && !responsibility.resolve && !responsibility.reallocate) return undefined;
    return (
        <>
            {eligible.post ? (
                <RowAction
                    kind="post"
                    command="charge.post"
                    chargeId={chargeId}
                    title={`Post ${label} — it becomes owed`}
                    onClick={() => request({ kind: "post", chargeId, label })}
                />
            ) : null}
            {eligible.reverse ? (
                <RowAction
                    kind="reverse"
                    command="charge.reverse"
                    chargeId={chargeId}
                    title={`Reverse ${label} — unwind a charge that should never have stood`}
                    onClick={() => request({ kind: "reverse", chargeId, label })}
                />
            ) : null}
            {eligible.adjust ? (
                <RowAction
                    kind="adjust"
                    command="billing.adjust_account"
                    chargeId={chargeId}
                    title={`Adjust ${label} — it stands, and something reduces it`}
                    onClick={() => request({ kind: "adjust", chargeId, label })}
                />
            ) : null}
            {responsibility.resolve ? (
                <RowAction
                    kind="resolveResponsibility"
                    command="billing.resolve_responsibility"
                    chargeId={chargeId}
                    title={`Resolve who owes ${label} — divide it under the arrangement in force`}
                    onClick={() => request({ kind: "resolveResponsibility", chargeId, label })}
                />
            ) : null}
            {responsibility.reallocate ? (
                <RowAction
                    kind="reallocateResponsibility"
                    command="billing.reallocate_responsibility"
                    chargeId={chargeId}
                    title={`Reallocate ${label} — move what one party owes to another`}
                    onClick={() => request({ kind: "reallocateResponsibility", chargeId, label })}
                />
            ) : null}
        </>
    );
}

function ledgerRowFromWorkspaceRow(row: Row, cur: string): FinancialsLedgerRowView {
    const glCode = row.glCode ? String(row.glCode) : "";
    const glName = row.glAccountName ? String(row.glAccountName) : "";
    const corrected =
        row.correctsChargeId ? `${String(row.correctionKind ?? "correction")} of an earlier charge`
        : row.reversedByChargeId ? "Reversed by a correction"
        : null;
    return {
        key: String(row.chargeId),
        when: shortDate(row.date as string | null),
        /*
         * THE SAME MEANING THE FOCUS PANEL STATES. `reduction.conceptLabel` is the canonical answer
         * to what this row IS — Discount, Credit, Adjustment or Reversal — and the category is only
         * how the money posts. Two surfaces showing one account must not disagree about whether a
         * row is a discount, so both read the same projected field.
         */
        /* Same order as the Focus Panel, from the same shared rule: a reversal is a Reversal. */
        type: financialRowConceptLabel({
            correctionKind: row.correctionKind ? String(row.correctionKind) : null,
            reductionConceptLabel: reductionOf(row)?.conceptLabel ?? null,
            categoryLabel: String(row.categoryLabel ?? row.categoryKey ?? "—"),
        }),
        child: String(row.subjectName ?? "Household"),
        description: reductionPreviewOf(row) ?? String(row.description ?? "—"),
        glLabel: glCode ? (glName ? `${glCode} · ${glName}` : glCode) : null,
        amount: moneyExact(n(row.amountCents), cur),
        amountNote:
            n(row.outstandingCents) !== n(row.amountCents)
                ? `${moneyExact(n(row.outstandingCents), cur)} outstanding`
                : null,
        status: String(row.lifecycleStatus ?? row.status ?? "—"),
        responsibleParty: row.responsiblePartyName ? String(row.responsiblePartyName) : null,
        responsibilityUnassigned: Boolean(row.responsibilityUnassigned),
        /* Same projection, same two halves — neither host infers PARTIAL for itself. */
        responsibilityAssignedCents: Number(row.responsibilityAssignedCents ?? 0),
        responsibilityUnassignedCents: Number(row.responsibilityUnassignedCents ?? 0),
        /* History that no longer counts — a business state, never the amount's sign. */
        tone: row.lifecycleStatus === "reversed" ? "muted" : undefined,
        title: corrected ?? undefined,
    };
}

/** `2026-09` → `September 2026`, through the one authority. A row with no period is unplaced. */
function periodLabel(key: string): string {
    return billingPeriodLabel(key) || "Unplaced";
}

function PaymentsLens({
    payments,
    cur,
    capabilities,
}: {
    payments: Row[];
    cur: string;
    capabilities: Vm["paymentCapabilities"];
}) {
    /*
     * WHAT THIS ORGANISATION CAN ACTUALLY DO, said once, where money in is the subject.
     *
     * `unsupported` and `not_configured` are different answers and the operator can only act on the
     * second. Recording a cash or cheque payment never depends on a provider and is therefore never
     * reported here as missing.
     */
    const card = capabilities?.takePaymentCard;
    const notes: string[] = [];
    if (card && card.state !== "available" && card.reason) notes.push(`Card collection · ${card.reason}`);
    const ach = capabilities?.takePaymentAch;
    if (ach && ach.state !== "available" && ach.reason) notes.push(`Bank debit · ${ach.reason}`);

    return (
        <>
            {payments.length === 0 ? (
                <Empty>No payments received</Empty>
            ) : (
                <ul className="space-y-3">
                    {payments.map((p) => <PaymentCard key={String(p.paymentId)} p={p} cur={cur} />)}
                </ul>
            )}
            {notes.length ? (
                <ul className="mt-3 space-y-0.5 border-t border-alloy-stone/10 pt-2" data-financials-payment-capability="true">
                    {notes.map((note) => (
                        <li key={note} className="text-[11px] text-alloy-midnight/50">{note}</li>
                    ))}
                </ul>
            ) : null}
        </>
    );
}

/**
 * ONE PAYMENT, AS A BUSINESS OBJECT.
 *
 * The payment leads, its four distinct figures sit together, and the application history is
 * subordinate but never hidden — reversed rows stay inspectable and stay quiet.
 */
function PaymentCard({ p, cur }: { p: Row; cur: string }) {
    const apps = (p.applications ?? []) as Row[];
    const active = apps.filter((a) => String(a.status) === "active");
    const reversed = apps.filter((a) => String(a.status) !== "active");
    const isRefund = String(p.direction) === "outbound";

    return (
        <li className="rounded-lg border border-alloy-stone/15 bg-white/60 p-3" data-financials-payment={String(p.paymentId)}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <span className="text-sm font-semibold text-alloy-midnight">
                        {isRefund ? "Refunded" : "Received"} {moneyExact(n(p.amountCents), cur)}
                    </span>
                    <span className="ml-2 text-xs text-alloy-midnight/60">
                        {/* ACTUAL PAYER — never inferred from responsibility, and never changed by a move. */}
                        from <strong className="font-medium text-alloy-midnight" data-financials-payer={String(p.paymentId)}>
                            {String(p.payerLabel ?? "unnamed payer")}
                        </strong>
                        {p.method ? ` · ${String(p.method)}` : ""}
                        {p.receivedAt ? ` · ${shortDate(String(p.receivedAt))}` : ""}
                    </span>
                </div>
                {p.reference ? <span className="font-mono text-[11px] text-alloy-midnight/45">{String(p.reference)}</span> : null}
            </div>

            {!isRefund ? (
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <Money label="Applied" value={moneyExact(n(p.appliedCents), cur)} />
                    <Money label="Unapplied" value={moneyExact(n(p.unappliedCents), cur)} tone={n(p.unappliedCents) > 0 ? "due" : undefined} />
                    {n(p.refundedCents) > 0 ? <Money label="Refunded" value={moneyExact(n(p.refundedCents), cur)} /> : null}
                </div>
            ) : null}

            {active.length ? (
                <ul className="mt-2 space-y-0.5">
                    {active.map((a) => (
                        <li key={String(a.allocationId)} className="flex items-baseline justify-between gap-3 text-xs"
                            data-financials-application={String(a.allocationId)} data-application-status="active">
                            <span className="text-alloy-midnight/80">{String(a.chargeLabel)}</span>
                            <span className="tabular-nums text-alloy-midnight">{moneyExact(n(a.appliedCents), cur)}</span>
                        </li>
                    ))}
                </ul>
            ) : null}

            {reversed.length ? (
                /* History stays inspectable and stays quiet — collapsed, not removed. */
                <details className="mt-2" data-financials-reversed-applications={String(reversed.length)}>
                    <summary className="cursor-pointer text-[11px] text-alloy-midnight/50">
                        {reversed.length} reversed {reversed.length === 1 ? "application" : "applications"}
                    </summary>
                    <ul className="mt-1 space-y-0.5 border-l-2 border-alloy-stone/15 pl-2">
                        {reversed.map((a) => (
                            <li key={String(a.allocationId)} className="text-[11px] text-alloy-midnight/55"
                                data-financials-application={String(a.allocationId)} data-application-status="reversed">
                                {String(a.chargeLabel)} · {moneyExact(n(a.appliedCents), cur)}
                                {a.reversalReason ? ` · ${String(a.reversalReason)}` : ""}
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </li>
    );
}

// ── small presentational pieces ─────────────────────────────────────────────────────────────────

/**
 * A figure that is not known YET, inside the region that will hold it.
 *
 * Deliberately not a number and never a zero: a placeholder an operator could mistake for $0.00
 * would be worse than the loading message this replaced.
 */
const Skeleton = ({ w }: { w: string }) => (
    <span className="inline-block h-[1em] animate-pulse rounded bg-alloy-stone/25 align-middle"
        style={{ width: w }} data-financials-skeleton="true" aria-hidden="true" />
);

const Headline = ({ label, value, loading }: { label: string; value: string; loading: boolean }) => (
    <div><p className="text-[10px] uppercase tracking-wide text-alloy-midnight/45">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-alloy-midnight">
            {loading ? <Skeleton w="5rem" /> : value}
        </p></div>
);
const Figure = ({ label, value, loading, tone }: { label: string; value: string; loading: boolean; tone?: "due" }) => (
    <div><p className="text-[10px] uppercase tracking-wide text-alloy-midnight/45">{label}</p>
        <p className={`text-base tabular-nums ${tone === "due" ? "text-alloy-ember" : "text-alloy-midnight"}`}>
            {loading ? <Skeleton w="3.5rem" /> : value}
        </p></div>
);
const Money = ({ label, value, tone }: { label: string; value: string; tone?: "due" }) => (
    <span className={tone === "due" ? "text-alloy-ember" : "text-alloy-midnight/70"}>
        {label} <strong className="font-medium tabular-nums">{value}</strong>
    </span>
);

/** State as a chip. Colour carries meaning — attention, held, settled, quiet — and nothing else. */
const Chip = ({ children, tone, testId }: { children: React.ReactNode; tone: "due" | "hold" | "ok" | "quiet"; testId?: string }) => {
    const skin =
        tone === "due" ? "bg-alloy-ember/10 text-alloy-ember"
        : tone === "hold" ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
        : tone === "ok" ? "bg-alloy-midnight/[0.06] text-alloy-midnight/70"
        : "bg-alloy-stone/10 text-alloy-midnight/55";
    return (
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${skin}`} data-financials-chip={testId ?? tone}>
            {children}
        </span>
    );
};

/**
 * A CONTEXT FILTER, IN THE PLATFORM'S OWN DROPDOWN — not a raw browser select.
 *
 * This was a bare `<select>`: a grey OS control with black text sitting beside Bend Pine lenses and
 * Alloy buttons, and on macOS its open menu is painted by the operating system and ignores the
 * product's CSS entirely. `AlloySelect` is the house control — the one the Financials workspace's
 * own site filter already uses — and it owns the border, radius, chevron, hover, focus, open state
 * and the white-and-midnight menu. Adopting it is how these stop being the one place in Financials
 * that looks like an admin form.
 *
 * The count stays in the option label: it is the only reason to prefer one filter value over
 * another before opening it.
 */
const Filter = ({ testId, value, onChange, placeholder, options }: {
    testId: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    options: Array<{ value: string; label: string; count: number }>;
}) => (
    /*
     * SIZED BY A WRAPPER, not by a class on the control. `.alloy-select` sets `width: 100%`, so a
     * width utility on the same element is a specificity coin-toss against the primitive's own
     * stylesheet — and as a bare flex item it collapsed to its content and truncated its own
     * placeholder to "All perio…". The wrapper gives it a width to be 100% OF.
     */
    <span className="inline-block w-[10.5rem] shrink-0">
        <AlloySelect
            value={value}
            onChange={onChange}
            options={options.map((o) => ({ value: o.value, label: `${o.label} (${o.count})` }))}
            placeholder={placeholder}
            density="compact"
            aria-label={placeholder}
            testId={`financials-filter-${testId}`}
        />
    </span>
);

const LedgerSkeleton = () => (
    <div className="space-y-2 py-1" data-financials-ledger-skeleton="true">
        {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
                <Skeleton w="5rem" /><Skeleton w="4rem" /><Skeleton w="9rem" />
                <span className="ml-auto"><Skeleton w="4rem" /></span>
            </div>
        ))}
    </div>
);

const Sub = ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <p className={`mb-1 text-[11px] uppercase tracking-wide text-alloy-midnight/45 ${title ? "cursor-help decoration-dotted underline-offset-2 [text-decoration-line:underline]" : ""}`}
        title={title}>
        {children}
    </p>
);
const Empty = ({ children }: { children: React.ReactNode }) => (
    <p className="text-sm text-alloy-midnight/50">{children}</p>
);
const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th className={`px-2 py-1.5 font-medium ${right ? "text-right" : ""}`}>{children}</th>
);
const Td = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <td className={`px-2 py-1.5 align-top text-alloy-midnight/80 ${right ? "text-right" : ""}`}>{children}</td>
);
