"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import { hasInnerDismissibleLayer } from "@/lib/adminV2/runtime/focusPanel/escapeLayerOwnership";
import type { AccountLens } from "@/lib/financials/workspace/accountLenses";
import { FOCUS_PANEL_RESERVED_MIN_HEIGHT } from "@/components/admin/focusPanel/FocusPanelSummarySkeleton";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    collectionLifecycle,
    lifecycleLabel,
    type CollectionRail,
} from "@/lib/financials/payments/collectionLifecycle";
import ApprovedFinancialsCard, { AccountSummaryPending } from "@/components/operationalCards/FinancialsCard";
import {
    useRegisterFinancialCommandHost,
    type FinancialCommandRequest,
} from "@/components/financials/FinancialCommandChannel";
import { executeFinancialCommand } from "@/lib/financials/commands/financialTransactionCommands";
import AddChargeCommand from "@/components/operationalCards/AddChargeCommand";
import FinancialsResponsibilityPanel from "@/app/adminV2/financials/FinancialsResponsibilityPanel";
import FinancialsDiscountPanel, { type FamilyPosition } from "@/app/adminV2/financials/FinancialsDiscountPanel";
import PaymentMethodsSection from "@/components/operationalCards/PaymentMethodsSection";
import AutopaySection from "@/components/operationalCards/AutopaySection";
import FinancialsDetailCard from "@/components/operationalCards/FinancialsDetailCard";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
import CardCollectionField from "./CardCollectionField";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import {
    categoryPermitsChildGrain,
    categoryPermitsHouseholdGrain,
} from "@/lib/financials/chargeCategorySemantics";
import {
    adaptAddChargeSpecimen,
    adaptChargeTemplateOption,
    adaptFinancialsVmToFinancialsCard,
    adaptFinancialsVmToLedgerPeriods,
    hydratingFinancialsEvidence,
} from "@/lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    presentPayments,
    unappliedTotalCents,
} from "@/lib/adminV2/runtime/focusPanel/financials/paymentPresentation";
import type { FinancialsCardVM,
    FinancialsLedgerRow,
} from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { resolveFinancialSubjectId } from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";
import {
    compactPayableRows as selectCompactPayableRows,
    financialsRowsInSubjectScope,
    rowInFinancialsSubjectScope,
} from "@/lib/adminV2/runtime/focusPanel/financials/financialsRowScope";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
    /**
     * Whether this placement offers the `Details →` drill-down.
     *
     * True in the Focus Panel, where the card is financial context beside another subject. False in
     * Financials → Accounts, where the account's own activity is already on screen beneath it.
     */
    showDetailsAction?: boolean;
    /**
     * Which summary this placement wants — see `summaryVariant` on the approved card.
     *
     * The Focus Panel keeps the period reconciliation. Financials → Accounts takes the account
     * summary: balance, due, past due, `Payment`, `Add charge`, and nothing else in the header.
     */
    summaryVariant?: "period" | "account";
};

/**
 * THE FINANCIALS CARD — what is owed, what happened, and what can be done about it.
 *
 * Three densities, ONE read model. Compact, summary and expanded differ in how much of the same
 * composed truth they show, never in what they compute — this component performs no financial
 * arithmetic at all. Every cents value, every period placement and every GL code arrives decided by
 * `buildFinancialsCardVM`, because a card that recomputed a balance would be a second answer to a
 * question the ledger already answers.
 *
 * ── WHAT IT REFUSES TO SHOW ──
 *
 * The read model reports facts the platform does not own — payments, autopay, payer splits — as
 * named unavailabilities rather than as zeroes. This card renders that absence as absence. A
 * "$0.00 paid" line would state something the platform cannot know, and a disabled payer filter
 * would advertise a model Financials does not have.
 *
 * ── SUBJECT, NOT HOUSEHOLD ──
 *
 * Attribution is `billable_source_type` → subject. An enrolled child's charge hangs off their
 * agreement (agreement → child), so the subject filter offers All plus each child. A pre-enrolment
 * fee hangs off the HOUSEHOLD (`customer`) and belongs to the account rather than to any one child —
 * it is never faked onto a sibling, which would put a family expense on one child's ledger.
 *
 * ── THE LIFECYCLE IS OPERABLE FROM HERE ──
 *
 * Add charge creates a DRAFT, and a draft is not owed. Posting is a separate authoritative step and
 * a posted charge is immutable, so each ledger row offers exactly the transition its lifecycle
 * admits: `Post` on a draft, `Reverse` on posted money that still stands. Both run registered
 * actions; this card decides nothing about money and refreshes from the read model rather than
 * patching a row it just changed.
 *
 * A charge is reversed ONCE. A reversed row reads `reversed` and offers nothing, and a correction
 * row is never itself reversed — the bound is the database's (`20260902140000`) and the read model
 * projects it, so this card renders the answer rather than deciding it.
 */
/**
 * ── TURNING TWO CANONICAL READS INTO TWO ROWS ────────────────────────────────────────────────
 *
 * Both of these are PRESENTATION. They choose words for answers the server already gave, per
 * child, and neither computes money, resolves specificity, or decides what applies to whom. Every
 * number they render was carried through from the read that produced it.
 *
 * They live at module scope so it is obvious they hold no state and can see no other source: a
 * summariser that could reach the view model is a summariser that can quietly substitute one
 * child's answer for another's, which is the exact defect the child grain exists to prevent.
 */

/** "Certa — Household", "Certb — Parent A 60% · Parent B 40%", "Certc — Not on record". */
function summariseResponsibilityPositions(body: unknown): Array<{ childLabel: string; summary: string }> {
    const positions = (body as {
        positions?: Array<{
            label?: string | null;
            authoredAtChild?: boolean;
            shares?: Array<{
                name?: string | null;
                method?: string | null;
                amountCents?: number | null;
                percentBasisPoints?: number | null;
            }>;
        }>;
    } | null)?.positions;
    if (!Array.isArray(positions)) return [];

    return positions.map((position) => {
        const shares = position.shares ?? [];
        /*
         * A CHILD COVERED BY THE HOUSEHOLD'S ARRANGEMENT SAYS SO. The route reports whether the
         * governing arrangement was authored at this child, and collapsing that distinction would
         * show inherited household money as though the child had been given it deliberately.
         */
        if (!position.authoredAtChild) {
            return { childLabel: position.label ?? "—", summary: shares.length > 0 ? "Household" : "Not on record" };
        }
        if (shares.length === 0) return { childLabel: position.label ?? "—", summary: "Not on record" };
        return {
            childLabel: position.label ?? "—",
            summary: shares
                .map((share) => {
                    const who = (share.name ?? "").trim() || "Unnamed";
                    if (share.method === "percentage" && share.percentBasisPoints != null) {
                        return `${who} ${share.percentBasisPoints / 100}%`;
                    }
                    if (share.method === "fixed" && share.amountCents != null) {
                        return `${who} $${(share.amountCents / 100).toFixed(2)}`;
                    }
                    if (share.method === "remainder") return `${who} remainder`;
                    return who;
                })
                .join(" · "),
        };
    });
}

/** The account's own arrangement in one line — what a charge-scoped override would depart from. */
function summariseHouseholdArrangement(body: unknown): string {
    const household = (body as {
        household?: {
            shares?: Array<{
                name?: string | null;
                method?: string | null;
                amountCents?: number | null;
                percentBasisPoints?: number | null;
            }>;
        } | null;
    } | null)?.household;
    const shares = household?.shares ?? [];
    if (shares.length === 0) return "The account has no standing arrangement.";
    return `The account's arrangement: ${shares
        .map((share) => {
            const who = (share.name ?? "").trim() || "Unnamed";
            if (share.method === "percentage" && share.percentBasisPoints != null) {
                return `${who} ${share.percentBasisPoints / 100}%`;
            }
            if (share.method === "fixed" && share.amountCents != null) {
                return `${who} $${(share.amountCents / 100).toFixed(2)}`;
            }
            if (share.method === "remainder") return `${who} remainder`;
            return who;
        })
        .join(" · ")}.`;
}

/**
 * "Certa — Sibling 10%", "Certb — None".
 *
 * The route answers BY POLICY, with the children each policy affects; the row asks by child. That
 * inversion is the whole job here, and it is why a child with no line in any policy must still
 * appear: a child silently missing from a per-child row reads as a child who was not considered.
 */
function summariseDiscountPositions(
    body: unknown,
    labelFor: (customerMemberId: string | null) => string | null,
): Array<{ childLabel: string; summary: string }> {
    const parsed = body as {
        policies?: Array<{
            label?: string | null;
            subjects?: Array<{ customerMemberId?: string | null; expectedCents?: number | null }>;
        }>;
        notExpected?: Array<{ opportunityCustomerMemberId?: string | null }>;
    } | null;
    const policies = parsed?.policies;
    if (!Array.isArray(policies)) return [];

    const byChild = new Map<string, { label: string; effects: string[] }>();
    for (const policy of policies) {
        for (const subject of policy.subjects ?? []) {
            const memberId = (subject.customerMemberId ?? "").trim();
            const label = labelFor(memberId || null) ?? "This child";
            const key = memberId || label;
            const entry = byChild.get(key) ?? { label, effects: [] };
            /*
             * THE POLICY'S NAME, NOT A RESTATEMENT OF ITS RULE. "Sibling discount" is what the
             * forecast called it; re-deriving "10%" from the expected amount and the basis would
             * be this card computing a rate the policy already states.
             */
            entry.effects.push((policy.label ?? "Discount").trim());
            byChild.set(key, entry);
        }
    }
    if (byChild.size === 0) return [];
    return [...byChild.values()].map((entry) => ({
        childLabel: entry.label,
        summary: entry.effects.length > 0 ? [...new Set(entry.effects)].join(" · ") : "None",
    }));
}

