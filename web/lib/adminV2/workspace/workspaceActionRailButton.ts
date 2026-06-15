/** Canonical workspace command-rail action button classes — department + work-unit surfaces share these. */

export const WORKSPACE_ACTION_RAIL_PRIMARY_CLASS = "adminv2-ws-actions-rail-primary";
export const WORKSPACE_ACTION_RAIL_SECONDARY_CLASS = "adminv2-ws-actions-rail-secondary";
export const WORKSPACE_ACTION_RAIL_LIST_COLUMN_CLASS =
    "adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column";

export type WorkspaceActionRailTier = "primary" | "secondary";

export type WorkspaceActionRailVariantInput = {
    variant?: "primary" | "secondary";
};

export function workspaceActionRailButtonClass(
    tier: WorkspaceActionRailTier,
    extraClassName?: string
): string {
    const base =
        tier === "primary" ? WORKSPACE_ACTION_RAIL_PRIMARY_CLASS : WORKSPACE_ACTION_RAIL_SECONDARY_CLASS;
    return extraClassName ? `${base} ${extraClassName}`.trim() : base;
}

/** Primary tier: at most `maxSolid` solid primaries; remainder outlined. Secondary always outlined. */
export function resolveWorkspaceActionRailTier(
    action: WorkspaceActionRailVariantInput,
    solidUsed: { n: number },
    maxSolid: number
): WorkspaceActionRailTier {
    if (action.variant === "secondary") return "secondary";
    const wantsSolid = action.variant === "primary" || action.variant === undefined;
    if (wantsSolid && solidUsed.n < maxSolid) {
        solidUsed.n += 1;
        return "primary";
    }
    return "secondary";
}

export function resolveWorkspaceActionRailTierClasses(
    actions: WorkspaceActionRailVariantInput[],
    maxSolid = 2
): WorkspaceActionRailTier[] {
    const solidUsed = { n: 0 };
    return actions.map((action) => resolveWorkspaceActionRailTier(action, solidUsed, maxSolid));
}
