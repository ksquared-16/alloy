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

export default function FinancialsCharges({
    queue,
    scopeLabel,
    siteSelected,
}: {
    queue: FinancialWorkQueueState;
    scopeLabel: string;
    /** True when a site is chosen — the bulk run does not obey it, and says so. */
    siteSelected: boolean;
}) {
    const [selected, setSelected] = useState<FinancialWorkRow | null>(null);
    const [posting, setPosting] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [cardNonce, setCardNonce] = useState(0);

    const rows = useMemo(() => queue.data?.rows ?? [], [queue.data]);

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
                await queue.refresh();
                // Re-mounting the card is how it re-reads; nothing here edits its numbers.
                setCardNonce((n) => n + 1);
            } catch (e) {
                setActionError(e instanceof Error ? e.message : "Posting failed.");
            } finally {
                setPosting(false);
            }
        },
        [queue],
    );

    return (
        <div className="flex min-h-0 flex-1 gap-3" data-testid="financials-charges-section">
            <WorkspaceSurface className="flex min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden">
                {/*
                 * BULK CHARGING SITS ABOVE THE QUEUE IT FILLS. One server-owned run, previewed and
                 * confirmed — never a client loop over Add Charge.
                 */}
                <FinancialsBulkCharge onCommitted={queue.refresh} siteSelected={siteSelected} />
                <div className="min-h-0 flex-1 overflow-y-auto" data-financials-work-queue="true">
                    {queue.loading && rows.length === 0 ? (
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
                                onClick={() => setSelected(row)}
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
                                    {selected.householdName ?? "Household"}
                                </p>
                                {/* SCOPE, SAID OUT LOUD. The queue is site-scoped; this is not. */}
                                <p className="text-xs text-alloy-midnight/60" data-financials-detail-scope="account_wide">
                                    Account-wide financial detail
                                </p>
                            </div>
                            <button
                                type="button"
                                className={WS_ACTION_PRIMARY}
                                disabled={posting}
                                onClick={() => void postCharge(selected)}
                                data-financials-post-charge={selected.chargeId}
                            >
                                {posting ? "Posting…" : `Post ${moneyExact(selected.amountCents, selected.currencyCode)}`}
                            </button>
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
                            <FinancialsChargeDetail key={selected.chargeId} chargeId={selected.chargeId} />
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
