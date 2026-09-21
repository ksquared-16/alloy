"use client";

import { useCallback, useEffect, useState } from "react";
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
type FamilyPosition = {
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

export default function FinancialsDiscountPanel({
    customerId,
    childLabelFor,
    onCommitted,
}: {
    customerId: string;
    /** Names the relationship in the operator's words. The panel never invents a label. */
    childLabelFor?: (opportunityCustomerMemberId: string, customerMemberId: string | null) => string | null;
    /** Re-read committed truth. This panel reports no success of its own. */
    onCommitted: () => Promise<void> | void;
}) {
    const [position, setPosition] = useState<FamilyPosition | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [manageOpen, setManageOpen] = useState(false);
    const [nonce, setNonce] = useState(0);
    const gearRef = useState<{ current: HTMLButtonElement | null }>({ current: null })[0];

    /* Draft state for one governed exception. Nothing is written until Confirm. */
    const [draft, setDraft] = useState<{ policyId: string; ocmId: string; reason: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
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
        gearRef.current?.focus();
    }, [gearRef]);

    /**
     * One governed exception, through the certified action. The panel supplies a RELATIONSHIP, a
     * POLICY and a REASON — never an amount, never a rate, never a boolean. What the exception
     * does to the money is the policy engine's business.
     */
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

    return (
        <div className="mb-3" data-financials-discount-position="true">
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
                              * THE NAME ONLY. The forecast's explanation already leads with the
                              * policy kind, so rendering both produced "discount · discount · 10%
                              * of $185.00" — and that basis was one child's, shown as if it were
                              * the policy's. The derivation now sits on the line it belongs to.
                              */}
                            <p className="text-[11px] text-alloy-midnight/75">{p.label}</p>
                            {p.subjects.map((s) => (
                                <p
                                    key={s.opportunityCustomerMemberId}
                                    className="pl-3 text-[11px] text-alloy-midnight/55"
                                    data-financials-discount-subject={s.opportunityCustomerMemberId}
                                >
                                    {label(s)} · Expected {money(Math.abs(s.expectedCents), s.currencyCode)}
                                    {s.explanation ? (
                                        <span className="text-alloy-midnight/40"> · {s.explanation}</span>
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
                        <p className="text-sm font-semibold text-alloy-midnight">Manage discounts</p>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/55">
                            {/* The law this intent obeys, said where the operator is about to act on it. */}
                            Which policies reach this family, and whether a relationship is excepted from one.
                            Rates and eligibility are organization configuration.
                        </p>

                        {policies.length === 0 ? (
                            <p className="mt-2 text-[11px] text-alloy-midnight/45">
                                No discount policy is expected to apply to this family's current period.
                            </p>
                        ) : (
                            policies.map((p) => (
                                <div key={p.policyId} className="mt-2 border-t border-alloy-stone/10 pt-2" data-financials-discount-manage-policy={p.policyId}>
                                    <p className="text-[12px] font-medium text-alloy-midnight">{p.label}</p>
                                    {p.subjects.map((s) => {
                                        const excepted = (position?.exceptions ?? []).find(
                                            (e) => e.policyId === p.policyId
                                                && e.opportunityCustomerMemberId === s.opportunityCustomerMemberId
                                                && e.isLiveNow,
                                        );
                                        return (
                                            <div key={s.opportunityCustomerMemberId} className="mt-1 pl-2">
                                                <p className="text-[11px] text-alloy-midnight/70">
                                                    {label(s)} · Expected {money(Math.abs(s.expectedCents), s.currencyCode)}
                                                    {s.explanation ? (
                                                        <span className="text-alloy-midnight/45"> · {s.explanation}</span>
                                                    ) : null}
                                                </p>
                                                {excepted ? (
                                                    <p className="text-[11px] text-alloy-ember" data-financials-discount-exception={excepted.id}>
                                                        {reductionReasonLabel("excluded_by_exception")}
                                                        {excepted.reason ? ` — ${excepted.reason}` : ""}
                                                        {excepted.effectiveStart ? ` · from ${excepted.effectiveStart}` : ""}
                                                        {" "}
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            data-end-policy-exception={excepted.id}
                                                            className="font-medium text-alloy-bend-pine hover:underline disabled:opacity-50"
                                                            onClick={() => void runException("end", {
                                                                ocmId: excepted.opportunityCustomerMemberId,
                                                                exceptionId: excepted.id,
                                                                reason: "Ended from family discount administration",
                                                            })}
                                                        >
                                                            End exception
                                                        </button>
                                                    </p>
                                                ) : draft && draft.policyId === p.policyId && draft.ocmId === s.opportunityCustomerMemberId ? (
                                                    <div className="mt-0.5" data-financials-discount-exception-draft="true">
                                                        {/* A REASON IS REQUIRED. An exception carries provenance or it is not one. */}
                                                        <input
                                                            className="block w-full rounded border border-alloy-stone/25 px-2 py-1 text-[11px]"
                                                            placeholder="Why is this relationship excepted?"
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
                                                                    ocmId: s.opportunityCustomerMemberId,
                                                                    policyId: p.policyId,
                                                                    reason: draft.reason.trim(),
                                                                })}
                                                            >
                                                                Confirm exception
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
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        data-add-policy-exception={p.policyId}
                                                        className="text-[11px] font-medium text-alloy-bend-pine hover:underline disabled:opacity-50"
                                                        onClick={() => setDraft({ policyId: p.policyId, ocmId: s.opportunityCustomerMemberId, reason: "" })}
                                                    >
                                                        Add exception
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))
                        )}

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

                        <button
                            type="button"
                            className="mt-2 text-[11px] font-medium text-alloy-midnight/55 hover:underline"
                            onClick={closeManage}
                        >
                            Close
                        </button>
                    </section>
                </div>
            ) : null}
        </div>
    );
}
