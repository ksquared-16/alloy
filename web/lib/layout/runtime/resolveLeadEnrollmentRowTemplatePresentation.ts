/**
 * Lead enrollment child row template — runtime presentation from layoutEditorRowTemplate metadata.
 */

import type { LayoutItem } from "@/lib/layout/layoutV2";
import {
    readLayoutEditorRowTemplateConfig,
    type LayoutEditorRowAction,
    type LayoutEditorRowLayoutMode,
    type LayoutEditorRowTemplateConfig,
} from "@/lib/layout/layoutEditorRowTemplateConfig";

export type LeadEnrollmentRowTemplatePresentation = {
    config: LayoutEditorRowTemplateConfig;
    layoutMode: LayoutEditorRowLayoutMode;
    useCardList: boolean;
    useDetailedGrid: boolean;
    showAvatar: boolean;
    showStatusPill: boolean;
    showSecondaryMetadata: boolean;
    enabledActions: Set<LayoutEditorRowAction>;
    unsupportedActions: LayoutEditorRowAction[];
};

const RUNTIME_SUPPORTED_ROW_ACTIONS: LayoutEditorRowAction[] = ["open_child_drawer", "edit_enrollment"];

export function resolveLeadEnrollmentRowTemplatePresentation(item: LayoutItem): LeadEnrollmentRowTemplatePresentation {
    const config = readLayoutEditorRowTemplateConfig(item.metadata);
    const layoutMode = config.layoutMode ?? "standard";
    const requestedActions = config.actions ?? ["open_child_drawer"];
    const enabledActions = new Set<LayoutEditorRowAction>();
    const unsupportedActions: LayoutEditorRowAction[] = [];

    for (const action of requestedActions) {
        if (RUNTIME_SUPPORTED_ROW_ACTIONS.includes(action)) enabledActions.add(action);
        else unsupportedActions.push(action);
    }
    if (enabledActions.size === 0) enabledActions.add("open_child_drawer");

    return {
        config,
        layoutMode,
        useCardList: layoutMode === "compact" || layoutMode === "standard",
        useDetailedGrid: layoutMode === "detailed",
        showAvatar: config.display?.avatar !== false,
        showStatusPill: config.display?.statusPill !== false,
        showSecondaryMetadata: config.display?.secondaryMetadata !== false,
        enabledActions,
        unsupportedActions,
    };
}

export function shouldApplyLeadEnrollmentRowTemplatePresentation(
    item: LayoutItem,
    options: { honorLayoutDocBlocks?: boolean; opportunityEntityLayoutsVisualConfig?: boolean },
): boolean {
    if (item.kind !== "related_list" || item.refKey !== "children") return false;
    if (options.honorLayoutDocBlocks || options.opportunityEntityLayoutsVisualConfig) return true;
    return Boolean(item.metadata?.layoutEditorRowTemplate);
}
