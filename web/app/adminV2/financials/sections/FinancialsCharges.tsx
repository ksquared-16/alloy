"use client";

/**
 * CHARGES — the draft charges waiting to be posted, and the operator's path to acting on them.
 *
 * Selecting a row opens the EXISTING Thread 2 account detail. This file renders no financial
 * figure of its own beyond the amount already written on the charge, and computes none at all.
 *
 * ── WHERE EVERY NUMBER COMES FROM ──
 *
 *   queue rows + counts   the workspace projection (selection only, no arithmetic)
 *   row amount            `charges.amount_cents`, as stored
 *   everything else       Thread 2's card, after selection, from its own owners
 *
 * ── SCOPE IS LABELLED, NOT ASSUMED ──
 *
 * The queue is site-scoped when a site is selected. The account detail is NOT: Thread 2 answers
 * for a household across every site, and silently presenting an account-wide balance under a site
 * heading would be the workspace lying about somebody else's number. The detail zone says
 * "Account-wide" for exactly that reason.
 */

import { useCallback, useMemo, useState } from "react";

import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import FinancialsAccountDetail from "@/app/adminV2/financials/FinancialsAccountDetail";
import FinancialsChargeDetail from "@/app/adminV2/financials/FinancialsChargeDetail";
import FinancialsBulkCharge from "@/app/adminV2/financials/sections/FinancialsBulkCharge";
import { moneyExact } from "@/app/adminV2/financials/financialsFormat";
import type { FinancialWorkQueueState } from "@/app/adminV2/financials/useFinancialWorkQueue";
import type { FinancialWorkRow } from "@/lib/financials/workspace/resolveFinancialWorkQueue";
import type { FinancialPositionCohort, FinancialPositionRow } from "@/lib/financials/workspace/resolveFinancialPosition";
import type { FinancialsReadState } from "@/app/adminV2/financials/useFinancialsReads";

/*
 * WORK AND RECORD ARE DIFFERENT QUESTIONS, and they get different lists.
 *
 * "What needs posting?" is operational work: a queue of drafts an operator is expected to act on.
 * "What has been billed?" is the record: posted obligations, including ones from months already
 * closed. Folding the second into the first would turn a work queue into a pretend ledger, and an
 * operator would lose the ability to ask either question cleanly.
 *
 * So there are two views over two canonical reads — the work queue and the position cohort — and
 * exactly one detail surface beneath them. Selection supplies a charge id and nothing else;
 * `FinancialsChargeDetail` re-resolves every figure by that id, so where a charge was discovered
 * can never change what it is worth.
 */
type ChargesView = "awaiting" | "posted";

/** What a selection hands to the detail below it: identity, never money. */
type SelectedCharge = {
    chargeId: string;
    customerId: string | null;
    customerMemberId: string | null;
    childName: string | null;
    label: string;
    /** Present only for drafts, where the Post control states the amount it is about to owe. */
    draft: FinancialWorkRow | null;
};

function fromWorkRow(row: FinancialWorkRow): SelectedCharge {
    return {
        chargeId: row.chargeId,
        customerId: row.customerId,
        customerMemberId: row.customerMemberId,
        childName: row.childName,
        label: row.categoryLabel,
        draft: row,
    };
}

function fromPositionRow(row: FinancialPositionRow): SelectedCharge {
    return {
        chargeId: row.position.chargeId,
        customerId: row.customerId,
        customerMemberId: row.customerMemberId,
        childName: null,
        label: row.householdName ?? "Charge",
        draft: null,
    };
}

