"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { money, moneyExact, shortDate } from "@/app/adminV2/financials/financialsFormat";
import {
    ACCOUNT_LENSES,
    ACCOUNT_LENS_LABELS,
    NO_FILTER,
    filterLedger,
    filterPayments,
    hasChoice,
    lensCounts,
    payerOptions,
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
    const [subject, setSubject] = useState<string | null>(null);
    const [periodKey, setPeriodKey] = useState<string | null>(null);
    const [payer, setPayer] = useState<string | null>(null);

    /* The account still selected. Every response is checked against it before it is allowed to land. */
    const wantedRef = useRef(customerId);

    useEffect(() => {
        const wanted = customerId;
        wantedRef.current = wanted;
        /* The previous account's money must not sit under this one's name for even a frame. */
        setVm(null);
        setError(null);
        setLens("all");
        setSubject(null);
        setPeriodKey(null);
        setPayer(null);
        void (async () => {
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
        })();
    }, [customerId]);

    const rows = useMemo(() => (vm?.rows ?? []) as Row[], [vm]);
    const payments = useMemo(() => (vm?.payments ?? []) as Row[], [vm]);

    const subjects = useMemo(() => subjectOptions(rows as never), [rows]);
    const periods = useMemo(() => periodOptions(rows as never), [rows]);
    const payers = useMemo(() => payerOptions(payments as never), [payments]);
    const counts = useMemo(
        () => lensCounts(rows as never, payments as never, { subject, periodKey }),
        [rows, payments, subject, periodKey],
    );

    const ledger = useMemo(
        () =>
            filterLedger(rows as never, { ...NO_FILTER, lens, subject, periodKey })
                .slice()
                .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))),
        [rows, lens, subject, periodKey],
    );
    const visiblePayments = useMemo(
        () => filterPayments(payments as never, { payerLabel: payer }) as unknown as Row[],
        [payments, payer],
    );

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
        <div className="flex flex-col" data-financials-workspace-detail={customerId}
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
            <section className="border-t border-alloy-stone/15 pt-2" data-financials-lenses="true">
                <div className="flex flex-wrap items-center gap-1 px-1 pb-1.5">
                    {ACCOUNT_LENSES.map((key) => (
                        <button
                            key={key}
                            type="button"
                            data-financials-lens={key}
                            aria-pressed={lens === key}
                            onClick={() => setLens(key)}
                            disabled={loading}
                            className={`rounded-md px-2.5 py-1 text-[12px] transition disabled:opacity-40 ${
                                lens === key
                                    ? "bg-alloy-midnight text-white"
                                    : "text-alloy-midnight/70 hover:bg-alloy-stone/10"
                            }`}
                        >
                            {ACCOUNT_LENS_LABELS[key]}
                            {!loading ? (
                                <span className={`ml-1.5 tabular-nums ${lens === key ? "text-white/70" : "text-alloy-midnight/40"}`}>
                                    {counts[key]}
                                </span>
                            ) : null}
                        </button>
                    ))}

                    {/*
                     * A FILTER IS OFFERED ONLY WHEN IT DIVIDES SOMETHING. One child, one period or
                     * one payer would be a dropdown with a single choice, which reads as a
                     * capability this surface does not have. Every control shown here works.
                     */}
                    <span className="ml-auto flex flex-wrap items-center gap-1.5">
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

                <div className="py-1">
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
                        <LedgerTable rows={ledger as unknown as Row[]} cur={cur} />
                    )}
                </div>
            </section>

            {/* ── 4 · WHO OWES IT, AND WHO IS FUNDING IT ────────────────────────────────────────── */}
            <section className="border-t border-alloy-stone/15 pt-2.5" data-financials-arrangements="true">
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <Sub>Who owes it</Sub>
                        {loading ? (
                            <Skeleton w="12rem" />
                        ) : (vm?.responsibility?.parties ?? []).length === 0 ? (
                            <Empty>No responsibility assigned</Empty>
                        ) : (
                            <ul className="space-y-1">
                                {(vm?.responsibility?.parties ?? []).map((p) => (
                                    <li key={String(p.personId)} className="flex items-baseline justify-between gap-3 text-sm"
                                        data-financials-responsible-party={String(p.personId)}>
                                        <span className="text-alloy-midnight">{String(p.name)}</span>
                                        <span className="tabular-nums text-alloy-midnight">{moneyExact(n(p.assignedCents), cur)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div>
                        <Sub title="An expectation, not money received. It does not reduce what is owed.">
                            Expected funding
                        </Sub>
                        {loading ? (
                            <Skeleton w="12rem" />
                        ) : (vm?.expectedFunding ?? []).length === 0 ? (
                            <Empty>No expected funding</Empty>
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
                        {/*
                         * THE DISTINCTION STAYS; THE PARAGRAPH GOES.
                         *
                         * Misreading expected funding as money received is a real financial risk, so
                         * the warning is kept — but as a hint on the label rather than three lines of
                         * teaching on every account an operator opens for the rest of the product's
                         * life. Progressive disclosure, not permanent instruction.
                         */}
                    </div>
                </div>
                {!loading && (vm?.unavailable ?? []).length ? (
                    <p className="mt-2 text-[11px] text-alloy-midnight/45" data-financials-not-claimed="true">
                        Not claimed here: {(vm?.unavailable ?? []).map((u) => String(u.fact)).join(", ")}.
                    </p>
                ) : null}
            </section>
        </div>
    );
}

// ── LENS CONTENT ────────────────────────────────────────────────────────────────────────────────

function LedgerTable({ rows, cur }: { rows: Row[]; cur: string }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
                <thead>
                    <tr className="border-b border-alloy-stone/15 text-left text-[11px] uppercase tracking-wide text-alloy-midnight/45">
                        <Th>Date</Th><Th>Period</Th><Th>Type</Th><Th>Subject</Th><Th>Description</Th>
                        <Th>GL</Th><Th>Status</Th><Th right>Amount</Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={String(row.chargeId)} className="border-b border-alloy-stone/8"
                            data-financials-ledger-row={String(row.chargeId)}>
                            <Td>{shortDate(row.date as string | null)}</Td>
                            <Td>{String(row.periodKey ?? "—")}</Td>
                            {/* The catalog's word, never the key behind it. */}
                            <Td>{String(row.categoryLabel ?? row.categoryKey ?? "—")}</Td>
                            <Td>{String(row.subjectName ?? "Household")}</Td>
                            <Td>{String(row.description ?? "—")}</Td>
                            {/*
                             * GL CONTEXT AT TRANSACTION GRAIN. `gl_accounts` and
                             * `gl_account_mappings` are canonical and the reader already carries the
                             * resolved code and name. Code and name together, because a code alone
                             * is unreadable and a name alone is unsearchable.
                             */}
                            <Td>
                                {row.glCode ? (
                                    <span data-financials-gl={String(row.glCode)}>
                                        <span className="font-mono text-xs">{String(row.glCode)}</span>
                                        {row.glAccountName ? (
                                            <span className="block text-[11px] text-alloy-midnight/50">{String(row.glAccountName)}</span>
                                        ) : null}
                                    </span>
                                ) : <span className="text-alloy-midnight/35">—</span>}
                            </Td>
                            <Td>{String(row.lifecycleStatus ?? row.status ?? "—")}</Td>
                            <Td right>
                                <span className="tabular-nums">{moneyExact(n(row.amountCents), cur)}</span>
                                {n(row.outstandingCents) !== n(row.amountCents) ? (
                                    <span className="block text-[11px] text-alloy-midnight/50">
                                        {moneyExact(n(row.outstandingCents), cur)} outstanding
                                    </span>
                                ) : null}
                            </Td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
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

const Filter = ({ testId, value, onChange, placeholder, options }: {
    testId: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    options: Array<{ value: string; label: string; count: number }>;
}) => (
    <select
        value={value}
        aria-label={placeholder}
        data-financials-filter={testId}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-alloy-stone/25 bg-white px-2 py-1 text-[12px] text-alloy-midnight"
    >
        <option value="">{placeholder}</option>
        {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
        ))}
    </select>
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
