export type PermissionGridLevel = "none" | "read" | "write";

export type PermissionGridRow = {
    id: string;
    label: string;
    /** permission_keys that represent "Read" for this area */
    readKeys: string[];
    /** permission_keys that represent "Write/Manage" for this area (Write implies Read in UI) */
    writeKeys: string[];
};

export const PERMISSION_GRID_ROWS: readonly PermissionGridRow[] = [
    { id: "opportunities", label: "Opportunities / Inquiries", readKeys: ["crm.opportunities.read"], writeKeys: ["crm.opportunities.write"] },
    { id: "customers", label: "Customers / Families", readKeys: ["crm.customers.read"], writeKeys: ["crm.customers.write"] },
    { id: "communications", label: "Communications", readKeys: ["communications.read"], writeKeys: ["communications.send"] },
    { id: "scheduling", label: "Scheduling", readKeys: ["scheduling.read"], writeKeys: ["scheduling.write"] },
    { id: "billing", label: "Billing / Payments", readKeys: ["billing.read"], writeKeys: ["billing.write"] },
    { id: "documents", label: "Documents", readKeys: ["documents.read"], writeKeys: ["documents.write"] },
    { id: "reports", label: "Reports / Analytics", readKeys: ["reports.read"], writeKeys: ["reports.write"] },
    { id: "settings", label: "Configuration", readKeys: ["settings.read"], writeKeys: ["settings.manage"] },
    // Users & Roles is also enforced by server gate on `settings.users_roles` (write/manage).
    { id: "users_roles", label: "Users & Roles", readKeys: ["settings.users_roles.read"], writeKeys: ["settings.users_roles"] },
    { id: "workflows", label: "Workflows / Automation", readKeys: ["workflows.read"], writeKeys: ["workflows.write"] },
] as const;

export function keysForLevel(row: PermissionGridRow, level: PermissionGridLevel): string[] {
    if (level === "none") return [];
    if (level === "read") return [...row.readKeys];
    return [...new Set([...row.readKeys, ...row.writeKeys])];
}

export function levelFromGrantedKeys(row: PermissionGridRow, granted: Set<string>): PermissionGridLevel {
    const hasWrite = row.writeKeys.some((k) => granted.has(k));
    if (hasWrite) return "write";
    const hasRead = row.readKeys.some((k) => granted.has(k));
    if (hasRead) return "read";
    return "none";
}

/**
 * Apply one row's selection to a full set of grants.
 * Only touches keys defined by that row (unknown / out-of-grid keys are preserved).
 */
export function applyGridRowSelection(params: {
    row: PermissionGridRow;
    level: PermissionGridLevel;
    granted: Set<string>;
}): Set<string> {
    const { row, level, granted } = params;
    const next = new Set(granted);
    for (const k of [...row.readKeys, ...row.writeKeys]) next.delete(k);
    for (const k of keysForLevel(row, level)) next.add(k);
    return next;
}

