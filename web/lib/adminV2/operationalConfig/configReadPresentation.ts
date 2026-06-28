/**
 * Pure presentation helpers for read-only operational/financial configuration
 * surfaces (Operational Configuration V1, Batch 0).
 *
 * These are display-only: they classify effective-dating status, describe scope
 * inheritance, and format money/ranges for the Configuration Runtime. No DB, no
 * IO, no writes. The authoritative resolver remains resolveConfigRule.ts.
 */

import { compareIsoDates } from "@/lib/childcareOperational/effectiveDating";
import type {
    ConfigRuleEffectiveColumns,
    ConfigRuleScopeColumns,
    ConfigRuleScopeType,
} from "@/lib/childcareOperational/config/configRuleTypes";

/**
 * Versioning status of a single effective-dated configuration row relative to a
 * reference date. Mirrors the supersede/change-later model: a row is Current,
 * Scheduled (future), or Historical (ended). Read-only in Batch 0.
 */
export type EffectiveStatus = "current" | "scheduled" | "historical";

export const EFFECTIVE_STATUS_LABEL: Record<EffectiveStatus, string> = {
    current: "Current",
    scheduled: "Scheduled",
    historical: "Historical",
};

/** Classify an effective-dated row relative to a reference date (YYYY-MM-DD). */
export function classifyEffectiveStatus(
    row: ConfigRuleEffectiveColumns,
    todayYmd: string,
): EffectiveStatus {
    if (compareIsoDates(row.effective_start, todayYmd) > 0) return "scheduled";
    if (row.effective_end != null && compareIsoDates(todayYmd, row.effective_end) > 0) {
        return "historical";
    }
    return "current";
}

/** Human label for a scope row, generic across verticals. */
export const SCOPE_LABEL: Record<ConfigRuleScopeType, string> = {
    org: "Org default",
    site: "Location override",
    program: "Program override",
    room: "Room override",
};

export function describeScope(row: ConfigRuleScopeColumns): string {
    return SCOPE_LABEL[row.scope_type] ?? row.scope_type;
}

/** True when this row overrides the org default (i.e. is more specific). */
export function isScopeOverride(row: ConfigRuleScopeColumns): boolean {
    return row.scope_type !== "org";
}

/** Format an effective range for display: "Aug 1, 2026 → ongoing" / "→ Jul 31". */
export function formatEffectiveRange(row: ConfigRuleEffectiveColumns): string {
    const start = formatYmd(row.effective_start);
    const end = row.effective_end ? formatYmd(row.effective_end) : "ongoing";
    return `${start} → ${end}`;
}

export function formatYmd(ymd: string | null | undefined): string {
    if (!ymd) return "—";
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Format integer cents as currency. Display-only; never used for math. */
export function formatCurrencyCents(cents: number, currencyCode = "USD"): string {
    const amount = (Number.isFinite(cents) ? cents : 0) / 100;
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount);
    } catch {
        return `${currencyCode} ${amount.toFixed(2)}`;
    }
}

/**
 * Sort effective-dated rows for display: Current first, then Scheduled (soonest
 * first), then Historical (most-recent first). Stable for equal keys.
 */
export function sortByEffectiveStatus<T extends ConfigRuleEffectiveColumns>(
    rows: readonly T[],
    todayYmd: string,
): T[] {
    const order: Record<EffectiveStatus, number> = { current: 0, scheduled: 1, historical: 2 };
    return rows
        .slice()
        .sort((a, b) => {
            const sa = classifyEffectiveStatus(a, todayYmd);
            const sb = classifyEffectiveStatus(b, todayYmd);
            if (order[sa] !== order[sb]) return order[sa] - order[sb];
            if (sa === "historical") return compareIsoDates(b.effective_start, a.effective_start);
            return compareIsoDates(a.effective_start, b.effective_start);
        });
}
