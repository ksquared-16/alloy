"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    collectionLifecycle,
    lifecycleLabel,
    type CollectionRail,
} from "@/lib/financials/payments/collectionLifecycle";
import ApprovedFinancialsCard from "@/components/operationalCards/FinancialsCard";
import AddChargeCommand from "@/components/operationalCards/AddChargeCommand";
import FinancialsDetailCard from "@/components/operationalCards/FinancialsDetailCard";
import CardCollectionField from "./CardCollectionField";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import {
    adaptAddChargeSpecimen,
    adaptChargeTemplateOption,
    adaptFinancialsVmToFinancialsCard,
    adaptFinancialsVmToLedgerPeriods,
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
import type { FinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { resolveFinancialSubjectId } from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
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
export default function FinancialsCard({ model, context, receded = false, coordination }: Props) {
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
    const [loading, setLoading] = useState(false);
    /*
     * ONE overlay at a time, and the Focus Panel's OWN depth layer renders it.
     *
     * `useReportPerspective(..., "focused")` is what raises this card into the centered, scrimmed
     * position the approved detail and command cards are drawn in — the same machinery Scheduling
     * already uses. Neither of these is a new page or a second modal system, and the scrim click /
     * ESC path comes back through `useDismissSignal` rather than a close button this card owns.
     */
    const [overlay, setOverlay] = useState<null | "detail" | "add_charge" | "payment">(null);
    const expanded = overlay === "detail";
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
    const load = useCallback(async () => {
        if (!customerId && !scopedMemberId) {
            requestSeq.current += 1;
            setVm(null);
            return;
        }
        const seq = (requestSeq.current += 1);
        const current = () => seq === requestSeq.current;
        setLoading(true);
        try {
            const query = customerId
                ? `customer_id=${encodeURIComponent(customerId)}`
                : `customer_member_id=${encodeURIComponent(scopedMemberId as string)}`;
            const res = await fetch(`/api/admin/financials/card?${query}`, { credentials: "include" });
            const json = (await res.json()) as { ok?: boolean; vm?: FinancialsCardVM };
            if (!current()) return;
            setVm(json?.ok && json.vm ? json.vm : null);
        } catch {
            if (!current()) return;
            setVm(null);
        } finally {
            // A superseded request must not clear the spinner belonging to the one that replaced it.
            if (current()) setLoading(false);
        }
    }, [customerId, scopedMemberId]);

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

    useEffect(() => {
        // Clear FIRST: the previous household's balance must not linger while the next resolves.
        setVm(null);
        void load();
    }, [load]);

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
        return subjectFilter === "all"
            ? vm.rows
            : vm.rows.filter((r) => r.subjectMemberId === subjectFilter);
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
    const chargeInvocation = useMemo((): {
        entityType: string;
        entityId: string;
        customerMemberId: string | null;
    } | null => {
        if (chargeTarget) {
            return { entityType: "child", entityId: chargeTarget, customerMemberId: chargeTarget };
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
    }, [chargeTarget, customerId, context.subject?.id, context.subject?.type]);

    /**
     * Open the settle operation on the obligation most likely to be settled.
     *
     * The read model decides which that is — the first row it marks payable — and the operator may
     * change both the charge and the amount once the panel is open. Undefined when nothing can take
     * money, so the control stays inert rather than opening a panel with nothing to act on.
     */
    const openSettle = useMemo(() => {
        if (!payableRows.length) return undefined;
        return () => {
            const row = payableRows[0];
            setCommandError(null);
            setPayTarget({
                chargeId: row.chargeId,
                label: row.description ?? row.categoryLabel,
                outstandingCents: row.outstandingCents,
                subjectMemberId: row.subjectMemberId,
            });
            setPayAmount((row.outstandingCents / 100).toFixed(2));
            setOverlay("payment");
        };
    }, [payableRows]);

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
                                : {}),
                            // The household, so a pre-enrolment family has a billable subject when
                            // no child agreement exists. The resolver still prefers an agreement.
                            customer_id: customerId,
                            template_id: templateId,
                            child_label: chargeInvocation.customerMemberId
                                ? vm?.subjects.find(
                                      (s) => s.customerMemberId === chargeInvocation.customerMemberId,
                                  )?.displayName
                                : undefined,
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
                            : {}),
                        // Same subject inputs the preview was given — preview and commit run the
                        // same resolver, so they must be asked the same question.
                        customer_id: customerId,
                        template_id: pending.templateId,
                        ...(chargeEventDate ? { event_date: chargeEventDate } : {}),
                        ...(chargeNote ? { note: chargeNote } : {}),
                    },
                }),
            });
            const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string } };
            if (!json?.ok) {
                const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                // A refusal is the domain speaking — surfaced, never swallowed into a silent no-op.
                setCommandError(err || "The charge was refused.");
                return;
            }
            setPending(null);
            // The command card closes on success only. A refusal keeps it open with the domain's
            // own message, so the operator can correct the charge rather than re-open and retype it.
            setOverlay(null);
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
    }, [chargeEventDate, chargeNote, chargeInvocation, chargeUnavailableReason, load, pending, running]);

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
            actionKey: "charge.post" | "charge.reverse",
            row: { chargeId: string; description: string | null; subjectMemberId: string | null },
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
                        entity_type: row.subjectMemberId ? "child" : (chargeInvocation?.entityType ?? "child"),
                        /*
                         * The ROW's own subject when it has one, and the panel's when it does not.
                         *
                         * This sent an EMPTY STRING for a household charge, on the reasoning that a
                         * family expense must not be attributed to one sibling and that neither
                         * action requires an entity — `charge.post` and `charge.reverse` both
                         * declare `requiresEntityId: false`. The reasoning is right about
                         * attribution and wrong about the route: `/api/admin/actions/execute`
                         * refuses any request without an entity id, so Post and Reverse on a
                         * household charge answered 400 and the operator could not act on a
                         * pre-enrolment fee at all. Found by driving the route the way this card
                         * does; the action definitions alone say the call is legal.
                         *
                         * The charge_id in the payload is what decides which charge is posted or
                         * reversed, and the service reads the row's own billable source — so the
                         * fallback subject travels as request context, not as the money's
                         * attribution. `posted_by` still records the operator, and the charge stays
                         * on the household it was billed to.
                         */
                        entity_id: row.subjectMemberId ?? chargeInvocation?.entityId ?? "",
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload: {
                            charge_id: row.chargeId,
                            charge_label: row.description ?? row.chargeId,
                            ...(actionKey === "charge.reverse" ? { kind: "reversal" } : {}),
                        },
                    }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string } };
                if (!json?.ok) {
                    const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                    // The domain refusing is an answer. Surfaced, never swallowed.
                    setCommandError(err || "That could not be done.");
                }
            } catch {
                setCommandError("The request could not be sent.");
            } finally {
                setRunning(false);
                await load();
            }
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
                if (actionKey !== "payment.collect_card") setPayTarget(null);
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

    // Elevation reported from RENDER-adjacent state, so the depth layer and this card agree on the
    // same frame. A card that reported after paint would flash its base surface first.
    useReportPerspective(coordination, "financials", overlay ? "focused" : "base");
    useDismissSignal(coordination, "financials", () => {
        setOverlay(null);
        setPending(null);
        setCommandError(null);
    });

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
    const paymentBand = vm ? (
            <section className="alloy-os-financials__band" data-financials-band="payment">
                <p className="alloy-os-financials__band-label">Payment</p>
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
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={payAmount}
                            aria-label="Payment amount"
                            data-financials-payment-amount="true"
                            onChange={(e) => setPayAmount(e.target.value)}
                        />
                        <select
                            value={payMethod}
                            aria-label="Payment method"
                            data-financials-payment-method="true"
                            onChange={(e) => setPayMethod(e.target.value)}
                        >
                            <option value="card">Card</option>
                            <option value="cash">Cash</option>
                            <option value="check">Check</option>
                            <option value="money_order">Money order</option>
                            {/*
                                Bank transfer is a real rail with no executor
                                yet. Offering it as though it worked recorded
                                money nobody had collected, which is the same
                                defect Card had; it stays visible and disabled so
                                the model reads truthfully.
                            */}
                            {/*
                                Availability is the SERVER's answer, carried on the view model from
                                the merchant's own recorded capability. A chooser deciding this for
                                itself would offer a collection the provider then refuses, after the
                                operator was told it was under way.
                            */}
                            <option value="ach" disabled={!vm.achAvailable}>
                                {vm.achAvailable
                                    ? "Bank account"
                                    : "Bank account — not enabled for this organization"}
                            </option>
                            <option value="other">Other</option>
                        </select>
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
            <div className="alloy-os-financials" data-financials-card="true" data-financials-overlay="add_charge">
                {selected ? (
                    <AddChargeCommand
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
                                void preview(id, tpl?.label ?? "");
                            },
                            subjects: [
                                { id: "all", label: "Household" },
                                ...vm.subjects.map((sub) => ({
                                    id: sub.customerMemberId,
                                    label: sub.displayName,
                                })),
                            ],
                            selectedSubjectId: subjectFilter,
                            onSelectSubject: setSubjectFilter,
                            amount: chargeAmount,
                            onAmount: setChargeAmount,
                            note: chargeNote,
                            onNote: setChargeNote,
                            eventDate: chargeEventDate,
                            onEventDate: setChargeEventDate,
                            onSubmit: () => void commit(),
                            onCancel: () => {
                                setOverlay(null);
                                setPending(null);
                                setCommandError(null);
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
                    title="Take payment"
                    insight=""
                    iconName="Receipt"
                    tier="work"
                    archetype="status"
                    modalClass="command"
                    density="expanded"
                    gridSpan="row"
                    data-universal-card-key="payment"
                    footerAction={
                        <button
                            type="button"
                            className="alloy-os-financials__action"
                            data-financials-payment-close="true"
                            onClick={() => {
                                setPayTarget(null);
                                setOverlay("detail");
                            }}
                        >
                            ← Back to details
                        </button>
                    }
                >
                    {paymentBand}
                </UniversalCard>
            </div>
        );
    }

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
                        <label className="alloy-os-fdetail__movefield">
                            <span>{movePending ? "Move to" : "Apply to"}</span>
                            <select
                                data-testid="payment-move-target"
                                value={moveTargetId}
                                onChange={(e) => {
                                    setMoveTargetId(e.target.value);
                                    // A new destination invalidates a preview taken for the old one.
                                    setMovePreview(null);
                                }}
                            >
                                <option value="">Choose a charge…</option>
                                {moveTargets.map((t) => (
                                    <option key={t.chargeId} value={t.chargeId}>
                                        {t.label}
                                        {t.serviceDate ? ` · ${t.serviceDate}` : ""}
                                        {` · ${(t.outstandingCents / 100).toLocaleString(undefined, {
                                            style: "currency",
                                            currency,
                                        })} outstanding`}
                                    </option>
                                ))}
                            </select>
                        </label>
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

                <FinancialsDetailCard
                    onMovePayment={openMovePayment}
                    onApplyPayment={openApplyPayment}
                    evidence={adaptFinancialsVmToFinancialsCard({
                        vm,
                        reconciliation,
                        pastDue,
                        rows: vm.rows.filter(
                            (r) =>
                                r.periodKey === vm.period.key
                                && (subjectFilter === "all" || r.subjectMemberId === subjectFilter),
                        ),
                        currency,
                    })}
                    periods={adaptFinancialsVmToLedgerPeriods({
                        vm,
                        currency,
                        openPeriodKey: vm.period.key,
                    })}
                    activeSubject={subjectFilter === "all" ? "All" : subjectFilter}
                    /*
                     * `Payment` enters the settle operation. Slice H is that lane, so the control is
                     * live: it selects the obligation the operator is most likely to settle — the
                     * first charge the read model marks payable — and opens the same form the band's
                     * own `Record payment →` menu opens. Still inert when nothing can take money,
                     * because an enabled control that cannot act is the lie this comment used to
                     * describe.
                     */
                    onPayment={openSettle}
                    onAddCharge={() => setOverlay("add_charge")}
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
                */}
                {paymentBand}
            </div>
        );
    }

    if (!expanded && vm && reconciliation && !vm.unavailableReason) {
        const periodRows = vm.rows.filter(
            (r) =>
                r.periodKey === vm.period.key
                && (subjectFilter === "all" || r.subjectMemberId === subjectFilter),
        );
        return (
            <div
                className="alloy-os-financials"
                data-financials-card="true"
                data-financials-subject={subjectFilter}
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
                    onDetails={() => setOverlay("detail")}
                    onAddCharge={() => setOverlay("add_charge")}
                    /*
                     * `Pay now` was always this card's primary action and the Focus Panel never wired
                     * it, so it rendered inert while Slice H's settle operation had no way in at all.
                     * It opens at the SAME depth as Add charge deliberately: reached from inside the
                     * detail representation, the panel's armed depth scrim sits over the operation
                     * and the commit button cannot be clicked — visible, enabled, and unreachable.
                     */
                    onPayNow={openSettle}
                />
            </div>
        );
    }

    return (
        <div className="alloy-os-financials" data-financials-card="true" data-financials-subject={subjectFilter}>
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
                    <p
                        className="alloy-os-financials__empty"
                        data-financials-empty={
                            loading || subjectStillResolving
                                ? "loading"
                                : noFinancialSubject
                                  ? "no-subject"
                                  : "no-account"
                        }
                    >
                        {/*
                         * THREE STATES, AND ONLY ONE OF THEM IS TERMINAL.
                         *
                         * "No financial record" was wrong in every case it was shown. It reads as a
                         * statement about the FAMILY — that they have no financial history — and
                         * having no financial activity is a perfectly ordinary, fully supported
                         * state that renders as $0.00 with Add charge available. What the card
                         * actually meant was that it could not resolve an account to ask about.
                         */}
                        {loading || subjectStillResolving
                            ? "Loading the account…"
                            : "Financial account unavailable"}
                    </p>
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

                                {paymentBand}
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
                                        const groupRows = group.rows.filter(
                                            (r) => subjectFilter === "all" || r.subjectMemberId === subjectFilter,
                                        );
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
                                                            {row.date ?? "—"}
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
                                                                    onClick={() => void runRowAction("charge.post", row)}
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
                                                                    onClick={() => void runRowAction("charge.reverse", row)}
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

                        <button
                            type="button"
                            className="alloy-os-financials__details"
                            data-financials-details="true"
                            // The overlay state owns elevation now; reporting perspective here as
                            // well would give the depth layer two authorities for one card.
                            onClick={() => setOverlay(expanded ? null : "detail")}
                        >
                            {expanded ? "← Less" : "Details →"}
                        </button>
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
