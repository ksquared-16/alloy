"use client";

import { useCallback, useEffect, useState } from "react";
import IdentityAvatar from "@/components/admin/focusPanel/identity/IdentityAvatar";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";
import { reductionReasonLabel } from "@/lib/financials/reductions/reductionReasonLabels";
import { Settings2 } from "lucide-react";

import { executeFinancialsAction } from "@/lib/financials/executeFinancialsAction";

/**
 * WHAT DISCOUNTS AFFECT THIS FAMILY'S FINANCIAL POSITION.
 *
 * An operator looking at a family's money had to open each child's Assignment to learn what
 * discount was expected, or travel to organization configuration to read a policy that says
 * nothing about THIS family. The position belongs where the money is, and this is it.
 *
 * ── WHAT THIS COMPONENT IS NOT ALLOWED TO DO ──────────────────────────────────────────────────
 *
 * It computes NOTHING. Every figure below arrives from `/api/admin/financials/family-discount-position`,
 * which groups the canonical forecast's own outcomes. The tempting version of this component
 * multiplies a rate by a gross to render "10% of $1,450" — and that number would be blind to
 * exceptions, effective windows and category scoping, and would disagree with the applied ledger
 * the moment any of them changed. There is one forecast authority and this surface only reads it.
 *
 * It also authors no policy. Rates, eligibility and scope are Organization configuration's; what
 * belongs here is the RESOLVED family truth and the governed exception decision.
 */

const HOUSEHOLD_LABEL = "this family";

type Subject = {
    opportunityCustomerMemberId: string;
    customerMemberId: string | null;
    expectedCents: number;
    currencyCode: string;
    /** How THIS relationship's effect was derived — the basis differs per child. */
    explanation: string | null;
    /*
     * THE AUTHORED RATE, carried from the resolver. An operator must be able to read "10%" without
     * inferring it from the expected amount — and they could not, because one sibling policy
     * produced -$18.50 on one tuition and -$145.00 on another. Two numbers, one rate.
     */
    basis?: "percentage" | "amount" | null;
    basisValue?: number | null;
};
type PolicyPosition = {
    policyId: string;
    policyKind: string;
    label: string;
    explanation: string | null;
    subjects: Subject[];
};
type ExceptionRow = {
    id: string;
    policyId: string;
    policyLabel: string;
    effectiveStart: string | null;
    effectiveEnd: string | null;
    reason: string | null;
    appliesNow: boolean;
    isLiveNow: boolean;
    ended: boolean;
    superseded: boolean;
    opportunityCustomerMemberId: string;
};
export type FamilyPosition = {
    ok: true;
    policies: PolicyPosition[];
    exceptions: ExceptionRow[];
    notExpected: { opportunityCustomerMemberId: string; reason: string }[];
    withoutForecast: { opportunityCustomerMemberId: string; reason: string }[];
};

function money(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
}

/*
 * The reason vocabulary is `reductionReasonLabel`, shared with Assignment so the same canonical
 * reason reads the same way at both grains. This surface deliberately keeps no sentences of its
 * own: when it did, "Excluded — an exception applies to this relationship" and Assignment's
 * "Excluded for this assignment" were two spellings of one fact, and an operator moving between
 * them could not tell whether they were reading one thing or two.
 *
 * THE DISTINCTION THE VOCABULARY CARRIES: excluded_by_exception is a DECISION somebody made, not
 * absence of configuration. An operator told "no policy configured" goes to Organization to create
 * something that is already there.
 */


/**
 * THE BASIS, WITHOUT THE NAME IN FRONT OF IT.
 *
 * The forecast builds its explanation as "<policy name> · <basis>" — it has to, because a caller
 * reading one outcome in isolation needs to know which policy it is about. This surface already
 * states the policy name as a header, so rendering the explanation whole printed the name twice
 * on every relationship line.
 *
 * MEASURED on deployed cfd4168b8: "Certa Certhouse · Expected $18.50 · Sibling discount (QA
 * specimen) · 10% of $185.00". Two fixes interacting — D2 moved the basis onto the relationship
 * line, D3 gave the explanation the policy's real name — and neither was wrong alone.
 *
 * Only a LEADING, exact name is removed. Nothing is recomputed, and an explanation that does not
 * begin with the name is shown untouched rather than guessed at.
 */