export default function FinancialsCharges({
    queue,
    position,
    scopeLabel,
    siteSelected,
}: {
    queue: FinancialWorkQueueState;
    /** The posted cohort — the same read Accounts and Subsidy use, never a second projection. */
    position: FinancialsReadState<FinancialPositionCohort>;
    scopeLabel: string;
    /** True when a site is chosen — the bulk run does not obey it, and says so. */
    siteSelected: boolean;
}) {
    const [view, setView] = useState<ChargesView>("awaiting");
    const [selected, setSelected] = useState<SelectedCharge | null>(null);
    const [posting, setPosting] = useState(false);
    const [reversing, setReversing] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [cardNonce, setCardNonce] = useState(0);
    const [detailNonce, setDetailNonce] = useState(0);

    const rows = useMemo(() => queue.data?.rows ?? [], [queue.data]);
    /* Newest obligations first: the record is read backwards from now. */
    const postedRows = useMemo(() => {
        const all = position.data?.rows ?? [];
        return [...all].sort((a, b) => (b.serviceDate ?? "").localeCompare(a.serviceDate ?? ""));
    }, [position.data]);

    /*
     * POSTING GOES THROUGH THE REGISTERED ACTION, from the operator's own session.
     *
     * `charge.post` already owns eligibility, authorization, idempotency and audit. A page-local
     * write here would be a second posting path with none of those, and it would drift from the one
     * Thread 1 certifies. After it commits, committed truth is re-read — the queue and the card both
     * — rather than the row being removed optimistically.
     */
    const postCharge = useCallback(
        async (row: FinancialWorkRow) => {
            setPosting(true);
            setActionError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: "charge.post",
                        entity_type: "child",
                        entity_id: row.customerMemberId ?? row.customerId ?? "",
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload: { charge_id: row.chargeId, charge_label: row.categoryLabel },
                    }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: unknown };
                if (!res.ok || json.ok === false) {
                    const message =
                        typeof json.error === "string"
                            ? json.error
                            : ((json.error as { message?: string } | undefined)?.message ?? "Posting was refused.");
                    setActionError(message);
                    return;
                }
                /*
                 * BOTH LISTS RE-READ. A posted charge leaves the work queue and joins the record,
                 * and an operator who just posted it must be able to find it there rather than
                 * losing it for having acted.
                 */
                await Promise.all([queue.refresh(), position.refresh()]);
                setDetailNonce((n) => n + 1);
                setCardNonce((n) => n + 1);
            } catch (e) {
                setActionError(e instanceof Error ? e.message : "Posting failed.");
            } finally {
                setPosting(false);
            }
        },
        [position, queue],
    );

    /*
     * REVERSING GOES THROUGH THE REGISTERED ACTION TOO, for the same reasons posting does.
     *
     * `charge.reverse` owns eligibility, `fin.adjust`, idempotency and audit. Nothing here decides
     * whether a charge may be reversed — the command does, and a refusal is shown as it came back
     * rather than pre-empted by hiding the control. A hidden button is not authorization; the
     * server answering 403 is.
     */
    const reverseCharge = useCallback(
        async (charge: SelectedCharge) => {
            setReversing(true);
            setActionError(null);
            try {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: "charge.reverse",
                        entity_type: "child",
                        entity_id: charge.customerMemberId ?? charge.customerId ?? "",
                        mode: "execute",
                        confirmation: { confirmed: true },
                        payload: { charge_id: charge.chargeId, charge_label: charge.label },
                    }),
                });
                const json = (await res.json()) as { ok?: boolean; error?: unknown };
                if (!res.ok || json.ok === false) {
                    const message =
                        typeof json.error === "string"
                            ? json.error
                            : ((json.error as { message?: string } | undefined)?.message ?? "Reversing was refused.");
                    setActionError(message);
                    return;
                }
                await Promise.all([queue.refresh(), position.refresh()]);
                // Both projections re-read; neither is edited in place.
                setDetailNonce((n) => n + 1);
                setCardNonce((n) => n + 1);
            } catch (e) {
                setActionError(e instanceof Error ? e.message : "Reversing failed.");
            } finally {
                setReversing(false);
            }
        },
        [position, queue],
    );

    return (
        <div className="flex min-h-0 flex-1 gap-3" data-testid="financials-charges-section">
            <WorkspaceSurface className="flex min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden">
                {/*
                 * BULK CHARGING SITS ABOVE THE QUEUE IT FILLS. One server-owned run, previewed and
                 * confirmed — never a client loop over Add Charge.
                 */}
                <FinancialsBulkCharge onCommitted={queue.refresh} siteSelected={siteSelected} />
                {/* WORK, OR RECORD. Two questions, stated as two views over two canonical reads. */}
                <div className="flex shrink-0 gap-1 border-b border-alloy-stone/10 px-3 py-2" role="tablist">
                    {([
                        { key: "awaiting" as const, label: "Awaiting posting", count: rows.length },
                        { key: "posted" as const, label: "Posted", count: postedRows.length },
                    ]).map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            role="tab"
                            aria-selected={view === tab.key}
                            data-financials-charges-view={tab.key}
                            data-active={view === tab.key ? "true" : undefined}
                            onClick={() => {
                                setView(tab.key);
                                setSelected(null);
                                setActionError(null);
                            }}
                            className={`rounded-full px-2.5 py-1 text-xs transition ${
                                view === tab.key
                                    ? "bg-alloy-bend-pine/10 font-medium text-alloy-midnight"
                                    : "text-alloy-midnight/60 hover:bg-alloy-stone/5"
                            }`}
                        >
                            {tab.label}
                            <span className="ml-1 tabular-nums text-alloy-midnight/45">{tab.count}</span>
                        </button>
                    ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto" data-financials-work-queue="true">
                    {view === "posted" ? (
                        position.loading && postedRows.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-alloy-midnight/50">Loading posted charges…</p>
                        ) : position.error ? (
                            <p className="px-3 py-4 text-xs text-alloy-ember" data-financials-posted-error="true">
                                {position.error}
                            </p>
                        ) : postedRows.length === 0 ? (
                            <WorkspaceEmptyState
                                title="Nothing billed yet"
                                body={`No posted charges for ${scopeLabel.toLowerCase()}.`}
                            />
                        ) : (
                            postedRows.map((row) => (
                                <button
                                    key={row.position.chargeId}
                                    type="button"
                                    onClick={() => setSelected(fromPositionRow(row))}
                                    data-financials-posted-row={row.position.chargeId}
                                    aria-current={selected?.chargeId === row.position.chargeId ? "true" : undefined}
                                    className={`block w-full border-b border-alloy-stone/10 px-3 py-2 text-left transition hover:bg-alloy-stone/5 ${
                                        selected?.chargeId === row.position.chargeId ? "bg-alloy-bend-pine/5" : ""
                                    }`}
                                >
                                    <span className="flex items-baseline justify-between gap-2">
                                        <span className="truncate text-sm text-alloy-midnight">
                                            {row.householdName ?? "Household"}
                                        </span>
                                        <span className="shrink-0 text-sm tabular-nums text-alloy-midnight">
                                            {moneyExact(
                                                row.position.explanation.netCents,
                                                row.position.currencyCode,
                                            )}
                                        </span>
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs text-alloy-midnight/60">
                                        {/* The charge's own date, not the operating month. */}
                                        {row.serviceDate ?? "No service date"}
                                        {row.customerMemberId ? " · child" : " · account-wide"}
                                        {row.position.outstandingCents > 0
                                            ? ` · ${moneyExact(row.position.outstandingCents, row.position.currencyCode)} outstanding`
                                            : " · settled"}
                                    </span>
                                </button>
                            ))
                        )
                    ) : queue.loading && rows.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-alloy-midnight/50">Loading financial work…</p>
                    ) : queue.error ? (
                        <p className="px-3 py-4 text-xs text-alloy-ember" data-financials-queue-error="true">
                            {queue.error}
                        </p>
                    ) : rows.length === 0 ? (
                        <WorkspaceEmptyState
                            title="Nothing waiting to post"
                            body={`No draft charges for ${scopeLabel.toLowerCase()}.`}
                        />
                    ) : (
                        rows.map((row) => (
                            <button
                                key={row.chargeId}
                                type="button"
                                onClick={() => setSelected(fromWorkRow(row))}
                                data-financials-queue-row={row.chargeId}
                                data-financials-queue-row-site={row.siteLocationId ?? "org"}
                                aria-current={selected?.chargeId === row.chargeId ? "true" : undefined}
                                className={`block w-full border-b border-alloy-stone/10 px-3 py-2 text-left transition hover:bg-alloy-stone/5 ${
                                    selected?.chargeId === row.chargeId ? "bg-alloy-bend-pine/5" : ""
                                }`}
                            >
                                <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-sm text-alloy-midnight">
                                        {row.householdName ?? "Household"}
                                    </span>
                                    <span className="shrink-0 text-sm tabular-nums text-alloy-midnight">
                                        {moneyExact(row.amountCents, row.currencyCode)}
                                    </span>
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-alloy-midnight/60">
                                    {row.categoryLabel}
                                    {row.childName ? ` · ${row.childName}` : ""}
                                    {row.periodKey ? ` · ${row.periodKey}` : ""}
                                    {" · "}
                                    {/* Location is stated per row, including when it belongs to no site. */}
                                    {row.locationScope === "site" ? (row.siteName ?? "Site") : "Account-wide"}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </WorkspaceSurface>

            <WorkspaceSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {!selected ? (
                    <WorkspaceEmptyState
                        title="Select financial work"
                        body="Choose a draft charge to see the household's canonical financial detail."
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col" data-financials-detail={selected.chargeId}>
                        <div className="flex items-center justify-between gap-3 border-b border-alloy-stone/10 px-3 py-2">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-alloy-midnight">
                                    {selected.label}
                                </p>
                                {/* SCOPE, SAID OUT LOUD. The queue is site-scoped; this is not. */}
                                <p className="text-xs text-alloy-midnight/60" data-financials-detail-scope="account_wide">
                                    Account-wide financial detail
                                </p>
                            </div>
                            {/*
                             * THE ACTION THE CHARGE'S OWN STATE ALLOWS. A draft is posted; a posted
                             * charge is reversed. Neither control decides whether it may run — the
                             * registered command does, and its refusal is shown rather than
                             * pre-empted by hiding the button.
                             */}
                            {selected.draft ? (
                                <button
                                    type="button"
                                    className={WS_ACTION_PRIMARY}
                                    disabled={posting}
                                    onClick={() => void postCharge(selected.draft!)}
                                    data-financials-post-charge={selected.chargeId}
                                >
                                    {posting
                                        ? "Posting…"
                                        : `Post ${moneyExact(selected.draft.amountCents, selected.draft.currencyCode)}`}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className={WS_ACTION_PRIMARY}
                                    disabled={reversing}
                                    onClick={() => void reverseCharge(selected)}
                                    data-financials-reverse-charge={selected.chargeId}
                                >
                                    {reversing ? "Reversing…" : "Reverse charge"}
                                </button>
                            )}
                        </div>
                        {actionError ? (
                            <p className="px-3 py-2 text-xs text-alloy-ember" data-financials-action-error="true">
                                {actionError}
                            </p>
                        ) : null}
                        <div className="min-h-0 flex-1 overflow-y-auto p-3">
                            {/*
                             * THE OBLIGATION FIRST, THEN THE ACCOUNT IT BELONGS TO.
                             *
                             * The pane has always shown how the household is doing. It never said
                             * what the selected charge actually was, so an operator could read an
                             * amount and a family name and still not know what the money was for,
                             * who owed it, or what had been applied. This resolves the charge by id
                             * through its own canonical read — the queue row supplies identity and
                             * nothing else, because a row is a preview and not authority.
                             */}
                            <FinancialsChargeDetail key={`${selected.chargeId}-${detailNonce}`} chargeId={selected.chargeId} />
                            {/* THREAD 2, UNFORKED. Its own read model, its own numbers. */}
                            <FinancialsAccountDetail
                                key={`${selected.customerId ?? selected.customerMemberId}-${cardNonce}`}
                                customerId={selected.customerId ?? null}
                                customerMemberId={selected.customerMemberId ?? null}
                                participationId={null}
                                displayName={selected.childName}
                            />
                        </div>
                    </div>
                )}
            </WorkspaceSurface>
        </div>
    );
}