export default function FinancialsCard({
    model,
    context,
    receded = false,
    coordination,
    showDetailsAction = true,
    summaryVariant = "period",
}: Props) {
    const scope = context.participantScope ?? null;
    const scopedMemberId = scope?.customerMemberId ?? null;
    const customerId = householdIdFrom(context);
    /*
     * ── "NOT YET" IS NOT "NEVER" ────────────────────────────────────────────────────────────────
     *
     * The card had one way of having no subject, and said the same terminal sentence for both of
     * them: "No financial record." One is a household whose account genuinely cannot be resolved.
     * The other is the ordinary window while the panel's own truth is still composing — during which
     * the card holds no id, is not loading anything (there is nothing to load yet), and therefore
     * printed a verdict about an account it had not looked for.
     *
     * The context already answers this: `status` is `composing` until the subject is settled. So the
     * card asks the question it actually means — is the subject resolved yet — instead of inferring
     * it from the absence of an id.
     */
    const subjectStillResolving = context.status === "composing";
    /** Settled, and there is no account to ask about — the only state that may speak terminally. */
    const noFinancialSubject = !subjectStillResolving && !customerId && !scopedMemberId;

    const [vm, setVm] = useState<FinancialsCardVM | null>(null);
    /*
     * A REFUSAL IS NOT AN EMPTY ACCOUNT.
     *
     * The endpoint answers 403 with `required_permission` when the caller lacks `fin.read`, and this
     * card used to discard that and fall through to its empty state — telling an operator who may not
     * see the ledger that there is nothing to see. The root producer reports the refusal explicitly,
     * so the card can say what is actually true.
     */
    const [deniedRead, setDeniedRead] = useState(false);
    /**
     * WHICH ACCOUNT'S FULL MODEL IS LOADED — null while the card holds the root's bounded summary.
     *
     * The initial projection carries the account summary without `payments` or `ledgerPeriods`:
     * 16.6 KB of receipts and placed ledger that the summary never reads. Every surface that DOES
     * read them is an interaction, so opening one loads the full model from the endpoint that was
     * always its owner.
     */
    const deepLoadedForRef = useRef<string | null>(null);
    /**
     * WHICH SUBJECT A READ HAS ANSWERED FOR — not which one produced an account.
     *
     * `deepLoadedForRef` records a SUCCESSFUL deep read, so it cannot answer "has anyone asked about
     * this subject yet". That difference is what put a terminal sentence on a healthy account: see
     * `awaitingFirstAnswer` below.
     */
    const answeredKeyRef = useRef<string | null>(null);
    const [loading, setLoading] = useState(false);
    /*
     * ONE overlay at a time, and the Focus Panel's OWN depth layer renders it.
     *
     * `useReportPerspective(..., "focused")` is what raises this card into the centered, scrimmed
     * position the approved detail and command cards are drawn in — the same machinery Scheduling
     * already uses. Neither of these is a new page or a second modal system, and the scrim click /
     * ESC path comes back through `useDismissSignal` rather than a close button this card owns.
     */
    /*
     * ── FINANCIALS NAVIGATION IS A STACK, AND THE STACK IS WRITTEN DOWN ───────────────────────
     *
     * It used to be one `overlay` string plus a single-slot memory of where a command had been
     * raised from. That memory could hold exactly one answer, so it could only be right about the
     * simplest journey, and it recorded a KIND rather than a destination: dismissing a command
     * restored "detail", which remounted Details from scratch — a different Details, at the top of
     * an unfiltered ledger, with every disclosure closed.
     *
     * Worse, the row-level Adjust had no surface of its own and borrowed the Add command in
     * adjustment mode. Cancelling it therefore landed on the Add selector, a destination the
     * operator had never asked for. That is the wrong-return defect, and no amount of remembering
     * "the previous kind" fixes it, because the previous kind was never the problem: the previous
     * STATE was.
     *
     * So the stack is explicit and each entry carries what its surface needs. `push` goes deeper,
     * `pop` goes back exactly one level, and what "back" means is never inferred from whichever
     * component happened to render last.
     */
    /*
     * ── MULTI-CHILD ADD IS AN OPERATION, AND THIS IS THE SELECTION ────────────────────────────
     *
     * `subjectFilter` remains the ONE subject the command is anchored to — the attention context,
     * and the child a single Add bills. This holds the ADDITIONAL children the operator ticked.
     *
     * Kept separate rather than folded into one array because the two mean different things: the
     * anchor is where the operator already was, and these are a deliberate widening of it. Merging
     * them would make "which child is this panel about" unanswerable the moment the last checkbox
     * was cleared.
     */
    const [extraChildIds, setExtraChildIds] = useState<string[]>([]);
    const [stack, setStack] = useState<FinancialsSurface[]>([]);
    const surface = stack.length ? stack[stack.length - 1] : null;
    const overlay = surface?.kind ?? null;
    const push = useCallback((next: FinancialsSurface) => setStack((st) => [...st, next]), []);
    const pop = useCallback(() => setStack((st) => st.slice(0, -1)), []);

    /*
     * ── FOCUS RETURNS TO THE CONTROL THAT OPENED THE DEPTH CARD ───────────────────────────────
     *
     * The ownership doctrine says a dismissed depth card hands focus back to the control that
     * opened it; without that, Escape drops a keyboard operator on <body> and they restart from
     * the top of the page. The Accounts host keeps a ref, because there the gear and the card
     * live in one component. Here they do not: opening a depth card returns early, Details
     * unmounts, and the gear element is removed from the document — a ref would hold a node that
     * is no longer anywhere.
     *
     * So the opener records WHAT it opened from, as a selector, and the restore runs after
     * Details is back in the document. Same rule as Accounts, expressed the only way that
     * survives an unmount.
     */
    const adminFocusSelector = useRef<string | null>(null);
    const openAdmin = useCallback(
        (kind: "responsibility_admin" | "discount_admin" | "payments_admin", selector: string) => {
            adminFocusSelector.current = selector;
            push({ kind });
        },
        [push],
    );
    useEffect(() => {
        const selector = adminFocusSelector.current;
        /* Only once the depth card is actually gone, and only for the card that set it. */
        if (!selector || overlay === "responsibility_admin" || overlay === "discount_admin" || overlay === "payments_admin") {
            return;
        }
        adminFocusSelector.current = null;
        /* One frame, so the restored Details subtree exists to be queried. */
        const frame = requestAnimationFrame(() => {
            const gear = document.querySelector<HTMLElement>(selector);
            gear?.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [overlay]);
    const resetStack = useCallback(() => setStack([]), []);
    /*
     * ── ONE ENTRY, TWO OPERATIONS ─────────────────────────────────────────────────────────────
     *
     * A charge and an adjustment are different financial objects and the operator's job is the
     * same one: put a financial fact on this account. They had two unrelated entry points — one a
     * command, one a link under the ledger — so raising a credit meant knowing which of the two
     * Alloy files it under. The mode lives on the command, not on the surface.
     *
     * `adjustSource` binds a ledger row when the operator arrived from one, so a correction does
     * not make them rediscover the transaction they were just looking at.
     */
    const [entryMode, setEntryMode] = useState<"charge" | "adjustment">("charge");

    const expanded = overlay === "detail";

    /*
     * ── WHAT THE COMPACT ROWS SAY, EACH FROM THE AUTHORITY THAT OWNS ITS GRAIN ────────────────
     *
     * The first version of this built responsibility out of `vm.payers`, because that field means
     * responsibility and was already in hand. It is the right fact at the WRONG GRAIN: `payers`
     * names the parties on the ACCOUNT, and the row has to name each CHILD. Rendering the account
     * answer against a per-child label would have asserted one child's arrangement for a sibling
     * who may have their own — a claim about real money, made by a summary, from a convenience.
     *
     * So both rows read the canonical per-child answer, and neither is derived from the other:
     * responsibility says who owes, the discount position says what reduces the obligation, and a
     * summary that inferred one from the other would be stating a policy it never read.
     */
    const [adminPositions, setAdminPositions] = useState<{
        responsibility: Array<{ childLabel: string; summary: string }>;
        discounts: Array<{ childLabel: string; summary: string }>;
    }>({ responsibility: [], discounts: [] });
    const [adminPositionsLoading, setAdminPositionsLoading] = useState(false);
    /*
     * THE POLICIES THEMSELVES, kept from the same read rather than fetched again for Add Charge —
     * which needs their IDS to offer waiving one. Two fetches of one canonical answer would be two
     * answers the moment configuration changed between them.
     */
    const [expectedPolicies, setExpectedPolicies] = useState<Array<{ id: string; label: string }>>([]);
    /* What the ACCOUNT's standing arrangement says, so Add Charge can show what it would override. */
    const [standingResponsibilitySummary, setStandingResponsibilitySummary] = useState("Not on record");
    /*
     * THE RAW BODY OF THE DISCOUNT READ, kept so the depth card can paint real content on its
     * first frame. The compact row and the depth card ask the identical question of the identical
     * route; making the card ask again meant the operator pressed a gear and waited out a second
     * round trip for an answer this component was already holding.
     */
    const [discountPositionBody, setDiscountPositionBody] = useState<FamilyPosition | null>(null);

    useEffect(() => {
        if (!customerId) return;
        let cancelled = false;
        setAdminPositionsLoading(true);
        /*
         * CONCURRENT. Two independent questions of two independent authorities; asking them in
         * series doubles the time the rows say "Reading…" and buys nothing.
         */
        void Promise.all([
            fetch(`/api/admin/financials/responsibility-positions?customer_id=${encodeURIComponent(customerId)}`, {
                credentials: "include",
            })
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null),
            fetch(`/api/admin/financials/family-discount-position?customer_id=${encodeURIComponent(customerId)}`, {
                credentials: "include",
            })
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null),
        ]).then(([positionsBody, discountBody]) => {
            if (cancelled) return;
            setAdminPositionsLoading(false);

            const responsibility = summariseResponsibilityPositions(positionsBody);
            const discounts = summariseDiscountPositions(discountBody, (customerMemberId) =>
                (vm?.subjects ?? []).find((sub) => sub.customerMemberId === customerMemberId)?.displayName ?? null,
            );
            /*
             * A FAILED READ IS NOT AN ANSWER. Either half keeps its last truthful value rather
             * than falling back to "None", which an operator would read as "no discount applies".
             */
            setAdminPositions((prior) => ({
                responsibility: positionsBody ? responsibility : prior.responsibility,
                discounts: discountBody ? discounts : prior.discounts,
            }));

            if (discountBody) {
                setDiscountPositionBody(discountBody as FamilyPosition);
                const policies = (discountBody as { policies?: Array<{ policyId?: string | null; label?: string | null }> })
                    .policies ?? [];
                setExpectedPolicies(
                    policies
                        .map((policy) => ({ id: (policy.policyId ?? "").trim(), label: (policy.label ?? "Discount").trim() }))
                        .filter((policy) => policy.id.length > 0),
                );
            }
            if (positionsBody) {
                setStandingResponsibilitySummary(summariseHouseholdArrangement(positionsBody));
            }
        });
        return () => {
            cancelled = true;
        };
        /*
         * `vm?.subjects` is READ inside, to name a child the discount route identifies by id. It is
         * in the list so a card that resolves its subjects after this read re-labels rather than
         * leaving the discount row naming ids.
         */
    }, [customerId, vm?.subjects]);

    /*
     * ── EVERY CHILD THE ACCOUNT MAY ARRANGE FOR ───────────────────────────────────────────────
     *
     * Read when the responsibility depth card opens, not on every card open: the ledger does not
     * need it. This fetch used to live in Details, next to the editor it fed. The editor moved to
     * depth and the fetch has to follow it — a panel handed no member options can only arrange at
     * household grain, which silently retires child-scoped responsibility rather than declaring it.
     */
    const [responsibilityScopeMembers, setResponsibilityScopeMembers] = useState<
        { customerMemberId: string; label: string }[]
    >([]);
    useEffect(() => {
        if (overlay !== "responsibility_admin" || !customerId || responsibilityScopeMembers.length > 0) return;
        let cancelled = false;
        void fetch(`/api/admin/financials/responsibility-scopes?customer_id=${encodeURIComponent(customerId)}`, {
            credentials: "include",
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((body: { members?: { customerMemberId: string; label: string }[] } | null) => {
                if (!cancelled && body?.members) setResponsibilityScopeMembers(body.members);
            })
            .catch(() => {
                /* The card still arranges the household; it simply cannot offer a child. */
            });
        return () => {
            cancelled = true;
        };
    }, [overlay, customerId, responsibilityScopeMembers.length]);

    /*
     * ── THE DETAILS VIEW BELONGS TO THE CARD, NOT TO THE DETAILS COMPONENT ────────────────────
     *
     * Lens, period disclosure and scroll position lived inside the surface that displays them, so
     * they died with it every time a command took the screen. Held here, they outlive any number
     * of command round trips, which is what "Details exactly as it was" has to mean.
     */
    const [detailLens, setDetailLens] = useState<AccountLens | null>(null);
    const [expandedPeriods, setExpandedPeriods] = useState<Record<string, boolean>>({});
    const detailScrollRef = useRef(0);
    const [subjectFilter, setSubjectFilter] = useState<string>("all");
    const [running, setRunning] = useState(false);
    const [commandError, setCommandError] = useState<string | null>(null);


    const [chargeAmount, setChargeAmount] = useState("");
    const [chargeNote, setChargeNote] = useState("");
    const [chargeEventDate, setChargeEventDate] = useState("");
    const [pending, setPending] = useState<{
        templateId: string;
        label: string;
        summary: string;
        changes: string[];
    } | null>(null);

    /*
     * THE CHARGE A PAYMENT IS BEING RECORDED AGAINST.
     *
     * `payment.record` records money AND applies it in one act, so it needs the obligation it
     * settles. The amount starts at what that row still owes — the read model's own
     * `outstandingCents`, not arithmetic done here — and the operator may reduce it for a partial
     * payment. The service and the allocation bounds trigger remain the authority on what is
     * acceptable; this only opens the conversation.
     */
    const [payTarget, setPayTarget] = useState<{
        chargeId: string;
        label: string;
        outstandingCents: number;
        /** The charge's own child, when it has one. A household charge has none. */
        subjectMemberId: string | null;
    } | null>(null);
    const [payAmount, setPayAmount] = useState<string>("");
    const [payMethod, setPayMethod] = useState<string>("cash");
    /*
     * WHOSE MONEY THIS IS — asked, never inferred.
     *
     * The record path wrote no payer at all, so every cash payment on every account was money from
     * nobody. `payments.payer_entity_type` / `payer_entity_id` have existed since Thread 6 and
     * `payment.record` already accepts them; the operator was simply never given a way to say. The
     * empty string means "not stated", which stays a legitimate answer: a cheque arriving in the
     * post with no name on it is better recorded as unattributed than as a guess.
     */
    const [payPayerPersonId, setPayPayerPersonId] = useState<string>("");
    /**
     * THE REFUND THE OPERATOR IS COMPOSING.
     *
     * One canonical capability with an amount intent, not two actions: full and partial both commit
     * `payment.refund`, and the amount is the only thing that differs. It opens at the full
     * remaining refundable figure so the common case is one click, and the operator may reduce it.
     */
    const [refundTarget, setRefundTarget] = useState<{
        paymentId: string;
        label: string;
        receivedCents: number;
        refundedCents: number;
        refundableCents: number;
        currencyCode: string;
    } | null>(null);
    const [refundAmount, setRefundAmount] = useState<string>("");
    const [refundError, setRefundError] = useState<string | null>(null);
    /*
     * CARD IS COLLECTED, NOT RECORDED — and that distinction is the whole of this state.
     *
     * `payment.record` writes down money that already arrived. Choosing Card used to call it, which
     * recorded a payment nobody had collected: the balance fell and no card was ever charged. Card
     * now runs `payment.collect_card`, and everything below tracks the interval between asking and
     * being paid, which `payment.record` has never had because cash has no such interval.
     */
    const [cardStage, setCardStage] = useState<
        "idle" | "blocked" | "entry" | "finalizing" | "recognized" | "failed"
    >("idle");
    const [cardMessage, setCardMessage] = useState<string | null>(null);
    const [cardCollection, setCardCollection] = useState<{
        clientSecret: string;
        connectedAccount: string;
        attemptId: string;
        amountCents: number;
    } | null>(null);

    /*
     * The card asks for the WHOLE account and filters in the client.
     *
     * Scoping the request to one child would make the subject filter a network round trip per
     * selection and — worse — would make "All" unanswerable without a second shape of request. The
     * account is small (one household's charges), the filter is presentation, and the totals below
     * are still the server's.
     */
    /*
     * THE ANSWER TO THE QUESTION STILL BEING ASKED.
     *
     * Attendance and Health each bind a returning response to the child it was requested for, and
     * this card had no equivalent: it applied whichever response arrived LAST BY WALL CLOCK. Clearing
     * `vm` on subject change stops the previous balance from lingering, but it cannot stop a slow
     * earlier response from landing on top of a newer one afterwards.
     *
     * Reproduced in the browser by holding one in-flight request, letting a later one resolve, then
     * releasing the first: the stale body replaced the current one.
     *
     * A SEQUENCE, not an account comparison. The sibling cards compare a participant id because their
     * responses are scoped to one child. This account is the HOUSEHOLD's — the same `customer_id`
     * legitimately serves several queue rows, so an account check would admit exactly the stale
     * overwrite reproduced above. Comparing the request's own ordinal answers the real question —
     * "is this still the request whose answer we are waiting for" — and covers the cross-household
     * case as a consequence rather than as a second rule.
     *
     * Local to the card: a ref and a comparison. No shared coordinator, no cancellation plumbing, and
     * a superseded response is simply dropped rather than cancelled, so nothing else changes.
     */
    const requestSeq = useRef(0);
    /*
     * ── THE REQUEST'S OWN IDENTITY, WHICH IS NOT THE SAME AS ITS INPUTS ──────────────────────────
     *
     * Measured on Firefly: this card issued `financials/card?customer_id=50b19065…` TWICE per Work
     * Unit entry, and they were the two slowest requests in the sample. One mounted instance, no
     * remount — proven with a mount counter and a per-request correlation header, because the DOM
     * card-role counts that suggested a second instance were three roles across six cards.
     *
     * The cause is that `load` depended on `[customerId, scopedMemberId]` while the request it
     * builds depends on the FIRST of them that is present. The participant resolves after the
     * household, so `scopedMemberId` went `null → a227e460…`, `load`'s identity changed, the mount
     * effect re-ran — and produced a byte-identical request, because `customerId` had won the
     * ternary both times.
     *
     * Keying on the composed query is therefore not a cache and not a dedupe layer: it is this
     * effect depending on what it actually sends. An input change that cannot change the request no
     * longer re-issues it, and a change that CAN (the member-scoped branch, when no household is
     * present) still does.
     */
    const requestQuery = useMemo(() => {
        if (customerId) return `customer_id=${encodeURIComponent(customerId)}`;
        if (scopedMemberId) return `customer_member_id=${encodeURIComponent(scopedMemberId)}`;
        return null;
    }, [customerId, scopedMemberId]);

    const load = useCallback(async () => {
        if (!requestQuery) {
            requestSeq.current += 1;
            setVm(null);
            return;
        }
        const answeringKey = customerId ?? scopedMemberId ?? null;
        const seq = (requestSeq.current += 1);
        const current = () => seq === requestSeq.current;
        setLoading(true);
        try {
            const query = requestQuery;
                const res = await fetch(`/api/admin/financials/card?${query}`, { credentials: "include" });
            const json = (await res.json()) as { ok?: boolean; vm?: FinancialsCardVM };
            if (!current()) return;
            const fresh = json?.ok && json.vm ? json.vm : null;
            // The endpoint's answer is the FULL model; record which account now has it.
            if (fresh) deepLoadedForRef.current = customerId ?? scopedMemberId;
            setVm(fresh);
        } catch {
            if (!current()) return;
            setVm(null);
        } finally {
            // A superseded request must not clear the spinner belonging to the one that replaced it.
            if (current()) {
                /*
                 * THIS SUBJECT HAS NOW BEEN ANSWERED — whatever the answer was. Recorded before the
                 * spinner clears, because the frame after `setLoading(false)` is exactly the one
                 * that decides between "still reading" and "no account".
                 */
                answeredKeyRef.current = answeringKey;
                setLoading(false);
            }
        }
    }, [customerId, requestQuery, scopedMemberId]);

    /*
     * ── MOVING MONEY BETWEEN OBLIGATIONS ─────────────────────────────────────────────────────────
     *
     * A Move is deliberately TWO governed actions: reverse the application, then apply the freed
     * money to the chosen charge. It is not atomic and is not pretended to be — if the second step
     * refuses, the first stays committed and the money is genuinely unapplied, which is a true state
     * the operator can act on. `moveNotice` exists to say exactly that rather than "Move failed",
     * which would imply the original application survived.
     */
    type MoveTarget = { chargeId: string; label: string; serviceDate: string | null; outstandingCents: number };
    const [movePending, setMovePending] = useState<{ paymentId: string; allocationId: string } | null>(null);
    const [applyPending, setApplyPending] = useState<{ paymentId: string } | null>(null);
    const [moveTargets, setMoveTargets] = useState<MoveTarget[]>([]);
    const [moveTargetId, setMoveTargetId] = useState("");
    const [moveReason, setMoveReason] = useState("");

    /*
     * MANUAL ADJUSTMENTS.
     *
     * `billing.adjust_account` is scoped to an ENROLMENT AGREEMENT, not to the account, so the panel
     * carries the agreement it is about rather than letting the operator believe this is
     * account-wide. `adjustAgreementId` is that scope.
     */
    const [adjustOpen, setAdjustOpen] = useState(false);
    const [adjustAgreementId, setAdjustAgreementId] = useState("");
    /* WHICH OBLIGATION this reduces. A credit that names nothing reduces nothing — see below. */
    const [adjustSourceChargeId, setAdjustSourceChargeId] = useState("");
    const [adjustCategory, setAdjustCategory] = useState<"credit" | "adjustment">("credit");
    const [adjustDirection, setAdjustDirection] = useState<"decrease" | "increase">("decrease");
    const [adjustAmount, setAdjustAmount] = useState("");
    const [adjustReason, setAdjustReason] = useState("");
    const [adjustEffectiveDate, setAdjustEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [adjustPreview, setAdjustPreview] = useState<{ summary: string; changes: string[] } | null>(null);
    const [adjustError, setAdjustError] = useState<string | null>(null);
    const [reversePending, setReversePending] = useState<{ applicationId: string } | null>(null);
    const [reverseReason, setReverseReason] = useState("");
    const [reversePreview, setReversePreview] = useState<{ summary: string; changes: string[] } | null>(null);
    const [reverseError, setReverseError] = useState<string | null>(null);
    const [adjustNotice, setAdjustNotice] = useState<string | null>(null);

    /* Reversing a posted charge is a correction to money already told to a family: it previews first. */
    const [reverseCharge, setReverseCharge] = useState<{ chargeId: string; label: string } | null>(null);
    const [reverseChargePreview, setReverseChargePreview] = useState<{ summary: string; changes: string[] } | null>(null);
    const [responsibilityPreview, setResponsibilityPreview] = useState<{ summary: string; changes: string[] } | null>(null);
    const [responsibilityError, setResponsibilityError] = useState<string | null>(null);
    /* Reallocation moves what one person owes another, so the authority demands a stated reason. */
    const [reallocationReason, setReallocationReason] = useState("");
    const [reverseChargeError, setReverseChargeError] = useState<string | null>(null);

    const [movePreview, setMovePreview] = useState<{ summary: string; changes: string[] } | null>(null);
    const [moveError, setMoveError] = useState<string | null>(null);
    const [moveNotice, setMoveNotice] = useState<string | null>(null);

    const closeMovePanels = useCallback(() => {
        setMovePending(null);
        setApplyPending(null);
        setMoveTargets([]);
        setMoveTargetId("");
        setMoveReason("");
        setMovePreview(null);
        setMoveError(null);
    }, []);

    /** Targets come from the server resolver; the panel never assembles charges itself. */
    const loadMoveTargets = useCallback(async (paymentId: string, excludeChargeId?: string | null) => {
        setMoveTargets([]);
        try {
            const q = new URLSearchParams({ payment_id: paymentId });
            if (excludeChargeId) q.append("exclude_charge_id", excludeChargeId);
            const res = await fetch(`/api/admin/financials/eligible-target-charges?${q.toString()}`, {
                credentials: "include",
            });
            const json = (await res.json()) as { ok?: boolean; charges?: MoveTarget[]; error?: string };
            if (!json?.ok) {
                setMoveError(json?.error || "Charges to apply this payment to could not be loaded.");
                return;
            }
            setMoveTargets(json.charges ?? []);
        } catch {
            setMoveError("Charges to apply this payment to could not be loaded.");
        }
    }, []);

    const openMovePayment = useCallback(
        (args: { paymentId: string; allocationId: string }) => {
            closeMovePanels();
            setMovePending(args);
            const source = vm?.payments
                .find((p) => p.paymentId === args.paymentId)
                ?.applications.find((a) => a.allocationId === args.allocationId);
            void loadMoveTargets(args.paymentId, source?.chargeId ?? null);
        },
        [closeMovePanels, loadMoveTargets, vm],
    );

    const openApplyPayment = useCallback(
        (args: { paymentId: string }) => {
            closeMovePanels();
            setApplyPending(args);
            void loadMoveTargets(args.paymentId, null);
        },
        [closeMovePanels, loadMoveTargets],
    );

    const actionEntity = useCallback(
        () => ({
            entity_type: context.subject?.type ?? "opportunity",
            entity_id: context.subject?.id ?? "",
        }),
        [context.subject?.id, context.subject?.type],
    );

    /* The preview is the ACTION's. Nothing about the consequence is reconstructed here. */
    const previewMove = useCallback(async () => {
        if (!movePending || running) return;
        setRunning(true);
        setMoveError(null);
        try {
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action_key: "payment.reverse_application",
                    ...actionEntity(),
                    mode: "preview",
                    payload: { allocation_id: movePending.allocationId, reason: moveReason },
                }),
            });
            const json = (await res.json()) as {
                ok?: boolean;
                error?: string | { message?: string };
                data?: { execution_result?: { preview?: { summary?: string; changes?: string[] } } };
            };
            const p = json?.data?.execution_result?.preview;
            if (!json?.ok || !p?.summary) {
                const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                setMoveError(err || "This move could not be previewed.");
                return;
            }
            setMovePreview({ summary: p.summary, changes: p.changes ?? [] });
        } catch {
            setMoveError("The preview could not be requested.");
        } finally {
            setRunning(false);
        }
    }, [actionEntity, movePending, moveReason, running]);

    const runAction = useCallback(
        async (actionKey: string, payload: Record<string, unknown>) => {
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action_key: actionKey,
                    ...actionEntity(),
                    mode: "execute",
                    confirmation: { confirmed: true },
                    payload,
                }),
            });
            const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string } };
            if (!json?.ok) {
                const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                throw new Error(err || "The action was refused.");
            }
        },
        [actionEntity],
    );

    const confirmMove = useCallback(async () => {
        if (!movePending || !moveTargetId || running) return;
        setRunning(true);
        setMoveError(null);
        setMoveNotice(null);
        const target = moveTargets.find((t) => t.chargeId === moveTargetId);
        try {
            await runAction("payment.reverse_application", {
                allocation_id: movePending.allocationId,
                reason: moveReason,
            });
        } catch (e) {
            // Nothing has changed yet; the original application is untouched.
            setMoveError(e instanceof Error ? e.message : String(e));
            setRunning(false);
            return;
        }
        /*
         * THE REVERSAL IS COMMITTED FROM HERE ON. If the apply refuses, the money is unapplied and
         * stays that way; saying "Move failed" would tell the operator the opposite of what is true.
         */
        try {
            await runAction("payment.apply_to_charge", {
                payment_id: movePending.paymentId,
                charge_id: moveTargetId,
            });
            setMoveNotice(
                `Moved to ${target?.label ?? "the selected charge"}. The payment itself is unchanged.`,
            );
            closeMovePanels();
        } catch (e) {
            setMovePending(null);
            setMovePreview(null);
            setMoveNotice(
                "The original application was reversed, so that money is now unapplied and can be applied to another charge. "
                + `It was not applied to ${target?.label ?? "the selected charge"}: `
                + (e instanceof Error ? e.message : String(e)),
            );
        } finally {
            setRunning(false);
            await load();
        }
    }, [closeMovePanels, load, movePending, moveReason, moveTargetId, moveTargets, runAction, running]);

    const confirmApply = useCallback(async () => {
        if (!applyPending || !moveTargetId || running) return;
        setRunning(true);
        setMoveError(null);
        setMoveNotice(null);
        const target = moveTargets.find((t) => t.chargeId === moveTargetId);
        try {
            await runAction("payment.apply_to_charge", {
                payment_id: applyPending.paymentId,
                charge_id: moveTargetId,
            });
            setMoveNotice(`Applied to ${target?.label ?? "the selected charge"}.`);
            closeMovePanels();
        } catch (e) {
            setMoveError(e instanceof Error ? e.message : String(e));
        } finally {
            setRunning(false);
            await load();
        }
    }, [applyPending, closeMovePanels, load, moveTargetId, moveTargets, runAction, running]);

    /*
     * ── THE ONE PLACE A SIGN IS DECIDED ──────────────────────────────────────────────────────────
     *
     * The canonical amount is SIGNED: negative lowers what the family owes. Operators do not think
     * in signed cents, and asking them to would make a typo into a charge. So the panel takes an
     * unsigned amount plus an intent, and the conversion happens here, once. Nothing else in this
     * component multiplies by −1, and nothing infers the category from the sign.
     *
     * A CREDIT only ever lowers an obligation — that is what the word means — so it has no direction
     * control and cannot be used to raise one. An ADJUSTMENT is the category that goes either way,
     * and it must say which out loud.
     */
    const adjustSignedCents = useCallback((): number | null => {
        const entered = Number.parseFloat(adjustAmount.replace(/[$,\s]/g, ""));
        if (!Number.isFinite(entered) || entered <= 0) return null;
        const cents = Math.round(entered * 100);
        if (cents === 0) return null;
        const raises = adjustCategory === "adjustment" && adjustDirection === "increase";
        return raises ? cents : -cents;
    }, [adjustAmount, adjustCategory, adjustDirection]);

    const closeAdjustPanels = useCallback(() => {
        setAdjustOpen(false);
        setReversePending(null);
        setAdjustPreview(null);
        setReversePreview(null);
        setAdjustError(null);
        setReverseError(null);
        setAdjustAmount("");
        setAdjustReason("");
        setAdjustSourceChargeId("");
        setReverseReason("");
    }, []);

    /** The agreements this account's money can be adjusted against, named for the operator. */
    const adjustableSubjects = useMemo(
        () => (vm?.subjects ?? []).filter((sub) => sub.agreementId),
        [vm],
    );

    /**
     * The obligations this reduction could be against.
     *
     * A reduction attaches to what it reduces through `source_charge_id`, and every authority that
     * asks what a charge still owes nets it that way. A credit written without one appears on the
     * ledger's signed total — so the family looks like they owe less — while the obligation it was
     * meant to reduce is untouched and remains fully collectible. Two readings of the same
     * household, one of them wrong, which is what the representative-household oracle found.
     *
     * Only the selected child's own posted obligations are offered: a reduction is netted against an
     * enrolment-backed charge, and a correction or a credit is not an obligation to reduce.
     */
    const adjustableCharges = useMemo(() => {
        const member = adjustableSubjects.find((sub) => sub.agreementId === adjustAgreementId)?.customerMemberId;

        /*
         * HOW MUCH OF EACH OBLIGATION IS STILL THERE TO REDUCE.
         *
         * A reduction may not take more than the charge holds: the service refuses it, because an
         * obligation netted below zero is one `resolveAllocatableNet` will not read. Offering a
         * charge with nothing left would be offering a choice that can only be refused, so what is
         * already reduced is subtracted here — from the reductions the account read already carries,
         * not from a second sum of our own.
         */
        const reducedBySource = new Map<string, number>();
        for (const r of vm?.reductions ?? []) {
            if (!r.sourceChargeId) continue;
            reducedBySource.set(r.sourceChargeId, (reducedBySource.get(r.sourceChargeId) ?? 0) + r.amountCents);
        }

        return (vm?.rows ?? []).filter(
            (r) =>
                r.status === "posted"
                && r.amountCents > 0
                && !r.correctsChargeId
                && !r.reversedByChargeId
                && r.subjectMemberId != null
                && r.subjectMemberId === member
                && r.amountCents + (reducedBySource.get(r.chargeId) ?? 0) > 0,
        );
    }, [adjustAgreementId, adjustableSubjects, vm]);

    const openAddAdjustment = useCallback(() => {
        closeMovePanels();
        closeAdjustPanels();
        setAdjustNotice(null);
        /*
         * Default to the enrolment already in view. When the card is narrowed to one child that is
         * unambiguous; with the account as a whole it is only a default, and the panel still shows
         * which agreement is about to be adjusted.
         */
        const scoped = adjustableSubjects.find((sub) => sub.customerMemberId === subjectFilter);
        setAdjustAgreementId(scoped?.agreementId ?? adjustableSubjects[0]?.agreementId ?? "");
        setAdjustSourceChargeId("");
        setAdjustOpen(true);
    }, [adjustableSubjects, closeAdjustPanels, closeMovePanels, subjectFilter]);

    /**
     * ── ADJUST, FROM THE ROW IT IS ABOUT ────────────────────────────────────────────────────────
     *
     * The operator is already looking at the transaction. Sending them to Add, then to the
     * Adjustment mode, then to an enrolment select, then to a charge select to find the SAME row
     * again is asking them to re-enter a context they never left — and every one of those steps is
     * a chance to bind the reduction to the wrong obligation, which is the failure that makes a
     * household read as owing less while the obligation stays fully collectible.
     *
     * So this is not a second adjustment surface and not a second writer. It opens the one unified
     * command in Adjustment mode with the source transaction ALREADY BOUND; `billing.adjust_account`
     * remains the only thing that writes. The enrolment is derived from the charge rather than
     * defaulted, because a charge knows which child it belongs to and the operator should not have
     * to tell us something the row already says.
     */
    const openAdjustForCharge = useCallback((args: { chargeId: string }) => {
        closeMovePanels();
        closeAdjustPanels();
        setAdjustNotice(null);
        const row = (vm?.rows ?? []).find((r) => r.chargeId === args.chargeId);
        const agreementId =
            adjustableSubjects.find((sub) => sub.customerMemberId === row?.subjectMemberId)?.agreementId
            ?? adjustableSubjects[0]?.agreementId
            ?? "";
        setAdjustAgreementId(agreementId);
        setAdjustSourceChargeId(args.chargeId);
        setAdjustOpen(true);
        setEntryMode("adjustment");
        push({ kind: "adjust_charge", chargeId: args.chargeId });
    }, [adjustableSubjects, closeAdjustPanels, closeMovePanels, vm]);

    const openReverseAdjustment = useCallback((args: { applicationId: string }) => {
        closeMovePanels();
        closeAdjustPanels();
        setAdjustNotice(null);
        setReversePending(args);
    }, [closeAdjustPanels, closeMovePanels]);

    /** The preview is the ACTION's. Nothing about the consequence is reconstructed here. */
    const previewAdjustment = useCallback(async () => {
        const amountCents = adjustSignedCents();
        if (!adjustOpen || running || amountCents === null) return;
        setRunning(true);
        setAdjustError(null);
        try {
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action_key: "billing.adjust_account",
                    ...actionEntity(),
                    mode: "preview",
                    payload: {
                        enrollment_agreement_id: adjustAgreementId,
                        source_charge_id: adjustSourceChargeId,
                        charge_category: adjustCategory,
                        amount_cents: amountCents,
                        reason: adjustReason,
                        effective_date: adjustEffectiveDate,
                    },
                }),
            });
            const json = (await res.json()) as {
                ok?: boolean;
                error?: string | { message?: string };
                data?: { execution_result?: { preview?: { summary?: string; changes?: string[] } } };
            };
            const p = json?.data?.execution_result?.preview;
            if (!json?.ok || !p?.summary) {
                const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                setAdjustError(err || "This adjustment could not be previewed.");
                return;
            }
            setAdjustPreview({ summary: p.summary, changes: p.changes ?? [] });
        } catch (e) {
            setAdjustError(e instanceof Error ? e.message : String(e));
        } finally {
            setRunning(false);
        }
    }, [actionEntity, adjustAgreementId, adjustCategory, adjustEffectiveDate, adjustOpen, adjustReason, adjustSignedCents, adjustSourceChargeId, running]);

    const confirmAdjustment = useCallback(async () => {
        const amountCents = adjustSignedCents();
        if (!adjustOpen || running || !adjustPreview || amountCents === null) return;
        setRunning(true);
        setAdjustError(null);
        try {
            await runAction("billing.adjust_account", {
                enrollment_agreement_id: adjustAgreementId,
                source_charge_id: adjustSourceChargeId,
                charge_category: adjustCategory,
                amount_cents: amountCents,
                reason: adjustReason,
                effective_date: adjustEffectiveDate,
            });
            /*
             * The action writes a DRAFT charge. What the family owes has not moved yet, and saying
             * it had would be the one thing this panel must never do.
             */
            setAdjustNotice(
                amountCents < 0
                    ? "Recorded as a draft credit. It lowers what the family owes once it is posted."
                    : "Recorded as a draft adjustment. It raises what the family owes once it is posted.",
            );
            closeAdjustPanels();
        } catch (e) {
            setAdjustError(e instanceof Error ? e.message : String(e));
        } finally {
            setRunning(false);
            await load();
        }
    }, [adjustAgreementId, adjustCategory, adjustEffectiveDate, adjustOpen, adjustPreview, adjustReason, adjustSignedCents, adjustSourceChargeId, closeAdjustPanels, load, runAction, running]);

    const previewReversal = useCallback(async () => {
        if (!reversePending || running) return;
        setRunning(true);
        setReverseError(null);
        try {
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action_key: "billing.reverse_adjustment",
                    ...actionEntity(),
                    mode: "preview",
                    payload: { application_id: reversePending.applicationId, reason: reverseReason },
                }),
            });
            const json = (await res.json()) as {
                ok?: boolean;
                error?: string | { message?: string };
                data?: { execution_result?: { preview?: { summary?: string; changes?: string[] } } };
            };
            const p = json?.data?.execution_result?.preview;
            if (!json?.ok || !p?.summary) {
                const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                setReverseError(err || "This reversal could not be previewed.");
                return;
            }
            setReversePreview({ summary: p.summary, changes: p.changes ?? [] });
        } catch (e) {
            setReverseError(e instanceof Error ? e.message : String(e));
        } finally {
            setRunning(false);
        }
    }, [actionEntity, reversePending, reverseReason, running]);

    const confirmReversal = useCallback(async () => {
        if (!reversePending || running || !reversePreview) return;
        setRunning(true);
        setReverseError(null);
        try {
            await runAction("billing.reverse_adjustment", {
                application_id: reversePending.applicationId,
                reason: reverseReason,
            });
            // The original is untouched on purpose; what changed is that its opposite now exists.
            setAdjustNotice("Reversed. The original adjustment stays on the record, with its opposite beside it.");
            closeAdjustPanels();
        } catch (e) {
            setReverseError(e instanceof Error ? e.message : String(e));
        } finally {
            setRunning(false);
            await load();
        }
    }, [closeAdjustPanels, load, reversePending, reversePreview, reverseReason, runAction, running]);




    /*
     * THE ROOT PROVISIONED THIS ACCOUNT. The card renders it.
     *
     * This used to `fetch(/api/admin/financials/card)` on mount. The financials producer now runs
     * inside the root provisioning lifecycle, under the SAME `fin.read` gate the endpoint applies,
     * so the projection arrives already refused if this operator may not see the ledger.
     *
     * ── THE STALE GUARANTEE IS STRONGER HERE, NOT WEAKER ──
     *
     * `requestSeq` exists because a slow earlier response could land on top of a newer one — A → B
     * → C with A resolving last, reproduced in the browser. The initial read no longer has a request
     * of its own to lose that race with: the projection arrives WITH the answer whose subject it
     * belongs to, and the root lifecycle already drops superseded answers wholesale.
     *
     * `requestSeq` stays for `load()`, which is the RELOAD after a financial action — an interaction,
     * not a bootstrap, and still capable of racing itself.
     */
    const provisioned = context.operationalProjection?.cards?.financials ?? null;

    /*
     * Missing projection is PROVISIONING — but only where a projection is actually coming. A host
     * that supplies none is answered by the self-bootstrap below, and calling that state
     * "provisioning" is what kept the workspace summary pending forever.
     */
    const provisioningAccount =
        context.operationalProjection != null
        && (customerId != null || scopedMemberId != null)
        && provisioned == null;

    /*
     * ── S3-2: CLEAR THE DATA, KEEP THE FOOTPRINT ────────────────────────────────────────────────
     *
     * Clearing below is correct and stays: a previous household's balance must never linger under
     * the next subject's name. What was wrong was the GEOMETRY of that clear. Frame-sampled on
     * Firefly across one subject switch, this card went 409px → 69px → 409px — it was the only
     * audited card that collapsed, and the ~340px round trip shoved every card beneath it down and
     * back while the account loaded.
     *
     * The Focus Panel already has a reserved-geometry contract for exactly this transition
     * (`FOCUS_PANEL_RESERVED_MIN_HEIGHT`, the floor `ReservedSettlementRegion` reserves). This card
     * adopts it, and reserves its OWN last loaded footprint when it has one — geometry is not data,
     * so remembering how much room the card occupied leaks nothing about the previous account, and
     * it adapts per subject instead of freezing one height for every account. The shared token is
     * the floor for the first load, where there is nothing to remember yet.
     *
     * A genuinely different next subject still resizes the card once, on arrival. That is honest;
     * the artificial collapse to a one-line loader in between is what this removes.
     */
    const shellRef = useRef<HTMLDivElement | null>(null);
    const loadedHeightRef = useRef<number | null>(null);
    useEffect(() => {
        if (!vm || !shellRef.current) return;
        const h = Math.round(shellRef.current.getBoundingClientRect().height);
        if (h > 0) loadedHeightRef.current = h;
    }, [vm]);

    /*
     * ── RECONCILIATION: WHAT THE RESERVE IS FOR ─────────────────────────────────────────────────
     *
     * The reserve was written as `!vm`, when the only way to have no vm was to be loading one. The
     * root lifecycle gave this card three further answers that also carry no vm — a permission
     * refusal, no resolvable subject, and no account — and each of those is a SETTLED sentence the
     * card is entitled to render at its own size. Reserving through them would pad a card that has
     * finished, which is the failure the sibling cards were corrected for in the same programme.
     *
     * So the reserve tracks exactly the condition under which this card says "Loading the account…",
     * and nothing else. Both intents survive: the collapse is still removed while the account
     * resolves, and staging's new answers are still allowed to be answers.
     */
    /*
     * ── A SUBJECT NOBODY HAS ANSWERED FOR IS NOT AN ABSENT ACCOUNT ─────────────────────────────
     *
     * Measured on the deployed build, Financials → Accounts, a healthy household:
     *
     *   +4452ms  h=93  stats=3  "CURRENT BALANCE — Reading the account…"
     *   +4687ms  h=67  stats=0  "Financial account unavailable"        ← for 235ms
     *   +4707ms  h=93  stats=3  "… Reading the account…"
     *   +7035ms  h=93  stats=3  "$0.00  DUE $0.00  PAST DUE None  Payment Add"
     *
     * The card told an operator the account was unavailable, took it back a fifth of a second
     * later, and then showed them the account. On a financial surface that sentence is a verdict,
     * and it was wrong.
     *
     * The cause is a gap, not a race in the read: "no account" was inferred from `!vm && !loading`,
     * and on a host that bootstraps its own read there is a paint where the subject is chosen, `vm`
     * is cleared, and `load()` has not started yet — so `loading` is still false. Nobody has asked
     * about this subject; that is not the same as having asked and been told there is nothing.
     *
     * `answeredKeyRef` is what closes it: set in `load()`'s `finally`, for the key that was
     * requested, whatever the answer was. Before an answer the card waits; after an answer with no
     * account, "unavailable" is still reached and still correct.
     */
    const subjectKey = customerId ?? scopedMemberId ?? null;
    const awaitingFirstAnswer = subjectKey != null && answeredKeyRef.current !== subjectKey;

    const reservingAccount =
        !vm && !deniedRead && (loading || subjectStillResolving || provisioningAccount || awaitingFirstAnswer);

    /*
     * ── A FLOOR IS FOR A COLLAPSE, AND THE ACCOUNT VARIANT NO LONGER COLLAPSES ──────────────────
     *
     * Measured in Financials → Accounts → selected account: the pane committed at 120px and then
     * SHRANK to 93px 1.4 seconds later, when the read landed. 120px is `FOCUS_PANEL_RESERVED_MIN_
     * HEIGHT` exactly — 7.5rem — so the shift was not the data arriving. It was this floor, held
     * under a frame that did not need one and was 27px shorter than the floor reserving for it.
     *
     * The floor was introduced for the Focus Panel's subject switch, where the card genuinely went
     * 409px → 69px → 409px because its loading state was a one-line loader. The account variant's
     * loading state is `AccountSummaryPending` — the SAME three metrics over the same two commands
     * as the resolved summary — so its pending frame is already the right shape and already the
     * right height. Reserving a different one is how a stable anatomy acquires a visible jump.
     *
     * So the floor now applies where a collapse is actually possible, and the variant that commits
     * its anatomy up front is trusted to hold its own geometry. The Focus Panel path is untouched.
     */
    const reservesFootprint = reservingAccount && summaryVariant !== "account";

    /*
     * ── A BOUNDED SUMMARY IS NOT A LEDGER ──────────────────────────────────────────────────────
     *
     * The card is seeded from the operational projection, which is the BOUNDED summary by
     * construction — enough rows to state a position, not the account's history. Details rendered
     * those same rows, so opening it on a subject whose projection carried two rows showed a
     * complete-looking ledger of two transactions, which the deep read then replaced with fifty-six.
     * Two real-looking rows presented as the whole truth, and then a different whole truth.
     *
     * `deepLoadedForRef` already records which account has been read IN FULL. Until that is this
     * account the ledger is PENDING: the shell, the metrics, the lenses and the filters commit
     * immediately — they are the same whatever the rows say — and the ledger region reserves itself
     * rather than showing a partial cohort as if it were complete.
     */
    const ledgerComplete = deepLoadedForRef.current === (customerId ?? scopedMemberId);

    /*
     * ── DETAILS COMMITS ONCE, OR IT DOES NOT COMMIT ───────────────────────────────────────────
     *
     * The previous two attempts both left a visible intermediate. The first replaced the compact
     * card with a Details skeleton the instant it was clicked; the second kept the skeleton out of
     * the metrics but reserved the ledger region, so Details still arrived with an empty body that
     * filled in afterwards. Both are the same lie told at different volumes: the operator is shown
     * the destination before the destination exists.
     *
     * The rule here is simpler and has no tuning knob. Details is not ENTERED until the deep read
     * its ledger depends on has resolved. Clicking it records a request; the request becomes the
     * surface when — and only when — the account has actually been read in full. Until then the
     * compact card stays on screen, unchanged, with its Details control marked busy.
     *
     * If the read takes 500ms the operator looks at the compact card for 500ms. That is the whole
     * cost, and it buys the thing Kelly has been asking for since 5H: one commit, no double load.
     */
    const [detailPending, setDetailPending] = useState(false);

    /*
     * ── THE LEDGER'S SCROLL POSITION SURVIVES A COMMAND ───────────────────────────────────────
     *
     * The last thing an operator loses on a command round trip, and the most disorienting: they
     * were two thirds of the way down a fifty-six row ledger. Written on every scroll and put back
     * before paint, so returning to Details does not start from the top.
     */
    useLayoutEffect(() => {
        if (overlay !== "detail") return;
        const el = document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null;
        if (!el) return;
        if (detailScrollRef.current > 0) el.scrollTop = detailScrollRef.current;
        const remember = () => { detailScrollRef.current = el.scrollTop; };
        el.addEventListener("scroll", remember, { passive: true });
        return () => el.removeEventListener("scroll", remember);
    }, [overlay]);

    useEffect(() => {
        // Clear FIRST: the previous household's balance must not linger while the next resolves.
        // Any in-flight RELOAD is superseded too — its ordinal can no longer be current.
        requestSeq.current += 1;
        setVm(provisioned?.state === "ready" ? provisioned.data : null);
        setDeniedRead(provisioned?.state === "forbidden");
        // A new projection is the BOUNDED summary by construction, whichever account it is for.
        deepLoadedForRef.current = null;
    }, [provisioned]);

    /*
     * DEPTH IS AN INTERACTION. Opening any of the account's deep surfaces — the ledger, the payment
     * flow, add-charge — loads the full model once per account. The initial panel still issues no
     * request at all, which is the invariant; this is the operator asking.
     */

    /*
     * ── A HOST THAT SUPPLIES NO PROJECTION IS NOT A HOST THAT IS STILL PROVISIONING ────────────
     *
     * The card's bootstrap moved to `context.operationalProjection.cards.financials`: the Focus
     * Panel hands the summary down with the subject it belongs to, and the card issues no request
     * of its own. That is right for the Focus Panel and it silently broke the FINANCIALS WORKSPACE,
     * which composes this card directly and builds its own context. No projection is supplied
     * there, so `provisioned` was null, `provisioningAccount` was true, and the account summary sat
     * in its pending frame FOREVER — three metric labels over three placeholders — while the ledger
     * body beside it, which does its own read, hydrated normally. Measured: body hydrated with 56
     * rows, summary still pending after 18 seconds, the card endpoint answering 200 throughout.
     *
     * The two states are different and were being conflated. `provisioned == null` means one of:
     *   · the host HAS a projection pipeline and this subject has not arrived yet → wait;
     *   · the host has no projection pipeline at all → nobody is going to send one, ever.
     *
     * A host declares the second by not supplying `operationalProjection`. In that case the card
     * bootstraps itself once per subject, which is what it did before the projection existed. The
     * Focus Panel is untouched: it supplies the object, so this never runs there.
     */
    const hostSuppliesProjection = context.operationalProjection != null;
    useEffect(() => {
        if (hostSuppliesProjection) return;
        const key = customerId ?? scopedMemberId;
        if (!key || deepLoadedForRef.current === key) return;
        void load();
    }, [hostSuppliesProjection, customerId, scopedMemberId, load]);

    /*
     * ── THE LIKELY NEXT SURFACE IS RESOLVED BEFORE IT IS ASKED FOR ────────────────────────────
     *
     * Details opened instantly and then said "Reading this account's activity…" for two seconds,
     * because the deep read only STARTED on the click. The account is known while the compact card
     * is on screen, so the read can be in flight long before anyone asks — the same doctrine
     * `focusPanelActivityPrewarm` already states for mode switching: sanctioned idle prefetch,
     * never a reveal gate, so the operator never waits for what was predictable.
     *
     * No second authority and no new cache: this is the SAME `load()` filling the SAME `vm` and
     * `deepLoadedForRef` that Details already consumes. Only its timing moved.
     *
     * Subject safety is not an extra mechanism either. `requestSeq` makes a superseded response
     * unable to land, and a new projection clears both `vm` and `deepLoadedForRef` — so a prewarm
     * for household A cannot become household B's ledger; it can only be discarded.
     */
    useEffect(() => {
        const key = customerId ?? scopedMemberId;
        if (!key || deepLoadedForRef.current === key) return;
        // Asked for: now. The operator is waiting, so idle is the wrong queue.
        if (overlay || detailPending) {
            void load();
            return;
        }
        if (!hostSuppliesProjection || provisioned?.state !== "ready") return;
        /*
         * Otherwise it is a prediction, so it yields: queued at idle and cancelled if the subject
         * changes first, which keeps a panel of cards from racing the surface's own first paint.
         */
        const w = window as unknown as {
            requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
            cancelIdleCallback?: (h: number) => void;
        };
        if (typeof w.requestIdleCallback === "function") {
            const handle = w.requestIdleCallback(() => void load(), { timeout: 1_200 });
            return () => w.cancelIdleCallback?.(handle);
        }
        const t = setTimeout(() => void load(), 0);
        return () => clearTimeout(t);
    }, [overlay, detailPending, customerId, scopedMemberId, load, hostSuppliesProjection, provisioned]);

    /*
     * A SCOPED CHILD PRESELECTS THE SUBJECT FILTER.
     *
     * When the panel is about one child, opening on "All" would answer about their siblings too. The
     * operator can still widen it — the account is genuinely the household's — but the default
     * matches what they are looking at.
     */
    useEffect(() => {
        setSubjectFilter(scopedMemberId ?? "all");
    }, [scopedMemberId]);

    const visibleRows = useMemo(() => {
        if (!vm) return [];
        // ONE rule for what a subject scope includes — household-grain rows stay visible. See
        // `financialsRowScope`: a child-scoped panel does not make the account's charges disappear.
        return financialsRowsInSubjectScope(vm.rows, subjectFilter);
    }, [vm, subjectFilter]);

    /*
     * The charges that can actually take money, in the operator's current scope.
     *
     * `offersPayment` is the read model's answer — posted, not a correction, still owing something —
     * exactly as `offersReverse` is for the other direction. Filtering the same `visibleRows` the
     * ledger renders is what keeps the menu honest under the subject filter: a payment offered
     * against a sibling's charge that is not on screen would be attributing money by accident.
     */
    const payableRows = useMemo(
        () => visibleRows.filter((r) => r.offersPayment),
        [visibleRows],
    );

    /** The child a charge would apply to — the filter's subject, else the panel's. */
    const chargeTarget =
        subjectFilter !== "all" ? subjectFilter : scopedMemberId ?? vm?.subjects[0]?.customerMemberId ?? null;

    /**
     * ── WHAT THE ACTION IS INVOKED AGAINST — a child when this card has one, the panel's own
     * subject when it does not ──
     *
     * `resolveChargeSubject` already owns the whole question of what a charge is written against:
     * the named child's agreement when there is one, the HOUSEHOLD when there is not, because "a
     * pre-enrolment child's fee is the FAMILY's, and that is a real, chargeable subject". This card
     * decides none of that and must not; its only job is to hand the resolver enough canonical
     * identity to decide.
     *
     * It was handing over a child or nothing. `chargeTarget` derives from `vm.subjects`, which
     * derives from `child_enrollment_agreements` — so for a family with no agreement it is null,
     * and both `preview()` and `commit()` opened with a bare `return`. The overlay still showed an
     * amount and an enabled confirmation, and the click issued no request at all: the exact family
     * the resolver documents could never reach it. Proven on the certification tenant, where every
     * New Leads family is pre-enrolment and `charges` stayed at 0.
     *
     * So when there is no child, the invocation travels at the grain the panel actually has. The
     * household id goes in the payload as `customer_id` exactly as it always did, no
     * `customer_member_id` is invented, and the resolver — not this card — decides the subject.
     */
    /*
     * EVERY CHILD THIS OPERATION WILL BILL — the anchor plus whatever the operator ticked.
     *
     * De-duplicated and anchor-first, so the preview and the commit name the children in the same
     * order the operator sees them, and a child cannot be billed twice by being both the anchor
     * and a ticked sibling.
     */

    const chargeInvocation = useMemo((): {
        entityType: string;
        entityId: string;
        customerMemberId: string | null;
    } | null => {
        if (chargeTarget) {
            /*
             * ── THE ENTITY IS ROUTING; THE MEMBER ID IS ATTRIBUTION ───────────────────────────
             *
             * "Applies to · Household" said Household on screen and wrote a CHILD. `chargeTarget`
             * falls back to the panel's scoped child whenever the subject filter is `all`, and that
             * fallback was being used for BOTH questions — so choosing Household still sent
             * `customer_member_id: <a child>` and the charge was billed to that child. Measured on
             * the mounted candidate: APPLIES TO read "Household", the payload carried Certb's member
             * id, and the ledger row came back "Certb Certhouse".
             *
             * The route refuses a call with no entity, so the child still travels as CONTEXT. The
             * member id is the ATTRIBUTION, and a deliberate household choice means there is no
             * child to attribute to — `childIdsFrom` then reads the absent field as household grain,
             * which is the doctrine the whole subject model rests on.
             */
            return {
                entityType: "child",
                entityId: chargeTarget,
                customerMemberId: subjectFilter === "all" ? null : chargeTarget,
            };
        }
        const subjectId = (context.subject?.id ?? "").trim();
        if (customerId && subjectId) {
            return {
                entityType: (context.subject?.type ?? "").trim() || "opportunity",
                entityId: subjectId,
                customerMemberId: null,
            };
        }
        // Genuinely unresolvable: no child, and no household to fall back to.
        return null;
    }, [chargeTarget, customerId, subjectFilter, context.subject?.id, context.subject?.type]);

    /**
     * Open the settle operation on the obligation most likely to be settled.
     *
     * The read model decides which that is — the first row it marks payable — and the operator may
     * change both the charge and the amount once the panel is open. Undefined when nothing can take
     * money, so the control stays inert rather than opening a panel with nothing to act on.
     */
    /** Open the settle form against the first charge in a given set. One body, two eligibilities. */
    /**
     * EVERY CHILD THIS OPERATION WILL BILL — the anchor, plus whatever the operator ticked.
     *
     * Anchor-first and de-duplicated, so the preview and the commit name children in the order the
     * operator sees them, and a child cannot be billed twice by being both the anchor and a ticked
     * sibling. Empty when the command is anchored at the household, which is how a household charge
     * reaches the resolver: by naming no child at all, never by an empty array standing in for one.
     */
    const selectedChildIds = useMemo(() => {
        const anchorId = chargeInvocation?.customerMemberId ?? null;
        const ids = [anchorId, ...extraChildIds].filter((v): v is string => Boolean(v));
        return [...new Set(ids)];
    }, [chargeInvocation, extraChildIds]);

    const selectedChildLabels = useMemo(
        () => selectedChildIds.map(
            (id) => vm?.subjects.find((sub) => sub.customerMemberId === id)?.displayName ?? "Child",
        ),
        [selectedChildIds, vm],
    );

    const makeSettleOpener = useCallback(
        (rows: readonly FinancialsLedgerRow[]) => {
            if (!rows.length) return undefined;
            return () => {
                const row = rows[0]!;
                setCommandError(null);
                setPayTarget({
                    chargeId: row.chargeId,
                    label: row.description ?? row.categoryLabel,
                    outstandingCents: row.outstandingCents,
                    subjectMemberId: row.subjectMemberId,
                });
                setPayAmount((row.outstandingCents / 100).toFixed(2));
                push({ kind: "payment" });
            };
        },
        [],
    );

    /** Everything in scope that can take money — what the ledger's own menu offers, across periods. */
    const openSettle = useMemo(() => makeSettleOpener(payableRows), [makeSettleOpener, payableRows]);

    /*
     * ── WHAT THE COMPACT CARD MAY OFFER TO SETTLE ───────────────────────────────────────────────
     *
     * Compact is a CURRENT-PERIOD summary. Its lines state this period's responsibility and balance,
     * so its Payment control must settle this period — offering a prior period's charge from a card
     * that never mentions it is a cross-period claim the summary cannot support.
     *
     * This is NOT a second grain rule. It is the same canonical scope (`financialsRowScope`:
     * household-grain rows plus the selected child's), narrowed by the period Compact already
     * declares. Deep and prior-period settlement stays where it is reachable and explained — the
     * Details ledger and its `Record payment →` menu, which still read `payableRows` across periods.
     *
     * Found by the deployed regression: Wrigley's September is settled in full, yet Payment appeared,
     * because eligibility was drawn from `visibleRows` — which is not period-scoped — and reached an
     * August registration fee. The subject-filter defect had been masking that.
     */
    const compactPayableRows = useMemo(
        () => (vm == null ? [] : selectCompactPayableRows(vm.rows, subjectFilter, vm.period.key)),
        [vm, subjectFilter],
    );
    const openSettleCurrentPeriod = useMemo(
        () => makeSettleOpener(compactPayableRows),
        [makeSettleOpener, compactPayableRows],
    );

    /** Why Add charge cannot be offered, when it cannot. Stated, never silent. */
    const chargeUnavailableReason =
        chargeInvocation ? null : (
            "This record has no household or child in scope, so there is nothing to charge against."
        );

    /**
     * PREVIEW FIRST, and the preview is the DOMAIN's.
     *
     * `mode: "preview"` runs `previewTemplateCharge` — the same resolver the write uses — so the
     * amount, the dates and the scheduled-vs-draft verdict shown to the operator are the ones that
     * will be persisted. Nothing is computed on this side, which is why the preview cannot drift from
     * the commit that follows it.
     */
    const preview = useCallback(
        async (templateId: string, label: string) => {
            if (running) return;
            if (!chargeInvocation) {
                // An absent target is an answer the operator is owed, not a reason to do nothing.
                setCommandError(chargeUnavailableReason);
                return;
            }
            setRunning(true);
            setCommandError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: "charge.add",
                        entity_type: chargeInvocation.entityType,
                        entity_id: chargeInvocation.entityId,
                        mode: "preview",
                        payload: {
                            // Omitted entirely when no child is named — the resolver reads that as
                            // "no child", which is what sends it to the household.
                            ...(chargeInvocation.customerMemberId
                                ? { customer_member_id: chargeInvocation.customerMemberId }
                                /* Deliberately household — stated, because omission means "no opinion". */
                                : { subject_grain: "household" }),
                            // The household, so a pre-enrolment family has a billable subject when
                            // no child agreement exists. The resolver still prefers an agreement.
                            customer_id: customerId,
                            template_id: templateId,
                            child_label: chargeInvocation.customerMemberId
                                ? vm?.subjects.find(
                                      (s) => s.customerMemberId === chargeInvocation.customerMemberId,
                                  )?.displayName
                                : undefined,
                            /*
                             * ONLY WHEN THE OPERATION IS ACTUALLY WIDER THAN ONE CHILD. Sending the
                             * plural form for a single subject would route an ordinary Add through
                             * the batch path and report it in batch language, which is a different
                             * story told about the same act.
                             */
                            ...(selectedChildIds.length > 1
                                ? { customer_member_ids: selectedChildIds, child_labels: selectedChildLabels }
                                : {}),
                            // An `event_date` template is REFUSED without one — the preview returns
                            // `missing_event_date` — so the operator's date has to travel with the
                            // preview, not only with the commit.
                            ...(chargeEventDate ? { event_date: chargeEventDate } : {}),
                            ...(chargeNote ? { note: chargeNote } : {}),
                        },
                    }),
                });
                const json = (await res.json()) as {
                    ok?: boolean;
                    error?: string | { message?: string };
                    data?: { execution_result?: { preview?: { summary?: string; changes?: string[] } } };
                };
                const p = json?.data?.execution_result?.preview;
                if (!json?.ok || !p) {
                    const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                    setCommandError(err || "This charge cannot be previewed.");
                    return;
                }
                setPending({
                    templateId,
                    label,
                    summary: p.summary ?? "",
                    changes: Array.isArray(p.changes) ? p.changes : [],
                });
            } catch {
                setCommandError("The preview could not be requested.");
            } finally {
                setRunning(false);
            }
        },
        [chargeInvocation, chargeUnavailableReason, chargeEventDate, chargeNote, running, vm],
    );

    /*
     * ── WHAT THE OPERATOR DECIDED ABOUT THIS CHARGE, BEFORE THE CHARGE EXISTS ─────────────────
     *
     * Responsibility and exclusions are both keyed by charge id, and there is no charge id until
     * `charge.add` returns one. So the decisions are held here and applied afterwards, against the
     * charges that were actually created — which is also why there is no durable charge-intent
     * model: nothing is written that a later step has to reconcile or clean up. An operator who
     * abandons the command leaves no trace, because these are React state and nothing else.
     */
    const [chargeScope, setChargeScope] = useState<"account" | "charge">("account");
    const [chargeShares, setChargeShares] = useState<
        Array<{ partyId: string; method: "percentage" | "fixed" | "remainder"; value: string }>
    >([]);
    const [waivedPolicyIds, setWaivedPolicyIds] = useState<string[]>([]);
    const [waiverReason, setWaiverReason] = useState("");
    const resetChargeDecisions = useCallback(() => {
        setChargeScope("account");
        setChargeShares([]);
        setWaivedPolicyIds([]);
        setWaiverReason("");
    }, []);

    /*
     * ── AFTER THE CHARGE EXISTS, THE DECISIONS ABOUT IT ──────────────────────────────────────
     *
     * Two registered actions, each per created charge: a charge-scoped arrangement when the
     * operator divided this charge themselves, and a charge-level exclusion per waived policy.
     * Both are keyed by a charge id that did not exist a moment ago, which is the entire reason
     * this runs after the create rather than inside it.
     *
     * NOTHING IS ROLLED BACK. The charge is canonical the instant it is written, and reversing it
     * because a waiver failed would destroy real money to tidy up a follow-up — so every refusal
     * is COLLECTED and returned, and the caller reports them. Each step is independently
     * retryable, which is what makes reporting rather than unwinding the honest answer.
     */
    const applyChargeDecisions = useCallback(
        async (chargeIds: readonly string[]): Promise<string[]> => {
            const failures: string[] = [];
            if (chargeIds.length === 0) return failures;

            const run = async (actionKey: string, payload: Record<string, unknown>): Promise<string | null> => {
                try {
                    const res = await fetch("/api/admin/actions/execute", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                            action_key: actionKey,
                            /*
                             * THE SAME SUBJECT THE CHARGE WAS RAISED AGAINST. There is no `charge`
                             * entity type in the action runtime; the charge these decisions are
                             * about travels in the payload, where every other charge-scoped
                             * financial action carries it.
                             */
                            entity_type: chargeInvocation?.entityType ?? "child",
                            entity_id: chargeInvocation?.entityId ?? "",
                            mode: "execute",
                            confirmation: { confirmed: true },
                            payload,
                        }),
                    });
                    const body = (await res.json()) as { ok?: boolean; error?: string | { message?: string } };
                    if (body?.ok) return null;
                    const message = typeof body?.error === "string" ? body.error : body?.error?.message;
                    return message || "refused";
                } catch {
                    return "could not be sent";
                }
            };

            for (const chargeId of chargeIds) {
                if (chargeScope === "charge" && chargeShares.length > 0) {
                    /*
                     * THE SHARES ARE TRANSLATED, NOT COMPUTED. A percentage becomes basis points
                     * and an amount becomes cents because that is how the domain stores them; what
                     * a share is WORTH against this charge is the resolver's answer, and this card
                     * never asks itself that question.
                     */
                    const shares = chargeShares
                        .filter((share) => share.partyId.trim().length > 0)
                        .map((share) => ({
                            responsible_party_id: share.partyId,
                            method: share.method,
                            percent_basis_points:
                                share.method === "percentage" ? Math.round(Number(share.value || 0) * 100) : null,
                            amount_cents:
                                share.method === "fixed" ? Math.round(Number(share.value || 0) * 100) : null,
                        }));
                    const error = await run("billing.configure_responsibility", {
                        customer_id: customerId,
                        charge_id: chargeId,
                        /* Today: the arrangement governs this charge from the moment it is made. */
                        effective_start: new Date().toISOString().slice(0, 10),
                        shares,
                    });
                    if (error) failures.push(`responsibility for this charge — ${error}`);
                }

                for (const policyId of waivedPolicyIds) {
                    const error = await run("billing.waive_charge_discount", {
                        charge_id: chargeId,
                        policy_id: policyId,
                        reason: waiverReason,
                    });
                    if (error) failures.push(`waiving a discount — ${error}`);
                }
            }
            return failures;
        },
        [chargeInvocation, chargeScope, chargeShares, customerId, waivedPolicyIds, waiverReason],
    );

    const commit = useCallback(async () => {
        if (!pending || running) return;
        if (!chargeInvocation) {
            setCommandError(chargeUnavailableReason);
            return;
        }
        setRunning(true);
        setCommandError(null);
        try {
            const res = await fetch("/api/admin/actions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action_key: "charge.add",
                    entity_type: chargeInvocation.entityType,
                    entity_id: chargeInvocation.entityId,
                    mode: "execute",
                    confirmation: { confirmed: true },
                    /*
                     * THE COMMIT MUST CARRY WHAT THE PREVIEW CARRIED.
                     *
                     * This payload was the bare pair while the preview had already learned to send
                     * the event date, so an `occurs_on = event_date` template previewed cleanly and
                     * then refused at commit with `missing_event_date` — after the operator had
                     * entered the date. Preview and commit run the same resolver; they have to be
                     * given the same inputs or the resolver is being asked two different questions.
                     */
                    payload: {
                        ...(chargeInvocation.customerMemberId
                            ? { customer_member_id: chargeInvocation.customerMemberId }
                            : { subject_grain: "household" }),
                        // Same subject inputs the preview was given — preview and commit run the
                        // same resolver, so they must be asked the same question.
                        customer_id: customerId,
                        template_id: pending.templateId,
                        // The same selection the preview was given — preview and commit run the
                        // same resolver, so they must be asked the same question.
                        ...(selectedChildIds.length > 1
                            ? { customer_member_ids: selectedChildIds, child_labels: selectedChildLabels }
                            : {}),
                        ...(chargeEventDate ? { event_date: chargeEventDate } : {}),
                        ...(chargeNote ? { note: chargeNote } : {}),
                    },
                }),
            });
            const json = (await res.json()) as {
                ok?: boolean;
                error?: string | { message?: string };
                result?: {
                    affectedId?: string | null;
                    detail?: {
                        per_child?: Array<{ charge_id?: string | null; error?: string | null }>;
                        charges_failed?: number;
                    } | null;
                } | null;
            };
            if (!json?.ok) {
                const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                // A refusal is the domain speaking — surfaced, never swallowed into a silent no-op.
                setCommandError(err || "The charge was refused.");
                return;
            }

            /*
             * ── THE CHARGES THAT NOW EXIST ───────────────────────────────────────────────────
             *
             * One per billed child, or one for the household. `charge.add` reports a multi-child
             * operation as SUCCESS carrying its failures, so the list below can be shorter than
             * what the operator selected — and the follow-up work must run against the charges
             * that exist rather than the ones that were asked for.
             */
            const detail = json.result?.detail ?? null;
            const createdChargeIds = detail?.per_child
                ? detail.per_child.map((r) => (r.charge_id ?? "").trim()).filter(Boolean)
                : [String(json.result?.affectedId ?? "").trim()].filter(Boolean);
            const followUpFailures = await applyChargeDecisions(createdChargeIds);

            /*
             * ── PARTIAL COMPLETION IS REPORTED, NOT ROUNDED ──────────────────────────────────
             *
             * The charge is written and cannot be un-written by a later step failing. An operator
             * told only "done" would believe a waiver stands that does not, and would find out
             * from an invoice. So a follow-up refusal keeps the command open, naming what DID
             * happen first — the charge is real — and then exactly what did not.
             */
            if (followUpFailures.length > 0) {
                const created = createdChargeIds.length;
                setCommandError(
                    `${created === 1 ? "The charge was created" : `${created} charges were created`}, `
                    + `but ${followUpFailures.length === 1 ? "one step" : `${followUpFailures.length} steps`} `
                    + `did not complete: ${followUpFailures.join("; ")}`,
                );
                /* Nothing is reset: the decisions stay on screen so the operator can retry them. */
                return;
            }

            setPending(null);
            resetChargeDecisions();
            // The command card closes on success only. A refusal keeps it open with the domain's
            // own message, so the operator can correct the charge rather than re-open and retype it.
            resetStack();
            setChargeAmount("");
            setChargeNote("");
            setChargeEventDate("");
        } catch {
            setCommandError("The charge could not be sent.");
        } finally {
            setRunning(false);
            // The card REFRESHES from the read model; it never inserts the row it just created.
            await load();
        }
        // `chargeEventDate` and `chargeNote` are READ inside this callback and must be in its
        // dependency list. Without them the commit closed over the empty initial values and the
        // domain refused with `missing_event_date` — after the operator had entered a date, and
        // after the PREVIEW had accepted it. A stale closure is invisible until the two disagree.
    }, [
        applyChargeDecisions,
        chargeEventDate,
        chargeNote,
        chargeInvocation,
        chargeUnavailableReason,
        load,
        pending,
        resetChargeDecisions,
        running,
    ]);

    /**
     * A LEDGER ROW'S OWN TRANSITION — post a draft, reverse posted money.
     *
     * Both are registered actions (`charge.post`, `charge.reverse`), so every rule about what may
     * happen to a charge stays in the domain. Immutability is a DB trigger, idempotent posting is the
     * service's guarded update, and the reversal's amount is derived by the service — none of it is
     * decided here. The card refreshes from the read model afterwards, so what it shows is what
     * committed, never an optimistic guess about it.
     */
    const runRowAction = useCallback(
        async (
            actionKey: "post" | "reverse",
            row: { chargeId: string; description: string | null; subjectMemberId: string | null },
        ) => {
            if (running) return;
            setRunning(true);
            setCommandError(null);
            /*
             * THROUGH THE SHARED AUTHORITY. This built its own request to
             * `/api/admin/actions/execute`; so did the reverse preview below it, and so would the
             * workspace ledger if it were given commands of its own. One executor means one idea of
             * what a refusal looks like and one place a financial action is spelled.
             *
             * The entity rule that lives here is request CONTEXT, not attribution: the route refuses
             * a call without an entity id, while `charge_id` in the payload is what decides which
             * charge is acted on. A household charge therefore travels with the panel's subject and
             * still stays on the household it was billed to.
             */
            const result = await executeFinancialCommand({
                action: actionKey,
                entity: {
                    entityType: row.subjectMemberId ? "child" : (chargeInvocation?.entityType ?? "child"),
                    entityId: row.subjectMemberId ?? chargeInvocation?.entityId ?? "",
                },
                mode: "execute",
                payload: {
                    charge_id: row.chargeId,
                    charge_label: row.description ?? row.chargeId,
                    ...(actionKey === "reverse" ? { kind: "reversal" } : {}),
                },
            });
            // The domain refusing is an answer. Surfaced, never swallowed.
            if (!result.ok) setCommandError(result.error);
            setRunning(false);
            await load();
        },
        [load, running, chargeInvocation],
    );


    /*
     * MONEY IN, AND MONEY BACK OUT — through the registered actions that already own both.
     *
     * `payment.record` and `payment.refund` have been registered, catalogued as executable and
     * certified against real persistence since Thread 8; nothing on this card issued either of them,
     * so a family could be charged and could not be recorded as having paid. This adds the call, not
     * the capability: no amount is validated here beyond it being a positive integer of cents, no
     * balance is computed, and the refusals — a draft charge, an over-application, a refund larger
     * than the receipt — stay where they are enforced and are surfaced verbatim.
     *
     * Same shape as `runRowAction` deliberately: execute, surface a refusal, and refresh from the
     * read model in `finally` so what the card shows afterwards is what committed rather than an
     * optimistic guess about it.
     */
    /**
     * WHAT A PAYMENT IS ATTRIBUTED TO.
     *
     * `/api/admin/actions/execute` refuses a call with no entity, and the payment path was handing
     * it the panel's child — which a pre-enrolment household does not have. `vm.subjects` is empty
     * for a New Leads family, so the attribution resolved to null, the route answered "action_key,
     * entity_type, and entity_id are required", and the panel showed that sentence as a blocked
     * card collection. Manual rails, card collection and refunds all failed the same way; only the
     * chooser labels could be certified, which is why it survived this long.
     *
     * `chargeInvocation` already answers exactly this question for charges — the named child when
     * there is one, the panel's own subject when there is not — so payments travel at the same
     * grain rather than inventing a second answer. The charge_id or payment_id in the payload still
     * decides where the money goes; this is attribution for the audit trail.
     */
    const paymentEntityFor = useCallback(
        (subjectMemberId: string | null): { entityType: string; entityId: string } | null => {
            if (subjectMemberId) return { entityType: "child", entityId: subjectMemberId };
            if (chargeInvocation) {
                return { entityType: chargeInvocation.entityType, entityId: chargeInvocation.entityId };
            }
            return null;
        },
        [chargeInvocation],
    );

    const runPaymentAction = useCallback(
        async (
            actionKey: "payment.record" | "payment.refund" | "payment.collect_card",
            payload: Record<string, unknown>,
            entity: { entityType: string; entityId: string } | null,
        ) => {
            if (running) return;
            setRunning(true);
            setCommandError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: actionKey,
                        entity_type: entity?.entityType ?? "child",
                        /*
                         * THE ROUTE IS STRICTER THAN THE ACTION.
                         *
                         * `payment.record` declares `requiresEntityId: false` — the subject of a
                         * payment is the charge it settles — but `/api/admin/actions/execute`
                         * refuses any request without one ("action_key, entity_type, and entity_id
                         * are required"). The certification found this by calling the route the way
                         * the card does, which is the only way it could have been found: the action
                         * definition alone says the call is legal.
                         *
                         * So the money carries the subject it concerns: the charge's own child where
                         * it has one, else the panel's. The charge_id in the payload remains what
                         * decides where the money goes; this is attribution for the audit trail.
                         */
                        entity_id: entity?.entityId ?? "",
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload,
                    }),
                });
                const json = (await res.json()) as {
                    ok?: boolean;
                    error?: string | { message?: string };
                    data?: { execution_result?: Record<string, unknown> };
                };
                if (!json?.ok) {
                    const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                    setCommandError(err || "That could not be done.");
                    return { ok: false as const, error: err ?? "That could not be done." };
                }
                // A card collection keeps the panel open: the operator still has to enter a card.
                if (actionKey !== "payment.collect_card") {
                    setPayTarget(null);
                    /* The next payment is a fresh question about who paid, not a carried answer. */
                    setPayPayerPersonId("");
                }
                /*
                 * THE RESULT IS THE EXECUTION RESULT, not a `detail` inside it.
                 *
                 * `/api/admin/actions/execute` answers `data.execution_result: { client_secret,
                 * connected_account, collection_attempt_id, … }`. Reading a `detail` wrapper that
                 * the envelope does not have yielded `{}` for every field, so a card collection
                 * handed Stripe Elements an empty client secret and the Payment Element refused to
                 * mount: "clientSecret should be of the form ${id}_secret_${secret}. You specified:
                 * .". The intent had been created on the connected account by then — the money side
                 * was correct and only the browser's handle on it was lost.
                 *
                 * The nested shape is still honoured, so an action that does wrap its answer keeps
                 * working.
                 */
                const executionResult = (json.data?.execution_result ?? {}) as Record<string, unknown>;
                const detail = (executionResult.detail as Record<string, unknown> | undefined) ?? executionResult;
                return { ok: true as const, detail };
            } catch {
                setCommandError("The request could not be sent.");
                return { ok: false as const, error: "The request could not be sent." };
            } finally {
                setRunning(false);
                // A collection has not changed any balance yet, but reloading is harmless and keeps
                // the ledger honest if something else moved underneath.
                await load();
            }
        },
        [load, running],
    );

    const currency = vm?.rows[0]?.currencyCode ?? "USD";
    /*
     * THE TOTALS FOLLOW THE FILTER.
     *
     * The subject filter narrows the ledger, so the reconciliation above it must narrow too — a
     * "$100.00" account total sitting over a filtered ledger showing $75 is precisely the "every
     * total reconciles to authoritative rows" rule broken, and it is what the first browser pass
     * found. The narrowed figures are the SERVER's, computed per subject in the same composition, so
     * switching subjects costs nothing and cannot compute the rule a second way.
     */
    const reconciliation =
        vm == null
            ? null
            : subjectFilter === "all"
              ? vm.reconciliation
              : vm.reconciliationBySubject[subjectFilter] ?? vm.reconciliation;
    const pastDue =
        vm == null
            ? null
            : subjectFilter === "all"
              ? vm.pastDue
              : vm.pastDueBySubject[subjectFilter] ?? null;

    const detailReady = Boolean(vm && reconciliation && ledgerComplete);

    const requestDetails = useCallback(() => {
        /*
         * ── THE SHELL IS NOT DATA-DEPENDENT ───────────────────────────────────────────────────
         *
         * Holding the request until the deep read resolved removed the false intermediate, and it
         * bought that with a wait on the compact card — which is not how any other Focus Panel card
         * behaves. Invoking a focused surface establishes the depth immediately; Financials now does
         * the same, at final geometry, because its structure is known the moment it is asked for.
         *
         * What must NOT arrive with it is ledger content nobody has read. The header, metrics,
         * lenses and filters commit from the account values the compact card is already authoritative
         * for; the ledger REGION alone says it is still reading, and it says so without inventing a
         * single row. That distinction — an honest empty region versus fabricated rows — is the whole
         * difference between this and the skeleton that was rejected three passes running.
         */
        setDetailPending(true);
        setStack([{ kind: "detail" }]);
    }, []);

    useEffect(() => {
        if (!detailPending || !detailReady) return;
        setDetailPending(false);
    }, [detailPending, detailReady]);
    /*
     * DENSITY IS A REAL DISTINCTION, not a label.
     *
     * `compact` is supporting financial context inside another operating process — the balance, what
     * is next, and the way in. It deliberately does NOT attempt the reconciliation: a half-stated
     * breakdown is more misleading than none. `standard` is the V5 summary and states the period in
     * full. Expanded is either of them plus the ledger.
     */
    const isCompact = model.density === "compact" && !expanded;
    /*
     * THE LEDGER IS THE EXPANDED REPRESENTATION, and only that.
     *
     * Summary and expanded rendered identically at first, which made `Details →` a no-op and left the
     * summary carrying a ledger it has no room for. The summary states the period; the expanded view
     * keeps a SHALLOW top — balance and past due in one line — and gives the rest of the surface to
     * the ledger, because re-rendering a larger copy of the summary above it would spend the width
     * the ledger exists to use.
     */
    const showBands = !expanded;
    const showLedger = expanded;

    /*
     * ── THE SUMMARY IS THE APPROVED CARD, RENDERED BY THE APPROVED COMPONENT ──
     *
     * Everything above this line is the card's DATA work — loading the account, narrowing to a
     * subject, running Add charge. None of it is presentation, and none of it changes here.
     *
     * What changes is that the summary no longer draws itself. It renders
     * `components/operationalCards/FinancialsCard`, the same component the design lab renders, so
     * there is one presentation of this card rather than a locked specimen and a production
     * approximation of it. The approximation opened with a hero line the specimen does not have,
     * showed two of the seven arithmetic lines, drew its actions as bordered buttons rather than
     * quiet links, and left a band of empty white below the zones.
     *
     * The EXPANDED path below is untouched: the ledger is the expanded representation and is not
     * part of the approved summary specimen.
     */
    /*
     * The command card opens on the DOMAIN's answer, not on the template's raw configuration.
     *
     * Without this the card showed `event_date` as its service date — a stored strategy key on the
     * one screen where an operator is about to commit money. Previewing on open (and whenever the
     * template or subject changes) means every date, the amount and the subject on screen are what
     * the resolver actually produced.
     */
    useEffect(() => {
        if (overlay !== "add_charge" || !vm) return;
        const first = pending?.templateId ?? vm.chargeTemplates[0]?.id ?? null;
        if (!first) return;
        void preview(first, vm.chargeTemplates.find((t) => t.id === first)?.label ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-previews on open, subject and date change
    }, [overlay, subjectFilter, chargeEventDate]);

    /** The row as the read model knows it — the callback carries identity, not attribution. */
    const rowForCharge = useCallback(
        (chargeId: string) => {
            const row = vm?.rows.find((r) => r.chargeId === chargeId);
            return {
                chargeId,
                description: row?.description ?? null,
                subjectMemberId: row?.subjectMemberId ?? null,
            };
        },
        [vm],
    );

    /*
     * ── REVERSE IS A COMMAND, SO IT GETS THE COMMAND SHELL ────────────────────────────────────
     *
     * It rendered as a band inside the Details tree: a full-width strip of unstyled controls laid
     * horizontally across the ledger, sharing the Move-payment panel's classes because that is
     * what it was copied from. Beside Add and Payment — which are focused command cards — it read
     * as an unfinished part of the page rather than a deliberate operation, and it was the one
     * money-destroying command on the surface.
     *
     * Nothing about the operation changes. `charge.reverse` is still the only writer and it is
     * still reached through the shared command authority. What changes is that Reverse is now a
     * destination on the stack like every other command, so it is drawn in the same shell, it is
     * dismissed by the same three gestures, and dismissing it returns to Details.
     */
    const openReverseCharge = useCallback((args: { chargeId: string; label: string }) => {
        closeMovePanels();
        closeAdjustPanels();
        setReverseChargePreview(null);
        setReverseChargeError(null);
        setAdjustNotice(null);
        setReverseCharge(args);
        push({ kind: "reverse_charge", chargeId: args.chargeId, label: args.label });
    }, [closeAdjustPanels, closeMovePanels, push]);

    /*
     * ── WHO OWES THIS OBLIGATION ──────────────────────────────────────────────────────────────
     *
     * Opened per row, in the mode the row's own state earned: a charge nobody owes yet is RESOLVED
     * under the arrangement in force; a charge that already names a party is REALLOCATED, which is
     * a different act and needs a reason. Nothing is decided here — the mode only chooses which
     * canonical command the shell will raise.
     */
    const openResponsibility = useCallback(
        (args: { chargeId: string; label: string; mode: "resolve" | "reallocate" }) => {
            closeMovePanels();
            closeAdjustPanels();
            setResponsibilityPreview(null);
            setResponsibilityError(null);
            setReallocationReason("");
            push({ kind: "responsibility", chargeId: args.chargeId, label: args.label, mode: args.mode });
        },
        [closeAdjustPanels, closeMovePanels, push],
    );

    /*
     * THE PREVIEW IS THE ACTION'S. `buildPreview` reads the allocatable net from the charge itself
     * — gross, then the Thread 10 reductions, then what is left to divide — so the number an
     * operator confirms is the engine's, and this card never computes a responsibility base.
     */
    const runResponsibilityCommand = useCallback(
        async (mode: "preview" | "execute", target: { chargeId: string; mode: "resolve" | "reallocate" }) => {
            const row = rowForCharge(target.chargeId);
            const result = await executeFinancialCommand({
                action: target.mode === "resolve" ? "resolveResponsibility" : "reallocateResponsibility",
                entity: {
                    entityType: row.subjectMemberId ? "child" : (chargeInvocation?.entityType ?? "child"),
                    entityId: row.subjectMemberId ?? chargeInvocation?.entityId ?? "",
                },
                mode,
                payload: {
                    charge_id: target.chargeId,
                    /* The authority refuses a reallocation with no reason; it is never defaulted here. */
                    ...(target.mode === "reallocate" ? { reason: reallocationReason } : {}),
                },
            });
            return result;
        },
        [chargeInvocation, reallocationReason, rowForCharge],
    );

    const previewResponsibility = useCallback(
        async (target: { chargeId: string; mode: "resolve" | "reallocate" }) => {
            if (running) return;
            setRunning(true);
            setResponsibilityError(null);
            const result = await runResponsibilityCommand("preview", target);
            if (result.ok) setResponsibilityPreview(result.preview ?? null);
            else setResponsibilityError(result.error);
            setRunning(false);
        },
        [runResponsibilityCommand, running],
    );

    const confirmResponsibility = useCallback(
        async (target: { chargeId: string; mode: "resolve" | "reallocate" }) => {
            if (running) return;
            setRunning(true);
            setResponsibilityError(null);
            const result = await runResponsibilityCommand("execute", target);
            /*
             * A REFUSAL IS AN ANSWER AND STAYS ON SCREEN. `reallocation_required` in particular is
             * the engine telling the operator that the arrangement in force would divide this
             * posted charge differently — which is a decision for them, not a retry for us.
             */
            if (!result.ok) {
                setResponsibilityError(result.error);
                setRunning(false);
                return;
            }
            setResponsibilityPreview(null);
            setReallocationReason("");
            setRunning(false);
            pop();
            await load();
        },
        [load, pop, runResponsibilityCommand, running],
    );


    /*
     * ── THIS CARD IS THE COMMAND HOST ──────────────────────────────────────────────────────────
     *
     * Financials → Accounts renders this card above its own ledger, as siblings. The ledger's rows
     * carry the same action icons as Details and must raise the same commands — so rather than the
     * workspace growing a Reverse of its own, it asks, and this card performs. One command model,
     * one eligibility model, one execution path, two presentation hosts.
     *
     * Registered only where a host actually provides the channel; in the Focus Panel there is none,
     * and this is inert.
     */
    const handleCommandRequest = useCallback(
        (request: FinancialCommandRequest) => {
            if (request.kind === "adjust") openAdjustForCharge({ chargeId: request.chargeId });
            else if (request.kind === "reverse") openReverseCharge({ chargeId: request.chargeId, label: request.label });
            else if (request.kind === "post") void runRowAction("post", rowForCharge(request.chargeId));
            /* The workspace asks for the same two commands; this card performs them. */
            else if (request.kind === "resolveResponsibility") {
                openResponsibility({ chargeId: request.chargeId, label: request.label, mode: "resolve" });
            } else if (request.kind === "reallocateResponsibility") {
                openResponsibility({ chargeId: request.chargeId, label: request.label, mode: "reallocate" });
            }
        },
        [openAdjustForCharge, openReverseCharge, openResponsibility, rowForCharge, runRowAction],
    );
    useRegisterFinancialCommandHost(handleCommandRequest);

    const previewReverseCharge = useCallback(async () => {
        if (!reverseCharge || running) return;
        setRunning(true);
        setReverseChargeError(null);
        const row = rowForCharge(reverseCharge.chargeId);
        /* The preview is the ACTION's, fetched through the one executor. */
        const result = await executeFinancialCommand({
            action: "reverse",
            entity: {
                entityType: row.subjectMemberId ? "child" : (chargeInvocation?.entityType ?? "child"),
                entityId: row.subjectMemberId ?? chargeInvocation?.entityId ?? "",
            },
            mode: "preview",
            payload: { charge_id: reverseCharge.chargeId, charge_label: reverseCharge.label, kind: "reversal" },
        });
        if (!result.ok) setReverseChargeError(result.error);
        else if (!result.preview) setReverseChargeError("This reversal could not be previewed.");
        else setReverseChargePreview(result.preview);
        setRunning(false);
    }, [chargeInvocation, reverseCharge, rowForCharge, running]);

    const confirmReverseCharge = useCallback(async () => {
        if (!reverseCharge || running || !reverseChargePreview) return;
        const target = reverseCharge;
        setReverseCharge(null);
        setReverseChargePreview(null);
        await runRowAction("reverse", rowForCharge(target.chargeId));
        // The original stays posted; what changed is that a corrective line now references it.
        setAdjustNotice(`Reversed ${target.label}. The original charge stays on the record, with its correction beside it.`);
    }, [reverseCharge, reverseChargePreview, rowForCharge, runRowAction, running]);

    // Elevation reported from RENDER-adjacent state, so the depth layer and this card agree on the
    // same frame. A card that reported after paint would flash its base surface first.
    useReportPerspective(coordination, "financials", overlay ? "focused" : "base");
    /*
     * ── DISMISSAL POPS ONE LEVEL ───────────────────────────────────────────────────────────────
     *
     * COMPACT → DETAILS → COMMAND is a stack, and closing a command returned the operator all the
     * way to the compact card: open Details, work the ledger, adjust a row, cancel — and the ledger,
     * the lens and the expanded periods were gone, because dismissal cleared the overlay outright.
     *
     * Dismissal pops ONE level, whatever the level happens to be: a command returns to Details,
     * Details returns to the compact card. Escape, the backdrop and every Cancel run through this
     * one path, so the three cannot drift apart.
     *
     * ── ONE GESTURE, ONE LEVEL ────────────────────────────────────────────────────────────────
     *
     * Dismissal has more than one announcer — the grid's backdrop publishes a signal, and this card
     * listens for Escape itself — and on some hosts both speak for the same keypress. Two pops for
     * one Escape would take the operator from a command past Details to the compact card, which is
     * the wrong-return defect wearing a different hat. So the pop is coalesced: whoever announces
     * first moves the stack, and anything arriving in the same gesture window is the same gesture.
     */
    const lastDismissRef = useRef(0);
    const [dismissNonce, setDismissNonce] = useState(0);
    const dismissOneLevel = useCallback(() => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - lastDismissRef.current < 150) return;
        lastDismissRef.current = now;
        setDismissNonce((n) => n + 1);
        pop();
        setPending(null);
        setCommandError(null);
        closeMovePanels();
        closeAdjustPanels();
        setReverseCharge(null);
        setReverseChargePreview(null);
        setReverseChargeError(null);
    }, [closeAdjustPanels, closeMovePanels, pop]);

    useDismissSignal(coordination, "financials", dismissOneLevel);

    /*
     * ── ESCAPE BELONGS TO THIS CARD'S OWN STACK ───────────────────────────────────────────────
     *
     * Measured on the mounted work-unit lane: Escape over an open Financials command did nothing
     * at all — the grid that owns the backdrop on this route publishes no dismissal, so the card
     * waited for a signal that never came while Cancel and the backdrop both worked. A stack whose
     * three dismissal gestures do not agree is not a stack.
     *
     * The yield condition is the shared one rather than a second opinion about it: an open select
     * menu or inline editor closes itself first, exactly as it does for the grid.
     */
    /*
     * ── A DISMISSAL THAT LEAVES A SURFACE STANDING MUST RE-ASSERT DEPTH ───────────────────────
     *
     * The host clears its OWN depth layer when the backdrop is clicked — reasonably, since for
     * every other card a dismissal means there is nothing left to elevate. This card has a stack,
     * so dismissing a command leaves Details standing and still owed the depth layer.
     *
     * `useReportPerspective` reports only when the LEVEL changes, and the level does not change
     * here: it was "focused" for the command and is "focused" for Details. So nothing re-reported,
     * the host stayed collapsed, and everything from then on rendered un-elevated — measured as a
     * Reverse command with no backdrop at all in the DOM, which is how an operator ends up with a
     * money-destroying command open over a live, clickable page.
     *
     * Re-asserting is the whole fix: same value, said again, because the host has forgotten it.
     */
    useEffect(() => {
        if (dismissNonce === 0 || !overlay) return;
        coordination?.reportPerspective?.("financials", "focused");
    }, [dismissNonce, overlay, coordination]);

    useEffect(() => {
        if (!overlay) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (hasInnerDismissibleLayer(document)) return;
            event.preventDefault();
            /*
             * DELIBERATELY NOT stopPropagation.
             *
             * Swallowing the key kept the grid from seeing a dismissal it also tracks, and the two
             * drifted apart: measured after one Escape-dismissed command, re-opening a command
             * rendered the surface with NO backdrop in the DOM — the card thought it was elevated
             * and the grid no longer did. An operator then has a money-destroying command open
             * over an un-scrimmed page.
             *
             * The key is allowed to continue, so every listener keeps its own books straight, and
             * `dismissOneLevel` makes the extra announcements harmless: one gesture still moves the
             * stack exactly one level.
             */
            dismissOneLevel();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [overlay, dismissOneLevel]);

    /*
     * ── ADD CHARGE — the approved command card, over the domain's own preview ──
     *
     * The template catalog, the preview and the write are all unchanged: `mode: "preview"` runs the
     * same resolver the write uses, so what the operator confirms is what gets persisted. Only the
     * PRESENTATION moves — from a generic list-and-confirm into the approved command card.
     */
    /*
     * ── THE PAYMENT BAND, HOISTED SO THE MOUNTED PANEL CAN ACTUALLY REACH IT ──
     *
     * Everything Slice H built — the rail chooser, the amount, the card collection and the
     * finalizing/failed/recognized states — lived inside the band region below, which renders only
     * when this card falls through to its own anatomy. The mounted Focus Panel never falls through:
     * a healthy account returns the approved card above, and `Details →` returns the approved detail
     * above that. So the payment operation was built, typechecked, and unreachable in the product —
     * `Record payment →` did not exist in any representation an operator could open.
     *
     * Hoisting it costs nothing (every value it closes over is resolved by this point) and lets the
     * detail representation — the density where an operator is actually working the ledger — carry
     * the operation, which is where FinancialsDetailCard's own `Payment` action already pointed.
     */
    /*
     * The band's own heading is suppressed inside the Payment COMMAND, where the command's title
     * already says "Payment" one line above it. Two headings, one word, one surface.
     */
    /*
     * THE CANONICAL ADJUSTMENT ENTRY, hoisted so the unified Add command can host it.
     *
     * Same state, same `billing.adjust_account` preview and commit, same enrolment scoping. What
     * changed is only WHERE it renders: it was a band beneath the ledger reached by a footer link,
     * and it is now the Adjustment mode of the one financial entry command.
     */
    /*
     * ── AN EMPTY COMMAND IS NOT A COMMAND ─────────────────────────────────────────────────────
     *
     * `adjustmentBand` is null whenever `adjustOpen` is false, and the two could fall out of step:
     * `closeAdjustPanels` clears `adjustOpen` while `entryMode` keeps saying "adjustment", so the
     * next Add opened straight onto the Adjustment mode with nothing beneath the selector — a
     * committed destination whose whole body was missing. Kelly screenshotted it.
     *
     * The band is the destination's body, so `adjustmentReady` below is what the render asks
     * before committing to Adjustment at all, and the effect after it opens the band whenever the
     * mode is selected. Neither alone is enough: the effect keeps them in step, and the guard
     * makes the empty state unrenderable even if some future path breaks step again.
     */
    const adjustmentBand = adjustOpen ? (

                    <div className="alloy-os-fdetail__movepanel" data-testid="adjustment-panel">
                        <div className="alloy-os-fdetail__moveheader">Add adjustment</div>
                        <div className="alloy-os-fdetail__movefield">
                            <span>Against enrolment</span>
                            <AlloySelect
                                testId="adjustment-agreement"
                                aria-label="Against enrolment"
                                allowEmpty={false}
                                value={adjustAgreementId}
                                options={adjustableSubjects.map((sub) => ({
                                    value: sub.agreementId,
                                    label: sub.displayName,
                                }))}
                                onChange={(next) => {
                                    setAdjustAgreementId(next);
                                    // The charges on offer belong to the enrolment; changing it changes them.
                                    setAdjustSourceChargeId("");
                                    setAdjustPreview(null);
                                }}
                            />
                        </div>
                        <div className="alloy-os-fdetail__movefield">
                            <span>Against charge</span>
                            <AlloySelect
                                testId="adjustment-source-charge"
                                aria-label="Against charge"
                                placeholder="Choose the charge this is about…"
                                value={adjustSourceChargeId}
                                options={adjustableCharges.map((r) => ({
                                    value: r.chargeId,
                                    label:
                                        `${r.description ?? r.categoryLabel}`
                                        + (r.date ? ` · ${r.date}` : "")
                                        + ` · ${(r.outstandingCents / 100).toLocaleString(undefined, {
                                            style: "currency",
                                            currency,
                                        })} outstanding`,
                                }))}
                                onChange={(next) => {
                                    setAdjustSourceChargeId(next);
                                    setAdjustPreview(null);
                                }}
                            />
                        </div>
                        <label className="alloy-os-fdetail__movefield">
                            <span>Type</span>
                            {/*
                              * Two categories, not three. `discount` exists in the vocabulary but
                              * is owned by authored policy — a manual one would land in the same
                              * bucket as a configured one and nothing on the card could tell an
                              * operator which was policy and which was somebody's decision.
                              */}
                            <AlloySelect
                                testId="adjustment-category"
                                aria-label="Type"
                                allowEmpty={false}
                                value={adjustCategory}
                                options={[
                                    { value: "credit", label: "Credit — lowers what the family owes" },
                                    { value: "adjustment", label: "Adjustment — either direction" },
                                ]}
                                onChange={(next) => {
                                    setAdjustCategory(next as "credit" | "adjustment");
                                    setAdjustPreview(null);
                                }}
                            />
                        </label>
                        {adjustCategory === "adjustment" ? (
                            <label className="alloy-os-fdetail__movefield">
                                <span>Direction</span>
                                <AlloySelect
                                    testId="adjustment-direction"
                                    aria-label="Direction"
                                    allowEmpty={false}
                                    value={adjustDirection}
                                    options={[
                                        { value: "decrease", label: "Lower what the family owes" },
                                        { value: "increase", label: "Raise what the family owes" },
                                    ]}
                                    onChange={(next) => {
                                        setAdjustDirection(next as "decrease" | "increase");
                                        setAdjustPreview(null);
                                    }}
                                />
                            </label>
                        ) : null}
                        <label className="alloy-os-fdetail__movefield">
                            <span>Amount</span>
                            <input
                                data-testid="adjustment-amount"
                                inputMode="decimal"
                                value={adjustAmount}
                                onChange={(e) => {
                                    setAdjustAmount(e.target.value);
                                    setAdjustPreview(null);
                                }}
                                placeholder="25.00"
                            />
                        </label>
                        <label className="alloy-os-fdetail__movefield">
                            <span>Reason</span>
                            <input
                                data-testid="adjustment-reason"
                                value={adjustReason}
                                onChange={(e) => {
                                    setAdjustReason(e.target.value);
                                    setAdjustPreview(null);
                                }}
                                placeholder="Agreed goodwill credit"
                            />
                        </label>
                        <label className="alloy-os-fdetail__movefield">
                            <span>Effective date</span>
                            <input
                                data-testid="adjustment-effective-date"
                                type="date"
                                value={adjustEffectiveDate}
                                onChange={(e) => {
                                    setAdjustEffectiveDate(e.target.value);
                                    setAdjustPreview(null);
                                }}
                            />
                        </label>
                        {adjustPreview ? (
                            <div className="alloy-os-fdetail__movepreview" data-testid="adjustment-preview">
                                <strong>{adjustPreview.summary}</strong>
                                {adjustPreview.changes.map((c) => (
                                    <span key={c}>{c}</span>
                                ))}
                                {/*
                                  * The action's own summary speaks in the present tense. It writes a
                                  * draft, so the timing is stated here rather than left to be
                                  * discovered when the balance does not move.
                                  */}
                                <span data-testid="adjustment-preview-timing">
                                    Recorded as a draft — it changes what the family owes once posted.
                                </span>
                            </div>
                        ) : null}
                        {adjustError ? (
                            <div className="alloy-os-fdetail__moveerror" data-testid="adjustment-error">
                                {adjustError}
                            </div>
                        ) : null}
                        <div className="alloy-os-fdetail__moveactions">
                            <button
                                type="button"
                                data-testid="adjustment-preview-button"
                                disabled={running || !adjustReason.trim() || !adjustAgreementId || !adjustSourceChargeId}
                                onClick={() => void previewAdjustment()}
                            >
                                Preview
                            </button>
                            <button
                                type="button"
                                data-testid="adjustment-confirm"
                                disabled={running || !adjustPreview}
                                onClick={() => void confirmAdjustment()}
                            >
                                Confirm
                            </button>
                            <button
                                type="button"
                                data-testid="adjustment-cancel"
                                onClick={() => {
                                    closeAdjustPanels();
                                    /* Cancel is a dismissal like any other: one level back. */
                                    pop();
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
    ) : null;

    /** The Adjustment destination's body. Without it there is no destination to commit to. */
    const adjustmentReady = adjustmentBand != null;

    useEffect(() => {
        if (entryMode !== "adjustment" || adjustOpen) return;
        if (adjustableSubjects.length === 0) return;
        openAddAdjustment();
    }, [entryMode, adjustOpen, adjustableSubjects.length, openAddAdjustment]);

    const paymentBandFor = (labelled: boolean) => vm ? (
            <section className="alloy-os-financials__band" data-financials-band="payment">
                {labelled ? <p className="alloy-os-financials__band-label">Payment</p> : null}
                {/*
                    ONLY CANONICAL PAYMENT STATE THAT ACTUALLY EXISTS.
                    This region used to print the platform's own limitations at
                    the operator — "payments are not recorded for enrollment
                    accounts yet", "autopay is not configured in this platform",
                    "responsibility splits are owned by Processing". Those are
                    development findings; they belong in the ledger, not on a
                    card someone uses to run a childcare centre. Where no
                    canonical payment state exists, the region stays neutral and
                    says nothing rather than explaining our architecture.
                */}
                {vm.paymentSetup ? (
                    <p className="alloy-os-financials__note" data-financials-payment="state">
                        {vm.paymentSetup}
                    </p>
                ) : null}

                {/*
                    WHAT IS STILL ON ITS WAY, read from the DATABASE.

                    A card collection lasts seconds and could live happily in component state. A bank
                    debit lasts days — the operator closes the tab and comes back tomorrow — so an
                    in-flight collection is read from the view model and survives a reload. The words
                    come from the shared lifecycle module, so nothing here can invent a state that
                    means money.
                */}
                {vm.openCollections.length ? (
                    <ul className="alloy-os-financials__payments" data-financials-collections="true">
                        {vm.openCollections.map((c) => {
                            const rail = (c.rail === "ach" ? "ach" : "card") as CollectionRail;
                            const state = collectionLifecycle({
                                rail,
                                processorState: c.processorState,
                                providerActionType: c.providerActionType,
                                canonicallyRecognized: false,
                            });
                            return (
                                <li
                                    key={c.attemptId}
                                    className="alloy-os-financials__payment"
                                    data-financials-collection={c.attemptId}
                                    data-financials-collection-rail={c.rail}
                                    data-financials-collection-state={state}
                                >
                                    <span>{money(c.amountCents, c.currencyCode)}</span>
                                    <span className="alloy-os-financials__note">
                                        {lifecycleLabel(state, rail)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                ) : null}

                {/*
                    WHAT ARRIVED, AND WHAT IT IS DOING.
                    `vm.payments` was composed by the read model and never
                    rendered, so a family could send $500, have $300 applied, and
                    the card showed neither number. Received and applied are
                    separate facts; the difference between them is money sitting
                    on the account, and it is called UNAPPLIED — never account
                    credit, which in this platform is a charge-side ledger row.
                */}
                {vm.payments.length ? (
                    <ul
                        className="alloy-os-financials__payments"
                        data-financials-payments="true"
                    >
                        {presentPayments(vm.payments).map((p) => {
                            const composing = refundTarget?.paymentId === p.paymentId;
                            return (
                                <li
                                    key={p.paymentId}
                                    className="alloy-os-financials__payment"
                                    data-financials-payment-id={p.paymentId}
                                    data-financials-payment-kind={p.kind}
                                >
                                    <span data-financials-payment-received="true">
                                        {p.kind === "receipt" ? "" : "−"}
                                        {money(p.receivedCents, p.currencyCode)}
                                    </span>
                                    <span
                                        className="alloy-os-financials__note"
                                        data-financials-payment-origin={p.reversalOrigin ?? undefined}
                                    >
                                        {p.statusLabel} · {p.methodLabel}
                                        {/* A return says who did it, because "Returned" alone still
                                            leaves an operator wondering which of them acted. */}
                                        {p.kind === "return" ? " · reversed by the bank" : null}
                                    </span>
                                    {p.kind === "receipt" && p.isMoney ? (
                                        <span
                                            className="alloy-os-financials__note"
                                            data-financials-payment-applied={p.appliedCents}
                                        >
                                            {money(p.appliedCents, p.currencyCode)} applied
                                            {p.unappliedCents > 0 ? (
                                                <>
                                                    {" · "}
                                                    <span data-financials-payment-unapplied={p.unappliedCents}>
                                                        {money(p.unappliedCents, p.currencyCode)} unapplied
                                                    </span>
                                                </>
                                            ) : null}
                                        </span>
                                    ) : null}
                                    {/*
                                        WHAT IS LEFT OF THIS RECEIPT, once some of it has gone back.
                                        The original amount stays on the row above rather than being
                                        replaced by a "Partially refunded" state that hides both
                                        numbers; refunded and retained are stated beside it.
                                    */}
                                    {p.kind === "receipt" && p.isMoney && p.refundedCents > 0 ? (
                                        <span
                                            className="alloy-os-financials__note"
                                            data-financials-payment-refunded={p.refundedCents}
                                        >
                                            {money(p.refundedCents, p.currencyCode)} returned or refunded ·{" "}
                                            <span data-financials-payment-retained={p.receivedCents - p.refundedCents}>
                                                {money(p.receivedCents - p.refundedCents, p.currencyCode)} net retained
                                            </span>
                                        </span>
                                    ) : null}
                                    {p.offersRefund && !composing ? (
                                        <button
                                            type="button"
                                            className="alloy-os-financials__action"
                                            data-financials-command="payment.refund"
                                            data-financials-refund-payment={p.paymentId}
                                            disabled={running}
                                            onClick={() => {
                                                setCommandError(null);
                                                setRefundError(null);
                                                setRefundTarget({
                                                    paymentId: p.paymentId,
                                                    label: `${money(p.receivedCents, p.currencyCode)} ${p.methodLabel}`,
                                                    receivedCents: p.receivedCents,
                                                    refundedCents: p.refundedCents,
                                                    refundableCents: p.refundableCents,
                                                    currencyCode: p.currencyCode,
                                                });
                                                // Opens at the full remaining refundable amount.
                                                setRefundAmount((p.refundableCents / 100).toFixed(2));
                                            }}
                                        >
                                            Refund
                                        </button>
                                    ) : null}
                                    {composing ? (
                                        <div
                                            className="alloy-os-financials__preview"
                                            data-financials-refund-form="true"
                                            data-financials-refund-for={p.paymentId}
                                        >
                                            <p className="alloy-os-financials__preview-summary">
                                                Refund {p.methodLabel} payment
                                            </p>
                                            {/* Every figure the decision needs, so nothing is worked
                                                out in the operator's head. */}
                                            <p className="alloy-os-financials__note">
                                                <span data-financials-refund-original={p.receivedCents}>
                                                    {money(p.receivedCents, p.currencyCode)} original
                                                </span>
                                                {" · "}
                                                <span data-financials-refund-already={p.refundedCents}>
                                                    {money(p.refundedCents, p.currencyCode)} already refunded
                                                </span>
                                                {" · "}
                                                <span data-financials-refund-remaining={p.refundableCents}>
                                                    {money(p.refundableCents, p.currencyCode)} refundable
                                                </span>
                                            </p>
                                            <input
                                                className="alloy-os-financials__input"
                                                data-financials-refund-amount="true"
                                                inputMode="decimal"
                                                value={refundAmount}
                                                onChange={(e) => {
                                                    setRefundError(null);
                                                    setRefundAmount(e.target.value);
                                                }}
                                                aria-label={`Refund amount in ${p.currencyCode}`}
                                            />
                                            {refundError ? (
                                                <p
                                                    className="alloy-os-financials__note"
                                                    data-financials-refund-error="true"
                                                >
                                                    {refundError}
                                                </p>
                                            ) : null}
                                            <span className="alloy-os-financials__preview-actions">
                                                <button
                                                    type="button"
                                                    className="alloy-os-financials__action"
                                                    data-financials-refund-commit="true"
                                                    disabled={running}
                                                    onClick={() => {
                                                        /*
                                                         * Cents, as an integer, because money is not
                                                         * a float — the same conversion the payment
                                                         * amount already uses.
                                                         *
                                                         * These checks are for the operator's sake,
                                                         * not the ledger's: the action re-derives
                                                         * eligibility, the merchant, the currency and
                                                         * the cumulative ceiling on the server, and
                                                         * its refusal is what decides.
                                                         */
                                                        const cents = Math.round(Number(refundAmount) * 100);
                                                        if (!Number.isFinite(cents) || cents <= 0) {
                                                            setRefundError("Enter a refund amount greater than zero.");
                                                            return;
                                                        }
                                                        if (cents > p.refundableCents) {
                                                            setRefundError(
                                                                `Refund amount exceeds the remaining refundable balance of ${money(p.refundableCents, p.currencyCode)}.`,
                                                            );
                                                            return;
                                                        }
                                                        setRefundError(null);
                                                        void runPaymentAction(
                                                            "payment.refund",
                                                            {
                                                                payment_id: p.paymentId,
                                                                amount_cents: cents,
                                                                payment_label: `${money(p.receivedCents, p.currencyCode)} ${p.methodLabel}`,
                                                            },
                                                            paymentEntityFor(chargeTarget),
                                                        ).then((outcome) => {
                                                            if (outcome?.ok) setRefundTarget(null);
                                                        });
                                                    }}
                                                >
                                                    Refund{" "}
                                                    {money(
                                                        Math.max(0, Math.round(Number(refundAmount) * 100) || 0),
                                                        p.currencyCode,
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="alloy-os-financials__action"
                                                    data-financials-refund-cancel="true"
                                                    disabled={running}
                                                    onClick={() => {
                                                        setRefundTarget(null);
                                                        setRefundError(null);
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            </span>
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                ) : null}

                {/* Cash on the account, stated as cash. Never subtracted from
                    what is owed here — applying money is its own act with its
                    own record, and the balance above stays the read model's. */}
                {unappliedTotalCents(vm.payments) > 0 ? (
                    <p
                        className="alloy-os-financials__note"
                        data-financials-unapplied-total={unappliedTotalCents(vm.payments)}
                    >
                        {money(unappliedTotalCents(vm.payments), currency)} received and not yet
                        applied
                    </p>
                ) : null}

                {/* RECORD PAYMENT — the charges that can actually take money.
                    `offersPayment` is the read model's answer, the same way
                    `offersReverse` is; this renders it and does not restate it. */}
                {payableRows.length ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="alloy-os-financials__action"
                                data-financials-command="payment.record"
                                disabled={running}
                            >
                                Record payment →
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" sideOffset={4} data-financials-payment-menu="true">
                            {payableRows.map((r) => (
                                <DropdownMenuItem
                                    key={r.chargeId}
                                    data-financials-payment-charge={r.chargeId}
                                    onSelect={() => {
                                        setCommandError(null);
                                        setPayTarget({
                                            chargeId: r.chargeId,
                                            label: r.description ?? r.categoryLabel,
                                            outstandingCents: r.outstandingCents,
                                            subjectMemberId: r.subjectMemberId,
                                        });
                                        // The row's own outstanding amount, from
                                        // the read model. The operator may lower
                                        // it for a partial payment.
                                        setPayAmount((r.outstandingCents / 100).toFixed(2));
                                    }}
                                >
                                    {r.description ?? r.categoryLabel}
                                    <span className="alloy-os-financials__menu-amount">
                                        {money(r.outstandingCents, r.currencyCode)}
                                    </span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : null}

                {payTarget ? (
                    <div
                        className="alloy-os-financials__preview"
                        data-financials-payment-form="true"
                    >
                        <p className="alloy-os-financials__preview-summary">
                            {payTarget.label}
                        </p>
                        <p className="alloy-os-financials__note">
                            {money(payTarget.outstandingCents, currency)} outstanding
                        </p>
                        {/*
                         * LABELLED, like every other Alloy command field. This was three bare
                         * controls in a column — an amount, a method and a payer with nothing
                         * saying which was which, which is what made the command read as a raw form
                         * rather than a financial operation.
                         */}
                        <p className="alloy-os-financials__fieldlabel">Amount</p>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={payAmount}
                            aria-label="Payment amount"
                            data-financials-payment-amount="true"
                            onChange={(e) => setPayAmount(e.target.value)}
                        />
                        <p className="alloy-os-financials__fieldlabel">Method</p>
                        {/*
                            Bank transfer is a real rail with no executor yet. Offering it as though
                            it worked recorded money nobody had collected, which is the same defect
                            Card had; it stays VISIBLE AND DISABLED so the model reads truthfully —
                            and the canonical control carries disabled options natively, arrowing
                            past them rather than parking the operator on a dead row.

                            Availability is the SERVER's answer, carried on the view model from the
                            merchant's own recorded capability. A chooser deciding this for itself
                            would offer a collection the provider then refuses, after the operator
                            was told it was under way.
                        */}
                        <AlloySelect
                            value={payMethod}
                            aria-label="Payment method"
                            testId="financials-payment-method"
                            allowEmpty={false}
                            options={[
                                { value: "card", label: "Card" },
                                { value: "cash", label: "Cash" },
                                { value: "check", label: "Check" },
                                { value: "money_order", label: "Money order" },
                                {
                                    value: "ach",
                                    label: vm.achAvailable
                                        ? "Bank account"
                                        : "Bank account — not enabled for this organization",
                                    disabled: !vm.achAvailable,
                                },
                                { value: "other", label: "Other" },
                            ]}
                            onChange={(next) => setPayMethod(next)}
                        />
                        {/*
                         * ── WHO ACTUALLY PAID — a different question from who owes it ───────────
                         *
                         * Candidates are household membership, not responsibility, and the list is
                         * ordered by primary contact rather than by who carries the obligation:
                         * ordering it by responsibility is how an operator records the responsible
                         * party as the payer without noticing. A grandparent settling a bill is a
                         * payer and is responsible for nothing.
                         *
                         * Naming a payer confers no responsibility, and attributing the money to
                         * somebody's SHARE remains a separate, explicit act.
                         */}
                        {vm.payerCandidates.length ? (
                            <>
                            <p className="alloy-os-financials__fieldlabel">Who paid</p>
                            <AlloySelect
                                value={payPayerPersonId}
                                aria-label="Who paid"
                                testId="financials-payment-payer"
                                placeholder="Who paid? (optional)"
                                options={vm.payerCandidates.map((c) => ({
                                    value: c.personId,
                                    label:
                                        `${c.name}`
                                        + (c.roleType ? ` · ${c.roleType.replace(/_/g, " ")}` : "")
                                        + (c.alsoResponsible ? " · also responsible" : ""),
                                }))}
                                onChange={(next) => setPayPayerPersonId(next)}
                            />
                            </>
                        ) : null}
                        <span className="alloy-os-financials__preview-actions">
                            <button
                                type="button"
                                className="alloy-os-financials__action"
                                data-financials-payment-commit="true"
                                disabled={running}
                                onClick={() => {
                                    // Cents, as an integer, because money is not
                                    // a float. The action refuses anything that
                                    // is not a positive integer of cents.
                                    const cents = Math.round(Number(payAmount) * 100);
                                    const subject = paymentEntityFor(payTarget.subjectMemberId ?? chargeTarget);

                                    /*
                                     * ── WHICH RAILS ASK, AND WHICH ONES WRITE DOWN ──
                                     *
                                     * Card and bank account both COLLECT: money has to be asked for
                                     * and confirmed by the provider before any of it is real. Cash,
                                     * check and money order RECORD money that already arrived.
                                     *
                                     * Sending a bank debit down the record path would write a
                                     * receipt for money no bank has moved yet — the same defect Card
                                     * had, on a rail where settlement takes days rather than
                                     * seconds, so the lie would last longer.
                                     */
                                    const collects = payMethod === "card" || payMethod === "ach";
                                    if (!collects) {
                                        void runPaymentAction(
                                            "payment.record",
                                            {
                                                charge_id: payTarget.chargeId,
                                                amount_cents: cents,
                                                payment_method: payMethod,
                                                charge_label: payTarget.label,
                                                /* Identity of the payer. Omitted entirely when
                                                   nobody was named — never defaulted to whoever
                                                   happens to be responsible. */
                                                ...(payPayerPersonId
                                                    ? {
                                                          payer_entity_type: "person",
                                                          payer_entity_id: payPayerPersonId,
                                                      }
                                                    : {}),
                                            },
                                            subject,
                                        );
                                        return;
                                    }

                                    /*
                                     * CARD ASKS FOR THE MONEY. The server decides
                                     * whether this organisation can collect at
                                     * all — a merchant that has not finished
                                     * onboarding is a blocked state with an
                                     * explanation, never a generic failure and
                                     * never a fallback to Alloy's own account.
                                     */
                                    setCardMessage(null);
                                    void (async () => {
                                        const outcome = await runPaymentAction(
                                            "payment.collect_card",
                                            {
                                                charge_id: payTarget.chargeId,
                                                amount_cents: cents,
                                                charge_label: payTarget.label,
                                                // Intent only. The server resolves the merchant, its
                                                // capability for this rail, and what may be taken.
                                                rail: payMethod,
                                            },
                                            subject,
                                        );
                                        if (!outcome?.ok) {
                                            setCardStage("blocked");
                                            setCardMessage(
                                                outcome?.error
                                                    ?? (payMethod === "ach"
                                                        ? "Bank collection is unavailable."
                                                        : "Card collection is unavailable."),
                                            );
                                            return;
                                        }
                                        const d = outcome.detail;
                                        setCardCollection({
                                            clientSecret: String(d.client_secret ?? ""),
                                            connectedAccount: String(d.connected_account ?? ""),
                                            attemptId: String(d.collection_attempt_id ?? ""),
                                            amountCents: Number(d.amount_cents ?? cents),
                                        });
                                        setCardStage("entry");
                                    })();
                                }}
                            >
                                {payMethod === "card"
                                    ? "Collect by card"
                                    : payMethod === "ach"
                                        ? "Collect by bank account"
                                        : "Record payment"}
                            </button>
                            <button
                                type="button"
                                className="alloy-os-financials__action"
                                data-financials-payment-cancel="true"
                                disabled={running}
                                onClick={() => setPayTarget(null)}
                            >
                                Cancel
                            </button>
                        </span>

                        {/*
                            THE INTERVAL BETWEEN ASKING AND BEING PAID.
                            Cash has no such interval, which is why the panel
                            never needed these states before. Every one of them
                            is deliberately NOT "paid": the balance below does
                            not move until Financials recognises the money.
                        */}
                        {cardStage === "blocked" ? (
                            <p
                                className="alloy-os-financials__note"
                                data-financials-card-blocked="true"
                            >
                                {cardMessage ?? "Card collection is unavailable."}
                            </p>
                        ) : null}

                        {cardStage === "entry" && cardCollection ? (
                            <CardCollectionField
                                clientSecret={cardCollection.clientSecret}
                                connectedAccount={cardCollection.connectedAccount}
                                amountLabel={money(cardCollection.amountCents, currency)}
                                disabled={running}
                                onCancel={() => {
                                    setCardStage("idle");
                                    setCardCollection(null);
                                }}
                                onResult={(r) => {
                                    if (r.status === "failed") {
                                        setCardStage("failed");
                                        setCardMessage(r.message ?? "That card could not be charged.");
                                        return;
                                    }
                                    /*
                                     * The card went through at the processor.
                                     * That is NOT a payment yet — Financials
                                     * recognises it when provider confirmation
                                     * reaches the canonical posting path — so the
                                     * operator is told it is finalizing, and is
                                     * never offered "charge again" as recovery.
                                     */
                                    setCardStage("finalizing");
                                    setCardMessage(null);
                                    void (async () => {
                                        for (let i = 0; i < 12; i += 1) {
                                            await new Promise((res) => setTimeout(res, 1000));
                                            await load();
                                            const check = await fetch(
                                                `/api/admin/financials/collection-state?attempt_id=${cardCollection.attemptId}`,
                                                { credentials: "include" },
                                            );
                                            if (!check.ok) continue;
                                            const body = (await check.json()) as { recognized?: boolean };
                                            if (body.recognized) {
                                                setCardStage("recognized");
                                                setCardCollection(null);
                                                setPayTarget(null);
                                                await load();
                                                return;
                                            }
                                        }
                                    })();
                                }}
                            />
                        ) : null}

                        {cardStage === "finalizing" ? (
                            <p
                                className="alloy-os-financials__note"
                                data-financials-card-finalizing="true"
                            >
                                Payment received — finalizing. The balance updates when Financials records it.
                            </p>
                        ) : null}

                        {cardStage === "failed" ? (
                            <p
                                className="alloy-os-financials__note"
                                data-financials-card-failed="true"
                            >
                                {cardMessage ?? "That card could not be charged."} Nothing was collected and the balance is unchanged.
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {cardStage === "recognized" ? (
                    <p
                        className="alloy-os-financials__note"
                        data-financials-card-recognized="true"
                    >
                        Payment received.
                    </p>
                ) : null}

                {!vm.paymentSetup && !vm.payments.length && !payableRows.length ? (
                    <p className="alloy-os-financials__note" data-financials-payment="none">
                        No payments recorded
                    </p>
                ) : null}
            </section>
    ) : null;

    /*
     * The mode control, declared once and rendered by whichever mode's host is on screen. Two
     * inline copies would be two places for the modes to drift apart.
     */
    const entryModes = (
        <div className="alloy-os-financials__entrymodes" role="tablist" aria-label="What to add">
            {(["charge", "adjustment"] as const).map((mode) => (
                <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={entryMode === mode}
                    data-financials-entry-mode-tab={mode}
                    className={entryMode === mode ? "is-selected" : undefined}
                    onClick={() => {
                        setEntryMode(mode);
                        if (mode === "adjustment" && !adjustOpen) openAddAdjustment();
                    }}
                >
                    {mode === "charge" ? "Charge" : "Adjustment"}
                </button>
            ))}
        </div>
    );

    if (overlay === "add_charge" && vm && reconciliation) {
        const templates = vm.chargeTemplates.map((tpl) => adaptChargeTemplateOption(tpl, currency));
        const selected =
            templates.find((tpl) => tpl.key === pending?.templateId) ?? templates[0] ?? null;
        const subjectLabel =
            subjectFilter === "all" ?
                "Household"
            :   (vm.subjects.find((sub) => sub.customerMemberId === subjectFilter)?.displayName
                ?? "Household");

        return (
            <div className="alloy-os-financials" data-financials-card="true" data-financials-overlay="add_charge"
                data-financials-entry-mode={entryMode}>
                {/*
                 * ── ONE ENTRY, TWO OPERATIONS — AND BOTH HOSTED BY THE PLATFORM CARD ──────────
                 *
                 * A charge and an adjustment stay different financial objects with different
                 * writers, different permissions and different audit meaning. What they stopped
                 * being is two unrelated PLACES: Add charge was a command and Add adjustment was a
                 * link under the ledger, so raising a credit meant knowing which of the two Alloy
                 * files it under. The operator's job is one job — put a financial fact on this
                 * account — and the mode belongs on the command.
                 *
                 * The mode control renders INSIDE the command's own card, never beside it. An
                 * elevated Focus Panel cell makes every direct child inert and grants interaction
                 * to `.alloy-os-ucard` alone; measured mounted, the control was visible, keyboard-
                 * focusable and would not take a pointer click, with `elementFromPoint` returning
                 * the depth scrim. Add charge and Payment each learned this before it.
                 */}
                {entryMode === "adjustment" && adjustmentReady ? (
                    /*
                     * The SAME canonical adjustment entry, in the command's shell rather than in a
                     * band under the ledger. `billing.adjust_account` is unchanged and is still the
                     * only writer; `openAddAdjustment` still chooses the enrolment.
                     */
                    <UniversalCard
                        title="Add"
                        insight=""
                        iconName="Receipt"
                        tier="work"
                        archetype="status"
                        modalClass="command"
                        density="expanded"
                        gridSpan="row"
                        data-universal-card-key="add_adjustment"
                        footerAction={null}
                    >
                        <div className="alloy-os-financials__entrybody" data-financials-entry="adjustment">
                            {entryModes}
                            {adjustmentBand}
                        </div>
                    </UniversalCard>
                ) : selected ? (
                    <AddChargeCommand
                        modeSlot={entryModes}
                        templates={templates}
                        specimen={adaptAddChargeSpecimen({
                            template: selected,
                            subjectLabel,
                            amount: chargeAmount || selected.amount || "—",
                            note: chargeNote,
                            period: vm.period.label,
                            balanceCents: reconciliation.balanceCents,
                            currency,
                            previewSummary: pending?.summary ?? null,
                            previewChanges: pending?.changes ?? [],
                        })}
                        controls={{
                            selectedTemplateId: selected.key,
                            onSelectTemplate: (id) => {
                                const tpl = templates.find((x) => x.key === id);
                                /*
                                 * A CHANGE OF TYPE CAN INVALIDATE THE SUBJECT. Switching to a
                                 * child-grained type while the command is anchored on the
                                 * household would leave the selection pointing at an option the
                                 * list no longer offers — the operator would read the first child
                                 * and the payload would still say household. Move the anchor to a
                                 * real subject instead of letting the two disagree.
                                 */
                                const cat = tpl?.categoryKey ?? "";
                                if (subjectFilter === "all" && !categoryPermitsHouseholdGrain(cat)) {
                                    const first = vm.subjects[0]?.customerMemberId;
                                    if (first) setSubjectFilter(first);
                                } else if (subjectFilter !== "all" && !categoryPermitsChildGrain(cat)) {
                                    setSubjectFilter("all");
                                }
                                void preview(id, tpl?.label ?? "");
                            },
                            /*
                             * ── ALSO BILL THESE CHILDREN ─────────────────────────────────────
                             *
                             * Offered only where widening is LEGITIMATE: the charge category must
                             * permit child grain (the code-owned rule — a household account fee
                             * cannot become a child's), the command must be anchored on a child
                             * rather than the household, and there must be a sibling to add.
                             *
                             * Anchored at the household the control is absent BY DESIGN: a
                             * household charge is reached by naming NO child, and offering
                             * checkboxes there would invite an empty selection to mean "household",
                             * which is precisely the ambiguity the grain model forbids.
                             */
                            alsoChildren:
                                selected
                                && categoryPermitsChildGrain(selected.categoryKey ?? "")
                                && subjectFilter !== "all"
                                && vm.subjects.length > 1
                                    ? {
                                          options: vm.subjects
                                              .filter((sub) => sub.customerMemberId !== subjectFilter)
                                              .map((sub) => ({ id: sub.customerMemberId, label: sub.displayName })),
                                          selectedIds: selectedChildIds,
                                          onToggle: (id: string) =>
                                              setExtraChildIds((prev) =>
                                                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                                              ),
                                          perChildLabel: chargeAmount || selected.amount || null,
                                      }
                                    : undefined,
                            /*
                             * ── APPLIES TO, NARROWED BY WHAT THE CHARGE TYPE CAN MEAN ────────
                             *
                             * The same code-owned rule that governs "Also bill" governs this list.
                             * It offered Household and every child for EVERY type, so an operator
                             * could select Monthly tuition — a CHILD-grained charge — and apply it
                             * to the household. The write path now refuses that, and a control that
                             * offers a choice the domain will refuse is a worse surface than one
                             * that never offers it.
                             *
                             * Both halves are conditional because both are real: a household
                             * account fee cannot become a child's, and a child's tuition cannot
                             * become the household's.
                             */
                            /*
                             * ── ONE CONTROL, THE SAME GRAIN MODEL ────────────────────────────
                             *
                             * `subjectFilter` is still the anchor and `extraChildIds` still the
                             * widening; nothing about the payload, the writer or per-child
                             * obligation identity changes. What changes is that the operator sees
                             * one question instead of two, and mutual exclusion is enforced in
                             * the handlers rather than left to them to understand:
                             *
                             *   Household  → anchor "all", extras cleared
                             *   a child    → anchor that child, the rest as extras
                             *   last child untucked → anchor "all" would mean HOUSEHOLD, which an
                             *                         empty selection must never mean, so the
                             *                         anchor is parked on the child just removed
                             *                         and the summary asks for a choice.
                             */
                            unifiedTarget:
                                selected && categoryPermitsChildGrain(selected.categoryKey ?? "") && vm.subjects.length > 0
                                    ? {
                                          householdOffered: categoryPermitsHouseholdGrain(selected.categoryKey ?? ""),
                                          householdSelected: subjectFilter === "all",
                                          onSelectHousehold: () => {
                                              setSubjectFilter("all");
                                              setExtraChildIds([]);
                                          },
                                          children: vm.subjects.map((sub) => ({
                                              id: sub.customerMemberId,
                                              label: sub.displayName,
                                          })),
                                          selectedChildIds: subjectFilter === "all" ? [] : selectedChildIds,
                                          onToggleChild: (id: string) => {
                                              if (subjectFilter === "all") {
                                                  /* Picking a child is leaving the household grain. */
                                                  setSubjectFilter(id);
                                                  setExtraChildIds([]);
                                                  return;
                                              }
                                              if (id === subjectFilter) {
                                                  /* Untucking the anchor promotes the next extra, or leaves none chosen. */
                                                  const [next, ...rest] = extraChildIds;
                                                  if (next) {
                                                      setSubjectFilter(next);
                                                      setExtraChildIds(rest);
                                                  } else {
                                                      /* No child left. NOT "all" — an empty
                                                         selection must never become Household. */
                                                      setSubjectFilter("");
                                                      setExtraChildIds([]);
                                                  }
                                                  return;
                                              }
                                              setExtraChildIds((prev) =>
                                                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                                              );
                                          },
                                          perChildLabel: chargeAmount || selected.amount || null,
                                      }
                                    : undefined,
                            subjects: [
                                ...(categoryPermitsHouseholdGrain(selected.categoryKey ?? "")
                                    ? [{ id: "all", label: "Household" }]
                                    : []),
                                ...(categoryPermitsChildGrain(selected.categoryKey ?? "")
                                    ? vm.subjects.map((sub) => ({
                                          id: sub.customerMemberId,
                                          label: sub.displayName,
                                      }))
                                    : []),
                            ],
                            selectedSubjectId: subjectFilter,
                            onSelectSubject: setSubjectFilter,
                            amount: chargeAmount,
                            onAmount: setChargeAmount,
                            note: chargeNote,
                            onNote: setChargeNote,
                            eventDate: chargeEventDate,
                            onEventDate: setChargeEventDate,
                            /*
                             * WHO OWES THIS CHARGE — offered only when there are parties on record
                             * to divide it between. With none, the account has no arrangement to
                             * depart from and the control would be an empty form.
                             */
                            ...((vm.payers ?? []).length > 0
                                ? {
                                      chargeResponsibility: {
                                          standingSummary: standingResponsibilitySummary,
                                          parties: (vm.payers ?? [])
                                              .filter((party) => party.name.trim().length > 0)
                                              .map((party) => ({
                                                  id: party.personId,
                                                  label: party.name,
                                              })),
                                          scope: chargeScope,
                                          onScope: (scope: "account" | "charge") => {
                                              setChargeScope(scope);
                                              /*
                                               * Choosing to divide this charge opens ONE empty
                                               * share rather than a copy of the standing
                                               * arrangement: a pre-filled copy would be committed
                                               * unread, creating a charge-scoped duplicate of the
                                               * answer that already governed — an override that
                                               * overrides nothing and hides the next real change.
                                               */
                                              if (scope === "charge" && chargeShares.length === 0) {
                                                  setChargeShares([
                                                      { partyId: "", method: "percentage", value: "" },
                                                  ]);
                                              }
                                          },
                                          shares: chargeShares,
                                          onShare: (
                                              index: number,
                                              patch: {
                                                  partyId?: string;
                                                  method?: "percentage" | "fixed" | "remainder";
                                                  value?: string;
                                              },
                                          ) =>
                                              setChargeShares((prior) =>
                                                  prior.map((share, i) => (i === index ? { ...share, ...patch } : share)),
                                              ),
                                          onAddShare: () =>
                                              setChargeShares((prior) => [
                                                  ...prior,
                                                  { partyId: "", method: "percentage", value: "" },
                                              ]),
                                          onRemoveShare: (index: number) =>
                                              setChargeShares((prior) => prior.filter((_, i) => i !== index)),
                                      },
                                  }
                                : {}),
                            /* Waiving is offered only where there is an authored policy to waive. */
                            ...(expectedPolicies.length > 0
                                ? {
                                      chargeDiscount: {
                                          policies: expectedPolicies,
                                          waivedPolicyIds,
                                          onToggleWaive: (policyId: string) =>
                                              setWaivedPolicyIds((prior) =>
                                                  prior.includes(policyId)
                                                      ? prior.filter((id) => id !== policyId)
                                                      : [...prior, policyId],
                                              ),
                                          reason: waiverReason,
                                          onReason: setWaiverReason,
                                      },
                                  }
                                : {}),
                            onSubmit: () => void commit(),
                            onCancel: () => {
                                /* One level back. Raised from Details, this returns to Details. */
                                pop();
                                setPending(null);
                                setCommandError(null);
                                /* An abandoned command leaves no decision behind, because none was written. */
                                resetChargeDecisions();
                            },
                            running,
                            error: commandError,
                        }}
                    />
                ) : (
                    // A configured catalog with nothing in it is a configuration state, not an error.
                    <p className="alloy-os-financials__empty">No charge types are configured.</p>
                )}
            </div>
        );
    }

    /*
     * ── DETAILS — the approved ledger-first detail, in the same depth layer ──
     *
     * Same read model as the summary, so a number cannot differ between them. The ledger is grouped
     * by billing period with prior periods closed, and carries no running balance: `ledger_transactions`
     * guarantees no ordering, and computing one would present one defensible answer as the answer.
     */
    /*
     * ── SETTLE, AS ITS OWN REPRESENTATION ──
     *
     * The band cannot be a sibling of the approved detail card: that card's header and title sit
     * over anything beside it and intercept the pointer, so every control underneath rendered
     * visible, enabled and unclickable — proven in the browser, above and below it alike. Add charge
     * already answers this with its own overlay, and settling is the same kind of act, so it gets
     * the same treatment rather than a CSS argument with a card that is not ours to restyle.
     */
    /*
     * ── ADMINISTRATION AS DEPTH ───────────────────────────────────────────────────────────────
     *
     * Three surfaces, one shape, and it is the shape Add Charge and Payment already use: the
     * platform card with the command modal class, hosted by the elevated cell that grants it
     * interaction. Each hosts the component that already existed — this adds no second writer, no
     * second read model and no second visual language.
     *
     * They return EARLY, like every other overlay, so Details is not rendering underneath them in
     * the document flow. That is the whole difference between a depth card and an inline editor,
     * and it is why the ledger no longer moves when an operator manages a discount.
     */
    if (overlay === "responsibility_admin" && vm && customerId) {
        return (
            <div className="alloy-os-financials" data-financials-card="true" data-financials-overlay="responsibility_admin" data-financials-manage-responsibility="depth-card">
                <UniversalCard
                    title="Responsibility"
                    insight=""
                    iconName="Users"
                    tier="work"
                    archetype="status"
                    modalClass="command"
                    density="expanded"
                    gridSpan="row"
                    data-universal-card-key="responsibility_admin"
                    footerAction={null}
                >
                    <div className="alloy-os-financials__entrybody" data-financials-entry="responsibility_admin">
                        <FinancialsResponsibilityPanel
                            customerId={customerId}
                            /*
                             * ACCOUNT GRAIN. This is the standing arrangement, not one charge's —
                             * the per-charge surface is `responsibility`, opened from a ledger row,
                             * and it carries the charge it is about.
                             */
                            customerMemberId={null}
                            parties={(vm.payers ?? [])
                                .map((party) => ({ personId: party.personId ?? null, name: party.name }))
                                .filter((party) => party.name.trim().length > 0)}
                            memberOptions={responsibilityScopeMembers}
                            hostedOpen
                            onHostedClose={pop}
                            onCommitted={async () => {
                                await load();
                                pop();
                            }}
                        />
                    </div>
                </UniversalCard>
            </div>
        );
    }

    if (overlay === "discount_admin" && vm && customerId) {
        return (
            <div className="alloy-os-financials" data-financials-card="true" data-financials-overlay="discount_admin" data-financials-manage-discounts="depth-card">
                <UniversalCard
                    title="Discounts"
                    insight=""
                    iconName="Receipt"
                    tier="work"
                    archetype="status"
                    modalClass="command"
                    density="expanded"
                    gridSpan="row"
                    data-universal-card-key="discount_admin"
                    footerAction={null}
                >
                    <div className="alloy-os-financials__entrybody" data-financials-entry="discount_admin">
                        <FinancialsDiscountPanel
                            customerId={customerId}
                            /* Real content on the first frame; the panel re-reads and still owns it. */
                            initialPosition={discountPositionBody}
                            childLabelFor={(_ocmId: string, customerMemberId: string | null) =>
                                (vm.subjects ?? []).find((sub) => sub.customerMemberId === customerMemberId)
                                    ?.displayName ?? null
                            }
                            hostedOpen
                            onHostedClose={pop}
                            onCommitted={async () => {
                                await load();
                            }}
                        />
                    </div>
                </UniversalCard>
            </div>
        );
    }

    if (overlay === "payments_admin" && customerId) {
        return (
            <div className="alloy-os-financials" data-financials-card="true" data-financials-overlay="payments_admin">
                <UniversalCard
                    title="Payments"
                    insight=""
                    iconName="CreditCard"
                    tier="work"
                    archetype="status"
                    modalClass="command"
                    density="expanded"
                    gridSpan="row"
                    data-universal-card-key="payments_admin"
                    footerAction={null}
                >
                    {/*
                      * THE CANONICAL PAYMENTS SURFACES, REHOSTED — not rebuilt. Add card, add bank
                      * account, the method list and Autopay all stay exactly the components
                      * Payments W2/W5 own; what changed is where they are rendered, so Details no
                      * longer carries a permanent setup band for an account that may never need
                      * one.
                      */}
                    <div className="alloy-os-financials__entrybody" data-financials-entry="payments_admin">
                        <PaymentMethodsSection customerId={customerId} />
                        <AutopaySection customerId={customerId} />
                    </div>
                </UniversalCard>
            </div>
        );
    }

    if (overlay === "payment" && vm && reconciliation) {
        return (
            <div className="alloy-os-financials" data-financials-card="true" data-financials-overlay="payment">
                {/*
                 * HOSTED BY THE PLATFORM CARD, because that is what the depth layer grants
                 * interaction to.
                 *
                 * An elevated cell makes every direct child inert —
                 * `.alloy-os-focus-panel-grid[data-fp-depth="active"] .…__cell[data-fp-elevated="true"] > *
                 * { pointer-events: none }` — and hands `z-index: 60; pointer-events: auto` to
                 * `.alloy-os-ucard` alone. Rendered as a bare div, this surface painted above the
                 * scrim and could not be clicked: measured mounted, every ancestor of the commit
                 * control up to `.alloy-os-financials` carried `pointer-events: none`, no element in
                 * the chain created a stacking context, and `elementFromPoint` over the control
                 * returned the scrim. Not a z-index defect — a host defect.
                 *
                 * Add charge learned this first ("It was rendering as a bare div inside the elevated
                 * cell"), and the fix is the same one: the platform card, with the command modal
                 * class. No new layer numbers, and the scrim keeps protecting the background.
                 */}
                <UniversalCard
                    /*
                     * "Payment", the same word the control that opens it now uses. A command whose
                     * button says one thing and whose title says another reads as two commands.
                     */
                    title="Payment"
                    insight=""
                    iconName="Receipt"
                    tier="work"
                    archetype="status"
                    modalClass="command"
                    density="expanded"
                    gridSpan="row"
                    data-universal-card-key="payment"
                    /*
                     * "Back to details" is navigation language, and it only means something where a
                     * details destination exists. In the Focus Panel the operator arrived here from
                     * Details and going back is a real move. In Financials → Accounts there is no
                     * Details — the account is already open behind this overlay — so the control
                     * pointed at a place that does not exist, and the backdrop, Escape and Cancel
                     * all already return there. Same flag that governs the drill-down itself.
                     */
                    footerAction={
                        showDetailsAction ? (
                            <button
                                type="button"
                                className="alloy-os-financials__action"
                                data-financials-payment-close="true"
                                onClick={() => {
                                    setPayTarget(null);
                                    pop();
                                }}
                            >
                                ← Back to details
                            </button>
                        ) : null
                    }
                >
                    {paymentBandFor(false)}
                </UniversalCard>
            </div>
        );
    }

    /*
     * ── THE ROW COMMANDS, IN THE SAME SHELL AS EVERY OTHER FINANCIALS COMMAND ─────────────────
     *
     * Reverse and Adjust are the two things an operator does TO a ledger row, and both used to be
     * bands rendered inside the ledger itself. Add and Payment were already focused command cards,
     * so the surface taught two different lessons about what a command looks like — and the raw
     * one was attached to the operation that destroys money.
     *
     * Both are destinations now. Same `UniversalCard` shell, same `modalClass="command"`, same
     * three dismissal gestures, and each sits ON TOP of Details in the stack so dismissing it
     * returns to the ledger the operator was reading, in the state they left it.
     */
    if (surface?.kind === "responsibility" && vm) {
        const row = vm.rows.find((r) => r.chargeId === surface.chargeId) ?? null;
        const subjectName =
            row?.subjectName
            ?? vm.subjects.find((sub) => sub.customerMemberId === row?.subjectMemberId)?.displayName
            ?? "Household";
        const reallocating = surface.mode === "reallocate";
        const target = { chargeId: surface.chargeId, mode: surface.mode };
        return (
            <div
                className="alloy-os-financials"
                data-financials-card="true"
                data-financials-overlay="responsibility"
                data-financials-responsibility-mode={surface.mode}
                data-financials-command-shell="responsibility"
            >
                <UniversalCard
                    title={reallocating ? "Reallocate responsibility" : "Resolve responsibility"}
                    insight=""
                    iconName="Receipt"
                    tier="work"
                    archetype="status"
                    modalClass="command"
                    density="expanded"
                    gridSpan="row"
                    data-universal-card-key="responsibility"
                    footerAction={null}
                >
                    <div className="alloy-os-financials__commandbody" data-financials-command="responsibility">
                        <dl className="alloy-os-financials__commandfacts" data-testid="responsibility-facts">
                            <div>
                                <dt>Obligation</dt>
                                <dd data-testid="responsibility-charge">
                                    {row?.description ?? row?.categoryLabel ?? surface.label}
                                </dd>
                            </div>
                            <div>
                                <dt>Amount</dt>
                                <dd data-testid="responsibility-amount">
                                    {row ? money(row.amountCents, row.currencyCode || currency) : "—"}
                                </dd>
                            </div>
                            {/* WHO IT IS FOR — and it is not what this command changes. */}
                            <div>
                                <dt>For</dt>
                                <dd data-testid="responsibility-child">{subjectName}</dd>
                            </div>
                            <div>
                                <dt>Dated</dt>
                                <dd data-testid="responsibility-date">{formatDisplayDate(row?.date ?? null) || "—"}</dd>
                            </div>
                            <div>
                                <dt>Owes it now</dt>
                                <dd data-testid="responsibility-current">
                                    {row?.responsiblePartyName || (row?.responsibilityUnassigned ? "Unassigned" : "Not allocated")}
                                </dd>
                            </div>
                        </dl>
                        {/*
                          * CONFIGURE IS NOT RESOLVE, AND THE OPERATOR IS TOLD SO HERE. Naming who
                          * should be responsible is an account-grain arrangement effective from a
                          * date; it does not reach back over obligations that already stand. This
                          * command applies the arrangement IN FORCE for this obligation's own
                          * service date — and where none is, it says so rather than inventing one.
                          */}
                        <p className="alloy-os-financials__commandnote" data-testid="responsibility-effect">
                            {reallocating
                                ? "This moves what one party owes to another. The previous division stays readable beside the new one; nothing is edited in place."
                                : "This divides the obligation between the parties named by the arrangement in force for its service date. Where no arrangement was in force then, it stays honestly unassigned — configuring one now does not reach backwards."}
                        </p>
                        {reallocating ? (
                            <label className="alloy-os-financials__commandfield">
                                <span>Why responsibility is moving</span>
                                <input
                                    data-testid="responsibility-reason"
                                    className="alloy-os-addcharge__input"
                                    value={reallocationReason}
                                    onChange={(e) => setReallocationReason(e.target.value)}
                                    placeholder="Required — this changes what one real person owes another"
                                />
                            </label>
                        ) : null}
                        {responsibilityPreview ? (
                            <div className="alloy-os-fdetail__movepreview" data-testid="responsibility-preview">
                                <strong>{responsibilityPreview.summary}</strong>
                                {responsibilityPreview.changes.map((c) => (
                                    <span key={c}>{c}</span>
                                ))}
                            </div>
                        ) : null}
                        {responsibilityError ? (
                            <div className="alloy-os-fdetail__moveerror" data-testid="responsibility-error">
                                {responsibilityError}
                            </div>
                        ) : null}
                        <div className="alloy-os-financials__commandactions">
                            <button
                                type="button"
                                data-testid="responsibility-preview-button"
                                className="alloy-os-financials__action"
                                disabled={running}
                                onClick={() => void previewResponsibility(target)}
                            >
                                Preview
                            </button>
                            <button
                                type="button"
                                data-testid="responsibility-confirm"
                                className="alloy-os-financials__action alloy-os-financials__action--primary"
                                disabled={running || !responsibilityPreview || (reallocating && reallocationReason.trim().length < 3)}
                                onClick={() => void confirmResponsibility(target)}
                            >
                                {reallocating ? "Reallocate" : "Resolve responsibility"}
                            </button>
                            <button
                                type="button"
                                data-testid="responsibility-cancel"
                                className="alloy-os-financials__quiet"
                                onClick={() => {
                                    setResponsibilityPreview(null);
                                    setResponsibilityError(null);
                                    setReallocationReason("");
                                    pop();
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </UniversalCard>
            </div>
        );
    }

    if (surface?.kind === "reverse_charge" && vm) {
        const row = vm.rows.find((r) => r.chargeId === surface.chargeId) ?? null;
        const subjectName =
            row?.subjectName
            ?? vm.subjects.find((sub) => sub.customerMemberId === row?.subjectMemberId)?.displayName
            ?? "Household";
        return (
            <div
                className="alloy-os-financials"
                data-financials-card="true"
                data-financials-overlay="reverse_charge"
                data-financials-command-shell="reverse"
            >
                <UniversalCard
                    title="Reverse charge"
                    insight=""
                    iconName="Receipt"
                    tier="work"
                    archetype="status"
                    modalClass="command"
                    density="expanded"
                    gridSpan="row"
                    data-universal-card-key="reverse_charge"
                    footerAction={null}
                >
                    <div className="alloy-os-financials__commandbody" data-financials-command="reverse_charge">
                        {/*
                          * WHAT IS ABOUT TO BE UNDONE, stated before the button that undoes it. The
                          * band said only the row's label; an operator reversing money is entitled to
                          * the amount, the child it belongs to, the date it is filed under and the
                          * status it stands in.
                          */}
                        <dl className="alloy-os-financials__commandfacts" data-testid="charge-reverse-facts">
                            <div>
                                <dt>Charge</dt>
                                <dd data-testid="charge-reverse-subject">
                                    {row?.description ?? row?.categoryLabel ?? surface.label}
                                </dd>
                            </div>
                            <div>
                                <dt>Amount</dt>
                                <dd data-testid="charge-reverse-amount">
                                    {row ? money(row.amountCents, row.currencyCode || currency) : "—"}
                                </dd>
                            </div>
                            <div>
                                <dt>For</dt>
                                <dd data-testid="charge-reverse-child">{subjectName}</dd>
                            </div>
                            <div>
                                <dt>Dated</dt>
                                <dd data-testid="charge-reverse-date">{formatDisplayDate(row?.date ?? null) || "—"}</dd>
                            </div>
                            <div>
                                <dt>Status</dt>
                                <dd data-testid="charge-reverse-status">{row?.lifecycleStatus ?? "—"}</dd>
                            </div>
                        </dl>
                        <p className="alloy-os-financials__commandnote" data-testid="charge-reverse-effect">
                            The charge stays on the record and a correction is appended beside it. What the
                            family owes falls by this amount once the correction posts; nothing is deleted and
                            the reversal itself can never be reversed.
                        </p>
                        {reverseChargePreview ? (
                            <div className="alloy-os-fdetail__movepreview" data-testid="charge-reverse-preview">
                                <strong>{reverseChargePreview.summary}</strong>
                                {reverseChargePreview.changes.map((c) => (
                                    <span key={c}>{c}</span>
                                ))}
                            </div>
                        ) : null}
                        {reverseChargeError ? (
                            <div className="alloy-os-fdetail__moveerror" data-testid="charge-reverse-error">
                                {reverseChargeError}
                            </div>
                        ) : null}
                        <div className="alloy-os-financials__commandactions">
                            <button
                                type="button"
                                data-testid="charge-reverse-preview-button"
                                className="alloy-os-financials__action"
                                disabled={running}
                                onClick={() => void previewReverseCharge()}
                            >
                                Preview
                            </button>
                            <button
                                type="button"
                                data-testid="charge-reverse-confirm"
                                className="alloy-os-financials__action alloy-os-financials__action--primary"
                                disabled={running || !reverseChargePreview}
                                onClick={() => void confirmReverseCharge()}
                            >
                                Reverse charge
                            </button>
                            <button
                                type="button"
                                data-testid="charge-reverse-cancel"
                                className="alloy-os-financials__quiet"
                                onClick={() => {
                                    setReverseCharge(null);
                                    setReverseChargePreview(null);
                                    setReverseChargeError(null);
                                    pop();
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </UniversalCard>
            </div>
        );
    }

    /*
     * ADJUST, RAISED FROM A ROW. The same canonical adjustment entry the unified Add command hosts
     * — same band, same `billing.adjust_account` — with no mode selector, because the operator did
     * not ask to choose between a charge and an adjustment. They asked to correct one row.
     */
    if (surface?.kind === "adjust_charge" && adjustmentReady) {
        return (
            <div
                className="alloy-os-financials"
                data-financials-card="true"
                data-financials-overlay="adjust_charge"
                data-financials-command-shell="adjust"
            >
                <UniversalCard
                    title="Adjust charge"
                    insight=""
                    iconName="Receipt"
                    tier="work"
                    archetype="status"
                    modalClass="command"
                    density="expanded"
                    gridSpan="row"
                    data-universal-card-key="adjust_charge"
                    footerAction={null}
                >
                    <div className="alloy-os-financials__entrybody" data-financials-entry="adjustment">
                        {adjustmentBand}
                    </div>
                </UniversalCard>
            </div>
        );
    }

    /*
     * ── ONE DETAILS SURFACE, AND IT IS THE FINAL ONE ────────────────────────────────────────────
     *
     * There used to be a second Details branch above this one that committed the SHAPE of Details
     * while the deep read was still in flight — a metric row, five lenses and eight ledger columns
     * over em dashes — on the reasoning that the anatomy is known the moment the operator asks and
     * only the figures are outstanding.
     *
     * That reasoning was wrong about what an operator reads. A committed Details surface is a
     * claim that they have arrived, and arriving at a ledger that then rewrites itself from three
     * placeholder rows to fifty-six real ones is the "double load" reported in every pass of this
     * thread. The honest intermediate is the one the operator was already looking at: the compact
     * card.
     *
     * So there is exactly ONE Details branch, and its guard is total. `ledgerComplete` is in the
     * condition, not merely passed down as a hint, which means no Details tree can be reached — by
     * this path or any future one — while the read its ledger depends on is unresolved. The
     * request is held in `detailPending` until then and the compact card stays on screen.
     */
    if (overlay === "detail" && vm && reconciliation) {
        return (
            <div className="alloy-os-financials" data-financials-card="true" data-financials-overlay="detail">
                {/*
                  * The Move / Apply panel. One panel serves both intents because they differ only in
                  * whether a reversal has to happen first — the destination question is identical, and
                  * two panels asking it would be two places to get it wrong.
                  */}
                {moveNotice ? (
                    <div className="alloy-os-fdetail__movenotice" data-testid="payment-move-notice">
                        {moveNotice}
                    </div>
                ) : null}
                {movePending || applyPending ? (
                    <div className="alloy-os-fdetail__movepanel" data-testid="payment-move-panel">
                        <div className="alloy-os-fdetail__moveheader">
                            {movePending ? "Move payment" : "Apply payment"}
                        </div>
                        <div className="alloy-os-fdetail__movefield">
                            <span>{movePending ? "Move to" : "Apply to"}</span>
                            <AlloySelect
                                testId="payment-move-target"
                                aria-label={movePending ? "Move to" : "Apply to"}
                                placeholder="Choose a charge…"
                                value={moveTargetId}
                                options={moveTargets.map((t) => ({
                                    value: t.chargeId,
                                    label:
                                        `${t.label}`
                                        + (t.serviceDate ? ` · ${formatDisplayDate(t.serviceDate)}` : "")
                                        + ` · ${(t.outstandingCents / 100).toLocaleString(undefined, {
                                            style: "currency",
                                            currency,
                                        })} outstanding`,
                                }))}
                                onChange={(next) => {
                                    setMoveTargetId(next);
                                    // A new destination invalidates a preview taken for the old one.
                                    setMovePreview(null);
                                }}
                            />
                        </div>
                        {/* A reversal must say why; applying unapplied money undoes nothing. */}
                        {movePending ? (
                            <label className="alloy-os-fdetail__movefield">
                                <span>Reason</span>
                                <input
                                    data-testid="payment-move-reason"
                                    value={moveReason}
                                    onChange={(e) => {
                                        setMoveReason(e.target.value);
                                        setMovePreview(null);
                                    }}
                                    placeholder="Applied to the wrong charge"
                                />
                            </label>
                        ) : null}
                        {movePreview ? (
                            <div className="alloy-os-fdetail__movepreview" data-testid="payment-move-preview">
                                <strong>{movePreview.summary}</strong>
                                {movePreview.changes.map((c) => (
                                    <span key={c}>{c}</span>
                                ))}
                            </div>
                        ) : null}
                        {moveError ? (
                            <div className="alloy-os-fdetail__moveerror" data-testid="payment-move-error">
                                {moveError}
                            </div>
                        ) : null}
                        <div className="alloy-os-fdetail__moveactions">
                            {/*
                              * Preview first, and only for a Move: Confirm stays disabled until the
                              * ACTION has said what reversing this application will do. Applying
                              * unapplied money has no reversal to explain.
                              */}
                            {movePending ? (
                                <button
                                    type="button"
                                    data-testid="payment-move-preview-button"
                                    disabled={running || !moveReason.trim()}
                                    onClick={() => void previewMove()}
                                >
                                    Preview
                                </button>
                            ) : null}
                            <button
                                type="button"
                                data-testid="payment-move-confirm"
                                disabled={
                                    running
                                    || !moveTargetId
                                    || (movePending ? !movePreview : false)
                                }
                                onClick={() => void (movePending ? confirmMove() : confirmApply())}
                            >
                                Confirm
                            </button>
                            <button type="button" data-testid="payment-move-cancel" onClick={closeMovePanels}>
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : null}

                {adjustNotice ? (
                    <div className="alloy-os-fdetail__movenotice" data-testid="adjustment-notice">
                        {adjustNotice}
                    </div>
                ) : null}

                {/*
                  * ADD ADJUSTMENT. Scoped to an enrolment agreement, because that is what the action
                  * is scoped to — presenting it as account-wide would be a claim the backend cannot
                  * honour. Confirm stays disabled until the ACTION has said what this will do.
                  */}

                {/*
                  * REVERSE CHARGE IS NOT RENDERED HERE ANY MORE.
                  *
                  * It was a band inside the ledger — a horizontal strip of raw controls wearing the
                  * Move-payment panel's classes. Reverse is a command, so it is a destination on the
                  * stack and is drawn in the canonical command shell above, beside Add and Payment.
                  * Nothing about the operation moved: `charge.reverse`, through the shared command
                  * authority, is still the only writer.
                  */}
                {/* REVERSE. The original is never edited; its opposite is appended. */}
                {reversePending ? (
                    <div className="alloy-os-fdetail__movepanel" data-testid="adjustment-reverse-panel">
                        <div className="alloy-os-fdetail__moveheader">Reverse adjustment</div>
                        <label className="alloy-os-fdetail__movefield">
                            <span>Reason</span>
                            <input
                                data-testid="adjustment-reverse-reason"
                                value={reverseReason}
                                onChange={(e) => {
                                    setReverseReason(e.target.value);
                                    setReversePreview(null);
                                }}
                                placeholder="Recorded against the wrong enrolment"
                            />
                        </label>
                        {reversePreview ? (
                            <div className="alloy-os-fdetail__movepreview" data-testid="adjustment-reverse-preview">
                                <strong>{reversePreview.summary}</strong>
                                {reversePreview.changes.map((c) => (
                                    <span key={c}>{c}</span>
                                ))}
                            </div>
                        ) : null}
                        {reverseError ? (
                            <div className="alloy-os-fdetail__moveerror" data-testid="adjustment-reverse-error">
                                {reverseError}
                            </div>
                        ) : null}
                        <div className="alloy-os-fdetail__moveactions">
                            <button
                                type="button"
                                data-testid="adjustment-reverse-preview-button"
                                disabled={running || !reverseReason.trim()}
                                onClick={() => void previewReversal()}
                            >
                                Preview
                            </button>
                            <button
                                type="button"
                                data-testid="adjustment-reverse-confirm"
                                disabled={running || !reversePreview}
                                onClick={() => void confirmReversal()}
                            >
                                Confirm
                            </button>
                            <button type="button" data-testid="adjustment-reverse-cancel" onClick={closeAdjustPanels}>
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : null}

                <FinancialsDetailCard
                    /*
                     * ── THE COMPACT ADMINISTRATION ROW, AND ITS THREE DOORS ───────────────────
                     *
                     * The summaries are read from canonical truth the card already holds — the
                     * payers line means responsibility, and the discount position is the same
                     * forecast the depth card shows. Nothing here computes money.
                     *
                     * Each door pushes a depth surface onto the SAME stack Add Charge and Payment
                     * use, so Escape pops exactly one layer and Details survives underneath.
                     */
                    administration={
                        customerId
                            ? {
                                  responsibility: adminPositions.responsibility,
                                  discounts: adminPositions.discounts,
                                  loading: adminPositionsLoading,
                                  onManagePayments: () =>
                                      openAdmin("payments_admin", '[data-financials-manage-payments="open"]'),
                                  onManageResponsibility: () =>
                                      openAdmin("responsibility_admin", '[data-financials-manage-responsibility="gear"]'),
                                  onManageDiscount: () =>
                                      openAdmin("discount_admin", '[data-financials-manage-discounts="gear"]'),
                              }
                            : null
                    }
                    /*
                     * PAYMENT METHODS (Payments W2) — administered here, in Details, beside the
                     * ledger. Passed only when the household is actually resolved: a card with no
                     * account cannot truthfully say "no payment method on file".
                     */
                    paymentMethodsAccount={customerId ? { customerId } : null}
                    /*
                     * The family's discount position. `load` is the card's own canonical re-read,
                     * so after a governed exception the position, the ledger and the forecast all
                     * come back from the server rather than being patched here.
                     */
                    discountAdmin={
                        customerId
                            ? {
                                  customerId,
                                  /*
                                   * The card's subjects are keyed by `customerMemberId`, which is
                                   * the child; the discount position is keyed by the RELATIONSHIP.
                                   * The panel passes both, so the label is looked up by the one
                                   * this view model actually holds rather than by position.
                                   */
                                  childLabelFor: (_ocmId, customerMemberId) =>
                                      (vm?.subjects ?? []).find((s) => s.customerMemberId === customerMemberId)
                                          ?.displayName ?? null,
                                  onCommitted: async () => {
                                      await load();
                                  },
                              }
                            : null
                    }
                    /*
                     * MANAGE RESPONSIBILITY, from Details. Parties come from the account view
                     * model — the same `responsibility.parties` Accounts passes — so the operator
                     * edits who is already on record rather than inventing a party. `load` is the
                     * card's own canonical re-read: after a commit the panel, the responsibility
                     * position and the ledger all come back from the server, and nothing here
                     * guesses at the new state in the meantime.
                     */
                    responsibilityAdmin={
                        customerId
                            ? {
                                  customerId,
                                  parties: (vm?.responsibility?.parties ?? []) as {
                                      personId: string | null;
                                      name: string;
                                  }[],
                                  householdName: vm?.account?.label ?? null,
                                  onCommitted: async () => {
                                      await load();
                                  },
                              }
                            : null
                    }
                    onMovePayment={openMovePayment}
                    onApplyPayment={openApplyPayment}
                    /* Only offered where an enrolment exists: the action is scoped to an agreement. */
                    onAddAdjustment={adjustableSubjects.length > 0 ? openAddAdjustment : undefined}
                    onReverseAdjustment={openReverseAdjustment}
                    onPostCharge={({ chargeId }) => void runRowAction("post", rowForCharge(chargeId))}
                    onReverseCharge={openReverseCharge}
                    /*
                     * Reverse and Adjust are NOT two names for one operation and are not offered as
                     * such: Reverse unwinds a charge that should never have stood, Adjust leaves it
                     * standing and writes a separate, auditable reduction against it. Both sit on
                     * the row because both are about that row; only their meaning differs.
                     */
                    onAdjustCharge={adjustableSubjects.length > 0 ? openAdjustForCharge : undefined}
                    /*
                     * DETAILS ADMINISTERS RESPONSIBILITY. Summary reports it and is given neither
                     * of these, which is the doctrine rather than an oversight.
                     */
                    onResolveResponsibility={(a) => openResponsibility({ ...a, mode: "resolve" })}
                    onReallocateResponsibility={(a) => openResponsibility({ ...a, mode: "reallocate" })}
                    /*
                     * The surface is mounted; the ledger may still be reading. This is the ONLY
                     * region allowed to say so, and it says it by reserving itself — never by
                     * rendering rows, and never by changing the surface's geometry when the real
                     * rows arrive.
                     */
                    ledgerPending={!ledgerComplete}
                    /*
                     * THE VIEW OUTLIVES THE COMMANDS. Lens and disclosure are held by this card, so
                     * a row command and its dismissal cannot quietly reset the ledger the operator
                     * was reading.
                     */
                    lens={detailLens ?? undefined}
                    onLensChange={setDetailLens}
                    expandedPeriods={expandedPeriods}
                    onPeriodToggle={(label, isExpanded) =>
                        setExpandedPeriods((prev) => ({ ...prev, [label]: isExpanded }))
                    }
                    evidence={adaptFinancialsVmToFinancialsCard({
                        vm,
                        reconciliation,
                        pastDue,
                        rows: vm.rows.filter(
                            (r) =>
                                r.periodKey === vm.period.key
                                && rowInFinancialsSubjectScope(r, subjectFilter),
                        ),
                        currency,
                    })}
                    periods={adaptFinancialsVmToLedgerPeriods({
                        vm,
                        currency,
                        openPeriodKey: vm.period.key,
                    })}
                    /*
                     * `Payment` enters the settle operation. Slice H is that lane, so the control is
                     * live: it selects the obligation the operator is most likely to settle — the
                     * first charge the read model marks payable — and opens the same form the band's
                     * own `Record payment →` menu opens. Still inert when nothing can take money,
                     * because an enabled control that cannot act is the lie this comment used to
                     * describe.
                     */
                    onPayment={openSettle}
                    onAddCharge={() => push({ kind: "add_charge" })}
                    /*
                     * ── THE BAND IS THE CARD'S, NOT THE WRAPPER'S ────────────────────────────
                     *
                     * This was rendered as a SIBLING of the card, immediately below. The content is
                     * right and stays — see the note that follows — but a sibling of the focused
                     * card is not owned by it: the band sat outside the card's box at the wrapper's
                     * left edge, so a focused Details surface had a stray `Record payment →`
                     * floating beside it with no card around it. Measured mounted at 509,522 with
                     * no `data-universal-card-key` ancestor, while the card began at x≈528.
                     *
                     * Passed as a slot, the focused surface owns everything it presents. No
                     * z-index, no extra scrim, no second depth mechanism — the composition was the
                     * defect, so the composition is the repair.
                     */
                    paymentBand={paymentBandFor(true)}
                />
                {/*
                    WHAT ARRIVED, WHERE AN OPERATOR CAN STILL SEE IT.

                    The payment band otherwise renders in exactly two places: the summary's side
                    column, which a COMPACT card drops entirely, and the payment representation,
                    which correctly stops being offered once an account has nothing left to collect.
                    Certification found the consequence — on a compact card for a family who had just
                    paid in full, there was no way to reach the receipt that settled it. The record
                    of money arriving disappeared exactly when the account became healthy, which is
                    the same reachability defect Slice H opened this band to fix.

                    Details is where an operator works the ledger, and a ledger that cannot show what
                    was received is only half of one.

                    It is passed to the card as `paymentBand` above rather than rendered here, so it
                    lives inside the surface that owns it.
                */}
            </div>
        );
    }

    if (!expanded && vm && reconciliation && !vm.unavailableReason) {
        const periodRows = vm.rows.filter(
            (r) => r.periodKey === vm.period.key && rowInFinancialsSubjectScope(r, subjectFilter),
        );
        return (
            <div
                // SAME SHELL REF as the fallback return below. The loaded card renders through THIS
                // branch, so without the ref the footprint it is reserving on the next subject switch
                // could never be measured — the reserved height silently fell back to the shared floor.
                ref={shellRef}
                className="alloy-os-financials"
                data-financials-card="true"
                data-financials-subject={subjectFilter}
                /* WHICH ACCOUNT IS ON SCREEN — the household, not the child filter. */
                data-financials-account={vm.account?.customerId ?? undefined}
            >
                <ApprovedFinancialsCard
                    evidence={adaptFinancialsVmToFinancialsCard({
                        vm,
                        reconciliation,
                        pastDue,
                        rows: periodRows,
                        currency,
                    })}
                    /*
                     * DENSITY SELECTS THE PRESENTATION, which is what density is for.
                     *
                     * `compact` is supporting financial context inside another operating process —
                     * what is due, why at a glance, whether payment is healthy, and the ways in. It
                     * deliberately does NOT reconcile: a half-stated breakdown is more misleading
                     * than none. `standard` is the full period.
                     *
                     * Keyed off the model's density rather than its span because span is a LAYOUT
                     * fact a published Surface may override — the case surface hands this card 8
                     * columns while its composition asks for the compact policy, and the operator's
                     * placement should not silently change which questions the card answers.
                     */
                    span={model.density === "compact" ? 1 : "row"}
                    /* No drill-down where the account's own body is already open beneath this. */
                    onDetails={showDetailsAction ? requestDetails : undefined}
                    onAddCharge={() => push({ kind: "add_charge" })}
                    /*
                     * `Pay now` was always this card's primary action and the Focus Panel never wired
                     * it, so it rendered inert while Slice H's settle operation had no way in at all.
                     * It opens at the SAME depth as Add charge deliberately: reached from inside the
                     * detail representation, the panel's armed depth scrim sits over the operation
                     * and the commit button cannot be clicked — visible, enabled, and unreachable.
                     */
                    onPayNow={openSettleCurrentPeriod}
                    summaryVariant={summaryVariant}
                />
            </div>
        );
    }

    return (
        <div
            ref={shellRef}
            className="alloy-os-financials"
            data-financials-card="true"
            data-financials-subject={subjectFilter}
            /*
             * WHICH ACCOUNT IS ON SCREEN — the household, not the child filter.
             *
             * `data-financials-subject` is the subject FILTER inside the account; it cannot answer
             * "whose account is this". The sibling cards already name their subject this way
             * (`data-attendance-subject`), and a stale-overwrite proof needs to read the answer off
             * the rendered card rather than off the props it was handed.
             */
            data-financials-account={vm?.account?.customerId ?? undefined}
            data-financials-reserved={reservesFootprint ? "true" : undefined}
            style={
                reservesFootprint
                    ? { minHeight: loadedHeightRef.current ?? FOCUS_PANEL_RESERVED_MIN_HEIGHT }
                    : undefined
            }
        >
            <UniversalCard
                title={model.title}
                insight={insightFor(vm, reconciliation, loading, currency)}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                density="compact"
                gridSpan={expanded ? "row" : model.span}
                receded={receded}
                data-universal-card-key="financials"
                footerAction={null}
            >
                {!vm ? (
                    /*
                     * FOUR STATES, AND ONLY ONE OF THEM IS TERMINAL.
                     *
                     * "No financial record" was wrong in every case it was shown. It reads as a
                     * statement about the FAMILY — that they have no financial history — and having
                     * no financial activity is a perfectly ordinary, fully supported state that
                     * renders as $0.00 with Add charge available. What the card actually meant was
                     * that it could not resolve an account to ask about.
                     *
                     * ── THE MERGE THAT PRODUCED THIS BRANCH ────────────────────────────────────
                     *
                     * Two independent corrections met here and BOTH are kept, because each answers
                     * a question the other does not:
                     *
                     *   from staging   `deniedRead` and `provisioningAccount` — a reader without
                     *                  permission must be told that, not shown "unavailable", and
                     *                  an account still being provisioned is loading rather than
                     *                  absent.
                     *
                     *   from 11A       LOADING IS NOT A SENTENCE. The unresolved state used to be
                     *                  one line of text in an otherwise empty card, which in the
                     *                  Financials workspace — where this card is the account's
                     *                  primary summary — meant selecting an account produced a
                     *                  large box reading "Loading the account…" while the detail
                     *                  beneath it was already showing its ledger. The card's shape
                     *                  is known before its figures are, so the shape is what it
                     *                  draws.
                     *
                     * Taking either side wholesale would have dropped the other's fix.
                     */
                    deniedRead ? (
                        <p className="alloy-os-financials__empty" data-financials-empty="permission">
                            You do not have permission to view financial information.
                        </p>
                    ) : loading || subjectStillResolving || provisioningAccount || awaitingFirstAnswer ? (
                        /*
                         * The committed anatomy, with placeholders where values will land — never a
                         * number and never a zero, because a placeholder mistaken for $0.00 is
                         * worse than a wait.
                         */
                        summaryVariant === "account" ? (
                            <AccountSummaryPending />
                        ) : (
                        <div className="alloy-os-financials__empty" data-financials-empty="loading" aria-busy="true">
                            <div className="flex flex-wrap gap-x-8 gap-y-3">
                                {/*
                                  * The labels the summary actually settles into. They used to read
                                  * "Current period", which is the one field this surface no longer
                                  * carries — a skeleton promising a field that never arrives.
                                  */}
                                {["Balance", "Past due", "Payments"].map((label) => (
                                    <div key={label}>
                                        <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">{label}</p>
                                        <span
                                            aria-hidden
                                            data-financials-card-skeleton="true"
                                            className="mt-1 inline-block h-[1.1em] w-20 animate-pulse rounded bg-alloy-stone/25 align-middle"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        )
                    ) : (
                        <p
                            className="alloy-os-financials__empty"
                            data-financials-empty={noFinancialSubject ? "no-subject" : "no-account"}
                        >
                            Financial account unavailable
                        </p>
                    )
                ) : (
                    <>
                        {/* ── CURRENT PERIOD · PAST DUE / PAYMENT ─────────────────────────────── */}
                        {showBands ? (
                        <div
                            className="alloy-os-financials__bands"
                            data-financials-density={isCompact ? "compact" : expanded ? "expanded" : "summary"}
                        >
                            <section className="alloy-os-financials__band" data-financials-band="current-period">
                                <p className="alloy-os-financials__band-label">
                                    Current period · {vm.period.label}
                                </p>
                                {isCompact ? (
                                    /* Supporting context: what is owed, and whether anything is
                                       overdue. The breakdown belongs to the summary density. */
                                    <>
                                        <Line
                                            label="Balance"
                                            cents={reconciliation!.balanceCents}
                                            currency={currency}
                                            strong
                                            testId="balance"
                                        />
                                        {reconciliation!.scheduledCents !== 0 ? (
                                            <Line
                                                label="Scheduled"
                                                cents={reconciliation!.scheduledCents}
                                                currency={currency}
                                                muted
                                                testId="scheduled"
                                            />
                                        ) : null}
                                        {pastDue ? (
                                            <p className="alloy-os-financials__note">
                                                {money(pastDue.amountCents, currency)} past due ·{" "}
                                                {pastDue.agingDays} days
                                            </p>
                                        ) : null}
                                    </>
                                ) : (
                                <>
                                {/* Individual dollar rows stay regular and tabular; only the total
                                    earns stronger type. */}
                                <Line label="Charges" cents={reconciliation!.grossCents} currency={currency} />
                                {reconciliation!.discountsCents !== 0 ? (
                                    <Line
                                        label="Discounts & credits"
                                        cents={reconciliation!.discountsCents}
                                        currency={currency}
                                    />
                                ) : null}
                                {reconciliation!.fundingCents !== 0 ? (
                                    <Line label="Funding" cents={reconciliation!.fundingCents} currency={currency} />
                                ) : null}
                                {reconciliation!.adjustmentsCents !== 0 ? (
                                    <Line
                                        label="Adjustments"
                                        cents={reconciliation!.adjustmentsCents}
                                        currency={currency}
                                    />
                                ) : null}
                                {/* ── THE NET OBLIGATION, CALLED THAT ────────────────────────
                                    This figure is gross plus discounts, funding and adjustments —
                                    the type that produces it says so by construction. It was
                                    labelled "Responsibility", which is also the word directly
                                    beneath it for the split between named parties, so one word
                                    stood for two different things: what the family owes after
                                    reductions, and who owes it. An operator reading a total of
                                    $900 above a list adding to $900 had no way to tell whether
                                    the list explained the total or repeated it. */}
                                <Line
                                    label="Net obligation"
                                    cents={reconciliation!.responsibilityCents}
                                    currency={currency}
                                    strong
                                    testId="net-obligation"
                                />
                                {/* The part of that net someone has actually been made responsible
                                    for. Allocated and unassigned sum to the net above, which is
                                    what makes the two readable together. */}
                                <Line
                                    label="Responsibility"
                                    cents={vm.responsibility.allocatedCents}
                                    currency={currency}
                                    testId="responsibility"
                                />
                                {/* ── WHO OWES IT ────────────────────────────────────────────
                                    Persisted allocations, named parties, real cents. Thread 2
                                    shipped this seam empty on purpose — there was a payer contact
                                    role and no allocation store, so any split rendered here would
                                    have assigned real money to real people on no record. The
                                    record exists now, and the card reads it rather than deriving
                                    anything of its own.

                                    UNASSIGNED IS SHOWN, not hidden. Money nobody has been made
                                    responsible for is the operator's most actionable fact on this
                                    card, and quietly attributing it to the household is the exact
                                    behaviour the platform decided against. */}
                                {vm.responsibility.parties.map((party) => (
                                    <Line
                                        key={party.personId}
                                        label={party.name}
                                        cents={party.assignedCents}
                                        currency={currency}
                                        muted
                                        testId={`responsibility-party-${party.personId}`}
                                    />
                                ))}
                                {vm.responsibility.unassignedCents !== 0 ? (
                                    <Line
                                        label="Unassigned"
                                        cents={vm.responsibility.unassignedCents}
                                        currency={currency}
                                        testId="responsibility-unassigned"
                                    />
                                ) : null}
                                {/* ── WHAT MAY BE COLLECTED FROM THE FAMILY TODAY ────────────
                                    Only shown when a submitted claim is actually suppressing
                                    something. Outstanding is what is owed; collectible-now is what
                                    an operator may ask this family for while an agency has been
                                    told it will pay part of it. With no claim in flight the two
                                    are the same number and a second line would be noise. The
                                    figure is the canonical one — nothing here subtracts. */}
                                {vm.collectible.submittedClaimSuppressionCents > 0 ? (
                                    <Line
                                        label="Collectible now"
                                        cents={vm.collectible.currentlyCollectibleCents}
                                        currency={currency}
                                        testId="collectible-now"
                                    />
                                ) : null}
                                {vm.expectedFunding.length > 0 ? (
                                    <p className="alloy-os-financials__note" data-financials-expected-funding="true">
                                        {/* EXPECTED, and said so. Funding that has not arrived is not
                                            a payment and reduces nothing owed; stating it as a note
                                            beside the figures keeps it out of every total. */}
                                        Expected funding ·{" "}
                                        {vm.expectedFunding.map((f) => f.label).join(", ")} · not yet received
                                    </p>
                                ) : null}
                                {reconciliation!.scheduledCents !== 0 ? (
                                    /* STATED BESIDE the balance, never inside it: a scheduled charge
                                       is not yet owed, and folding it in would overstate the debt. */
                                    <Line
                                        label="Scheduled"
                                        cents={reconciliation!.scheduledCents}
                                        currency={currency}
                                        muted
                                        testId="scheduled"
                                    />
                                ) : null}
                                </>
                                )}
                            </section>

                            {isCompact ? null : (
                            <div className="alloy-os-financials__side">
                                <section className="alloy-os-financials__band" data-financials-band="past-due">
                                    <p className="alloy-os-financials__band-label">Past due</p>
                                    {pastDue ? (
                                        <>
                                            <Line
                                                label={`${pastDue.agingDays} days`}
                                                cents={pastDue.amountCents}
                                                currency={currency}
                                                strong
                                                testId="past-due"
                                            />
                                            <p className="alloy-os-financials__note">
                                                Oldest unpaid {pastDue.oldestDueDate}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="alloy-os-financials__note">Nothing past due.</p>
                                    )}
                                </section>

                                {paymentBandFor(true)}
                            </div>
                            )}
                        </div>
                        ) : (
                            /* The shallow top of the expanded view: what is owed, and whether
                               anything is overdue. Everything else is a row in the ledger below. */
                            <p className="alloy-os-financials__shallow" data-financials-shallow="true">
                                <span className="alloy-os-financials__shallow-value">
                                    {money(reconciliation!.balanceCents, currency)}
                                </span>
                                <span className="alloy-os-financials__shallow-label">
                                    owed · {vm.period.label}
                                </span>
                                {pastDue ? (
                                    <span className="alloy-os-financials__shallow-label">
                                        · {money(pastDue.amountCents, currency)} past due
                                    </span>
                                ) : null}
                                {reconciliation!.scheduledCents !== 0 ? (
                                    <span className="alloy-os-financials__shallow-label">
                                        · {money(reconciliation!.scheduledCents, currency)} scheduled
                                    </span>
                                ) : null}
                            </p>
                        )}

                        {/* THE COMMAND BELONGS TO THE CARD, not to one band.
                            It lived inside Current Period, so expanding the card — the density where
                            an operator is actually working the ledger — removed the only way to add
                            a charge. */}
                        <div className="alloy-os-financials__actions" data-financials-actions="true">
                        {vm.unavailableReason ? (
                            /* Stated beneath the anatomy, never in place of it. */
                            <span className="alloy-os-financials__note" data-financials-unavailable="true">
                                {vm.unavailableReason}
                            </span>
                        ) : null}
                        {vm.chargeTemplates.length > 0 ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        type="button"
                                        className="alloy-os-financials__action"
                                        data-financials-command="charge.add"
                                        disabled={running}
                                    >
                                        Add charge →
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" sideOffset={4} data-financials-charge-menu="true">
                                    {vm.chargeTemplates.map((tpl) => (
                                        <DropdownMenuItem
                                            key={tpl.id}
                                            data-financials-charge-template={tpl.id}
                                            onSelect={() => void preview(tpl.id, tpl.label)}
                                        >
                                            {/* The tenant's own label. Never `template_key`. */}
                                            {tpl.label}
                                            {tpl.amountCents != null ? (
                                                <span className="alloy-os-financials__menu-amount">
                                                    {money(tpl.amountCents, tpl.currencyCode)}
                                                </span>
                                            ) : null}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : null}
                        {pending ? (
                            <div className="alloy-os-financials__preview" data-financials-preview="true">
                                <p className="alloy-os-financials__preview-summary">{pending.label}</p>
                                {pending.changes.map((ch) => (
                                    <p key={ch} className="alloy-os-financials__note">
                                        {ch}
                                    </p>
                                ))}
                                {/*
                                    THE HONEST BALANCE IMPACT.
                                    The design showed "$255 → $295". Add Charge creates a DRAFT, and a
                                    draft is not owed — so the current balance does not move until the
                                    charge is posted. Printing an arrow between two balances would
                                    assert a change the backend does not make.
                                */}
                                <p className="alloy-os-financials__note" data-financials-preview-impact="true">
                                    Creates a draft · the balance changes when it is posted
                                </p>
                                <span className="alloy-os-financials__preview-actions">
                                    <button
                                        type="button"
                                        className="alloy-os-financials__action"
                                        data-financials-preview-commit="true"
                                        disabled={running}
                                        onClick={() => void commit()}
                                    >
                                        Add charge
                                    </button>
                                    <button
                                        type="button"
                                        className="alloy-os-financials__action"
                                        data-financials-preview-cancel="true"
                                        disabled={running}
                                        onClick={() => setPending(null)}
                                    >
                                        Cancel
                                    </button>
                                </span>
                            </div>
                        ) : null}
                        {commandError ? (
                            <span className="alloy-os-financials__error" data-financials-command-error="true">
                                {commandError}
                            </span>
                        ) : null}
                        </div>

                        {/* ── SUBJECT FILTER + LEDGER ─────────────────────────────────────────── */}
                        {showLedger ? (
                            <>
                                {vm.subjects.length > 1 ? (
                                    <div className="alloy-os-financials__filters" data-financials-filters="true">
                                        <FilterChip
                                            active={subjectFilter === "all"}
                                            onClick={() => setSubjectFilter("all")}
                                            value="all"
                                        >
                                            All
                                        </FilterChip>
                                        {vm.subjects.map((s) => (
                                            <FilterChip
                                                key={s.customerMemberId}
                                                active={subjectFilter === s.customerMemberId}
                                                onClick={() => setSubjectFilter(s.customerMemberId)}
                                                value={s.customerMemberId}
                                            >
                                                {s.displayName}
                                            </FilterChip>
                                        ))}
                                    </div>
                                ) : null}

                                <div className="alloy-os-financials__ledger" data-financials-ledger="true">
                                    {vm.ledgerPeriods.map((group) => {
                                        const groupRows = financialsRowsInSubjectScope(group.rows, subjectFilter);
                                        if (groupRows.length === 0) return null;
                                        return (
                                            <section
                                                key={group.period.key}
                                                className="alloy-os-financials__period"
                                                data-financials-period={group.period.key}
                                            >
                                                <p className="alloy-os-financials__period-label">
                                                    {group.period.label.toUpperCase()}
                                                </p>
                                                {groupRows.map((row) => (
                                                    <div
                                                        key={row.chargeId}
                                                        className="alloy-os-financials__row"
                                                        data-financials-row={row.chargeId}
                                                    >
                                                        <span className="alloy-os-financials__cell alloy-os-financials__cell--date">
                                                            {formatDisplayDate(row.date) || "—"}
                                                        </span>
                                                        <span className="alloy-os-financials__cell">
                                                            {row.subjectName ?? "—"}
                                                        </span>
                                                        <span className="alloy-os-financials__cell">
                                                            {row.categoryLabel}
                                                        </span>
                                                        <span className="alloy-os-financials__cell alloy-os-financials__cell--desc">
                                                            {row.description ?? "—"}
                                                        </span>
                                                        <span
                                                            className="alloy-os-financials__cell alloy-os-financials__cell--gl"
                                                            data-financials-gl={row.glCode ?? "unmapped"}
                                                        >
                                                            {/* Explicit, never a silent blank. */}
                                                            {row.glCode ?? "Unmapped"}
                                                        </span>
                                                        <span className="alloy-os-financials__cell alloy-os-financials__cell--amount">
                                                            {money(row.amountCents, row.currencyCode)}
                                                        </span>
                                                        <span
                                                            className="alloy-os-financials__cell alloy-os-financials__cell--status"
                                                            data-financials-lifecycle={row.lifecycleStatus}
                                                        >
                                                            {row.lifecycleStatus}
                                                        </span>
                                                        <span className="alloy-os-financials__cell alloy-os-financials__cell--source">
                                                            {row.source ?? "—"}
                                                        </span>
                                                        {/*
                                                            ONE TRANSITION PER LIFECYCLE STATE, AND
                                                            AT MOST ONE CORRECTION.

                                                            A draft can be posted; posted money can
                                                            only be corrected, and only once. A
                                                            REVERSED row is no longer `posted` here,
                                                            so it offers nothing — it used to still
                                                            read `posted`, which is how the same
                                                            charge was reversed twice and the family
                                                            credited for money never charged. A
                                                            CORRECTION row offers nothing either: a
                                                            reversal is not itself reversed. A void
                                                            row and a scheduled draft have no lawful
                                                            next step here. `offersReverse` is the
                                                            READ MODEL's answer, so the rule is not
                                                            restated in JSX — and a certification can
                                                            assert the very value that renders it.
                                                        */}
                                                        <span className="alloy-os-financials__cell alloy-os-financials__cell--row-action">
                                                            {row.lifecycleStatus === "draft" ? (
                                                                <button
                                                                    type="button"
                                                                    className="alloy-os-financials__action"
                                                                    data-financials-row-command="charge.post"
                                                                    data-financials-row-charge={row.chargeId}
                                                                    disabled={running}
                                                                    onClick={() => void runRowAction("post", row)}
                                                                >
                                                                    Post
                                                                </button>
                                                            ) : row.offersReverse ? (
                                                                <button
                                                                    type="button"
                                                                    className="alloy-os-financials__action"
                                                                    data-financials-row-command="charge.reverse"
                                                                    data-financials-row-charge={row.chargeId}
                                                                    disabled={running}
                                                                    onClick={() => void runRowAction("reverse", row)}
                                                                >
                                                                    Reverse
                                                                </button>
                                                            ) : null}
                                                        </span>
                                                    </div>
                                                ))}
                                            </section>
                                        );
                                    })}
                                    {visibleRows.length === 0 ? (
                                        <p className="alloy-os-financials__note">No financial activity yet.</p>
                                    ) : null}
                                </div>
                            </>
                        ) : null}

                        {/*
                         * ── DETAILS IS A DRILL-DOWN, AND SOME PLACEMENTS HAVE NOWHERE TO DRILL ──
                         *
                         * In the Focus Panel this card is financial CONTEXT beside some other
                         * subject, so `Details →` is how an operator asks to see the account. In
                         * Financials → Accounts they have already asked: they opened the Financials
                         * workspace, chose Accounts, and selected a household. The account's own
                         * activity is on screen beneath this card. Offering a drill-down there is
                         * asking them to request what they are already looking at, and it opened a
                         * scrimmed overlay over the surface that was already showing it.
                         *
                         * Defaults to present, so the Focus Panel is untouched.
                         */}

                        {showDetailsAction ? (
                            <button
                                type="button"
                                className="alloy-os-financials__details"
                                data-financials-details="true"
                                // The overlay state owns elevation now; reporting perspective here as
                                // well would give the depth layer two authorities for one card.
                                onClick={() => (expanded ? pop() : requestDetails())}
                                aria-busy={detailPending || undefined}
                                data-financials-details-pending={detailPending ? "true" : undefined}
                            >
                                {expanded ? "Less" : "Details"}
                            </button>
                        ) : null}
                    </>
                )}
            </UniversalCard>
        </div>
    );
}

/**
 * The household this panel is about.
 *
 * `truth` carries the household under more than one binding depending on how the panel was reached,
 * so this reads them in order of authority rather than assuming one. Returning null is ordinary — a
 * panel with no household simply has no account.
 */
/**
 * THE ACCOUNT THIS CARD IS ABOUT — the shared rule, not this card's opinion of it.
 *
 * These keys were written out twice: once where mounting is decided, once here where the read is
 * addressed. They agreed only by coincidence, and the registry's own comment had already named the
 * hazard — "admitting on one key and reading another is how a card mounts and then sits still".
 * Both now call `resolveFinancialSubjectId`, so the two decisions cannot diverge.
 */
/**
 * A DESTINATION, NOT A NAME.
 *
 * Every entry carries what its surface needs to render itself, so returning to one never means
 * reconstructing it from whatever state happens to survive. `adjust_charge` and `reverse_charge`
 * are row-scoped commands and say which row; `detail`, `add_charge` and `payment` need nothing
 * beyond their kind.
 */
export type FinancialsSurface =
    | { kind: "detail" }
    | { kind: "add_charge" }
    | { kind: "payment" }
    /*
     * ── ADMINISTRATION IS DEPTH, NOT DOCUMENT FLOW ────────────────────────────────────────────
     *
     * These three ride the same stack Add Charge and Payment ride, for the same reason: an
     * elevated Focus Panel cell grants interaction to the platform card alone, so a surface that
     * wants clicks has to BE one. Rendering them inside Details made them part of the record an
     * operator scrolls, which is what pushed the ledger down a screen.
     *
     * Each hosts the component that already exists. None of them is a second writer.
     *
     * Named `_admin` deliberately: `responsibility` already exists below as the PER-CHARGE resolve
     * and reallocate surface a ledger row opens, and the two are different acts. One changes what a
     * household arranges; the other divides one obligation. Sharing a name would make the stack
     * ambiguous about which was open.
     */
    | { kind: "responsibility_admin" }
    | { kind: "discount_admin" }
    | { kind: "payments_admin" }
    | { kind: "adjust_charge"; chargeId: string }
    | { kind: "reverse_charge"; chargeId: string; label: string }
    /*
     * WHO OWES ONE OBLIGATION. Row-scoped like the two above, and it carries its MODE because
     * resolving and reallocating are different intents that happen to share a shell: one divides a
     * charge nobody owes yet, the other moves what one real person owes to another.
     */
    | { kind: "responsibility"; chargeId: string; label: string; mode: "resolve" | "reallocate" };

function householdIdFrom(context: OperationalContext): string | null {
    /*
     * THE SHARED RULE, NOT A COPY OF IT. The registry decides whether this card may mount from the
     * same function — so a card can no longer be admitted because an account "is available" and then
     * fail to find one in the very context that admitted it.
     */
    return resolveFinancialSubjectId(context);
}

function money(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
}

/**
 * The header answer, in the SAME scope as the body.
 *
 * It read `vm.reconciliation` — the whole account — while the body could be filtered to one child, so
 * the card announced $100.00 above a $75.00 breakdown. The scoped figure is passed in rather than
 * re-derived, so the two cannot disagree again.
 */
function insightFor(
    vm: FinancialsCardVM | null,
    reconciliation: { balanceCents: number } | null,
    loading: boolean,
    currency: string,
): string {
    if (loading && !vm) return "";
    if (!vm || vm.unavailableReason || !reconciliation) return "";
    return `${money(reconciliation.balanceCents, currency)} · ${vm.period.label}`;
}

function Line(props: {
    label: string;
    cents: number;
    currency: string;
    strong?: boolean;
    muted?: boolean;
    testId?: string;
}) {
    return (
        <span
            className={[
                "alloy-os-financials__line",
                props.strong ? "alloy-os-financials__line--strong" : "",
                props.muted ? "alloy-os-financials__line--muted" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            data-financials-line={props.testId}
        >
            <span className="alloy-os-financials__line-label">{props.label}</span>
            <span className="alloy-os-financials__line-value">{money(props.cents, props.currency)}</span>
        </span>
    );
}

function FilterChip(props: {
    active: boolean;
    value: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className={`alloy-os-financials__chip${props.active ? " alloy-os-financials__chip--active" : ""}`}
            data-financials-filter={props.value}
            data-active={props.active ? "true" : undefined}
            onClick={props.onClick}
        >
            {props.children}
        </button>
    );
}
