"use client";

import { financialRowConceptLabel } from "@/lib/financials/reductions/reductionProvenance";
import { Settings2 } from "lucide-react";
import { financialResponsibilityEligibility } from "@/lib/financials/commands/financialTransactionCommands";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
/** An obligation nobody has been made answerable for. A state, not a person — so it sorts last. */
const UNASSIGNED_LABEL = "Unassigned";

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
    onResolveResponsibility,
    onReallocateResponsibility,
    onApplyPayment,
    hydrating = false,
    ledgerPending = false,
    paymentBand,
    paymentMethodsAccount,
    administration,
    discountAdmin,
    responsibilityAdmin,
    lens: lensProp,
    onLensChange,
    expandedPeriods,
    onPeriodToggle,
}: {
    evidence: FinancialsEvidence;
    periods: FinancialsLedgerPeriod[];
    /** Controlled lens. Omit to let this card own it, which is what the workspace host does. */
    lens?: AccountLens;
    onLensChange?: (lens: AccountLens) => void;
    /** Controlled period disclosure, keyed by period label. Omit for per-period local state. */
    expandedPeriods?: Record<string, boolean>;
    onPeriodToggle?: (label: string, expanded: boolean) => void;
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
    /**
     * THE PAYMENT BAND, RENDERED INSIDE THIS CARD.
     *
     * It used to be a SIBLING of this component — the host rendered `<FinancialsDetailCard/>` and
     * then the band next to it, inside the surface wrapper. So the band sat outside the card's own
     * box, at the wrapper's left edge, and once Details was focused an operator saw a stray
     * `Record payment →` floating beside the focused surface with no card around it. Measured
     * mounted: a visible leaf at 509,522 whose nearest `data-universal-card-key` ancestor was null,
     * while the Details card itself began at x≈528.
     *
     * The content was always legitimate — a ledger that cannot show what was received is half a
     * ledger. What was wrong was OWNERSHIP: a focused surface owns everything it presents. Passing
     * it in as a slot puts it inside the card that owns the interaction, and costs no depth
     * mechanism, no z-index exception and no second scrim.
     */
    paymentBand?: ReactNode;
    /**
     * THE ACCOUNT WHOSE STORED METHODS THIS CARD ADMINISTERS (Payments W2).
     *
     * Absent in the lab and wherever the host has no account context, in which case the section is
     * not rendered at all rather than rendered empty — "no payment method on file" is a claim, and
     * a card with no account cannot make it.
     */
    paymentMethodsAccount?: {
        customerId: string;
        payerEntityId?: string | null;
        payerName?: string | null;
        payerEmail?: string | null;
        canManage?: boolean;
    } | null;
    /*
     * ── MANAGE, BESIDE FILTER — the gap this closes ───────────────────────────────────────────
     *
     * Accounts has carried the Responsible party FILTER and the Manage responsibility GEAR side by
     * side since 11B. Details carried only the filter, so the surface an operator actually opens
     * from a family could answer "show me rows by who owes" and not "change who owes".
     *
     * Given, the gear appears next to the filter and opens the SAME responsibility surface the
     * compact row opens — one component, several doors, still not a second panel and still not a
     * second writer. This card no longer renders it: administration is depth now.
     */
    /*
     * The family's DISCOUNT position, beside Responsibility in the administration region. Given,
     * the position and its manage gear render; absent, this card behaves exactly as before.
     */
    discountAdmin?: {
        customerId: string;
        /** Names a relationship in the operator's words. The panel invents no label. */
        childLabelFor?: (opportunityCustomerMemberId: string, customerMemberId: string | null) => string | null;
        onCommitted: () => Promise<void> | void;
    } | null;
    responsibilityAdmin?: {
        customerId: string;
        /** Parties already on record, from the account view model — never invented here. */
        parties: { personId: string | null; name: string }[];
        householdName?: string | null;
        /** Re-read committed truth. The card does not report its own success. */
        onCommitted: () => Promise<void> | void;
    } | null;
    /**
     * ── THE COMPACT ADMINISTRATION ROW ────────────────────────────────────────────────────────
     *
     * `evidence.payers` already answers three of the four questions this region exists for: who is
     * financially related to the account, what they owe (the share), and how they can pay (the
     * method state). It has answered them since before this slice — what it never carried was a
     * way to CHANGE any of it, so administration grew underneath as four stacked sections.
     *
     * These give the existing row its management affordances instead. Each opens a real depth
     * surface through the same stack Add Charge and Payment use; none of them renders an editor
     * inside this card.
     */
    administration?: {
        /*
         * ── ONE ROW, NOT A REGION ─────────────────────────────────────────────────────────────
         *
         * This was two standalone rows — Responsibility and Discounts — each naming every child.
         * Correct about grain and wrong about weight: the card grew a permanent administration
         * block above the ledger, and responsibility already has a first-class KPI at the top of
         * the card, so the row restated what the operator had just read.
         *
         * What remains is the concise DISCOUNT POSITION on the relationship row, and the two
         * gears that open the depth cards. The grain did not move: a discount is still a fact
         * about a child's commercial relationship, and it is composed here rather than owned
         * here. Per-child detail lives in the depth card, which is the surface that can afford it.
         */

        /** The whole family's discount position in one phrase, already collapsed by the host. */
        discountSummary: string;
        /** True while the canonical read is in flight, so the row can wait without inventing. */
        loading?: boolean;
        onManagePayments: () => void;
        onManageResponsibility: () => void;
        onManageDiscount: () => void;
    } | null;
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
    /*
     * WHO OWES AN OBLIGATION — the charge-grain responsibility commands. Details ADMINISTERS
     * responsibility; Summary only reports it, so these never travel to the compact card.
     */
    onResolveResponsibility?: (args: { chargeId: string; label: string }) => void;
    onReallocateResponsibility?: (args: { chargeId: string; label: string }) => void;
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
    /**
     * THE SHELL IS FINAL; THE LEDGER IS NOT YET AUTHORITATIVE.
     *
     * Distinct from `hydrating`, which means nothing has been read at all. This means the account
     * HAS been read — enough for the metrics, the lenses and the filters, which are the same
     * whatever the rows say — but the ledger on hand is the bounded summary rather than the
     * account's history. Showing it would present a partial cohort as the complete one, and then
     * replace it; the region waits instead, and the complete ledger commits once.
     */
    ledgerPending?: boolean;
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
    /*
     * ── THE LENS MAY BELONG TO THE HOST ───────────────────────────────────────────────────────
     *
     * Held here, the lens died every time a command surface replaced this one, so an operator who
     * filtered to Credits, opened Adjust and cancelled came back to an unfiltered ledger. A host
     * that survives commands can own it instead and hand it down; the uncontrolled path below is
     * unchanged, so the Financials workspace keeps working exactly as before.
     */
    const [lensOwn, setLensOwn] = useState<AccountLens>("all");
    const lens = (lensProp as AccountLens | undefined) ?? lensOwn;
    const setLens = (next: AccountLens) => {
        setLensOwn(next);
        onLensChange?.(next);
    };
    const [subject, setSubject] = useState<string | null>(null);
    const [periodLabel, setPeriodLabel] = useState<string | null>(null);
    const [payer, setPayer] = useState<string | null>(null);
    /* WHO OWES IT — distinct from whose child the row is, and from who paid. */
    const [responsibleParty, setResponsibleParty] = useState<string | null>(null);

    const allEntries = useMemo(() => periods.flatMap((p) => p.entries), [periods]);

    /* Counts of ROWS, never sums of cents — the same rule `accountLenses` keeps. */
    /*
     * ONE PREDICATE FOR THE COUNTS AND THE ROWS. A badge derived from a different rule than the
     * ledger it labels promises rows the operator will not find — the exact defect the subject
     * convergence repaired once already.
     */
    const inResponsibleScope = useCallback(
        (e: { responsibleParty?: string | null }) =>
            !responsibleParty
            || ((e.responsibleParty ?? "").trim() || UNASSIGNED_LABEL) === responsibleParty,
        [responsibleParty],
    );

    const counts = useMemo(() => {
        const scoped = allEntries.filter(
            (e) =>
                (!subject || e.subject === subject)
                && inResponsibleScope(e)
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
    /*
     * Derived from the ROWS, never from household membership: a parent made responsible for nothing
     * is not a filter an operator needs, and offering them implies an arrangement that does not
     * exist. An obligation with no named party files under "Unassigned", which is a real and
     * frequently the most actionable choice.
     */
    /*
     * ── RESPONSIBILITY ADMINISTRATION STATE ───────────────────────────────────────────────────
     *
     * Open state only. The arrangement itself is the panel's business and the authority's; this
     * card holds no copy of it, so there is nothing here to drift from the committed truth.
     */
    /*
     * ── WHY NO GEAR REF LIVES HERE ────────────────────────────────────────────────────────────
     *
     * Focus restoration is real and required, and it is NOT this component's to hold. Opening a
     * depth card pushes a surface whose host returns early, so Details unmounts — every ref it
     * was keeping dies with it, and the element it pointed at is gone from the document. A ref
     * captured here would be null by the time anything could focus it.
     *
     * The gears therefore only have to be findable: they carry stable markers, the host records
     * which one it opened from, and on dismissal it focuses that marker once Details is back in
     * the document. See `restoreAdminFocus` in FinancialsCard.
     */

    const responsiblePartyChoices = useMemo(
        () =>
            [...new Set(allEntries.map((e) => (e.responsibleParty ?? "").trim() || UNASSIGNED_LABEL))].sort(
                (a, b) =>
                    a === UNASSIGNED_LABEL ? 1 : b === UNASSIGNED_LABEL ? -1 : a.localeCompare(b),
            ),
        [allEntries],
    );
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
                    (e) =>
                        (lens === "all" || e.lens === lens)
                        && (!subject || e.subject === subject)
                        && inResponsibleScope(e),
                ),
            }))
            .filter((p) => p.entries.length > 0);
    }, [periods, lens, subject, periodLabel, inResponsibleScope]);

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
                      * AVAILABLE PREPAID — money this family has already given that is not yet spent.
                      *
                      * SILENT WHEN THERE IS NONE. The adapter sends null rather than "$0.00", so an
                      * ordinary account does not carry a permanent zero in a slot meant for a fact —
                      * the same density rule that removed Autopay from this strip rather than
                      * rendering it as a standing "not available".
                      *
                      * It sits BESIDE Current balance and never inside it. Held money pays nothing
                      * down until it is applied, so `owes $0 with $200 available` stays two figures
                      * and never collapses into `-$200`, which would say the organisation owes the
                      * family money it does not owe.
                      *
                      * Toned `ok`: funds on the account are good news, not an exception to resolve.
                      */}
                    {period.availablePrepaid ? (
                        <Stat
                            label="Available prepaid"
                            value={period.availablePrepaid}
                            tone="ok"
                            testId="available-prepaid"
                        />
                    ) : null}
                    {/*
                      * HELD DEPOSIT — money received and restricted (W4).
                      *
                      * Toned neutral rather than `ok` or as a problem: held money is neither good
                      * news nor an exception to resolve, it is a position. And it is beside
                      * Available prepaid rather than inside it, because an operator may spend one
                      * and not the other.
                      */}
                    {period.heldFunds ? (
                        <Stat
                            label="Held deposit"
                            value={period.heldFunds}
                            testId="held-funds"
                        />
                    ) : null}
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

                {/*
                  * ── ONE COMPACT RELATIONSHIP ROW, IN THREE GROUPS ──────────────────────────
                  *
                  *   LEFT    who this relationship is, and what they owe
                  *   MIDDLE  what reduces it, with the gear that changes that
                  *   RIGHT   how they can pay, with the door that changes that
                  *
                  * The grouping is the point. `Manage payments` sat at the row's end with the
                  * discount between it and the payment state it manages, so the control floated
                  * next to a concept it has nothing to do with. Each action now touches the state
                  * it acts on, which is also what makes the row readable when it wraps.
                  *
                  * THE METHOD JOINS THE RIGHT GROUP ONLY WHEN THERE IS ONE PAYER TO BE ABOUT.
                  * A payment method is a fact about a payer, not about the account: with two
                  * payers on record, lifting "No payment method" out to the row's end would
                  * silently attribute one payer's method state to the relationship as a whole.
                  * With several, each keeps its own, and only the door is shared.
                  */}
                {evidence.payers.length || administration ? (
                    <div className="alloy-os-fdetail__payers" data-financials-payer-row="true">
                        <span className="alloy-os-fdetail__rowgroup" data-financials-row-group="identity">
                            {evidence.payers.map((p) => (
                                <span
                                    key={p.name}
                                    className="alloy-os-fdetail__payer"
                                    data-funding={p.funding ? "true" : undefined}
                                >
                                    <span className="alloy-os-billing__payer-name">{p.name}</span>
                                    <span className="alloy-os-billing__payer-share">{p.share}</span>
                                    {evidence.payers.length > 1 ? (
                                        <>
                                            <span className="alloy-os-billing__payer-method">{p.method}</span>
                                            {p.methodIssue ? (
                                                <span className="alloy-os-billing__method-issue">· {p.methodIssue}</span>
                                            ) : null}
                                        </>
                                    ) : null}
                                </span>
                            ))}
                        </span>

                        {/*
                          * WHAT REDUCES IT, and the gear that changes that — adjacent by rule,
                          * because the gear's whole meaning is "change THIS". No money here: the
                          * expected amounts are per child and belong to the card that shows them
                          * per child.
                          */}
                        {administration ? (
                            <span className="alloy-os-fdetail__rowgroup" data-financials-row-group="discount">
                                <span className="alloy-os-fdetail__adminvalue" data-financials-discount-summary="true">
                                    {administration.loading ? (
                                        <span data-financials-summary-state="loading">Reading…</span>
                                    ) : (
                                        administration.discountSummary
                                    )}
                                </span>
                                <button
                                    type="button"
                                    onClick={administration.onManageDiscount}
                                    data-financials-manage-discounts="gear"
                                    aria-label="Manage discounts"
                                    title="Manage discounts — what each child receives, and what can change"
                                    className="alloy-os-fdetail__admingear"
                                >
                                    <Settings2 className="h-3 w-3" strokeWidth={1.9} aria-hidden />
                                </button>
                            </span>
                        ) : null}

                        {/* HOW THEY CAN PAY, and the door that changes that — one thought, one group. */}
                        {administration ? (
                            <span className="alloy-os-fdetail__rowgroup alloy-os-fdetail__rowgroup--end" data-financials-row-group="payment">
                                {evidence.payers.length === 1 ? (
                                    <span className="alloy-os-billing__payer-method" data-financials-method-state="true">
                                        {evidence.payers[0]!.method}
                                        {evidence.payers[0]!.methodIssue ? (
                                            <span className="alloy-os-billing__method-issue"> · {evidence.payers[0]!.methodIssue}</span>
                                        ) : null}
                                    </span>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={administration.onManagePayments}
                                    data-financials-manage-payments="open"
                                    className="alloy-os-fdetail__payeraction"
                                >
                                    Manage payments <span aria-hidden>&rarr;</span>
                                </button>
                            </span>
                        ) : null}
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
                  * The four administration sections that stood here — payment methods,
                  * autopay, responsibility and discounts — are gone from the document flow.
                  * Their state is on the compact row above and their management opens as a
                  * depth surface, so the ledger is never pushed down by an editor.
                  */}

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
                            <span className="alloy-os-fdetail__lenscount">{hydrating || ledgerPending ? "" : counts[key]}</span>
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
                        {/*
                          * WHO OWES IT — the second question the ledger answers about an obligation,
                          * and a different one from whose child it is. Absent under the Payments
                          * lens, where the question is who actually paid and Payer owns it.
                          */}
                        {lens !== "payments" && responsiblePartyChoices.length > 1 ? (
                            <LensFilter
                                testId="responsible-party"
                                value={responsibleParty ?? ""}
                                onChange={(v) => setResponsibleParty(v || null)}
                                placeholder="Anyone responsible"
                                options={responsiblePartyChoices}
                            />
                        ) : null}
                        {/*
                          * MANAGE, beside FILTER — the same two intents Accounts already pairs, in
                          * the same order and the same row. The FILTER answers "show me rows by who
                          * owes"; the GEAR answers "change who owes". They sit together because they
                          * are about one concept, and the filter is never allowed to mutate it.
                          *
                          * Quiet on purpose: an icon at the filters' own size, no fill and no
                          * border, so the filter row does not become a command footer. Its
                          * accessible name says what it does — an icon shape is not a sentence.
                          */}
                        {lens !== "payments" && administration ? (
                            <button
                                type="button"
                                /*
                                 * THE SAME DEPTH SURFACE THE COMPACT ROW OPENS. This gear used to
                                 * set local state that unfolded the editor inside Details, which
                                 * is the behaviour that pushed the ledger down. Two hosts, one
                                 * surface — a second way in must not mean a second experience.
                                 */
                                onClick={() => administration.onManageResponsibility()}
                                aria-label="Manage responsibility"
                                title="Manage responsibility — who contractually owes, from a date"
                                data-financials-manage-responsibility="gear"
                                className="inline-flex h-[1.6rem] w-[1.6rem] shrink-0 items-center justify-center rounded text-alloy-midnight/45 transition hover:bg-alloy-stone/15 hover:text-alloy-bend-pine focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40"
                            >
                                <Settings2 aria-hidden size={14} strokeWidth={1.9} />
                            </button>
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

                    {hydrating || ledgerPending ? (
                        /*
                         * ── A RESERVED REGION, NOT THREE ROWS ─────────────────────────────────
                         *
                         * This used to render three placeholder rows of em dashes, on the reasoning
                         * that the grid the operator is about to read should already be in front of
                         * them. The grid still is — the same head component, so nothing shifts when
                         * the real rows arrive — but the ROWS are gone.
                         *
                         * Three row-shaped things in a ledger are three transactions, whatever
                         * characters sit in them, and a surface that shows three where fifty-six are
                         * coming has told the operator something false about an account. An em dash
                         * is the absence of an answer; a ROW is a claim that something happened.
                         * The region says it is reading and claims nothing else.
                         */
                        <div
                            className="alloy-os-billingdetail__ledger"
                            role="table"
                            data-financials-ledger-hydrating="true"
                            aria-busy="true"
                        >
                            <FinancialsLedgerHead />
                            <p className="alloy-os-fdetail__ledgerpending" data-financials-ledger-reading="true">
                                Reading this account&rsquo;s activity&hellip;
                            </p>
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
                            expandedOverride={expandedPeriods?.[per.label]}
                            onToggle={onPeriodToggle}
                            rows={per.entries.map((e, i) =>
                                ledgerRowFromEntry(e, i, {
                                    onPostCharge, onReverseCharge, onAdjustCharge,
                                    onResolveResponsibility, onReallocateResponsibility,
                                }),
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
                {/*
                  * The payment and adjustment bands are ledger activity too, and they are drawn from
                  * the same bounded projection — so while the ledger waits for its own authority,
                  * they wait with it. Showing them would be the same partial truth in a second place.
                  */}
                {ledgerPending ? null : lens === "payments" ? (
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

                {!ledgerPending && showAdjustments && evidence.adjustments.length ? (
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

                {/*
                  * PAYMENT METHODS — the thing "Manage payment" above was always meant to lead to.
                  *
                  * That control has rendered with `onClick={undefined}` for as long as it has
                  * existed, because nothing owned payers, methods or autopay. W2 owns methods, so
                  * they are presented here directly rather than behind a button that goes nowhere.
                  */}

                {/* Inside the card, because the focused surface owns what it presents. */}
                {paymentBand ? (
                    <div className="alloy-os-fdetail__paymentband" data-financials-payment-band="detail">
                        {paymentBand}
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
/**
 * The provenance an operator needs at a glance, joined into one short line.
 *
 * Deliberately bounded: basis, recurrence and the human sentence. Ids, timestamps and the policy
 * snapshot are real provenance and belong at depth, not in a ledger row — this file's whole
 * argument is that a row states a fact and does not become a paragraph.
 */
function reductionPreview(e: FinancialsEvidence["ledger"][number]): string | null {
    const r = e.reduction;
    if (!r) return null;
    /*
     * THE EXPLANATION SOMETIMES IS THE BASIS. `applyFinancialReductions` writes an explanation like
     * "discount · 10% of $400.00", so stating both produced
     * "10% of $400.00 · Ongoing · discount · 10% of $400.00" — the row saying one fact twice in its
     * narrowest column. Where the explanation already carries the basis, the basis alone is kept.
     */
    const basis = r.basisSummary;
    const explanation =
        basis && r.explanation && r.explanation.includes(basis) ? null : r.explanation;
    const parts = [basis, r.recurrenceLabel || null, explanation].filter(
        (v): v is string => Boolean(v && v.trim()),
    );
    if (!parts.length) return e.label || null;

    /*
     * ── THE TYPE COLUMN ALREADY SAID IT ──────────────────────────────────────────────────────
     *
     * The label led here at first, and measured at 1680 the cell renders "discount · 10% of …" in
     * 103px — the row spent its scarcest column repeating the word already printed one column to
     * the left, and truncated the only part an operator could not get elsewhere.
     *
     * So where the label merely restates the concept, it is dropped and the BASIS leads. Where it
     * says something the concept does not — a real description — it is kept. The column is not
     * widened and the ledger keeps its density; the row simply stops saying the same thing twice.
     */
    const label = (e.label ?? "").trim();
    const redundant = label.toLowerCase() === r.conceptLabel.toLowerCase()
        || label.toLowerCase() === r.concept.toLowerCase();
    return (redundant ? parts : [label, ...parts]).filter(Boolean).join(" · ");
}

function ledgerRowFromEntry(
    e: FinancialsEvidence["ledger"][number],
    index: number,
    actions: {
        onPostCharge?: (args: { chargeId: string; label: string }) => void;
        onReverseCharge?: (args: { chargeId: string; label: string }) => void;
        onAdjustCharge?: (args: { chargeId: string }) => void;
        /* Who owes this obligation. Charge-grain, and a different question from the arrangement. */
        onResolveResponsibility?: (args: { chargeId: string; label: string }) => void;
        onReallocateResponsibility?: (args: { chargeId: string; label: string }) => void;
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
    /*
     * WHO OWES IT — offered from the state this very row is already showing, through the shared
     * eligibility rule rather than a second reading of it here. A reduction offers neither: its
     * responsibility belongs to the charge it reduces.
     */
    const responsibility = financialResponsibilityEligibility({
        chargeId: e.chargeId ?? null,
        /* A reduction is not an obligation: its responsibility belongs to the charge it reduces. */
        responsibilityApplies: !e.reduction,
        responsibleParty: e.responsibleParty,
    });
    const resolveResp = responsibility.resolve && actions.onResolveResponsibility;
    const reallocateResp = responsibility.reallocate && actions.onReallocateResponsibility;
    return {
        key: e.chargeId || `${e.when}-${index}`,
        when: e.when,
        /*
         * ── THE OPERATOR'S WORD FOR THIS ROW ─────────────────────────────────────────────────
         *
         * A reduction produced by an authored discount policy said "Credit", because the CATEGORY
         * it is written under is the contra-revenue one it shares with every other reduction. The
         * category is how the money posts; it is not what the row IS. `reduction.conceptLabel` is
         * the canonical answer — Discount, Credit, Adjustment or Reversal — and a reversal says so
         * rather than appearing as a second unrelated discount.
         *
         * Falls back to the category label wherever the row is not a reduction, which is every
         * ordinary charge.
         */
        /* Correction lineage first, then reduction provenance, then the category. */
        type: financialRowConceptLabel({
            correctionKind: e.correctionKind,
            reductionConceptLabel: e.reduction?.conceptLabel ?? null,
            categoryLabel: chargeCategoryLabel(e.type),
        }),
        child: e.subject,
        /*
         * A CONCISE PREVIEW, NOT A PARAGRAPH. The decision behind the money, in the words an
         * operator would use to answer "why is my bill this number" — the policy's basis, whether
         * it recurs, and the sentence somebody wrote if they wrote one. Each part is omitted when
         * the model does not know it, so nothing here is padding and the ledger stays dense.
         */
        description: reductionPreview(e) || e.label,
        glLabel: e.glCode,
        amount: e.amount,
        status: e.status ?? "—",
        responsibleParty: e.responsibleParty,
        responsibilityUnassigned: e.responsibilityUnassigned,
        responsibilityAssignedCents: e.responsibilityAssignedCents,
        responsibilityUnassignedCents: e.responsibilityUnassignedCents,
        actions:
            post || reverse || adjust || resolveResp || reallocateResp ? (
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
                    {/*
                     * RESOLVE AND REALLOCATE ARE NEVER BOTH OFFERED. A row either names a party or
                     * it does not, and the operator reads which question this obligation is asking
                     * from which control is there.
                     */}
                    {resolveResp ? (
                        <RowAction
                            kind="resolveResponsibility"
                            command="billing.resolve_responsibility"
                            chargeId={e.chargeId!}
                            title={`Resolve who owes ${e.label} — divide it under the arrangement in force`}
                            onClick={() =>
                                actions.onResolveResponsibility!({ chargeId: e.chargeId!, label: e.label })
                            }
                        />
                    ) : null}
                    {reallocateResp ? (
                        <RowAction
                            kind="reallocateResponsibility"
                            command="billing.reallocate_responsibility"
                            chargeId={e.chargeId!}
                            title={`Reallocate ${e.label} — move what one party owes to another`}
                            onClick={() =>
                                actions.onReallocateResponsibility!({ chargeId: e.chargeId!, label: e.label })
                            }
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
export function Stat({ label, value, strong, tone, testId }: { label: string; value: string; strong?: boolean; tone?: "ok" | "due"; testId?: string }) {
    return (
        <span className="alloy-os-fdetail__stat" data-tone={tone} data-testid={testId}>
            <span className="alloy-os-fdetail__statlabel">{label}</span>
            <span className={clsx("alloy-os-fdetail__statvalue", strong && "alloy-os-fdetail__statvalue--strong")}>
                {value}
            </span>
        </span>
    );
}
