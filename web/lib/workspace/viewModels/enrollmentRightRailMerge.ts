import type { ActionsVm, PrimaryActionVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

export const REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX = "registry_right_rail:";

export function registryRightRailActionId(key: string): string {
    return `${REGISTRY_RIGHT_RAIL_ACTION_ID_PREFIX}${key}`;
}

function resolvedToPrimaryVm(a: ResolvedActionForClient): PrimaryActionVm {
    const style = (a.display_style ?? "").toLowerCase();
    const variant: "primary" | "secondary" | undefined = style === "menu_item" ? "secondary" : "primary";
    return {
        id: registryRightRailActionId(a.key),
        label: a.label,
        variant,
    };
}

export function mergeEnrollmentRightRailActions(registry: ResolvedActionForClient[], base: ActionsVm): ActionsVm {
    if (!registry.length) return base;
    const fromRegistry = registry.map(resolvedToPrimaryVm);
    return {
        ...base,
    systemActions: [...fromRegistry],
    quickOperations: [],
    overflow: [],
    };
}
