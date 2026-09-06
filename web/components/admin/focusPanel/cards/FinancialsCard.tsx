"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import ApprovedFinancialsCard from "@/components/operationalCards/FinancialsCard";
import AddChargeCommand from "@/components/operationalCards/AddChargeCommand";
import FinancialsDetailCard from "@/components/operationalCards/FinancialsDetailCard";
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
    presentPayment,
    unappliedTotalCents,
} from "@/lib/adminV2/runtime/focusPanel/financials/paymentPresentation";
import type { FinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

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
    const [overlay, setOverlay] = useState<null | "detail" | "add_charge">(null);
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
    const runPaymentAction = useCallback(
        async (
            actionKey: "payment.record" | "payment.refund",
            payload: Record<string, unknown>,
            entityId: string | null,
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
                        entity_type: "child",
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
                        entity_id: entityId ?? "",
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload,
                    }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string } };
                if (!json?.ok) {
                    const err = typeof json?.error === "string" ? json.error : json?.error?.message;
                    setCommandError(err || "That could not be done.");
                    return;
                }
                setPayTarget(null);
            } catch {
                setCommandError("The request could not be sent.");
            } finally {
                setRunning(false);
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
    if (overlay === "detail" && vm && reconciliation) {
        return (
            <div className="alloy-os-financials" data-financials-card="true" data-financials-overlay="detail">
                <FinancialsDetailCard
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
                    /* `Payment` enters the settle operation; the platform exposes no payment
                       command from this lane yet, so it is passed undefined and the control is
                       inert rather than lying about what it will do. */
                    onAddCharge={() => setOverlay("add_charge")}
                />
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
                    <p className="alloy-os-financials__empty" data-financials-empty="loading">
                        {loading ? "Loading the account…" : "No financial record."}
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
                                <Line
                                    label="Responsibility"
                                    cents={reconciliation!.responsibilityCents}
                                    currency={currency}
                                    strong
                                    testId="responsibility"
                                />
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
                                            {vm.payments.map((raw) => {
                                                const p = presentPayment(raw);
                                                return (
                                                    <li
                                                        key={p.paymentId}
                                                        className="alloy-os-financials__payment"
                                                        data-financials-payment-id={p.paymentId}
                                                        data-financials-payment-kind={p.kind}
                                                    >
                                                        <span data-financials-payment-received="true">
                                                            {p.kind === "refund" ? "−" : ""}
                                                            {money(p.receivedCents, p.currencyCode)}
                                                        </span>
                                                        <span className="alloy-os-financials__note">
                                                            {p.statusLabel} · {p.methodLabel}
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
                                                        {p.offersRefund ? (
                                                            <button
                                                                type="button"
                                                                className="alloy-os-financials__action"
                                                                data-financials-command="payment.refund"
                                                                data-financials-refund-payment={p.paymentId}
                                                                disabled={running}
                                                                onClick={() =>
                                                                    void runPaymentAction(
                                                                        "payment.refund",
                                                                        {
                                                                            payment_id: p.paymentId,
                                                                            payment_label: `${money(p.receivedCents, p.currencyCode)} ${p.methodLabel}`,
                                                                        },
                                                                        chargeTarget,
                                                                    )
                                                                }
                                                            >
                                                                Refund
                                                            </button>
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
                                                <option value="cash">Cash</option>
                                                <option value="check">Check</option>
                                                <option value="ach">Bank transfer</option>
                                                <option value="card">Card</option>
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
                                                        void runPaymentAction(
                                                            "payment.record",
                                                            {
                                                                charge_id: payTarget.chargeId,
                                                                amount_cents: cents,
                                                                payment_method: payMethod,
                                                                charge_label: payTarget.label,
                                                            },
                                                            payTarget.subjectMemberId ?? chargeTarget,
                                                        );
                                                    }}
                                                >
                                                    Record payment
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
                                        </div>
                                    ) : null}

                                    {!vm.paymentSetup && !vm.payments.length && !payableRows.length ? (
                                        <p className="alloy-os-financials__note" data-financials-payment="none">
                                            No payments recorded
                                        </p>
                                    ) : null}
                                </section>
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
function householdIdFrom(context: OperationalContext): string | null {
    const truth = context.truth as Record<string, unknown>;
    for (const key of ["customer.id", "household.id", "child.family_customer_id", "customer_id"]) {
        const value = truth[key];
        const s = value != null ? String(value).trim() : "";
        if (s) return s;
    }
    return null;
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