function basisWithoutPolicyName(explanation: string | null, policyName: string): string | null {
    if (!explanation) return null;
    const prefix = `${policyName} · `;
    return explanation.startsWith(prefix) ? explanation.slice(prefix.length) : explanation;
}

export default function FinancialsDiscountPanel({
    customerId,
    childLabelFor,
    childImageFor,
    hostedOpen,
    onHostedClose,
    initialPosition,
    onCommitted,
}: {
    customerId: string;
    /**
     * ── HOSTED AS A DEPTH CARD ────────────────────────────────────────────────────────────────
     *
     * Given, this panel is the CONTENT of a depth surface someone else opened, so management is
     * already open and dismissing it must dismiss that surface — not fold back to a position view
     * sitting inside an otherwise empty card. Without this, Escape took two presses: one to close
     * the section, another to pop the overlay.
     */
    hostedOpen?: boolean;
    onHostedClose?: () => void;
    /**
     * ── THE POSITION THE HOST HAS ALREADY READ ────────────────────────────────────────────────
     *
     * Measured in source: opening this card fired the SAME canonical route the parent had already
     * read to render its compact discount row, so the operator pressed a gear and waited out a
     * second round trip for an answer the page was holding. The card shell painted immediately and
     * its contents did not, which is what reads as a dead click.
     *
     * This is a SEED, not a second projection. It is the identical body of the identical route —
     * the panel's own read still runs, still owns the answer, and overwrites this the moment it
     * lands. What it buys is a first paint with real content instead of a skeleton, and a
     * skeleton is still what shows when no host supplies one.
     */
    initialPosition?: FamilyPosition | null;
    /** Names the relationship in the operator's words. The panel never invents a label. */
    childLabelFor?: (opportunityCustomerMemberId: string, customerMemberId: string | null) => string | null;
    /**
     * CANONICAL IDENTITY, SUPPLIED — never resolved here. The host holds the view model whose
     * subjects carry an already-authorized reference; this panel renders what it is given and
     * falls through to the canonical initials avatar when there is none.
     */
    childImageFor?: (opportunityCustomerMemberId: string, customerMemberId: string | null) => string | null;
    /** Re-read committed truth. This panel reports no success of its own. */
    onCommitted: () => Promise<void> | void;
}) {
    const [position, setPosition] = useState<FamilyPosition | null>(initialPosition ?? null);
    /* Seeded, there is nothing to wait for on the first paint — only something to confirm. */
    const [loading, setLoading] = useState(!initialPosition);
    const [error, setError] = useState<string | null>(null);
    /* Hosted, management IS the surface — it opens with it rather than behind another gear. */
    const [manageOpen, setManageOpen] = useState(Boolean(hostedOpen));
    const [nonce, setNonce] = useState(0);
    const gearRef = useState<{ current: HTMLButtonElement | null }>({ current: null })[0];

    /* Draft state for one governed exception. Nothing is written until Confirm. */
    const [draft, setDraft] = useState<{ policyId: string; ocmId: string; reason: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        /*
         * A SEEDED CARD DOES NOT FLASH BACK TO A SKELETON. The re-read still runs — it is the
         * authority — but replacing real content with "Reading discounts…" while confirming it
         * would be a worse flicker than the wait this removed.
         */
        if (!position) setLoading(true);
        void fetch(`/api/admin/financials/family-discount-position?customer_id=${encodeURIComponent(customerId)}`, {
            credentials: "include",
        })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Discount position unavailable (${r.status})`))))
            .then((body: FamilyPosition) => {
                if (!cancelled) { setPosition(body); setError(null); }
            })
            .catch((e: Error) => {
                /* FAIL CLOSED: "no discount" is a claim an operator acts on, so say it is unknown. */
                if (!cancelled) { setPosition(null); setError(e.message); }
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [customerId, nonce]);

    const reread = useCallback(async () => {
        await onCommitted();
        setNonce((n) => n + 1);
    }, [onCommitted]);

    const closeManage = useCallback(() => {
        setManageOpen(false);
        setDraft(null);
        setActionError(null);
        /* Hosted, the surface itself is what closes; the gear that opened it lives elsewhere. */
        if (hostedOpen) {
            onHostedClose?.();
            return;
        }
        gearRef.current?.focus();
    }, [gearRef, hostedOpen, onHostedClose]);

    /**
     * One governed exception, through the certified action. The panel supplies a RELATIONSHIP, a
     * POLICY and a REASON — never an amount, never a rate, never a boolean. What the exception
     * does to the money is the policy engine's business.
     */
    /*
     * ── WHAT THIS CHILD MAY BE GIVEN ──────────────────────────────────────────────────────────
     *
     * Read only when the operator asks to add one. The card's default job is to say what each
     * child receives; the catalogue of what they COULD receive is a second question and a second
     * read, and asking it on every open would spend a round trip on a list most operators never
     * look at.
     */
    const [candidates, setCandidates] = useState<
        Array<{ policyId: string; label: string; basis: string | null; basisValue: number | null }>
    >([]);
    const [assignedByMember, setAssignedByMember] = useState<
        Record<string, Array<{ assignmentId: string; policyId: string; opportunityCustomerMemberId: string }>>
    >({});
    const [addingFor, setAddingFor] = useState<{ ocmId: string; memberId: string; label: string } | null>(null);
    const [chosenPolicyId, setChosenPolicyId] = useState("");

    useEffect(() => {
        if (!customerId) return;
        let cancelled = false;
        void fetch(`/api/admin/financials/assignable-discounts?customer_id=${encodeURIComponent(customerId)}`, {
            credentials: "include",
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((body: {
                candidates?: Array<{ policyId: string; label: string; basis: string | null; basisValue: number | null }>;
                assignedByMember?: Record<string, Array<{ assignmentId: string; policyId: string; opportunityCustomerMemberId: string }>>;
            } | null) => {
                if (cancelled || !body) return;
                setCandidates(body.candidates ?? []);
                setAssignedByMember(body.assignedByMember ?? {});
            })
            .catch(() => {
                /* The card still states what each child receives; it simply cannot offer a new one. */
            });
        return () => { cancelled = true; };
    }, [customerId, nonce]);

    /*
     * ── GIVING AND TAKING BACK ────────────────────────────────────────────────────────────────
     *
     * The affirmative pair, beside the exception pair below it. Both go through registered
     * actions; neither writes a rate, because what a discount is worth is the policy's answer.
     */
    const runAssignment = useCallback(
        async (op: "assign" | "end", args: {
            ocmId: string;
            memberId?: string;
            policyId?: string;
            assignmentId?: string;
        }) => {
            setBusy(true);
            setActionError(null);
            const today = new Date().toISOString().slice(0, 10);
            try {
                await executeFinancialsAction({
                    action_key:
                        op === "assign"
                            ? "billing.assign_commercial_policy"
                            : "billing.end_commercial_policy_assignment",
                    entity_type: "opportunity_customer_member",
                    entity_id: args.ocmId,
                    mode: "execute",
                    confirmation: { confirmed: true },
                    payload:
                        op === "assign"
                            ? {
                                  policy_id: args.policyId,
                                  opportunity_customer_member_id: args.ocmId,
                                  customer_member_id: args.memberId,
                                  effective_start: today,
                              }
                            : { assignment_id: args.assignmentId, effective_end: today },
                });
                setAddingFor(null);
                setChosenPolicyId("");
                await reread();
            } catch (e) {
                setActionError((e as Error).message);
            } finally {
                setBusy(false);
            }
        },
        [reread],
    );

    const runException = useCallback(
        async (op: "create" | "end", args: { ocmId: string; policyId?: string; exceptionId?: string; reason?: string }) => {
            setBusy(true);
            setActionError(null);
            try {
                await executeFinancialsAction({
                    action_key:
                        op === "create" ? "billing.except_commercial_policy" : "billing.end_commercial_policy_exception",
                    entity_type: "opportunity_customer_member",
                    entity_id: args.ocmId,
                    mode: "execute",
                    confirmation: { confirmed: true },
                    payload:
                        op === "create"
                            ? { commercial_policy_id: args.policyId, reason: args.reason }
                            : { exception_id: args.exceptionId, reason: args.reason },
                });
                setDraft(null);
                await reread();
            } catch (e) {
                setActionError((e as Error).message);
            } finally {
                setBusy(false);
            }
        },
        [reread],
    );

    const label = (s: Subject) => childLabelFor?.(s.opportunityCustomerMemberId, s.customerMemberId) ?? HOUSEHOLD_LABEL;
    const policies = position?.policies ?? [];
    const liveExceptions = (position?.exceptions ?? []).filter((e) => e.isLiveNow);

    /*
     * ── THE CARD IS ABOUT CHILDREN, AND THE ROUTE ANSWERS BY POLICY ──────────────────────────
     *
     * Inverting it is the whole of this view model. The operator's question is "what does Certa
     * receive", asked once per child; the forecast's answer is "which children does this policy
     * reach", grouped the other way. Nothing is computed here — every figure is carried from the
     * position, and the rate is the policy's authored value rather than anything divided out of
     * an expected amount.
     *
     * A CHILD WITH NOTHING STILL APPEARS. They are the child an operator came here to give a
     * discount to, and a row that omits them says the surface did not consider them.
     */
    const childRows = (() => {
        type Row = {
            ocmId: string;
            memberId: string | null;
            label: string;
            imageUrl: string | null;
            lines: Array<{
                policyId: string;
                policyLabel: string;
                rate: string;
                expectedCents: number;
                currencyCode: string;
                why: string | null;
                assignmentId: string | null;
                exception: ExceptionRow | null;
            }>;
        };
        const byChild = new Map<string, Row>();

        /* Every relationship the position knows about, discount or not. */
        for (const p of policies) {
            for (const sub of p.subjects) {
                const row = byChild.get(sub.opportunityCustomerMemberId) ?? {
                    ocmId: sub.opportunityCustomerMemberId,
                    memberId: sub.customerMemberId,
                    label: label(sub),
                    imageUrl: childImageFor?.(sub.opportunityCustomerMemberId, sub.customerMemberId) ?? null,
                    lines: [],
                };
                const assigned = (assignedByMember[sub.customerMemberId ?? ""] ?? [])
                    .find((a) => a.policyId === p.policyId);
                row.lines.push({
                    policyId: p.policyId,
                    policyLabel: p.label,
                    rate:
                        sub.basis === "percentage" && sub.basisValue != null
                            ? `${sub.basisValue}%`
                            : sub.basis === "amount" && sub.basisValue != null
                              ? money(sub.basisValue, sub.currencyCode)
                              : "",
                    expectedCents: sub.expectedCents,
                    currencyCode: sub.currencyCode,
                    why: basisWithoutPolicyName(sub.explanation, p.label),
                    /*
                     * ASSIGNED vs RULE-DERIVED, and the difference decides what may be done. An
                     * assignment an operator made can be removed; a discount the rules grant can
                     * only be waived, because there is no assignment to end.
                     */
                    assignmentId: assigned?.assignmentId ?? null,
                    exception: (position?.exceptions ?? []).find(
                        (e) => e.policyId === p.policyId
                            && e.opportunityCustomerMemberId === sub.opportunityCustomerMemberId
                            && e.isLiveNow,
                    ) ?? null,
                });
                byChild.set(sub.opportunityCustomerMemberId, row);
            }
        }

        /* And the relationships no policy reached — named, with nothing, which is a real state. */
        for (const n of position?.notExpected ?? []) {
            if (byChild.has(n.opportunityCustomerMemberId)) continue;
            byChild.set(n.opportunityCustomerMemberId, {
                ocmId: n.opportunityCustomerMemberId,
                memberId:
                    Object.entries(assignedByMember).find(([, list]) =>
                        list.some((a) => a.opportunityCustomerMemberId === n.opportunityCustomerMemberId),
                    )?.[0] ?? null,
                label: childLabelFor?.(n.opportunityCustomerMemberId, null) ?? HOUSEHOLD_LABEL,
                imageUrl: childImageFor?.(n.opportunityCustomerMemberId, null) ?? null,
                lines: [],
            });
        }
        return [...byChild.values()];
    })();

    /*
     * ── ONE STATEMENT OF ONE FACT ─────────────────────────────────────────────────────────────
     *
     * This panel has two regions: a position summary, and a management section the gear opens.
     * Inline on Accounts that is right — the summary is what an operator reads, and management is
     * a door beside it.
     *
     * HOSTED AS A DEPTH CARD it is wrong, and was rendering both: `manageOpen` starts true, so the
     * card opened with "Certa · Expected $18.50" in the summary and "Certa · Expected $18.50"
     * again four lines below it under a "Manage discounts" heading that repeated the card's own
     * title. The operator read the same sentence twice and had to work out which copy could be
     * acted on.
     *
     * Hosted, the management list IS the content — it states every figure the summary did and
     * carries the action for each row. So the summary and the heading it sat under are suppressed,
     * and nothing is lost but the duplicate.
     */
    const summaryIsSeparate = !hostedOpen;

    return (
        <div className="mb-3" data-financials-discount-position="true">
            {summaryIsSeparate ? (
            <>
            <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Discounts</p>
                {/*
                 * MANAGE, beside POSITION — the same pairing Responsibility established, at the same
                 * size and with no fill, so an administration row does not become a command footer.
                 * The summary itself is not a button: reading a position should not require pressing
                 * anything.
                 */}
                <button
                    type="button"
                    ref={(el) => { gearRef.current = el; }}
                    onClick={() => setManageOpen(true)}
                    aria-label="Manage discounts"
                    title="Manage discounts — why a policy applies, and whether this family is excepted"
                    data-financials-manage-discounts="gear"
                    className="inline-flex h-[1.4rem] w-[1.4rem] shrink-0 items-center justify-center rounded text-alloy-midnight/45 transition hover:bg-alloy-stone/15 hover:text-alloy-bend-pine focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/40"
                >
                    <Settings2 aria-hidden size={13} strokeWidth={1.9} />
                </button>
            </div>
            {loading ? (
                <p className="text-[11px] text-alloy-midnight/45" data-financials-discount-loading="true">Reading discounts…</p>
            ) : error ? (
                <p className="text-[11px] text-alloy-ember" data-financials-discount-error="true">{error}</p>
            ) : policies.length === 0 ? (
                <p className="text-[11px] text-alloy-midnight/45" data-financials-discount-none="true">
                    No discount is expected on this family's current period.
                </p>
            ) : (
                <div className="mt-0.5 flex flex-col gap-1">
                    {policies.map((p) => (
                        <div key={p.policyId} data-financials-discount-policy={p.policyId}>
                            {/*
                              * THE NAME ONLY, AND ONLY HERE. The forecast's explanation always
                              * leads with the policy's own name, so rendering both printed the name
                              * twice — "discount · discount · 10% of $185.00" before D3 gave the
                              * policy its real name, "Sibling discount (QA specimen) · Sibling
                              * discount (QA specimen) · 10% of $185.00" after. And that basis was
                              * one child's, shown as if it were the policy's. The name stays at
                              * policy grain; the derivation sits on the line it belongs to.
                              */}
                            <p className="text-[11px] text-alloy-midnight/75">{p.label}</p>
                            {p.subjects.map((s) => (
                                <p
                                    key={s.opportunityCustomerMemberId}
                                    className="pl-3 text-[11px] text-alloy-midnight/55"
                                    data-financials-discount-subject={s.opportunityCustomerMemberId}
                                >
                                    {label(s)} · Expected {money(Math.abs(s.expectedCents), s.currencyCode)}
                                    {basisWithoutPolicyName(s.explanation, p.label) ? (
                                        <span className="text-alloy-midnight/40"> · {basisWithoutPolicyName(s.explanation, p.label)}</span>
                                    ) : null}
                                </p>
                            ))}
                        </div>
                    ))}
                    {liveExceptions.length > 0 ? (
                        <p className="text-[11px] text-alloy-ember" data-financials-discount-excluded="true">
                            {liveExceptions.length === 1 ? "One relationship is excepted" : `${liveExceptions.length} relationships are excepted`}
                        </p>
                    ) : null}
                </div>
            )}
            </>
            ) : null}

            {manageOpen ? (
                /*
                 * ESCAPE DISMISSES THE CARD, NOT THE ACCOUNT — the containment every Financials
                 * depth card carries, and the reason `escapeLayerOwnership` exists. Focus returns
                 * to the gear that opened it.
                 */
                <div
                    data-financials-manage-discounts="depth-card"
                    onKeyDown={(e) => {
                        if (e.key !== "Escape") return;
                        e.stopPropagation();
                        e.preventDefault();
                        closeManage();
                    }}
                >
                    <section
                        className="mb-3 mt-2 rounded-md border border-alloy-stone/15 bg-white/60 p-3"
                        data-financials-manage-discounts="open-panel"
                        tabIndex={-1}
                        ref={(el) => el?.focus({ preventScroll: true })}
                    >
                        {/*
                          * THE TITLE BELONGS TO WHICHEVER SURFACE IS THE OUTERMOST ONE. Hosted,
                          * the depth card's own header already says "Discounts"; repeating it
                          * here made the card look like it contained a second, smaller card.
                          */}
                        {hostedOpen ? null : (
                            <p className="text-sm font-semibold text-alloy-midnight">Manage discounts</p>
                        )}
                        {/*
                          * NO EXPLANATORY PARAGRAPH. It described the architecture — which policies
                          * reach a family, what is organization configuration — to an operator who
                          * came here to answer one question about one child. The rows below state
                          * the position and offer the action, which is the same information
                          * arranged so it can be acted on rather than read.
                          */}

                        {/*
                          * ── ONE ROW PER CHILD ──────────────────────────────────────────────
                          *
                          * The card's job is "manage the discounts each child receives", so the
                          * child is the unit and the policies are what a child has. It used to be
                          * the other way round, grouped by policy, which is how the forecast
                          * answers and not how an operator asks.
                          */}
                        {childRows.map((child) => (
                            <div
                                key={child.ocmId}
                                className="alloy-os-depthcard__unit"
                                data-financials-discount-child={child.ocmId}
                            >
                                {/*
                                  * IDENTITY LEADS THE UNIT. The child's name is what an operator
                                  * is looking for when they open this card, and it was set at the
                                  * same weight as the metadata under it.
                                  */}
                                <p className="alloy-os-depthcard__identity">
                                    {/*
                                      * THE CANONICAL AVATAR, at Financials density. Small enough to
                                      * be recognition rather than decoration, and the same component
                                      * every other Alloy surface uses — so a child looks like
                                      * themselves here, in Records and on the card.
                                      */}
                                    <IdentityAvatar
                                        name={child.label}
                                        imageUrl={child.imageUrl}
                                        size={22}
                                        allowZoom={false}
                                    />
                                    <span className="alloy-os-depthcard__identity-name">{child.label}</span>
                                </p>

                                {child.lines.length === 0 ? (
                                    /*
                                     * A CHILD WITH NOTHING IS THE POINT OF THIS CARD. They are who
                                     * an operator came to give a discount to, and one word plus a
                                     * door is the whole of what that state needs.
                                     */
                                    <p className="alloy-os-depthcard__value" data-financials-discount-none-for-child="true">
                                        No discount
                                    </p>
                                ) : (
                                    child.lines.map((line) => (
                                        <div key={line.policyId} className="mt-1 pl-2" data-financials-discount-line={line.policyId}>
                                            {/* THE STATE, at full strength — this is what the card is for. */}
                                            <p className="alloy-os-depthcard__value">
                                                <span>{line.policyLabel}</span>
                                                {line.rate ? (
                                                    <span data-financials-discount-rate={child.ocmId}>{" · "}{line.rate}</span>
                                                ) : null}
                                            </p>
                                            <p className="alloy-os-depthcard__label">
                                                Expected {money(Math.abs(line.expectedCents), line.currencyCode)}
                                                {/* WHY it is that, which is genuinely secondary. */}
                                                {line.why ? (
                                                    <span className="alloy-os-depthcard__hint"> · {line.why}</span>
                                                ) : null}
                                            </p>

                                            {line.exception ? (
                                                <div data-financials-discount-exception={line.exception.id}>
                                                    <p className="text-[11px] font-medium text-alloy-ember" data-financials-discount-waived="true">
                                                        Waived
                                                    </p>
                                                    {line.exception.reason ? (
                                                        <p className="text-[11px] text-alloy-midnight/55" data-financials-discount-waived-reason="true">
                                                            {line.exception.reason}
                                                        </p>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        data-end-policy-exception={line.exception.id}
                                                        data-financials-restore-discount={child.ocmId}
                                                        className="mt-0.5 text-[11px] font-medium text-alloy-bend-pine hover:underline disabled:opacity-50"
                                                        onClick={() => void runException("end", {
                                                            ocmId: child.ocmId,
                                                            exceptionId: line.exception!.id,
                                                            reason: "Ended from family discount administration",
                                                        })}
                                                    >
                                                        Restore discount <span aria-hidden>&rarr;</span>
                                                    </button>
                                                </div>
                                            ) : draft && draft.policyId === line.policyId && draft.ocmId === child.ocmId ? (
                                                <div className="mt-0.5" data-financials-discount-exception-draft="true">
                                                    <p className="text-[11px] font-medium text-alloy-midnight" data-financials-waive-heading="true">
                                                        Waive discount
                                                    </p>
                                                    <input
                                                        className="mt-0.5 block w-full rounded border border-alloy-stone/25 px-2 py-1 text-[11px]"
                                                        placeholder="Why is this discount being waived?"
                                                        value={draft.reason}
                                                        data-financials-discount-exception-reason="true"
                                                        onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                                                    />
                                                    <div className="mt-1 flex gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={busy || draft.reason.trim().length === 0}
                                                            data-financials-discount-exception-confirm="true"
                                                            className="rounded border border-alloy-bend-pine bg-alloy-bend-pine px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50"
                                                            onClick={() => void runException("create", {
                                                                ocmId: child.ocmId,
                                                                policyId: line.policyId,
                                                                reason: draft.reason.trim(),
                                                            })}
                                                        >
                                                            Confirm waiver
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="text-[11px] text-alloy-midnight/55 hover:underline"
                                                            onClick={() => setDraft(null)}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="alloy-os-depthcard__actionrow">
                                                    {/*
                                                      * REMOVE vs WAIVE, and the authority decides
                                                      * which is offered. An assignment an operator
                                                      * made can be removed; a discount the rules
                                                      * grant has no assignment to end, so the only
                                                      * honest act is to waive it — offering
                                                      * "Remove" there would be a control with
                                                      * nothing to remove.
                                                      */}
                                                    {line.assignmentId ? (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            data-financials-remove-discount={line.assignmentId}
                                                            className="alloy-os-depthcard__action--quiet"
                                                            onClick={() => void runAssignment("end", {
                                                                ocmId: child.ocmId,
                                                                assignmentId: line.assignmentId!,
                                                            })}
                                                        >
                                                            Remove discount <span aria-hidden>&rarr;</span>
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        data-add-policy-exception={line.policyId}
                                                        className="alloy-os-depthcard__action--quiet"
                                                        onClick={() => setDraft({ policyId: line.policyId, ocmId: child.ocmId, reason: "" })}
                                                    >
                                                        Waive discount <span aria-hidden>&rarr;</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}

                                {/*
                                  * ── ADD DISCOUNT ───────────────────────────────────────────
                                  *
                                  * The affirmative act, on the child it is about. The operator
                                  * chooses a CONFIGURED policy; they do not author one, and the
                                  * option states the rate the organisation set so the choice is
                                  * legible without being editable.
                                  */}
                                {addingFor?.ocmId === child.ocmId ? (
                                    <div className="mt-1 pl-2" data-financials-add-discount-draft="true">
                                        <p className="text-[11px] font-medium text-alloy-midnight">Add discount</p>
                                        <div className="mt-0.5">
                                            <AlloySelect
                                                testId="add-discount-policy"
                                                aria-label="Discount"
                                                value={chosenPolicyId}
                                                onChange={setChosenPolicyId}
                                                options={candidates
                                                    .filter((c) => !child.lines.some((l) => l.policyId === c.policyId))
                                                    .map((c) => ({
                                                        value: c.policyId,
                                                        label:
                                                            c.basis === "percentage" && c.basisValue != null
                                                                ? `${c.label} · ${c.basisValue}%`
                                                                : c.basis === "amount" && c.basisValue != null
                                                                  ? `${c.label} · ${money(c.basisValue, "USD")}`
                                                                  : c.label,
                                                    }))}
                                                placeholder="Choose a discount…"
                                                disabled={busy}
                                            />
                                        </div>
                                        <div className="mt-1 flex gap-2">
                                            <button
                                                type="button"
                                                disabled={busy || !chosenPolicyId}
                                                data-financials-add-discount-confirm="true"
                                                className="rounded border border-alloy-bend-pine bg-alloy-bend-pine px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50"
                                                onClick={() => void runAssignment("assign", {
                                                    ocmId: child.ocmId,
                                                    memberId: child.memberId ?? "",
                                                    policyId: chosenPolicyId,
                                                })}
                                            >
                                                Confirm
                                            </button>
                                            <button
                                                type="button"
                                                className="text-[11px] text-alloy-midnight/55 hover:underline"
                                                onClick={() => { setAddingFor(null); setChosenPolicyId(""); }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        data-financials-add-discount={child.ocmId}
                                        className="alloy-os-depthcard__action mt-1 inline-block"
                                        onClick={() => setAddingFor({ ocmId: child.ocmId, memberId: child.memberId ?? "", label: child.label })}
                                    >
                                        Add discount <span aria-hidden>&rarr;</span>
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* Why a relationship expects nothing — the canonical reason, never silence. */}
                        {(position?.notExpected ?? []).length > 0 ? (
                            <div className="mt-2 border-t border-alloy-stone/10 pt-2">
                                {(position?.notExpected ?? []).map((n, i) => (
                                    <p key={`${n.opportunityCustomerMemberId}-${i}`} className="text-[11px] text-alloy-midnight/55" data-financials-discount-not-expected={n.reason}>
                                        {childLabelFor?.(n.opportunityCustomerMemberId, null) ?? HOUSEHOLD_LABEL} · {reductionReasonLabel(n.reason)}
                                    </p>
                                ))}
                            </div>
                        ) : null}

                        {actionError ? (
                            <p className="mt-2 text-[11px] text-alloy-ember" data-financials-discount-action-error="true">{actionError}</p>
                        ) : null}


                        {/*
                          * ── AN ACTION THAT LOOKS LIKE ONE ─────────────────────────────────
                          *
                          * This was faint underlined body text at the foot of a card with no other
                          * way out visible, so a card whose content ran past the fold appeared to
                          * have no return path at all. Escape has always worked; a keyboard
                          * gesture is not an answer to "how do I get out of here".
                          *
                          * It sits in the card's own action row, which is what every other card in
                          * this family ends with.
                          */}
                        <div className="alloy-os-depthcard__actions" data-financials-card-actions="true">
                            <button
                                type="button"
                                className="alloy-os-depthcard__close"
                                data-financials-discount-close="true"
                                onClick={closeManage}
                            >
                                Close
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}
        </div>
    );
}
