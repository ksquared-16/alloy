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

/** Compact row inner shell — ~35% tighter than legacy admin spacing. */
export const CONFIG_WORKSPACE_ROW_INNER_CLASS = "flex items-center gap-1.5 px-2.5 py-1";

export type ConfigurationUnavailableHint = {
    label: string;
    title?: string;
};

/**
 * Collapsed-row availability: silence when all surfaces are available.
 * Surfaces only the first unavailable reason for operator scanability.
 */
export function configurationFieldUnavailableHint(
    rows: ReadonlyArray<{ status: "available" | "unavailable"; reason: string }>,
): ConfigurationUnavailableHint | null {
    const unavailable = rows.filter((r) => r.status === "unavailable");
    if (unavailable.length === 0) return null;
    const first = unavailable[0]!;
    const extra = unavailable.length > 1 ? ` (+${unavailable.length - 1} more)` : "";
    return {
        label: first.reason,
        title: unavailable.map((r) => r.reason).join(" · "),
    };
}

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
