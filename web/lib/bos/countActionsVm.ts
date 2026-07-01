import type { ActionsVm } from "@/lib/ui-v2/workspace-types";

type ActionsSurface = "department" | "company" | "work_unit" | "record";

/** Count visible actions for collapsible rail header (mirrors ActionsBlock structured layout). */
export function countActionsVm(model: ActionsVm, surface: ActionsSurface): number {
    const sysFull = model.systemActions ?? [];
    const uncappedRail = surface === "department" || surface === "work_unit";
    const primaryBand = uncappedRail ? sysFull : sysFull.slice(0, 2);
    const demotedSystemActions = uncappedRail ? [] : sysFull.slice(2);
    const quick = model.quickOperations;
    const smart = model.smartSuggestions;
    const recSec = model.recordSecondaryActions?.length ?? 0;
    const recTer = model.recordTertiaryActions?.length ?? 0;
    const useRecordQuickTiers = surface === "record" && (recSec > 0 || recTer > 0);
    const moreItems = [
        ...(useRecordQuickTiers ? model.recordTertiaryActions ?? [] : []),
        ...(model.overflow ?? []),
    ];
    const baseSecondary = useRecordQuickTiers ? model.recordSecondaryActions ?? [] : quick ?? [];
    const operationalActions = [...demotedSystemActions, ...baseSecondary];
    const structuredN =
        primaryBand.length + operationalActions.length + (smart?.length ?? 0) + moreItems.length;

    if (structuredN > 0) return structuredN;

    return model.primaries.length + (model.overflow?.length ?? 0);
}
