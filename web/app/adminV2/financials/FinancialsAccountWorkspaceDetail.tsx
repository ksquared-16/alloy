"use client";

import { useEffect, useMemo, useState } from "react";

import { money, moneyExact } from "@/app/adminV2/financials/financialsFormat";

/**
 * THE FINANCIAL ACCOUNT, AT WORKSPACE GRAIN.
 *
 * ── WHY THIS EXISTS BESIDE THE COMPACT CARD ────────────────────────────────────────────────────
 *
 * The Financials workspace used to render the Focus Panel's compact card as its account detail, and
 * that is a category error rather than a layout one. The compact card exists to give financial
 * CONTEXT while an operator is working some other subject — a child, a case — so it is summary-first
 * and deliberately small. The Financials workspace is already the dedicated financial context, so
 * putting the contextual card there answers a question nobody asked and leaves the canvas empty
 * around it.
 *
 * So: two presentation grains, one truth. Both read `buildFinancialsCardVM` through
 * `/api/admin/financials/card`. This file computes NO money. Every figure below is a field the
 * canonical reader already produced, and the only arithmetic here is choosing which of them to show.
 * A second calculation path is how two surfaces start disagreeing about one family.
 *
 * ── WHAT IS DELIBERATELY NOT HERE YET ─────────────────────────────────────────────────────────
 *
 * The financial COMMANDS still live on the card. Re-implementing Add charge, Add adjustment, Move
 * and Apply payment here would be a second action path — precisely what the surface decision
 * forbids — so the action region below composes the existing command-bearing card rather than
 * copying it. Wiring workspace-native commands is named as follow-up, not quietly skipped.
 */

