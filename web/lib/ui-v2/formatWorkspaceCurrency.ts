/**
 * Workspace UI convention: USD with thousands grouping, e.g. $1,234.
 * Used for KPI copy, pipeline cards, and queue row value labels (presentation only).
 */
const USD_GROUPED = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

export function formatWorkspaceUsdGrouped(n: number): string {
    return USD_GROUPED.format(Math.round(n));
}
