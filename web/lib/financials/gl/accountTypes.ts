/**
 * Operator-facing Account Types for the chart of accounts.
 * GL Codes belong to Account Types; commercial objects reference GL Codes.
 *
 * Note: DB check on gl_accounts.type currently allows asset|liability|equity|revenue|expense.
 * Contra Revenue is product intent — deferred until a migration expands the check.
 */

import { GL_ACCOUNT_TYPES, type GlAccountType } from "@/lib/financials/gl/glConfigTypes";

export const ACCOUNT_TYPE_ORDER: GlAccountType[] = [
    "revenue",
    "expense",
    "asset",
    "liability",
    "equity",
];

export const ACCOUNT_TYPE_LABELS: Record<GlAccountType, string> = {
    revenue: "Revenue",
    expense: "Expense",
    asset: "Asset",
    liability: "Liability",
    equity: "Equity",
};

export function accountTypeLabel(type: string | null | undefined): string {
    const key = String(type ?? "").trim().toLowerCase() as GlAccountType;
    if ((GL_ACCOUNT_TYPES as readonly string[]).includes(key)) {
        return ACCOUNT_TYPE_LABELS[key];
    }
    if (!type?.trim()) return "Uncategorized";
    // Title-case unknown / future types (e.g. contra_revenue after migration).
    return type
        .trim()
        .split(/[_\s]+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}

export function sortAccountTypes(types: string[]): string[] {
    const orderIndex = new Map(ACCOUNT_TYPE_ORDER.map((t, i) => [t, i]));
    return [...types].sort((a, b) => {
        const ai = orderIndex.get(a as GlAccountType) ?? 100;
        const bi = orderIndex.get(b as GlAccountType) ?? 100;
        if (ai !== bi) return ai - bi;
        return a.localeCompare(b);
    });
}
