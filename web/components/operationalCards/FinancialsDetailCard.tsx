"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import { Action, ActionRow, FooterAction, SectionHead } from "@/components/cardLab/CardLabKit";
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";
import {
    ACCOUNT_LENSES,
    ACCOUNT_LENS_LABELS,
    type AccountLens,
} from "@/lib/financials/workspace/accountLenses";
import type { FinancialsEvidence, FinancialsLedgerPeriod } from "@/lib/cardLab/cardLabTypes";

/**
 * Billing detail — what "Billing details →" opens.
 *
 * NOT a separate Billing product or runtime. It is the SAME card at `density="expanded"`, the
 * centered Focus Card with a depth scrim that Household, Children and the real assignment Tuition card
 * already use (System 5B Expand). The summary card and this surface are one card at two
 * densities, which is the platform's own density system — Micro, Compact, Standard, Expanded.
 *
 * Sections, in the order an operator asks for them:
 *   A  Current period   the full reconciliation, arithmetic visible
 *   B  Past due         obligations, aging, failed attempts, recovery
 *   C  Payment setup    payers, split, methods, autopay, funding
 *   D  Ledger           the real ledger, with filters — this is where it belongs
 *   E  Upcoming         only where authoritative; unowned facts are marked, not invented
 *   F  Actions          the operational command row
 *
 * No running balance column: `ledger_transactions` has no authoritative running balance, and
 * computing one in the card would invent an ordering the backend does not guarantee.
 */
