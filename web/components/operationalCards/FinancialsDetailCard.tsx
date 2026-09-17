"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import {
    FinancialsLedgerHead,
    RowAction,
    FinancialsLedgerPeriod as LedgerPeriod,
    FinancialsLedgerRow,
    type FinancialsLedgerRowView,
} from "@/components/operationalCards/FinancialsLedger";
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
    onAdjustCharge,
    onApplyPayment,
    hydrating = false,
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
    /**
     * Adjust THIS transaction. Distinct from Reverse and deliberately so: a reversal says the
     * charge should never have stood, an adjustment says it stands and something reduces it. The
     * host opens its one entry command in Adjustment mode with this charge already bound — this
     * card neither writes nor composes an adjustment of its own.
     */
    onAdjustCharge?: (args: { chargeId: string }) => void;
    /** Put already-received money against an obligation. */
    onApplyPayment?: (args: { paymentId: string }) => void;
    /**
     * ── THE ANATOMY IS KNOWN BEFORE THE FIGURES ARE ────────────────────────────────────────────
     *
     * True while the account is still being read. The card renders its FULL shape — the metric row,
     * the two commands, the lenses, the ledger's eight columns — and states every figure as an em
     * dash, because the shape is already decided the moment the operator asks for Details and only
     * the values are outstanding.
     *
     * It exists so no caller has to answer the same question with a DIFFERENT surface. A host that
     * renders something else while it waits makes the operator watch the Details shell be built
     * twice; a host that renders this renders it once.
     *
     * Three things change, and only three: Past due says it does not know rather than "None", the
     * lens counts state no number, and the ledger shows its columns over placeholder rows instead
     * of the sentence "Nothing charged yet" — which is a claim about the family that a loading
     * state has no standing to make.
     */
    hydrating?: boolean;
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
                /*
                 * NO BALANCE IN THE TITLE. It read "-$30.13 balance" as the card's large heading
                 * while the metric row directly beneath it carried Current balance as one of its
                 * figures — one number, stated twice, in two type scales, and the bigger of the two
                 * was the one an operator cannot act on. The title names the card; the metrics
                 * carry the money.
                 */
                insight=""
                supportingInsight={period.label}
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
                    {/*
                      * "Current balance", the same words the Accounts header uses for the same
                      * figure. It read "Balance" here and "Current balance" there — one number,
                      * one authority, two names — which is exactly the accidental drift the
                      * parity audit exists to catch. Different information between the two
                      * surfaces is allowed because their purposes differ; a different WORD for
                      * identical information is not.
                      */}
                    {/*
                      * ── THE SHARED CORE, IN THE SAME WORDS AS THE WORKSPACE ──────────────────
                      *
                      * Current balance, Due and Past due are the three the two surfaces share, and
                      * they use the same labels, the same formatter and the same type scale.
                      * Responsibility and Paid are the Focus Panel's own: this card is financial
                      * context beside another process and has no lenses to reach them through,
                      * where the workspace does. Not every contextual metric is forced onto the
                      * workspace for visual equality.
                      */}
                    <Stat label="Current balance" value={period.currentBalance} strong />
                    <Stat label="Due" value={period.dueNow} />
                    <Stat
                        label="Past due"
                        value={hydrating ? "—" : pastDue ? pastDue.amount : "None"}
                        tone={hydrating ? undefined : pastDue ? "due" : "ok"}
                    />
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
                    {/*
                      * AUTOPAY IS DROPPED FROM THE METRIC ROW. The platform has no autopay model —
                      * no table, no column, no writer — so the metric could only ever read "Not
                      * available yet", which is a statement about Alloy occupying a slot meant for
                      * a statement about this family. A metric that can never carry a value is not
                      * a metric. The capability is still reported where it is actionable, in the
                      * payment command's own capability lines.
                      *
                      * NEXT stays: a scheduled charge is a real, truthful operational fact and it
                      * is the one thing on this row the workspace has no lens for.
                      */}
                    {evidence.payment.nextChargeLabel ? (
                        <Stat label="Next" value={evidence.payment.nextChargeLabel} />
                    ) : null}
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
                        {/* One entry for charge and adjustment alike — the command carries the mode. */}
                        <Action onClick={onAddCharge}>Add</Action>
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
                            <span className="alloy-os-fdetail__lenscount">{hydrating ? "" : counts[key]}</span>
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

                    {hydrating ? (
                        /*
                         * The columns, over placeholders. Same head component the hydrated ledger
                         * uses, so the grid the operator is about to read is already the grid in
                         * front of them and nothing shifts underneath when the rows arrive.
                         */
                        <div className="alloy-os-billingdetail__ledger" role="table" data-financials-ledger-hydrating="true">
                            <FinancialsLedgerHead />
                            {[0, 1, 2].map((i) => (
                                <FinancialsLedgerRow
                                    key={`hydrating-${i}`}
                                    row={{
                                        key: `hydrating-${i}`,
                                        when: "—",
                                        type: "—",
                                        child: "—",
                                        description: "",
                                        glLabel: null,
                                        amount: "—",
                                        status: "—",
                                        responsibleParty: null,
                                        tone: "muted",
                                    }}
                                />
                            ))}
                        </div>
                    ) : visiblePeriods.length === 0 ? (
                        <p className="alloy-os-fdetail__collapsed" data-financials-ledger-empty="true">
                            {lens === "all"
                                ? "Nothing charged yet"
                                : `No ${ACCOUNT_LENS_LABELS[lens].toLowerCase()} in this view.`}
                        </p>
                    ) : null}
                    {/*
                      * ONE RENDERER. The lens has already decided the cohort; every period below it
                      * — including a period of nothing but credits and adjustments — is drawn by the
                      * same component as every other, in the same columns, collapsed or expanded.
                      */}
                    {visiblePeriods.map((per) => (
                        <LedgerPeriod
                            key={per.label}
                            label={per.label}
                            summary={per.summary}
                            open={per.open}
                            rows={per.entries.map((e, i) =>
                                ledgerRowFromEntry(e, i, { onPostCharge, onReverseCharge, onAdjustCharge }),
                            )}
                        />
                    ))}
                </div>
                ) : null}

                {/*
                  * ── PAYMENTS AND ADJUSTMENTS ARE LEDGER ACTIVITY ──────────────────────────────
                  *
                  * Both used to be their own presentations: payments as a stack of stat strips,
                  * adjustments as prose beneath an EMPTY ledger, because the credits lens filtered
                  * the ledger to nothing and then rendered a different component under it. Selecting
                  * a lens handed the operator a different document rather than a narrower ledger.
                  *
                  * They are the same activity in the same columns now. What each carries that a
                  * column cannot hold — a reduction's reason, a receipt's method and payer — becomes
                  * the Description preview and the row's title, and the row-level actions those
                  * sections owned travel with the rows.
                  *
                  * Every figure is still the adapter's. Nothing here adds, differences or decides
                  * what "applied" means.
                  */}
                {lens === "payments" ? (
                    <div className="alloy-os-billingdetail__ledger" role="table" data-financials-payments-ledger="true">
                        <FinancialsLedgerHead />
                        {visiblePayments.map((p) => (
                            <FinancialsLedgerRow
                                key={p.paymentId}
                                row={{
                                    ...ledgerRowFromPayment(p),
                                    /*
                                     * The receipt's own operations, on the receipt. Move and Apply
                                     * were a list of links beneath the rows; an operator reading
                                     * them could not tell which payment each belonged to.
                                     */
                                    actions: (
                                        <>
                                            {p.unappliedCents > 0 && onApplyPayment ? (
                                                <RowAction
                                                    kind="apply"
                                                    command="payment.apply"
                                                    title={`Apply ${p.unappliedLabel} to an obligation`}
                                                    onClick={() => onApplyPayment({ paymentId: p.paymentId })}
                                                />
                                            ) : null}
                                            {onMovePayment
                                                ? p.applications
                                                      .filter((a) => a.status === "active")
                                                      .slice(0, 1)
                                                      .map((a) => (
                                                          <RowAction
                                                              key={a.allocationId}
                                                              kind="move"
                                                              command="payment.move"
                                                              title={`Move ${a.amountLabel} from ${a.chargeLabel}`}
                                                              onClick={() =>
                                                                  onMovePayment({
                                                                      paymentId: p.paymentId,
                                                                      allocationId: a.allocationId,
                                                                  })
                                                              }
                                                          />
                                                      ))
                                                : null}
                                        </>
                                    ),
                                }}
                            />
                        ))}
                        {visiblePayments.length === 0 ? (
                            <p className="alloy-os-fdetail__collapsed" data-financials-payments-empty="true">
                                No money has been received.
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {showAdjustments && evidence.adjustments.length ? (
                    <div className="alloy-os-billingdetail__ledger" role="table" data-financials-adjustments-ledger="true">
                        {/*
                          * ── NO FOOTER LINK FARM ───────────────────────────────────────────────
                          *
                          * This block used to end in a row of links — "Reverse Credit →" once per
                          * unreversed adjustment, then "Add adjustment →" — so an account with six
                          * credits grew six identical-looking commands under the ledger, none of
                          * which said WHICH credit it acted on except by repeating its amount.
                          *
                          * A transaction's commands belong to the transaction. Reverse is now a row
                          * action on the row it reverses, and Add adjustment is gone from here
                          * entirely: it is the Adjustment mode of the one financial entry command.
                          */}
                        <FinancialsLedgerHead />
                        {evidence.adjustments.map((a) => (
                            <FinancialsLedgerRow
                                key={a.applicationId}
                                row={{
                                    ...ledgerRowFromAdjustment(a),
                                    actions:
                                        !a.reversed && !a.isReversal && onReverseAdjustment ? (
                                            <RowAction
                                                kind="reverse"
                                                command="billing.reverse_adjustment"
                                                title={`Reverse ${a.categoryLabel} ${a.amountLabel} — the original stays on the record`}
                                                onClick={() => onReverseAdjustment({ applicationId: a.applicationId })}
                                            />
                                        ) : undefined,
                                }}
                            />
                        ))}
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
 * ── ONE ROW SHAPE, THREE KINDS OF ACTIVITY ─────────────────────────────────────────────────────
 *
 * A charge, a manual adjustment and a payment are three different business objects and ONE kind of
 * financial activity. They used to be three presentations: a grid, a prose block and a stat strip.
 * These functions map each into the ledger's row shape so the lens changes the cohort and never the
 * renderer.
 *
 * Nothing here computes. Every label, sign and status arrives already decided by the adapter that
 * owns it.
 */
function ledgerRowFromEntry(
    e: FinancialsEvidence["ledger"][number],
    index: number,
    actions: {
        onPostCharge?: (args: { chargeId: string; label: string }) => void;
        onReverseCharge?: (args: { chargeId: string; label: string }) => void;
        onAdjustCharge?: (args: { chargeId: string }) => void;
    },
): FinancialsLedgerRowView {
    const post = e.chargeId && e.offersPost && actions.onPostCharge;
    const reverse = e.chargeId && e.offersReverse && actions.onReverseCharge;
    /*
     * A charge can be ADJUSTED exactly when it is a standing obligation: it has posted, so there is
     * something to reduce, and it has not been reversed, because a charge that no longer stands has
     * nothing left to adjust. `offersReverse` is the read model's answer to the same question, which
     * is why it gates both — Reverse and Adjust are two readings of one eligibility, not two.
     */
    const adjust = e.chargeId && e.offersReverse && actions.onAdjustCharge;
    return {
        key: e.chargeId || `${e.when}-${index}`,
        when: e.when,
        type: chargeCategoryLabel(e.type),
        child: e.subject,
        description: e.label,
        glLabel: e.glCode,
        amount: e.amount,
        status: e.status ?? "—",
        responsibleParty: e.responsibleParty,
        responsibilityUnassigned: e.responsibilityUnassigned,
        actions:
            post || reverse || adjust ? (
                <>
                    {/*
                     * POST IS OFFERED ONLY WHERE A LEGITIMATE DRAFT EXISTS. `offersPost` is the read
                     * model's answer, not a guess from the status string — and under the 5H decision
                     * a draft arises from a configured review boundary or a generated run, never from
                     * an operator having used a manual command.
                     */}
                    {post ? (
                        <RowAction
                            kind="post"
                            command="charge.post"
                            chargeId={e.chargeId!}
                            title={`Post ${e.label} — it becomes owed`}
                            onClick={() => actions.onPostCharge!({ chargeId: e.chargeId!, label: e.label })}
                        />
                    ) : null}
                    {reverse ? (
                        <RowAction
                            kind="reverse"
                            command="charge.reverse"
                            chargeId={e.chargeId!}
                            title={`Reverse ${e.label} — unwind a charge that should never have stood`}
                            onClick={() => actions.onReverseCharge!({ chargeId: e.chargeId!, label: e.label })}
                        />
                    ) : null}
                    {adjust ? (
                        <RowAction
                            kind="adjust"
                            command="billing.adjust_account"
                            chargeId={e.chargeId!}
                            title={`Adjust ${e.label} — it stands, and something reduces it`}
                            onClick={() => actions.onAdjustCharge!({ chargeId: e.chargeId! })}
                        />
                    ) : null}
                </>
            ) : undefined,
    };
}

/**
 * A manual reduction as a LEDGER ROW.
 *
 * It used to be prose — "Raises what is owed · Sep 14, 2026 · Reason…" — in a section of its own
 * beneath an empty ledger. The facts it carried are all columns: what it was, for whom, how much,
 * whether it has posted, and who owes the charge it reduces. The one fact with no column is the
 * REASON, which is free text, so it becomes the Description preview and the row's full title.
 *
 * `muted` for a reversed row: history that no longer counts. That is a business state, not a sign.
 */
function ledgerRowFromAdjustment(a: FinancialsEvidence["adjustments"][number]): FinancialsLedgerRowView {
    const direction = a.reducesObligation ? "Lowers what is owed" : "Raises what is owed";
    const state = a.reversed ? "reversed" : a.isReversal ? "reversal" : a.applied ? "posted" : "draft";
    return {
        key: a.applicationId,
        when: a.recordedOn ?? "—",
        type: a.categoryLabel,
        child: a.subjectName ?? "Household",
        /* The reason is the description; the direction explains a row whose sign alone would not. */
        description: a.reason ?? direction,
        /*
         * The reduction read carries no resolved GL account. Core DOES map the credit and
         * adjustment categories, so this is the row not knowing rather than the tenant not having
         * configured one — and "Unmapped" would accuse them of the latter.
         */
        glLabel: null,
        glApplies: false,
        amount: a.amountLabel,
        status: state,
        /* A reduction is not an obligation: responsibility belongs to the charge it reduces. */
        responsibleParty: null,
        responsibilityApplies: false,
        tone: a.reversed ? "muted" : undefined,
        title: [direction, a.reason, a.applied ? null : "Recorded, not yet posted"].filter(Boolean).join(" · "),
    };
}

/**
 * A receipt as a LEDGER ROW.
 *
 * Received, from whom, by what method, and what is still unapplied — the same four facts the stat
 * strip carried, in the columns every other row uses. Unapplied money is `attention` because it is
 * money sitting on the account answering nothing, which is a business state; the negative sign on a
 * receipt is not.
 */
function ledgerRowFromPayment(p: FinancialsEvidence["payments"][number]): FinancialsLedgerRowView {
    return {
        key: p.paymentId,
        when: p.receivedOn ?? "—",
        type: "Payment",
        /*
         * A RECEIPT IS NOT FOR A CHILD. This column is headed "Child", and it read "Household" on
         * every payment row — writing an account-level word into a child-grain column, which is the
         * kind of near-miss an operator stops trusting. A payment arrives against the account; the
         * obligations it answers may belong to several children, and naming one would be a guess.
         */
        child: "—",
        description: p.method ? `${p.method}${p.payerLabel ? ` · ${p.payerLabel}` : ""}` : (p.payerLabel ?? "Payment"),
        /* Core has no payment-GL authority: a receipt has no charge category to map. */
        glLabel: null,
        glApplies: false,
        amount: p.receivedLabel,
        amountNote: p.unappliedCents > 0 ? `${p.unappliedLabel} unapplied` : `${p.appliedLabel} applied`,
        /* Received, and how much of it has answered an obligation — the authority's own figures. */
        status: p.unappliedCents > 0 ? "Part applied" : "Applied",
        /*
         * THE PAYER IS NOT THE RESPONSIBLE PARTY. This column used to carry `payerLabel`, which
         * asserted that whoever paid is whoever owed — they are frequently different people, and on
         * a split household they are routinely different. The payer is stated in the description,
         * beside the method, where it is a fact about the receipt rather than a claim about the debt.
         */
        responsibleParty: null,
        responsibilityApplies: false,
        tone: p.unappliedCents > 0 ? "attention" : undefined,
    };
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
