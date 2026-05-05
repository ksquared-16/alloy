/**
 * Collapse `permission_definitions.group_key` into a small set of Settings UI buckets.
 */

export const PERMISSION_UI_AREA_ORDER = [
    "Settings/Admin",
    "CRM",
    "Communications",
    "Billing/Financials",
    "Scheduling",
    "Other",
] as const;

export type PermissionUiArea = (typeof PERMISSION_UI_AREA_ORDER)[number];

export function permissionUiArea(groupKey: string): PermissionUiArea {
    const g = (groupKey || "").toLowerCase();
    if (g === "settings" || g.includes("admin")) return "Settings/Admin";
    if (g === "crm" || g.startsWith("customer") || g.includes("opportun") || g.includes("contact")) return "CRM";
    if (g.includes("comm")) return "Communications";
    if (g.includes("bill") || g.includes("financ") || g.includes("payment") || g.includes("ledger") || g.includes("invoice"))
        return "Billing/Financials";
    if (g.includes("schedul")) return "Scheduling";
    return "Other";
}