export default function FinancialsDetailCard({
    evidence,
    periods,
    onPayment,
    onAddCharge,
    onManagePayment,
    onMovePayment,
    onAddAdjustment,
    onReverseAdjustment,
    onPostCharge,
    onReverseCharge,
    onApplyPayment,
}: {
    evidence: FinancialsEvidence;
    periods: FinancialsLedgerPeriod[];
    /**
     * TWO INDEPENDENT DIMENSIONS, deliberately not collapsed:
     *   subject — who or what the item is FOR   (Household · Avery · Riley)
     *   payer   — who is responsible for PAYING (Jordan · Taylor · Funding)
     * A charge for Avery may be paid by Jordan; a household charge has no child subject at all.
     * Both are FILTERS over canonical truth, never separate ledgers, and they compose.
     */
    /**
     * The detail's commands, when a host supplies them. `Payment` is one entry into the settle-what-
     * is-owed operation rather than a permanent row of competing payment buttons; `Add charge`
     * changes what is owed and stays its peer. Absent in the lab, where the controls are inert.
     */
    onPayment?: () => void;
    onAddCharge?: () => void;
    onManagePayment?: () => void;
    /** Correct WHICH obligation a receipt answered. Absent in the lab, where controls are inert. */
    onMovePayment?: (args: { paymentId: string; allocationId: string }) => void;
    onAddAdjustment?: () => void;
    onReverseAdjustment?: (args: { applicationId: string }) => void;
    /** A draft the operator may post. The row says whether it qualifies; this decides nothing. */
    onPostCharge?: (args: { chargeId: string; label: string }) => void;
    /** A posted charge the operator may correct. Eligibility is the read model's answer. */
    onReverseCharge?: (args: { chargeId: string; label: string }) => void;
    /** Put already-received money against an obligation. */
    onApplyPayment?: (args: { paymentId: string }) => void;
}) {
    const { period, pastDue } = evidence;

    /*
     * ── THE SAME FIVE LENSES THE WORKSPACE HAS ─────────────────────────────────────────────────
     *
     * This surface had no filtering at all: it rendered every ledger row, then a Payments section
     * beneath the ledger, then Adjustments beneath that, and an operator looking for what an agency
     * had funded read all three. The workspace account already answers that question with lenses,
     * and two Financials details with two different ways of narrowing is the divergence this pass
     * exists to end — so the lens list, the labels and the classifier are the SAME module, not a
     * second copy of the idea.
     *
     * Payments is a LENS here, which is what removes the separate Payments section: money in is one
     * angle on the account's activity, not a second report underneath it. Every action that section
     * carried — Move payment, Apply payment — moved with it and none was stranded.
     */
    const [lens, setLens] = useState<AccountLens>("all");
    const [subject, setSubject] = useState<string | null>(null);
    const [periodLabel, setPeriodLabel] = useState<string | null>(null);
    const [payer, setPayer] = useState<string | null>(null);

    const allEntries = useMemo(() => periods.flatMap((p) => p.entries), [periods]);

    /* Counts of ROWS, never sums of cents — the same rule `accountLenses` keeps. */
    const counts = useMemo(() => {
        const scoped = allEntries.filter(
            (e) =>
                (!subject || e.subject === subject)
                && (!periodLabel || periods.some((p) => p.label === periodLabel && p.entries.includes(e))),
        );
        const out: Record<AccountLens, number> = {
            all: scoped.length,
            charges: 0,
            credits: 0,
            funding: 0,
            payments: evidence.payments.length,
        };
        for (const e of scoped) out[e.lens] += 1;
        return out;
    }, [allEntries, periods, subject, periodLabel, evidence.payments.length]);

    /*
     * A FILTER IS OFFERED ONLY WHEN IT DIVIDES SOMETHING. One subject, one period or one payer is a
     * control with a single choice, which reads as a capability this surface does not have.
     */
    const subjectChoices = useMemo(
        () => [...new Set(allEntries.map((e) => e.subject))].sort((a, b) => a.localeCompare(b)),
        [allEntries],
    );
    const periodChoices = useMemo(() => periods.map((p) => p.label), [periods]);
    const payerChoices = useMemo(
        () =>
            [...new Set(evidence.payments.map((p) => p.payerLabel ?? "").filter(Boolean))].sort((a, b) =>
                a.localeCompare(b),
            ),
        [evidence.payments],
    );

    /* The periods the ledger actually renders. A period the filter empties is not drawn at all. */
    const visiblePeriods = useMemo(() => {
        if (lens === "payments") return [];
        return periods
            .filter((p) => !periodLabel || p.label === periodLabel)
            .map((p) => ({
                ...p,
                entries: p.entries.filter(
                    (e) => (lens === "all" || e.lens === lens) && (!subject || e.subject === subject),
                ),
            }))
            .filter((p) => p.entries.length > 0);
    }, [periods, lens, subject, periodLabel]);

    const visiblePayments = useMemo(
        () => (payer ? evidence.payments.filter((p) => (p.payerLabel ?? "") === payer) : evidence.payments),
        [evidence.payments, payer],
    );

    /* Adjustments ARE "credits & adjustments" — they belong to that lens, and to the whole view. */
    const showAdjustments = lens === "all" || lens === "credits";

    return (
        <div className="alloy-os-billing alloy-os-billing--detail" data-financials-detail="true">
            <UniversalCard
                title="Financials"
                insight={`${period.currentBalance} balance`}
                supportingInsight={`${period.label} · ${evidence.historyLine}`}
                iconName="Receipt"
                tier="context"
                archetype="status"
                statusChip={pastDue ? `${pastDue.amount} past due` : undefined}
                statusTone="due"
                modalClass="workstation"
                density="expanded"
                gridSpan="row"
                data-universal-card-key="financials_detail"
            >
                {/* Condensed overview — the detail must not re-render the summary card. */}
                {/*
                    ONE SHALLOW COMMAND BAR — the rollup and its commands on the same row.
                    It used to read summary -> action strip -> filters, three stacked bands before
                    any ledger, which is how a workstation detail ends up spending its height on a
                    header. The facts sit left, the two commands sit top-right of the same region,
                    and the ledger starts immediately under it.
                */}
                <div className="alloy-os-fdetail__rollup">
                    <div className="alloy-os-fdetail__rollup-facts">
                    <div className="alloy-os-fdetail__strip">
                    <Stat label="Balance" value={period.currentBalance} strong />
                    <Stat label="Past due" value={pastDue ? pastDue.amount : "None"} tone={pastDue ? "due" : "ok"} />
                    <Stat label="Responsibility" value={period.familyResponsibility} />
                    <Stat label="Paid" value={period.paymentsReceived.replace("−", "")} />
                    {/*
                     * "None" claimed an absence nothing could support. Payment setup has no producer
                     * yet, so the honest value is that it has not been recorded — and it is not
                     * toned as a problem, because an unknown is not a fault.
                     */}
                    {/*
                      * AUTOPAY IS NOT SUPPORTED YET — no table, no column, no writer anywhere in the
                      * platform. "Not recorded" implied somebody could have recorded it and had not,
                      * which is a statement about this family; the truth is about Alloy.
                      */}
                    <Stat label="Autopay" value={evidence.payment.autopayLabel ?? "Not available yet"} tone={evidence.payment.autopayHealthy ? "ok" : undefined} />
                    <Stat label="Next" value={evidence.payment.nextChargeLabel ?? "—"} />
                </div>

                {evidence.payers.length ? (
                    <div className="alloy-os-fdetail__payers">
                        {evidence.payers.map((p) => (
                            <span key={p.name} className="alloy-os-fdetail__payer" data-funding={p.funding ? "true" : undefined}>
                                <span className="alloy-os-billing__payer-name">{p.name}</span>
                                <span className="alloy-os-billing__payer-share">{p.share}</span>
                                <span className="alloy-os-billing__payer-method">{p.method}</span>
                                {p.methodIssue ? (
                                    <span className="alloy-os-billing__method-issue">· {p.methodIssue}</span>
                                ) : null}
                            </span>
                        ))}
                    </div>
                ) : null}

                {/*
                    TWO PEER ACTIONS, NOT THREE COMPETING BUTTONS.
                    Pay now and Record payment are both ways INTO the same operation — settling what
                    is owed — and giving each permanent equal real estate above the ledger spent a
                    third of the header on a choice the operator has not made yet. `Payment` enters
                    that operation and offers whichever variants are actually supported.
                    `Add charge` stays a peer because it changes what is OWED rather than settling
                    it, which is a different verb with a different consequence.
                */}
                    </div>
                    <div className="alloy-os-fdetail__actions">
                        <Action primary onClick={onPayment}>
                            Payment
                        </Action>
                        <Action onClick={onAddCharge}>Add charge</Action>
                    </div>
                </div>

                {/*
                    THE LENSES, between the rollup and the record.
                    Selected reads in Bend Pine — the product's active operational control — from
                    the token, never a hardcoded green and never the neutral navy that made a live
                    selection look like an inert chip.
                */}
                <div className="alloy-os-fdetail__lensbar" data-financials-lenses="true">
                    {ACCOUNT_LENSES.map((key) => (
                        <button
                            key={key}
                            type="button"
                            className={clsx(
                                "alloy-os-fdetail__lens",
                                lens === key && "alloy-os-fdetail__lens--on",
                            )}
                            data-financials-lens={key}
                            aria-pressed={lens === key}
                            onClick={() => setLens(key)}
                        >
                            {ACCOUNT_LENS_LABELS[key]}
                            <span className="alloy-os-fdetail__lenscount">{counts[key]}</span>
                        </button>
                    ))}
                    <span className="alloy-os-fdetail__lensfilters">
                        {lens !== "payments" && subjectChoices.length > 1 ? (
                            <LensFilter
                                testId="subject"
                                value={subject ?? ""}
                                onChange={(v) => setSubject(v || null)}
                                placeholder="Everyone"
                                options={subjectChoices}
                            />
                        ) : null}
                        {lens !== "payments" && periodChoices.length > 1 ? (
                            <LensFilter
                                testId="period"
                                value={periodLabel ?? ""}
                                onChange={(v) => setPeriodLabel(v || null)}
                                placeholder="All periods"
                                options={periodChoices}
                            />
                        ) : null}
                        {lens === "payments" && payerChoices.length > 1 ? (
                            <LensFilter
                                testId="payer"
                                value={payer ?? ""}
                                onChange={(v) => setPayer(v || null)}
                                placeholder="Any payer"
                                options={payerChoices}
                            />
                        ) : null}
                    </span>
                </div>

                {/*
                  * ── THE SAME SCROLL OWNER, AT THE PANEL'S SMALLER HEIGHT ─────────────────────
                  *
                  * The rollup and the lens bar above are the controls; everything below is the
                  * record. The record scrolls, the controls do not, and there is exactly ONE
                  * scroller — the Focus Panel already bounds this card's height, and a second
                  * scrollbar inside a bounded modal is two ways to move one surface.
                  */}
                <div className="alloy-os-fdetail__scroll" data-financials-detail-scroll="true">

                {/* The ledger owns the detail. */}
                {lens !== "payments" ? (
                <div className="alloy-os-billingdetail__ledgerband">
                    <SectionHead ruled={false}>Ledger</SectionHead>
                    {/*
                      * THE DECORATIVE FILTERS ARE GONE.
                      *
                      * Three groups rendered here — ledger kind, subject and payer — as plain
                      * buttons with NO click handler and no caller supplying one. They highlighted
                      * a default and did nothing else, which is the same defect as a dead command
                      * and is worse on a financial surface: an operator who believes they have
                      * filtered a ledger will read the wrong cohort and act on it. The card above
                      * already carries a working subject filter, so nothing usable was lost.
                      * Filtering belongs here, but it belongs here WIRED.
                      */}

                    {visiblePeriods.length === 0 ? (
                        <p className="alloy-os-fdetail__collapsed" data-financials-ledger-empty="true">
                            {lens === "all"
                                ? "Nothing charged yet"
                                : `No ${ACCOUNT_LENS_LABELS[lens].toLowerCase()} in this view.`}
                        </p>
                    ) : null}
                    {visiblePeriods.map((per) => (
                        <section key={per.label} className="alloy-os-fdetail__period">
                            <p className="alloy-os-fdetail__periodhead">
                                <span className="alloy-os-fdetail__periodname">{per.label}</span>
                                <span className="alloy-os-fdetail__periodsum">{per.summary}</span>
                            </p>
                            {per.open ? (
                                <div className="alloy-os-billingdetail__ledger" role="table">
                                    {/*
                                      * ── THREE FINANCIAL IDENTITIES, AND THEY ARE NOT ONE ──────
                                      *
                                      * "Subject" was a word from the data model standing in for a
                                      * business fact the system already knows. An operator reading a
                                      * ledger asks three different questions — which CHILD is this
                                      * for, who OWES it, and for a payment, who PAID — and one
                                      * generic column answered none of them.
                                      *
                                      * Child and Responsible party are the charge-side pair and are
                                      * both charge-grain in the model. Payer belongs to money IN and
                                      * lives in the Payments lens, where a receipt names the person
                                      * who supplied it; a payer column here would be empty on every
                                      * charge row.
                                      */}
                                    <div className="alloy-os-billingdetail__row alloy-os-billingdetail__row--head">
                                        <span>Date</span>
                                        <span>Type</span>
                                        <span>Child</span>
                                        <span>Description</span>
                                        <span>GL account</span>
                                        <span>Amount</span>
                                        <span>Status</span>
                                        <span>Responsible party</span>
                                    </div>
                                    {per.entries.map((e, i) => (
                                        <div key={`${e.when}-${i}`} className="alloy-os-billingdetail__row">
                                            <span className="alloy-os-billingdetail__when">{e.when}</span>
                                            {/* The catalog owns the label — the card never renders a raw key. */}
                                            <span className="alloy-os-billingdetail__type">
                                                {chargeCategoryLabel(e.type)}
                                            </span>
                                            <span className="alloy-os-billingdetail__subject">{e.subject}</span>
                                            <span className="alloy-os-billingdetail__desc">{e.label}</span>
                                            {/*
                                              * UNMAPPED IS A STATE, NOT A DASH. An em-dash reads as
                                              * "nothing to say here"; a charge with no GL account is
                                              * a configuration fact somebody has to act on, so it is
                                              * toned as one and never as a successful mapping.
                                              */}
                                            <span
                                                className="alloy-os-billingdetail__gl"
                                                data-financials-gl-state={e.glCode ? "mapped" : "unmapped"}
                                            >
                                                {e.glCode ?? "Unmapped"}
                                            </span>
                                            <span
                                                className={clsx(
                                                    "alloy-os-billingdetail__amount",
                                                    e.kind === "credit" && "alloy-os-billing__entry-amount--credit",
                                                )}
                                            >
                                                {e.amount}
                                            </span>
                                            <span className="alloy-os-billingdetail__status">{e.status ?? "—"}</span>
                                            <span className="alloy-os-billingdetail__source" data-financials-responsible="true">
                                                {e.responsibleParty
                                                    ?? (e.responsibilityUnassigned ? "Unassigned" : "—")}
                                                {/*
                                                  * THE TRANSITIONS THIS ROW ALREADY QUALIFIES FOR.
                                                  *
                                                  * Both are registered actions and both were already
                                                  * decided by the read model — the card asks, it does
                                                  * not work out the answer from a status string. They
                                                  * are rendered here because this is the ledger the
                                                  * operator actually reaches: the other copy of these
                                                  * controls sits behind a condition that cannot be
                                                  * true, so `charge.reverse` had no way in at all.
                                                  */}
                                                {e.chargeId && e.offersPost && onPostCharge ? (
                                                    <button
                                                        type="button"
                                                        className="alloy-os-fdetail__rowaction"
                                                        data-charge-command="charge.post"
                                                        data-charge-id={e.chargeId}
                                                        onClick={() => onPostCharge({ chargeId: e.chargeId!, label: e.label })}
                                                    >
                                                        Post
                                                    </button>
                                                ) : null}
                                                {e.chargeId && e.offersReverse && onReverseCharge ? (
                                                    <button
                                                        type="button"
                                                        className="alloy-os-fdetail__rowaction"
                                                        data-charge-command="charge.reverse"
                                                        data-charge-id={e.chargeId}
                                                        onClick={() => onReverseCharge({ chargeId: e.chargeId!, label: e.label })}
                                                    >
                                                        Reverse
                                                    </button>
                                                ) : null}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="alloy-os-fdetail__collapsed">Collapsed · select to expand</p>
                            )}
                        </section>
                    ))}
                    {/*
                      * The running-balance invariant holds and is not printed at the operator. It is
                      * engineering doctrine — see the note on the workspace ledger, the doctrine
                      * document, and the test that fails if a running-balance column appears.
                      */}
                </div>
                ) : null}

                {/*
                  * THE RECEIPTS, AND WHAT EACH IS ANSWERING.
                  *
                  * Every figure is already formatted by the adapter from the account VM's canonical
                  * numbers. Nothing here adds, differences or decides what "applied" means — the card
                  * would otherwise become a second opinion about money, which is the one thing a
                  * presentation layer must never be.
                  */}
                {lens === "payments" ? (
                    <div className="alloy-os-fdetail__payments">
                        {/*
                          * NO SECTION HEAD. This is no longer a second report beneath the ledger —
                          * it is the Payments LENS, and the pressed lens above already names it.
                          * A heading here would restate the control the operator just used.
                          */}
                        {visiblePayments.length === 0 ? (
                            <p className="alloy-os-fdetail__collapsed" data-financials-payments-empty="true">
                                No money has been received.
                            </p>
                        ) : null}
                        {visiblePayments.map((p) => (
                            <div key={p.paymentId} className="alloy-os-fdetail__payment" data-payment-id={p.paymentId}>
                                <div className="alloy-os-fdetail__strip">
                                    <Stat label="Received" value={p.receivedLabel} strong />
                                    {/* Never a guessed name: an absent payer reads as unnamed. */}
                                    <Stat label="From" value={p.payerLabel ?? "—"} />
                                    <Stat label="Method" value={p.method ?? "—"} />
                                    <Stat label="Applied" value={p.appliedLabel} />
                                    <Stat label="Unapplied" value={p.unappliedLabel} tone={p.unappliedCents > 0 ? "due" : "ok"} />
                                </div>
                                {p.applications.map((a) => (
                                    <div
                                        key={a.allocationId}
                                        className="alloy-os-fdetail__application"
                                        data-application-id={a.allocationId}
                                        data-application-status={a.status}
                                    >
                                        <span className="alloy-os-billing__line-label">{a.chargeLabel}</span>
                                        <span className="alloy-os-billing__line-value">{a.amountLabel}</span>
                                        <span className="alloy-os-fdetail__appstatus">
                                            {a.status === "active" ? "Active" : "Reversed"}
                                        </span>
                                        {a.reversalReason ? (
                                            <span className="alloy-os-fdetail__appreason">Reason: {a.reversalReason}</span>
                                        ) : null}
                                        {/*
                                          * Only an ACTIVE application can be moved. A reversed row is
                                          * history; offering to correct it again would imply the money
                                          * is still there, and there is nothing to release.
                                          */}
                                        {a.status === "active" && onMovePayment ? (
                                            <FooterAction
                                                onClick={() =>
                                                    onMovePayment({ paymentId: p.paymentId, allocationId: a.allocationId })
                                                }
                                            >
                                                Move payment →
                                            </FooterAction>
                                        ) : null}
                                    </div>
                                ))}
                                {/*
                                  * Unapplied money is received money that is not answering anything —
                                  * not a credit, not a refund. Whether it arrived that way or came back
                                  * from a reversal, the operator's next move is the same.
                                  */}
                                {p.unappliedCents > 0 && onApplyPayment ? (
                                    <div className="alloy-os-fdetail__unapplied">
                                        <span className="alloy-os-billing__line-label">
                                            {p.unappliedLabel} unapplied
                                        </span>
                                        <FooterAction onClick={() => onApplyPayment({ paymentId: p.paymentId })}>
                                            Apply payment →
                                        </FooterAction>
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}

                {/*
                  * WHAT SOMEBODY DECIDED BY HAND.
                  *
                  * The reconciliation already says what these came to. A total cannot be reversed and
                  * cannot be explained, so the decisions themselves are listed: what it was, which way
                  * it went, why, and whether it still stands. Only a reduction that has not already
                  * been reversed offers a reversal — reversing twice would credit the family twice for
                  * one decision, and the service refuses it anyway.
                  */}
                {showAdjustments && (evidence.adjustments.length || onAddAdjustment) ? (
                    <div className="alloy-os-fdetail__adjustments">
                        <SectionHead>Adjustments</SectionHead>
                        {evidence.adjustments.map((a) => (
                            <div
                                key={a.applicationId}
                                className="alloy-os-fdetail__adjustment"
                                data-adjustment-id={a.applicationId}
                                data-adjustment-reversed={a.reversed ? "true" : "false"}
                                data-adjustment-is-reversal={a.isReversal ? "true" : "false"}
                            >
                                <span className="alloy-os-billing__line-label">
                                    {a.categoryLabel}
                                    {a.subjectName ? ` · ${a.subjectName}` : ""}
                                </span>
                                <span className="alloy-os-billing__line-value">{a.amountLabel}</span>
                                <span className="alloy-os-fdetail__adjmeta" data-adjustment-applied={a.applied ? "true" : "false"}>
                                    {/*
                                      * A manual reduction is written as a DRAFT charge, and a draft
                                      * is not owed. Saying only "lowers what is owed" would tell the
                                      * operator the money had already moved when it has not.
                                      */}
                                    {a.applied
                                        ? a.reducesObligation ? "Lowers what is owed" : "Raises what is owed"
                                        : a.reducesObligation
                                            ? "Recorded — lowers what is owed once posted"
                                            : "Recorded — raises what is owed once posted"}
                                    {a.recordedOn ? ` · ${a.recordedOn}` : ""}
                                </span>
                                {a.reason ? (
                                    <span className="alloy-os-fdetail__adjreason">Reason: {a.reason}</span>
                                ) : null}
                                {a.reversed ? (
                                    <span className="alloy-os-fdetail__adjstatus">Reversed</span>
                                ) : a.isReversal ? (
                                    <span className="alloy-os-fdetail__adjstatus">Reversal</span>
                                ) : onReverseAdjustment ? (
                                    <FooterAction
                                        onClick={() => onReverseAdjustment({ applicationId: a.applicationId })}
                                    >
                                        Reverse adjustment →
                                    </FooterAction>
                                ) : null}
                            </div>
                        ))}
                        {onAddAdjustment ? (
                            <div className="alloy-os-fdetail__adjustadd">
                                <FooterAction onClick={() => onAddAdjustment()}>Add adjustment →</FooterAction>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {lens === "all" ? (
                <div className="alloy-os-fdetail__upcoming">
                    <SectionHead>Upcoming</SectionHead>
                    <div className="alloy-os-fdetail__upcominglist">
                        {evidence.upcoming.map((u) => (
                            <span key={u.label} className="alloy-os-fdetail__up">
                                <span className="alloy-os-billing__line-label">{u.label}</span>
                                <span className="alloy-os-billing__line-value">{u.value}</span>
                                {u.unowned ? (
                                    <span className="alloy-os-billingdetail__unowned">no owner yet</span>
                                ) : null}
                            </span>
                        ))}
                    </div>
                </div>
                ) : null}
                {/* A quiet utility link at the foot of the card — management, not a peer command,
                    and deliberately the last thing on the surface rather than a button above the
                    ledger competing with the work. */}
                {/*
                  * OFFERED ONLY WHERE IT IS WIRED.
                  *
                  * This rendered unconditionally with `onClick={undefined}`, and no caller has ever
                  * passed `onManagePayment` — so every operator who has clicked "Manage payment" on
                  * this card has clicked a control that does nothing. A dead affordance is worse
                  * than an absent one: it tells the operator a capability exists and then teaches
                  * them the product is unreliable. Manage payment is still the intended home for
                  * payers, methods and autopay; until something owns it, the card does not claim it.
                  */}
                {onManagePayment ? (
                    <div className="alloy-os-fdetail__utility">
                        <FooterAction onClick={onManagePayment}>Manage payment →</FooterAction>
                    </div>
                ) : null}

                </div>

                            </UniversalCard>
        </div>
    );
}

/**
 * A lens context filter — the same control the workspace account uses, in this card's type scale.
 * Value "" is the unfiltered state and is always offered, so a chosen filter can be cleared.
 */
function LensFilter({
    testId,
    value,
    onChange,
    placeholder,
    options,
}: {
    testId: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    options: string[];
}) {
    /*
     * The house dropdown, not a bare `<select>` — same reason as the workspace's copy: on macOS the
     * native option menu is drawn by the OS and ignores the product's CSS, so a filter beside Bend
     * Pine lenses rendered as a grey system control with a grey system popup.
     */
    return (
        <AlloySelect
            value={value}
            onChange={onChange}
            options={options.map((o) => ({ value: o, label: o }))}
            placeholder={placeholder}
            density="compact"
            aria-label={placeholder}
            testId={`financials-filter-${testId}`}
        />
    );
}

/**
 * THE FINANCIALS STAT — exported because the account summary must BE this, not resemble it.
 *
 * Focus Panel → Financials → Details is the canonical Financials detail presentation, so the
 * account summary in the Financials workspace borrows this component rather than growing a second
 * label-over-value idiom with its own type scale. One anatomy, two placements.
 */
export function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "due" }) {
    return (
        <span className="alloy-os-fdetail__stat" data-tone={tone}>
            <span className="alloy-os-fdetail__statlabel">{label}</span>
            <span className={clsx("alloy-os-fdetail__statvalue", strong && "alloy-os-fdetail__statvalue--strong")}>
                {value}
            </span>
        </span>
    );
}
