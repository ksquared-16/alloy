"use client";

/**
 * SUBSIDY — expected funding, what a submitted claim is holding, and where an agency paid
 * something else.
 *
 * ── FOUR NUMBERS, KEPT APART ON PURPOSE ──
 *
 *   Expected subsidy   what an arrangement says an agency should fund. Never money.
 *   With an agency     what a SUBMITTED claim is currently suppressing from family collection.
 *   Received           agency money that actually arrived and was applied, told apart by payer.
 *   Variance           claimed minus paid, on variances nobody has decided about. Signed.
 *
 * Collapsing these into one "subsidy balance" is the mistake this layout exists to prevent.
 * Expected is not money. Suppression is not a payment. A shortfall is not a family's bill. Each
 * one is a different fact with a different owner, and an operator asked to act on a single
 * merged figure could not tell which of the four had moved.
 *
 * ── AND SUBSIDY IS NOT A DISCOUNT ──
 *
 * A discount reduces what is owed; subsidy changes who pays it. Nothing here reduces a charge,
 * and the family's outstanding is unchanged by every figure on this surface — what a submitted
 * claim changes is whether the family is asked for it YET.
 *
 * Every figure comes from `computeCollectiblePosition` on the server. Claims themselves are
 * authored where they are owned: Studio → Funding.
 */

import { useMemo, useState } from "react";

import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import FinancialsAccountDetail from "@/app/adminV2/financials/FinancialsAccountDetail";
import { moneyExact, signedMoney } from "@/app/adminV2/financials/financialsFormat";
import type { FinancialsReadState } from "@/app/adminV2/financials/useFinancialsReads";
import type { FinancialPositionCohort, FinancialPositionRow } from "@/lib/financials/workspace/resolveFinancialPosition";

/** Why this charge is on the subsidy surface at all — stated per row, never inferred by the reader. */
function subsidyReason(row: FinancialPositionRow): string | null {
    const p = row.position;
    if (p.unresolvedVarianceCents !== 0) return "variance";
    if (p.submittedClaimSuppressionCents > 0) return "claimed";
    if (p.expectedSubsidyCents > 0) return "expected";
    return null;
}

const REASON_LABEL: Record<string, string> = {
    variance: "Agency paid something else",
    claimed: "With an agency",
    expected: "Expected funding",
};

