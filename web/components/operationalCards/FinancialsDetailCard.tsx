"use client";

import { financialRowConceptLabel } from "@/lib/financials/reductions/reductionProvenance";
import { ChevronRight, CreditCard, Settings2 } from "lucide-react";
import { financialResponsibilityEligibility } from "@/lib/financials/commands/financialTransactionCommands";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import {
    FinancialsLedgerHead,
    RowAction,
    FinancialsLedgerPeriod as LedgerPeriod,
    FinancialsLedgerRow,
    financialsChargeState,
    type FinancialsChargeStateKey,
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
 *   D  Ledger           ONE timeline — charges, credits and payments, in their billing periods
 *   E  Actions          the operational command row
 *
 * W7-F026: there is no Upcoming section (scheduled drafts live in their future periods) and no
 * payment band under the ledger (Payment is the top command; a receipt opens Payment Details).
 *
 * No running balance column: `ledger_transactions` has no authoritative running balance, and
 * computing one in the card would invent an ordering the backend does not guarantee.
 */
/** An obligation nobody has been made answerable for. A state, not a person — so it sorts last. */
const UNASSIGNED_LABEL = "Unassigned";

/** The account itself, as a scope value — a charge with no child subject belongs to the household. */
const HOUSEHOLD_SUBJECT = "__household__";

/*
 * W7-F021 / W7-F027 — the states an operator reads a ledger row in, from the ONE shared state rule
 * (`financialsChargeState`). Scheduled activates by itself; Needs attention is a person's decision;
 * Posted is standing money (a reversed original is history of posted money); Cancelled was
 * withdrawn before it activated; a Legacy draft predates automatic posting.
 */
const LEDGER_STATUS_GROUPS = ["Scheduled", "Needs attention", "Posted", "Cancelled", "Legacy draft"] as const;
const STATE_GROUP: Record<FinancialsChargeStateKey, (typeof LEDGER_STATUS_GROUPS)[number]> = {
    scheduled: "Scheduled",
    attention: "Needs attention",
    posted: "Posted",
    reversed: "Posted",
    cancelled: "Cancelled",
    legacy: "Legacy draft",
};
function ledgerStatusGroup(e: { status?: string | null; awaiting?: { key: string } | null }): string | null {
    if (!e.status) return null;
    return STATE_GROUP[financialsChargeState({ status: e.status, awaitingKey: e.awaiting?.key ?? null }).key];
}

export default function FinancialsDetailCard({
    evidence,
    periods,
    onPayment,
    paymentUnavailableReason,
    onAddCharge,
    onOpenCharge,
    onOpenPayment,
    onOpenPrepaid,
    onManagePayment,
    onAddAdjustment,
    onApplyHeldFunds,
    onReleaseHeldFunds,
    onRefundHeldFunds,
    onPostCharge,
    onReverseCharge,
    onAdjustCharge,
    onResolveResponsibility,
    onReallocateResponsibility,
    hydrating = false,
    ledgerPending = false,
    unavailable = false,
    paymentMethodsAccount,
    administration,
    discountAdmin,
    responsibilityAdmin,
    lens: lensProp,
    onLensChange,
    subject: subjectProp,
    onSubjectChange,
    expandedPeriods,
    onPeriodToggle,
}: {
    evidence: FinancialsEvidence;
    periods: FinancialsLedgerPeriod[];
    /**
     * Controlled subject scope, as a member id — or `null` for the whole account. Omit to let this
     * card own it. A host that derives the KPI band from a scope MUST pass that same scope here,
     * or the totals and the rows answer for different subjects.
     */
    subject?: string | null;
    onSubjectChange?: (next: string | null) => void;
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
    /** Why Payment cannot be taken, when it cannot. Rendered on the disabled control. */
    paymentUnavailableReason?: string | null;
    /*
     * W7-F026: THE PAYMENT BAND IS NO LONGER RENDERED HERE. It sat under the ledger as a second
     * payment presentation — "No payment method on file / Take or record payment →" — beside the
     * Payment command at the top that opens the same operation. Receipts are ledger rows now and
     * open Payment Details; the band remains the body of the Payment command itself.
     */
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
    /*
     * Opening a charge's record. A READ, so it is not routed through the command channel and
     * widens no authority — the host pushes a detail surface, which is the same thing clicking a
     * row does everywhere else in the product.
     */
    onOpenCharge?: (args: { chargeId: string; label: string }) => void;
    /** Opening a receipt's record — Payment Details. A read, like opening a charge. */
    onOpenPayment?: (args: { paymentId: string }) => void;
    /** W7-F044: the prepaid figure opens where it came from. */
    onOpenPrepaid?: () => void;
    onManagePayment?: () => void;
    onAddAdjustment?: () => void;
    /*
     * THE THREE THINGS THAT MAY BECOME OF HELD MONEY.
     *
     * Three callbacks and not one with a `kind`, because they are three different authorisations the
     * host resolves separately: applying raises the canonical apply command with the hold named,
     * releasing raises `deposit.release`, and refunding raises the receipt's own refund. A single
     * handler would invite one confirmation copy for three different consequences.
     *
     * Each is OPTIONAL and the control is absent when the callback is: in the lab the section renders
     * its position with no acts, which is what a specimen should show.
     */
    onApplyHeldFunds?: (args: { holdId: string; paymentId: string; remainingCents: number }) => void;
    onReleaseHeldFunds?: (args: { holdId: string; paymentId: string; remainingCents: number }) => void;
    onRefundHeldFunds?: (args: { holdId: string; paymentId: string; remainingCents: number }) => void;
    /**
     * REFUND A HELD LOT — held straight to a canonical refund.
     *
     * NO AVAILABLE-PREPAID INTERMEDIATE. The host does not release and then refund: releasing would
     * make the money ordinary spendable prepaid for the interval before the refund lands, and
     * another operation could apply it to an obligation while it was already going back to the payer.
     *
     * The act is the receipt's own `payment.refund`, told which lot it discharges. It cannot write
     * the `refunded` disposition itself on a card rail — the constraint requires it to name a
     * canonical refund payment, and none exists until the provider refund is RECOGNISED — so the
     * hold is carried on the provider refund record and discharged there. The manual rail discharges
     * it immediately, because cash handed back has no executor to wait for.
     *
     * OFFERED ONLY ON A REFUNDABLE LOT. The terms are known here, so a control that could only be
     * refused would ask the operator to discover a promise the record already carries. The
     * eligibility rule still lives server-side and runs BEFORE any provider call — a filter is not
     * a boundary.
     */
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
    /**
     * THE READ ANSWERED, AND THE ANSWER WAS NOTHING IT COULD USE.
     *
     * Distinct from `hydrating`, which means the read is still in flight. This account has been
     * asked about and could not be spoken for — so the surface must stop saying it is reading,
     * without ever saying the account is empty. An absence of rows is the absence of an answer; the
     * sentence "Nothing charged yet" is a claim about the family that a failed read has no standing
     * to make.
     *
     * The shape does not change, because the operator has not gone anywhere: same regions, same
     * columns, same geometry, and every figure still an em dash.
     */
    unavailable?: boolean;
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
    /*
     * ── ONE SCOPE, OWNED BY WHOEVER OWNS THE TOTALS ────────────────────────────────────────────
     *
     * This card used to hold its own `subject` state and filter the ledger by the display LABEL,
     * while the host held `subjectFilter` in member ids and derived the KPI band from it. Two
     * states, two vocabularies, one question — "which subject is this surface scoped to" — and on
     * deployed staging they disagreed: the control read "Everyone", the ledger showed all 79 rows
     * of the household, and the band above them reported one child's $1,412.87 instead of the
     * account's $2,023.87.
     *
     * So the scope is CONTROLLED, exactly as `lens` already is. A host that owns the totals owns
     * the scope those totals are taken at, and the rows and the control follow the same state.
     * Omit it and this card keeps its own, which is what the card lab does.
     */
    const [subjectOwn, setSubjectOwn] = useState<string | null>(null);
    const subject = subjectProp !== undefined ? subjectProp : subjectOwn;
    const setSubject = (next: string | null) => {
        setSubjectOwn(next);
        onSubjectChange?.(next);
    };
    const [periodLabel, setPeriodLabel] = useState<string | null>(null);
    const [payer, setPayer] = useState<string | null>(null);
    /* WHO OWES IT — distinct from whose child the row is, and from who paid. */
    const [responsibleParty, setResponsibleParty] = useState<string | null>(null);
    /*
     * ── WHAT KIND OF CHARGE, AND WHERE IT IS (W7-F021) ──────────────────────────────────────
     *
     * After tuition generates, the natural check is THIS account's Tuition charge — not a hunt
     * through an organization-wide queue. Charge type filters by the row's canonical category (the
     * label is the catalog's); Status groups the row's lifecycle into the three an operator reads:
     * Scheduled (a draft waiting on its period or a review), Posted, Cancelled.
     */
    const [chargeType, setChargeType] = useState<string | null>(null);
    const [statusGroup, setStatusGroup] = useState<string | null>(null);

    const allEntries = useMemo(() => periods.flatMap((p) => p.entries), [periods]);

    /* Counts of ROWS, never sums of cents — the same rule `accountLenses` keeps. */
    /*
     * ONE PREDICATE FOR THE COUNTS AND THE ROWS. A badge derived from a different rule than the
     * ledger it labels promises rows the operator will not find — the exact defect the subject
     * convergence repaired once already.
     */
    /*
     * W7-F026: A PAYMENT ROW ANSWERS NONE OF THE CHARGE QUESTIONS. It has no charge type, no charge
     * lifecycle and no responsible party, so any of those filters — or a child scope, since money
     * arrives against the account — narrows it out rather than filing it under a wrong answer
     * ("Unassigned", "Posted"). The payer is the payment's own question, asked under its lens.
     */
    const inResponsibleScope = useCallback(
        (e: { responsibleParty?: string | null; type?: string; status?: string | null; awaiting?: { key: string } | null; payment?: { payerLabel: string | null } | null }) =>
            e.payment
                ? !responsibleParty && !chargeType && !statusGroup
                  && (lens !== "payments" || !payer || (e.payment.payerLabel ?? "") === payer)
                : (!responsibleParty
                    || ((e.responsibleParty ?? "").trim() || UNASSIGNED_LABEL) === responsibleParty)
                  && (!chargeType || e.type === chargeType)
                  && (!statusGroup || ledgerStatusGroup(e) === statusGroup),
        [responsibleParty, chargeType, statusGroup, lens, payer],
    );
    const inSubjectScope = useCallback(
        (e: { subjectMemberId: string | null; payment?: unknown }) =>
            !subject || (!e.payment && (e.subjectMemberId ?? HOUSEHOLD_SUBJECT) === subject),
        [subject],
    );
    /* The charge-side rows — the only ones the charge filters offer choices from. */
    const chargeEntries = useMemo(() => allEntries.filter((e) => !e.payment), [allEntries]);

    const counts = useMemo(() => {
        const scoped = allEntries.filter(
            (e) =>
                inSubjectScope(e)
                && inResponsibleScope(e)
                && (!periodLabel || periods.some((p) => p.label === periodLabel && p.entries.includes(e))),
        );
        const out: Record<AccountLens, number> = {
            all: scoped.length,
            charges: 0,
            credits: 0,
            funding: 0,
            payments: 0,
        };
        for (const e of scoped) out[e.lens] += 1;
        return out;
    }, [allEntries, periods, periodLabel, inSubjectScope, inResponsibleScope]);

    /*
     * A FILTER IS OFFERED ONLY WHEN IT DIVIDES SOMETHING. One subject, one period or one payer is a
     * control with a single choice, which reads as a capability this surface does not have.
     */
    const subjectChoices = useMemo(
        () => {
            /* One option per distinct subject, keyed by the id the account scopes by. */
            const byId = new Map<string, string>();
            for (const e of chargeEntries) byId.set(e.subjectMemberId ?? HOUSEHOLD_SUBJECT, e.subject);
            return [...byId.entries()]
                .map(([value, label]) => ({ value, label }))
                .sort((a, b) => a.label.localeCompare(b.label));
        },
        [chargeEntries],
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

    const chargeTypeChoices = useMemo(() => {
        const byType = new Map<string, string>();
        for (const e of chargeEntries) if (e.type) byType.set(e.type, chargeCategoryLabel(e.type) || e.type);
        return [...byType.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    }, [chargeEntries]);
    const statusChoices = useMemo(
        () => LEDGER_STATUS_GROUPS.filter((g) => chargeEntries.some((e) => ledgerStatusGroup(e) === g)),
        [chargeEntries],
    );

    const responsiblePartyChoices = useMemo(
        () =>
            [...new Set(chargeEntries.map((e) => (e.responsibleParty ?? "").trim() || UNASSIGNED_LABEL))].sort(
                (a, b) =>
                    a === UNASSIGNED_LABEL ? 1 : b === UNASSIGNED_LABEL ? -1 : a.localeCompare(b),
            ),
        [chargeEntries],
    );
    const payerChoices = useMemo(
        () =>
            [...new Set(allEntries.map((e) => e.payment?.payerLabel ?? "").filter(Boolean))].sort((a, b) =>
                a.localeCompare(b),
            ),
        [allEntries],
    );

    /*
     * The periods the ledger actually renders. A period the filter empties is not drawn at all.
     *
     * W7-F026: the Payments lens is a FILTER over this same timeline, not a second table — it keeps
     * the periods and shows only their payment rows, across every period.
     */
    const visiblePeriods = useMemo(() => {
        return periods
            .filter((p) => !periodLabel || p.label === periodLabel)
            .map((p) => ({
                ...p,
                entries: p.entries.filter(
                    (e) =>
                        (lens === "all" || e.lens === lens)
                        && inSubjectScope(e)
                        && inResponsibleScope(e),
                ),
            }))
            .filter((p) => p.entries.length > 0);
    }, [periods, lens, periodLabel, inSubjectScope, inResponsibleScope]);



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
                supportingInsight="Account"
                iconName="Receipt"
                tier="context"
                archetype="status"
                /* W7-F031: past due is said once — under Due now — not again as a header chip. */
                statusChip={undefined}
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
                    {/*
                      * W7-F031: the account summary, shared with the Accounts header so one figure
                      * has one name everywhere — three answers, each with its own context.
                      */}
                    <FinancialsAccountSummary evidence={evidence} hydrating={hydrating} onOpenPrepaid={onOpenPrepaid} holdings="none" />


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
                        {/*
                          * DISABLED AND EXPLAINED, never live-but-dead. Without an opener this
                          * rendered as a primary button with no handler: clicking it did nothing
                          * and said nothing, which is the one thing a mounted command may not do.
                          */}
                        <Action
                            primary
                            onClick={onPayment}
                            disabled={!onPayment}
                            title={onPayment ? undefined : (paymentUnavailableReason ?? undefined)}
                        >
                            Payment
                        </Action>
                        {/* One entry for charge and adjustment alike — the command carries the mode. */}
                        <Action onClick={onAddCharge}>Add</Action>
                        {/*
                          * W7-F043: what the account HOLDS sits under the commands that spend or
                          * return it, so the three figures keep one row (deployed proof on 747ad20d:
                          * beside the figures it wrapped Scheduled to a second line).
                          */}
                        {hydrating ? null : <FinancialsAccountHoldings evidence={evidence} onOpenPrepaid={onOpenPrepaid} />}
                    </div>
                {/*
                  * W7-F041/F043: THE RELATIONSHIP ROW SPANS THE ROLLUP. It used to sit inside the
                  * facts column, so its right-hand group (method + Manage payments) ended in the
                  * middle of the card. As a full-width row its end group sits directly beneath
                  * Payment / Add.
                  */}
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
                {/*
                  * ── NO AVATAR ON THE PAYER, AND THAT IS A DECISION ────────────────────────
                  *
                  * Discounts draws a canonical avatar per child because it is handed the child's
                  * identity — `vm.subjects` carries the request-scoped `resolved_photo_url` that
                  * `projectResolvedProfilePhotosOntoRows` minted. The payer is not that: a
                  * `FinancialsPayer` is `{ name, share, method }`, with no person id and no photo,
                  * so this row cannot resolve an image without a second authority and a second
                  * fetch on a surface whose whole point is one compact line.
                  *
                  * So the absence is intentional, not an oversight, and it is recorded here rather
                  * than re-discovered: giving the adult an avatar means widening the payer model
                  * first. What must never happen instead is the shortcut — a child's avatar
                  * standing in for the adult who owes, on the row that says who owes.
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
                                {/*
                                  * ── W7-F049: THE METHOD IS THE DOOR ─────────────────────────────────
                                  *
                                  * "visa •••• 4242" sat beside a "Manage payments →" link, two pieces
                                  * of text for one thing. The method on file is now itself the control
                                  * that opens payment administration (methods and autopay): one
                                  * element, named by what it shows, with the management intent in its
                                  * accessible name and a quiet chevron. With no single payer's method
                                  * to show — several payers, each carrying their own on the row — the
                                  * same control reads "Payment methods". Its issue (expired,
                                  * unverified) stays visible on it.
                                  */}
                                {(() => {
                                    const only = evidence.payers.length === 1 ? evidence.payers[0]! : null;
                                    const label = only?.method || "Payment methods";
                                    return (
                                        <button
                                            type="button"
                                            onClick={administration.onManagePayments}
                                            data-financials-manage-payments="open"
                                            data-financials-method-state={only ? "true" : undefined}
                                            className="alloy-os-fdetail__methoddoor"
                                            aria-label={`Manage payments — ${label}${only?.methodIssue ? `, ${only.methodIssue}` : ""}`}
                                            title="Manage payment methods and autopay"
                                        >
                                            <CreditCard aria-hidden className="h-3 w-3" strokeWidth={1.9} />
                                            <span className="alloy-os-billing__payer-method">{label}</span>
                                            {only?.methodIssue ? (
                                                <span className="alloy-os-billing__method-issue">· {only.methodIssue}</span>
                                            ) : null}
                                            <ChevronRight aria-hidden className="h-3 w-3 opacity-60" strokeWidth={1.9} />
                                        </button>
                                    );
                                })()}
                            </span>
                        ) : null}
                    </div>
                ) : null}
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
                        {periodChoices.length > 1 ? (
                            <LensFilter
                                testId="period"
                                value={periodLabel ?? ""}
                                onChange={(v) => setPeriodLabel(v || null)}
                                placeholder="All periods"
                                options={periodChoices}
                            />
                        ) : null}
                        {lens !== "payments" && chargeTypeChoices.length > 1 ? (
                            <LensFilter
                                testId="charge-type"
                                value={chargeType ?? ""}
                                onChange={(v) => setChargeType(v || null)}
                                placeholder="Every charge type"
                                options={chargeTypeChoices}
                            />
                        ) : null}
                        {lens !== "payments" && statusChoices.length > 1 ? (
                            <LensFilter
                                testId="status"
                                value={statusGroup ?? ""}
                                onChange={(v) => setStatusGroup(v || null)}
                                placeholder="Any status"
                                options={statusChoices}
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
                        {/*
                          * W7-F041: THE canonical door to responsibility — the only one. It is
                          * therefore present under every lens (the Payments lens included), so the
                          * entry point never disappears with a filter. Tooltip and accessible name
                          * are the same words.
                          */}
                        {administration ? (
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
                                title="Manage responsibility"
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
                            data-financials-ledger-hydrating={unavailable ? "unavailable" : "true"}
                            aria-busy="true"
                        >
                            <FinancialsLedgerHead />
                            {unavailable ? (
                                <p className="alloy-os-fdetail__ledgerpending" data-financials-ledger-unavailable="true">
                                    This account&rsquo;s activity could not be read.
                                </p>
                            ) : (
                                <p className="alloy-os-fdetail__ledgerpending" data-financials-ledger-reading="true">
                                    Reading this account&rsquo;s activity&hellip;
                                </p>
                            )}
                        </div>
                    ) : visiblePeriods.length === 0 ? (
                        lens === "payments" ? (
                            <p className="alloy-os-fdetail__collapsed" data-financials-payments-empty="true">
                                No money has been received.
                            </p>
                        ) : (
                        <p className="alloy-os-fdetail__collapsed" data-financials-ledger-empty="true">
                            {lens === "all"
                                ? "Nothing charged yet"
                                : `No ${ACCOUNT_LENS_LABELS[lens].toLowerCase()} in this view.`}
                        </p>
                        )
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
                                e.payment
                                    ? ledgerRowFromPayment(e, e.payment, { onOpenPayment })
                                    : ledgerRowFromEntry(e, i, {
                                          onPostCharge, onReverseCharge, onAdjustCharge,
                                          onResolveResponsibility, onReallocateResponsibility,
                                          onOpenCharge,
                                      }),
                            )}
                        />
                    ))}
                </div>

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
                {/*
                  * W7-F030: NO SECOND ADJUSTMENTS TABLE. Credits, adjustments and their reversals are
                  * ledger rows (the Credits & adjustments lens shows exactly them), and a row opens
                  * its record — where Reverse adjustment now lives. The table existed to host that
                  * one act and repeated every reduction the ledger already showed.
                  */}
                {/*
                  * ── HELD DEPOSITS — A POSITION, WITH THE ACTS THAT DISCHARGE IT ───────────────
                  *
                  * The strip above carries a TOTAL, which answers "how much is restricted" and
                  * nothing else. It cannot be acted on: releasing "some of $675" requires knowing it
                  * is a refundable $500 security deposit and a non-refundable $175 registration fee,
                  * and an operator who cannot see that distinction cannot honour it.
                  *
                  * NOT A LEDGER. These are not transactions; they are standing restrictions over
                  * money whose receipt is already in the ledger above. Rendering them through
                  * `FinancialsLedgerRow` would need a date, a GL account and a status this has none
                  * of, and would state a held lot as an eighth kind of ledger row — which is the
                  * three-presentation-systems mistake that module exists to have ended.
                  *
                  * THE COMMANDS BELONG TO THE LOT. Same rule as the adjustments block: no footer
                  * link farm, because "Release →" three times under a list says nothing about which
                  * deposit it releases. Each lot carries its own three.
                  *
                  * CLOSED LOTS ARE ABSENT — the adapter drops them. A fully disposed hold offers no
                  * act, and what became of the money is readable from the receipt above.
                  */}
                {!ledgerPending && evidence.heldDeposits.length ? (
                    <div className="alloy-os-fdetail__held" data-financials-held-deposits="true">
                        <SectionHead>Held deposits</SectionHead>
                        {/*
                          * WHY THIS SENTENCE IS HERE. Held money is the one figure on this surface
                          * that an operator reliably misreads as available: it is money the family
                          * has already given. Saying what it is NOT is the difference between a
                          * deposit sitting untouched and a deposit quietly spent on tuition.
                          */}
                        <p className="alloy-os-fdetail__heldnote" data-financials-held-note="true">
                            Money received and restricted. It is not available prepaid and it does not
                            reduce what the family owes until it is applied.
                        </p>
                        <div className="alloy-os-fdetail__heldlist">
                            {evidence.heldDeposits.map((h) => (
                                <div
                                    key={h.holdId}
                                    className="alloy-os-fdetail__heldrow"
                                    data-financials-held-row={h.holdId}
                                >
                                    <span className="alloy-os-fdetail__heldfacts">
                                        <span className="alloy-os-fdetail__heldamount" data-financials-held-remaining="true">
                                            {h.remaining}
                                        </span>
                                        {/*
                                          * The reason is the lot's NAME to an operator — "Security
                                          * deposit" is how they think of it, not "hold 4f2a…". When
                                          * none was recorded the row says so rather than inventing a
                                          * label, because a deposit with no stated reason is a real
                                          * and reportable state.
                                          */}
                                        <span className="alloy-os-fdetail__heldreason">
                                            {h.reason ?? "No reason recorded"}
                                        </span>
                                        <span className="alloy-os-fdetail__heldmeta">
                                            {/*
                                              * THE TERMS THE MONEY WAS TAKEN UNDER, not the
                                              * organisation's current policy. A deposit keeps what
                                              * the family was promised even after the policy changes,
                                              * which is why the terms are stored on the hold.
                                              */}
                                            <span
                                                data-financials-held-refundable={h.refundable ? "yes" : "no"}
                                            >
                                                {h.refundableNote}
                                            </span>
                                            {h.heldOn ? <span>Held {h.heldOn}</span> : null}
                                            {/*
                                              * `original` is present only when part of the lot is
                                              * gone, so this line always explains a gap rather than
                                              * repeating the amount beside it.
                                              */}
                                            {h.original ? <span>{h.original} originally held</span> : null}
                                            {h.disposedLines.map((d) => (
                                                <span key={d.label}>{d.label} {d.value}</span>
                                            ))}
                                        </span>
                                    </span>
                                    <span className="alloy-os-fdetail__heldactions">
                                        {onApplyHeldFunds ? (
                                            <RowAction
                                                kind="apply"
                                                command="payment.apply_to_charge"
                                                title={`Apply ${h.remaining} of this held deposit to a charge — it stops being held and the balance falls`}
                                                onClick={() => onApplyHeldFunds({
                                                    holdId: h.holdId,
                                                    paymentId: h.paymentId,
                                                    remainingCents: h.remainingCents,
                                                })}
                                            />
                                        ) : null}
                                        {onReleaseHeldFunds ? (
                                            <RowAction
                                                kind="release"
                                                command="deposit.release"
                                                title={`Release ${h.remaining} — the restriction ends and it becomes available prepaid. No money moves.`}
                                                onClick={() => onReleaseHeldFunds({
                                                    holdId: h.holdId,
                                                    paymentId: h.paymentId,
                                                    remainingCents: h.remainingCents,
                                                })}
                                            />
                                        ) : null}
                                        {/*
                                          * ABSENT ON A NON-REFUNDABLE LOT, not present and refused.
                                          * A deposit taken as non-refundable is a promise the record
                                          * already carries; offering a control that can only fail
                                          * asks the operator to discover it by being told no.
                                          */}
                                        {onRefundHeldFunds && h.refundable ? (
                                            <RowAction
                                                kind="refund"
                                                command="payment.refund"
                                                title={`Refund ${h.remaining} to the payer — it leaves the organisation and does not pass through available prepaid`}
                                                onClick={() => onRefundHeldFunds({
                                                    holdId: h.holdId,
                                                    paymentId: h.paymentId,
                                                    remainingCents: h.remainingCents,
                                                })}
                                            />
                                        ) : null}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {/*
                  * ── DEPOSIT HISTORY — WHAT BECAME OF THE LOTS THAT ARE GONE ──────────────────
                  *
                  * A lot whose money is entirely disposed of leaves the position above, and used to
                  * leave the surface with it: once the lifecycle completed, nothing could say what
                  * was held, why, on what terms, or what became of it. The dispositions were always
                  * there; nothing rendered them.
                  *
                  * It contributes to NOTHING. These lots have no remaining money, so Held deposit,
                  * Available prepaid and Current balance are unchanged by their presence — the
                  * totals fold the same dispositions either way. It carries no controls for the
                  * same reason: there is nothing left to apply, release or refund.
                  */}
                {!ledgerPending && evidence.heldDepositHistory?.length ? (
                    <div className="alloy-os-fdetail__held" data-financials-held-history="true">
                        <SectionHead>Deposit history</SectionHead>
                        <p className="alloy-os-fdetail__heldnote">
                            Deposits that are fully accounted for. They hold no money and change no
                            figure above.
                        </p>
                        <div className="alloy-os-fdetail__heldlist">
                            {evidence.heldDepositHistory.map((h) => (
                                <div
                                    key={h.holdId}
                                    className="alloy-os-fdetail__heldrow"
                                    data-financials-held-history-row={h.holdId}
                                >
                                    <span className="alloy-os-fdetail__heldfacts">
                                        {/*
                                          * THE ORIGINAL AMOUNT is the fact here. `remaining` is zero
                                          * on every one of these rows, so printing it would give the
                                          * row's most prominent slot to the one number that says
                                          * nothing.
                                          */}
                                        <span className="alloy-os-fdetail__heldamount">
                                            {h.original ?? h.remaining}
                                        </span>
                                        <span className="alloy-os-fdetail__heldreason">
                                            {h.reason ?? "No reason recorded"}
                                        </span>
                                        <span className="alloy-os-fdetail__heldmeta">
                                            <span data-financials-held-refundable={h.refundable ? "yes" : "no"}>
                                                {h.refundableNote}
                                            </span>
                                            {h.heldOn ? <span>Held {h.heldOn}</span> : null}
                                            {h.disposedLines.map((d) => (
                                                <span key={d.label}>{d.label} {d.value}</span>
                                            ))}
                                        </span>
                                    </span>
                                </div>
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
        /*
         * OPENING THE RECORD IS A READ. It is passed beside the commands rather than among them,
         * and it is offered on any row that names a charge — eligibility for a WRITE says nothing
         * about whether a charge can be looked at.
         */
        onOpenCharge?: (args: { chargeId: string; label: string }) => void;
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
    /* The row's business word, which is what the ledger already shows the operator. */
    /*
     * W7-F014: the charge's HUMAN name — the configured charge type ("Materials") — never the
     * category key ("consumable_fee"), which the card title then uppercased to CONSUMABLE_FEE.
     */
    const label = (e.label && !/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(e.label) ? e.label : null) || chargeCategoryLabel(e.type) || "Charge";
    const openable = e.chargeId && actions.onOpenCharge;
    return {
        onOpen: openable ? () => actions.onOpenCharge!({ chargeId: e.chargeId!, label }) : undefined,
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
        /*
         * W7-F018: A DRAFT DOES NOT LOOK LIKE POSTED MONEY. The canonical lifecycle classifier
         * already says which rows are unposted; they read "Upcoming" (waiting for their period) or
         * "Draft" (waiting for something else), and carry the muted upcoming tone.
         */
        /*
         * W7-F027: THE OPERATOR'S STATE, never the storage word. "Upcoming", "Draft" and a raw
         * lowercase "posted" were three vocabularies in one column; the shared rule names every row
         * Scheduled, Review required, Posting failed, Posted, Reversed, Cancelled or Legacy draft,
         * and the Charges workspace reads the same rule. The reason travels on the title.
         */
        ...(() => {
            const st = financialsChargeState({ status: e.status, awaitingKey: e.awaiting?.key ?? null });
            return {
                status: e.status ? st.label : "—",
                state: e.status ? st.key : undefined,
                stateTitle: e.awaiting?.explanation ?? null,
                ...(st.key === "scheduled" || st.key === "legacy" || st.key === "attention"
                    ? { tone: "upcoming" as const }
                    : st.key === "cancelled" || st.key === "reversed"
                      ? { tone: "muted" as const }
                      : {}),
            };
        })(),
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
 * A PAYMENT EVENT AS A LEDGER ROW — W7-F026, completed by W7-F032.
 *
 * Date | Payment | — | settlement account | amount | Received | payer | method — the same columns
 * as every other row, each saying what it means for a payment:
 *
 *   Child        —  a payment is account-level; one receipt may answer several children's charges,
 *                   so naming one would be a guess (allocations live in Payment Details).
 *   GL account   the account this TENDER settles into (`receipts_<method>` → gl_account_mappings),
 *                never the revenue account of the charge it paid. Unmapped is a real, fixable state.
 *   Status       Received, or Unapplied / Part applied when the money still answers nothing — one
 *                word, no second line under the amount.
 *   Party        who PAID — the payment's own payer (the household only when none is named). Never
 *                presented as the responsible party.
 *   Description  the card or method: "Visa •••• 4242", "Cash".
 *
 * No money-moving icon sits on the row: Reallocate and Apply are named actions in Payment Details,
 * which the row's name opens, the way a charge's name opens Charge Details.
 */
function ledgerRowFromPayment(
    e: FinancialsEvidence["ledger"][number],
    pay: NonNullable<FinancialsEvidence["ledger"][number]["payment"]>,
    actions: { onOpenPayment?: (args: { paymentId: string }) => void },
): FinancialsLedgerRowView {
    return {
        key: `payment:${pay.paymentId}`,
        when: e.when,
        type: e.label,
        child: "—",
        description: pay.methodLabel ?? e.label,
        glLabel: e.glCode,
        /* A collection still in flight has no receipt yet, so no tender account to claim. */
        glApplies: pay.kind !== "collection",
        glNote: e.glNote ?? null,
        amount: e.amount,
        status: pay.statusLabel,
        responsibleParty: null,
        responsibilityApplies: false,
        party: pay.payerLabel,
        tone: pay.unapplied ? "attention" : pay.kind === "collection" ? "upcoming" : undefined,
        onOpen: pay.openable && actions.onOpenPayment ? () => actions.onOpenPayment!({ paymentId: pay.paymentId }) : undefined,
        title: [e.label, pay.statusLabel, pay.methodLabel, pay.payerLabel ? `Paid by ${pay.payerLabel}` : null].filter(Boolean).join(" · "),
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
    /*
     * A plain string where the label IS the value (period, payer), or an explicit pair where they
     * differ — the subject filter carries member ids and shows names, because the id is what the
     * account's totals are scoped by and the name is only what the operator reads.
     */
    options: ReadonlyArray<string | { value: string; label: string }>;
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
            options={options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))}
            placeholder={placeholder}
            density="compact"
            aria-label={placeholder}
            testId={`financials-filter-${testId}`}
        />
    );
}

/**
 * ── W7-F031: THE ACCOUNT SUMMARY, ONE COMPONENT FOR EVERY HOST ───────────────────────────────
 *
 * Details (Focus Panel and Accounts) and the Accounts header render THIS, so a figure cannot have
 * two names on two surfaces. The figures and their relationships are the adapter's
 * (`period.summary`); this lays out three primary answers and a quiet context line.
 */
export function FinancialsAccountSummary({
    evidence,
    hydrating = false,
    onOpenPrepaid,
    holdings = "inline",
}: {
    evidence: FinancialsEvidence;
    hydrating?: boolean;
    /** W7-F044: the prepaid figure is a door to where it came from, never a bare number. */
    onOpenPrepaid?: () => void;
    /**
     * W7-F043: where prepaid / held render. "inline" stacks them beside the figures (a host with
     * no command column); "none" leaves them to the host, which places `FinancialsAccountHoldings`
     * under its Payment / Add commands so the three figures keep one row.
     */
    holdings?: "inline" | "none";
}) {
    const { period, pastDue } = evidence;
    /* The adapter states the summary; a lab specimen without one reads the same figures plainly. */
    const summary = period.summary ?? {
        dueNow: period.dueNow,
        pastDueNote: pastDue ? `${pastDue.amount} past due` : null,
        pastDueBeyondDue: false,
        balance: period.currentBalance,
        balanceScope: period.label,
        balanceNote: `${period.familyResponsibility} charged · ${period.paymentsReceived} paid`,
        scheduled: period.upcoming ?? null,
        context: [
            ...(period.notYetDue ? [{ key: "not-yet-due", text: `${period.notYetDue} not yet due` }] : []),
            ...(period.availablePrepaid ? [{ key: "prepaid", text: `${period.availablePrepaid} prepaid available` }] : []),
            ...(period.heldFunds ? [{ key: "held", text: `${period.heldFunds} held deposit` }] : []),
        ],
    };
    /*
     * ── W7-F043: SECONDARY FACTS NEVER CLAIM A ROW ───────────────────────────────────────────
     *
     * Not yet due, prepaid and held used to sit on their own full-width line under the three
     * figures, which pushed the ledger down by a row for facts that are context, not answers.
     * Not yet due is about collection timing, so it sits under Due now's past-due note; prepaid and
     * held are money the account holds, so they sit beside the figures — or, in Details, under
     * Payment / Add. Every value is the adapter's, unchanged.
     */
    const notYetDue = hydrating ? null : (summary.context.find((c) => c.key === "not-yet-due")?.text ?? null);
    const held = hydrating || holdings === "none" ? [] : summary.context.filter((c) => c.key === "prepaid" || c.key === "held");
    return (
        <div className="alloy-os-fdetail__strip" data-financials-account-summary-strip="true">
            {/*
              * ── W7-F031: THREE QUESTIONS, NOT EIGHT PEERS ─────────────────────────────
              *
              * What needs paying now, what this period owes, what is coming. Past due is
              * Due now's note (said once — the header chip that repeated it is gone); Current
              * balance carries its period and the two figures it is the difference of
              * (Responsibility charged − Paid). Every figure is the adapter's, unchanged.
              */}
            <Stat
                label="Due now"
                value={summary.dueNow}
                strong
                note={hydrating ? null : summary.pastDueNote}
                noteTone="due"
                aside={notYetDue}
                asideTestId="summary-not-yet-due"
                testId="summary-due-now"
            />
            <Stat
                label={`Balance · ${summary.balanceScope}`}
                value={summary.balance}
                note={hydrating ? null : summary.balanceNote}
                testId="summary-balance"
            />
            {summary.scheduled ? (
                <Stat
                    label="Scheduled"
                    value={summary.scheduled}
                    note="activates with its period"
                    testId="summary-scheduled"
                />
            ) : null}
            {held.length ? <FinancialsAccountHoldings evidence={evidence} onOpenPrepaid={onOpenPrepaid} /> : null}
        </div>
    );
}

/**
 * W7-F043/F044 — MONEY THE ACCOUNT HOLDS: prepaid available (a door to the receipts behind it) and
 * held deposit. Context, not answers — so it never claims a row: beside the figures, or under the
 * host's Payment / Add commands.
 */
export function FinancialsAccountHoldings({ evidence, onOpenPrepaid }: { evidence: FinancialsEvidence; onOpenPrepaid?: () => void }) {
    const { period } = evidence;
    const context = period.summary?.context ?? [
        ...(period.availablePrepaid ? [{ key: "prepaid", text: `${period.availablePrepaid} prepaid available` }] : []),
        ...(period.heldFunds ? [{ key: "held", text: `${period.heldFunds} held deposit` }] : []),
    ];
    const held = context.filter((c) => c.key === "prepaid" || c.key === "held");
    if (!held.length) return null;
    return (
        <span className="alloy-os-fdetail__statside" data-financials-summary-context="true">
            {held.map((c) =>
                c.key === "prepaid" && onOpenPrepaid ? (
                    <button
                        key={c.key}
                        type="button"
                        className="alloy-os-fdetail__statsidelink"
                        data-financials-summary-context-item={c.key}
                        data-financials-prepaid-open="true"
                        onClick={onOpenPrepaid}
                        title="Where this prepaid came from"
                    >
                        {c.text} <span aria-hidden>&rarr;</span>
                    </button>
                ) : (
                    <span key={c.key} data-financials-summary-context-item={c.key}>{c.text}</span>
                ),
            )}
        </span>
    );
}

/**
 * THE FINANCIALS STAT — exported because the account summary must BE this, not resemble it.
 *
 * Focus Panel → Financials → Details is the canonical Financials detail presentation, so the
 * account summary in the Financials workspace borrows this component rather than growing a second
 * label-over-value idiom with its own type scale. One anatomy, two placements.
 */
export function Stat({
    label,
    value,
    strong,
    tone,
    testId,
    note,
    noteTone,
    aside,
    asideTestId,
}: {
    label: string;
    value: string;
    strong?: boolean;
    tone?: "ok" | "due";
    testId?: string;
    /** W7-F031: the figure's own context, beneath it — "$Y past due", "$R charged · $P paid". */
    note?: string | null;
    noteTone?: "due";
    /**
     * W7-F043: a second, quieter fact stacked under the note ("$225 not yet due · next Oct 31,
     * 2026") — inside the figure's own column, so secondary context never claims a row.
     */
    aside?: string | null;
    asideTestId?: string;
}) {
    return (
        <span className="alloy-os-fdetail__stat" data-tone={tone} data-testid={testId}>
            <span className="alloy-os-fdetail__statlabel">{label}</span>
            <span className={clsx("alloy-os-fdetail__statvalue", strong && "alloy-os-fdetail__statvalue--strong")}>
                {value}
            </span>
            {note || aside ? (
                <span className="alloy-os-fdetail__statnotes">
                    {note ? (
                        <span className="alloy-os-fdetail__statnote" data-tone={noteTone} data-testid={testId ? `${testId}-note` : undefined}>
                            {note}
                        </span>
                    ) : null}
                    {aside ? (
                        <span className="alloy-os-fdetail__statnote" data-testid={asideTestId}>
                            {aside}
                        </span>
                    ) : null}
                </span>
            ) : null}
        </span>
    );
}
