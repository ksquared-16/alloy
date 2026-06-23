/**
 * Experience Builder — Add card dialog surface options.
 */

import {
    EXPERIENCE_BUILDER_PEER_BLOCK_TYPES,
    type ExperienceBuilderPeerBlockType,
} from "@/lib/layout/layoutBuilderCardAuthoring";
import { layoutBuilderWidgetOptionsForSurface } from "@/lib/layout/layoutBuilderPaletteModel";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";

export type LayoutBuilderAddCardTypeOption = {
    type: ExperienceBuilderPeerBlockType;
    enabled: boolean;
    disabledReason?: string;
};

export function layoutBuilderAddCardTypeOptionsForSurface(
    surfaceKey: DrawerLayoutEditorSurfaceKey = "opportunity_drawer",
): LayoutBuilderAddCardTypeOption[] {
    const widgetCount = layoutBuilderWidgetOptionsForSurface(surfaceKey).length;

    return EXPERIENCE_BUILDER_PEER_BLOCK_TYPES.map((type) => {
        if (type === "widget" && widgetCount === 0) {
            return {
                type,
                enabled: false,
                disabledReason: "No KPI widgets are available for this drawer surface.",
            };
        }
        return { type, enabled: true };
    });
}

export function firstEnabledLayoutBuilderAddCardType(
    surfaceKey: DrawerLayoutEditorSurfaceKey = "opportunity_drawer",
): ExperienceBuilderPeerBlockType {
    const options = layoutBuilderAddCardTypeOptionsForSurface(surfaceKey);
    return options.find((option) => option.enabled)?.type ?? "fields";
}