export default function FinancialsSubsidy({
    position,
    scopeLabel,
}: {
    position: FinancialsReadState<FinancialPositionCohort>;
    scopeLabel: string;
}) {
    const [selected, setSelected] = useState<FinancialPositionRow | null>(null);

    const rows = useMemo(() => {
        const all = position.data?.rows ?? [];
        return all
            .filter((r) => subsidyReason(r) !== null)
            /* Variance first: it is the only one of the three that is stuck. */
            .sort((a, b) => {
                const rank = (r: FinancialPositionRow) => (r.position.unresolvedVarianceCents !== 0 ? 0 : 1);
                return rank(a) - rank(b) || b.position.expectedSubsidyCents - a.position.expectedSubsidyCents;
            });
    }, [position.data]);

    const totals = position.data?.totals;
    const currency = position.data?.rows[0]?.position.currencyCode ?? "USD";

    return (
        <div className="flex min-h-0 flex-1 gap-3" data-testid="financials-subsidy-section">
            <WorkspaceSurface className="flex min-h-0 w-[26rem] shrink-0 flex-col overflow-hidden">
                {totals ? (
                    <div
                        className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1 border-b border-alloy-stone/10 px-3 py-2 text-xs"
                        data-financials-subsidy-totals="true"
                    >
                        {/* Four figures, four rows. Never one. */}
                        <span className="text-alloy-midnight/55">Expected subsidy</span>
                        <span className="text-right tabular-nums text-alloy-midnight" data-financials-subsidy-expected="true">
                            {moneyExact(totals.expectedSubsidyCents, currency)}
                        </span>
                        <span className="text-alloy-midnight/55">With an agency</span>
                        <span className="text-right tabular-nums text-alloy-midnight" data-financials-subsidy-suppression="true">
                            {moneyExact(totals.submittedClaimSuppressionCents, currency)}
                        </span>
                        <span className="text-alloy-midnight/55">Received</span>
                        <span className="text-right tabular-nums text-alloy-midnight" data-financials-subsidy-received="true">
                            {moneyExact(totals.actualSubsidyReceivedCents, currency)}
                        </span>
                        <span className="text-alloy-midnight/55">Unresolved variance</span>
                        <span className="text-right tabular-nums text-alloy-midnight" data-financials-subsidy-variance="true">
                            {signedMoney(totals.unresolvedVarianceCents, currency)}
                        </span>
                    </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-y-auto" data-financials-subsidy-list="true">
                    {position.loading && rows.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-alloy-midnight/50">Loading subsidy positions…</p>
                    ) : position.error ? (
                        <p className="px-3 py-4 text-xs text-alloy-ember" data-financials-subsidy-error="true">
                            {position.error}
                        </p>
                    ) : rows.length === 0 ? (
                        <WorkspaceEmptyState
                            title="No subsidy position"
                            body={`No expected funding, submitted claim or open variance for ${scopeLabel.toLowerCase()}.`}
                        />
                    ) : (
                        rows.map((row) => {
                            const reason = subsidyReason(row) as string;
                            return (
                                <button
                                    key={row.position.chargeId}
                                    type="button"
                                    onClick={() => setSelected(row)}
                                    data-financials-subsidy-row={row.position.chargeId}
                                    data-financials-subsidy-reason={reason}
                                    aria-current={selected?.position.chargeId === row.position.chargeId ? "true" : undefined}
                                    className={`block w-full border-b border-alloy-stone/10 px-3 py-2 text-left transition hover:bg-alloy-stone/5 ${
                                        selected?.position.chargeId === row.position.chargeId ? "bg-alloy-bend-pine/5" : ""
                                    }`}
                                >
                                    <span className="flex items-baseline justify-between gap-2">
                                        <span className="truncate text-sm text-alloy-midnight">
                                            {row.householdName ?? "Household"} · {REASON_LABEL[reason]}
                                        </span>
                                        <span className="shrink-0 text-sm tabular-nums text-alloy-midnight">
                                            {reason === "variance"
                                                ? signedMoney(row.position.unresolvedVarianceCents, row.position.currencyCode)
                                                : reason === "claimed"
                                                  ? moneyExact(row.position.submittedClaimSuppressionCents, row.position.currencyCode)
                                                  : moneyExact(row.position.expectedSubsidyCents, row.position.currencyCode)}
                                        </span>
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs text-alloy-midnight/60">
                                        {/*
                                         * Outstanding is stated on every subsidy row. It is the number that did
                                         * NOT change, and saying so is how "subsidy is not a discount" stops
                                         * being a doctrine sentence and becomes something visible.
                                         */}
                                        {moneyExact(row.position.outstandingCents, row.position.currencyCode)} still owed
                                        {row.periodKey ? ` · ${row.periodKey}` : ""}
                                        {row.position.explanation.suppressionBoundBy !== "none"
                                            ? ` · bounded by ${row.position.explanation.suppressionBoundBy}`
                                            : ""}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            </WorkspaceSurface>

            <WorkspaceSurface className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {!selected ? (
                    <WorkspaceEmptyState
                        title="Select a subsidy position"
                        body="Choose a charge to see the household's canonical financial detail. Claims and remittances are authored in Studio → Funding."
                    />
                ) : !selected.customerId ? (
                    <WorkspaceEmptyState
                        title="This charge names no household"
                        body="There is no account-level detail to show for it."
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col" data-financials-subsidy-detail={selected.position.chargeId}>
                        <div className="border-b border-alloy-stone/10 px-3 py-2">
                            <p className="text-xs text-alloy-midnight/60" data-financials-detail-scope="account_wide">
                                Account-wide financial detail
                            </p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-3">
                            <FinancialsAccountDetail
                                key={selected.customerId}
                                customerId={selected.customerId}
                                customerMemberId={null}
                                participationId={null}
                                displayName={null}
                            />
                        </div>
                    </div>
                )}
            </WorkspaceSurface>
        </div>
    );
}
