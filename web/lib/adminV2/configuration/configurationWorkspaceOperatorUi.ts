/**
 * Reusable Configuration Workspace interaction + visual grammar.
 * Consumed by Data Model and future Platform Configuration workspaces.
 */

export const CONFIGURATION_WORKSPACE_ICON_STROKE = 1.75;

/** Collapsed row + expanded editor shell classes (Surface Builder rhythm). */
export const CONFIG_WORKSPACE_ROW_CLASS =
    "group border-b border-alloy-forge/10 last:border-b-0 transition-colors hover:bg-alloy-bend-pine/[0.04] hover:shadow-[inset_3px_0_0_#00a283]";

export const CONFIG_WORKSPACE_ROW_EXPANDED_CLASS = "bg-alloy-bend-pine/[0.03] shadow-[inset_3px_0_0_#00a283]";

export const CONFIG_WORKSPACE_GHOST_ACTION_CLASS =
    "config-ghost-btn shrink-0 px-1.5 py-0.5 text-[11px] font-medium text-alloy-bend-pine opacity-0 transition-opacity group-hover:opacity-100 hover:underline";

export function configurationOwnershipChipClass(ownership: "platform" | "custom" | "computed"): string {
    const base = "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium";
    switch (ownership) {
        case "platform":
            return `${base} border-alloy-forge/12 bg-alloy-stone/[0.35] text-alloy-midnight/50`;
        case "custom":
            return `${base} border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.06] text-alloy-bend-pine`;
        case "computed":
            return `${base} border-violet-200/50 bg-violet-500/[0.05] text-violet-700/80`;
    }
}

export function slugifyConfigurationKey(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 64);
}