type Row = Record<string, any>;
type Vm = {
    account?: Row; period?: Row; payers?: Row[]; rows?: Row[]; reductions?: Row[]; payments?: Row[];
    reconciliation?: Record<string, number>; collectible?: Record<string, number>;
    responsibility?: { parties?: Row[]; allocatedCents?: number; unassignedCents?: number };
    expectedFunding?: Row[]; subjects?: Row[]; pastDue?: Row; achAvailable?: boolean;
    unavailable?: Row[]; unavailableReason?: string | null;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export default function FinancialsAccountWorkspaceDetail({
    customerId,
    currencyCode = "USD",
}: {
    customerId: string;
    currencyCode?: string;
}) {
    const [vm, setVm] = useState<Vm | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        setVm(null); setError(null);
        void (async () => {
            try {
                const res = await fetch(`/api/admin/financials/card?customer_id=${customerId}`, { cache: "no-store" });
                const json = (await res.json()) as { vm?: Vm; error?: string };
                if (!live) return;
                /*
                 * A FAILED READ IS NOT A ZERO BALANCE. The surface says it could not look rather
                 * than rendering an account that owes nothing — the two are different answers and
                 * only one of them is safe to act on.
                 */
                if (!res.ok || !json.vm) { setError(json.error ?? `The account could not be read (${res.status}).`); return; }
                setVm(json.vm);
            } catch (e) {
                if (live) setError(e instanceof Error ? e.message : "The account could not be read.");
            }
        })();
        return () => { live = false; };
    }, [customerId]);

    const ledger = useMemo(() => (vm?.rows ?? []).slice().sort(
        (a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")),
    ), [vm]);

    if (error) return <p className="px-4 py-6 text-sm text-alloy-ember" data-financials-detail-error="true">{error}</p>;
    if (!vm) return <p className="px-4 py-6 text-sm text-alloy-midnight/50">Reading the account…</p>;

    const r = vm.reconciliation ?? {};
    const c = vm.collectible ?? {};
    const cur = String((vm.rows ?? [])[0]?.currencyCode ?? currencyCode);
    const pastDueCents = n(vm.pastDue?.amountCents);

    return (
        <div className="flex flex-col gap-4 pb-6" data-financials-workspace-detail={customerId}>
            {/* ── 1 · ACCOUNT FINANCIAL STATE ──────────────────────────────────────────────────── */}
            <Band>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <Headline label="Outstanding" value={moneyExact(n(r.balanceCents), cur)} />
                    <Figure label="Collectible now" value={moneyExact(n(c.currentlyCollectibleCents), cur)} />
                    <Figure label="Gross charged" value={money(n(r.grossCents), cur)} />
                    <Figure label="Payments received" value={money(n(r.paymentsCents), cur)} />
                    {pastDueCents > 0 ? <Figure label="Past due" value={money(pastDueCents, cur)} tone="due" /> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-alloy-stone/10 pt-2 text-xs text-alloy-midnight/60">
                    {/*
                     * PERIOD, SAID IN THE PRODUCT'S OWN TWO VOCABULARIES.
                     *
                     * The billing period is derived from `billable_on` and is the customer-facing
                     * monthly grouping. The accounting period is separately configured and is where
                     * the money REPORTS. They are allowed to disagree — that is the whole reason a
                     * 4/4/5 calendar exists — so the surface never implies one is the other.
                     */}
                    <span data-financials-billing-period={String(vm.period?.key ?? "")}>
                        Billing period · <strong className="font-medium text-alloy-midnight">{String(vm.period?.label ?? "—")}</strong>
                    </span>
                    <span>Children billed · {(vm.subjects ?? []).map((s) => String(s.displayName)).join(", ") || "none"}</span>
                </div>
                {(vm.unavailable ?? []).length ? (
                    <p className="mt-2 text-[11px] text-alloy-midnight/45" data-financials-not-claimed="true">
                        Not claimed here: {(vm.unavailable ?? []).map((u) => String(u.fact)).join(", ")}.
                    </p>
                ) : null}
            </Band>

            {/* ── 2 · RESPONSIBILITY & FUNDING ─────────────────────────────────────────────────── */}
            <Band title="Responsibility and funding">
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <Sub>Who owes it</Sub>
                        {(vm.responsibility?.parties ?? []).length === 0 ? (
                            <Empty>No responsibility has been arranged for this account.</Empty>
                        ) : (
                            <ul className="space-y-1">
                                {(vm.responsibility?.parties ?? []).map((p) => (
                                    <li key={String(p.personId)} className="flex items-baseline justify-between gap-3 text-sm"
                                        data-financials-responsible-party={String(p.personId)}>
                                        <span className="text-alloy-midnight">{String(p.name)}</span>
                                        <span className="tabular-nums text-alloy-midnight">{moneyExact(n(p.assignedCents), cur)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {n(vm.responsibility?.unassignedCents) > 0 ? (
                            <p className="mt-1 text-xs text-alloy-ember" data-financials-unassigned="true">
                                {moneyExact(n(vm.responsibility?.unassignedCents), cur)} not assigned to anyone
                            </p>
                        ) : null}
                    </div>
                    <div>
                        <Sub>Expected funding</Sub>
                        {(vm.expectedFunding ?? []).length === 0 ? (
                            <Empty>Nothing is expected from a third party.</Empty>
                        ) : (
                            <ul className="space-y-1">
                                {(vm.expectedFunding ?? []).map((f, i) => (
                                    <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                                        <span className="text-alloy-midnight">{String(f.label)}</span>
                                        <span className="tabular-nums text-alloy-midnight">{moneyExact(n(f.expectedCents), cur)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {/* The line the whole distinction exists for. */}
                        <p className="mt-1 text-[11px] text-alloy-midnight/50">
                            Expected funding is an expectation, not money received. It does not reduce what is owed.
                        </p>
                    </div>
                </div>
            </Band>

            {/* ── 3 · PAYMENTS ─────────────────────────────────────────────────────────────────── */}
            <Band title="Payments">
                {(vm.payments ?? []).length === 0 ? (
                    <Empty>No money has been received on this account.</Empty>
                ) : (
                    <ul className="space-y-3">
                        {(vm.payments ?? []).map((p) => <PaymentCard key={String(p.paymentId)} p={p} cur={cur} />)}
                    </ul>
                )}
            </Band>

            {/* ── 4 · LEDGER ───────────────────────────────────────────────────────────────────── */}
            <Band title="Financial activity">
                {ledger.length === 0 ? (
                    <Empty>Nothing has been charged on this account yet.</Empty>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[46rem] border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-alloy-stone/15 text-left text-[11px] uppercase tracking-wide text-alloy-midnight/45">
                                    <Th>Date</Th><Th>Period</Th><Th>Type</Th><Th>Subject</Th><Th>Description</Th>
                                    <Th>GL</Th><Th>Status</Th><Th right>Amount</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {ledger.map((row) => (
                                    <tr key={String(row.chargeId)} className="border-b border-alloy-stone/8"
                                        data-financials-ledger-row={String(row.chargeId)}>
                                        <Td>{String(row.date ?? "—")}</Td>
                                        <Td>{String(row.periodKey ?? "—")}</Td>
                                        {/* The catalog's word, never the key behind it. */}
                                        <Td>{String(row.categoryLabel ?? row.categoryKey ?? "—")}</Td>
                                        <Td>{String(row.subjectName ?? "—")}</Td>
                                        <Td>{String(row.description ?? "—")}</Td>
                                        {/*
                                         * GL CONTEXT AT TRANSACTION GRAIN.
                                         *
                                         * `gl_accounts` and `gl_account_mappings` are canonical and the
                                         * reader already carries the resolved code and name; the detail
                                         * simply never showed them. Code and name together, because a
                                         * code alone is unreadable and a name alone is unsearchable.
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
                                        <Td>{String(row.status ?? "—")}</Td>
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
                )}
            </Band>
        </div>
    );
}

/**
 * ONE PAYMENT, AS A BUSINESS OBJECT.
 *
 * The old presentation listed allocations as flat rows and read like debug output: an operator could
 * not tell at a glance who paid, how much of it had been placed, or which applications were live.
 * So the payment leads, its four distinct figures sit together, and the application history is
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
                        {p.receivedAt ? ` · ${String(p.receivedAt).slice(0, 10)}` : ""}
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
const Band = ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <section className="rounded-xl border border-alloy-stone/15 bg-white/60 px-4 py-3">
        {title ? <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">{title}</p> : null}
        {children}
    </section>
);
const Headline = ({ label, value }: { label: string; value: string }) => (
    <div><p className="text-[11px] uppercase tracking-wide text-alloy-midnight/45">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-alloy-midnight">{value}</p></div>
);
const Figure = ({ label, value, tone }: { label: string; value: string; tone?: "due" }) => (
    <div><p className="text-[11px] uppercase tracking-wide text-alloy-midnight/45">{label}</p>
        <p className={`text-base tabular-nums ${tone === "due" ? "text-alloy-ember" : "text-alloy-midnight"}`}>{value}</p></div>
);
const Money = ({ label, value, tone }: { label: string; value: string; tone?: "due" }) => (
    <span className={tone === "due" ? "text-alloy-ember" : "text-alloy-midnight/70"}>
        {label} <strong className="font-medium tabular-nums">{value}</strong>
    </span>
);
const Sub = ({ children }: { children: React.ReactNode }) => (
    <p className="mb-1 text-[11px] uppercase tracking-wide text-alloy-midnight/45">{children}</p>
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
