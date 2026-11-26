/**
 * Why a charge is on the Subsidy surface at all — stated per row, never inferred by the reader.
 *
 * Lifted unchanged from the Financials Subsidy section (BP V2 S5) so the section and the Billing
 * "Funding variances" Work View apply ONE rule: an open (unresolved) variance that is not zero.
 */
import type { FinancialPositionRow } from "@/lib/financials/workspace/resolveFinancialPosition";

export type FinancialSubsidyReason = "variance" | "claimed" | "expected";

export function financialSubsidyReason(row: Pick<FinancialPositionRow, "position">): FinancialSubsidyReason | null {
    const p = row.position;
    if (p.unresolvedVarianceCents !== 0) return "variance";
    if (p.submittedClaimSuppressionCents > 0) return "claimed";
    if (p.expectedSubsidyCents > 0) return "expected";
    return null;
}
