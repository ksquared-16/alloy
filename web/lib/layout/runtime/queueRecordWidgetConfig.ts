/**
 * Normalize v3 widget block config using shared drawer widget contracts.
 */

import type { QueueRecordBlockConfig } from "@/lib/layout/queueRecordLayoutV3";
import {
    defaultActivityTimelineConfigForSurface,
    type LayoutEditorActivityTimelineConfig,
} from "@/lib/layout/layoutEditorActivityTimelineConfig";

type WidgetBlock = Extract<QueueRecordBlockConfig, { type: "widget" }>;

const QUEUE_ACTIVITY_TIMELINE_MAX_ITEMS = 3;

/** Queue rows always use compact feed; cap items for row density. */
export function queueRecordActivityTimelineConfig(
    block?: WidgetBlock["config"],
): LayoutEditorActivityTimelineConfig {
    const drawerDefaults = defaultActivityTimelineConfigForSurface("opportunity_drawer");
    const maxItemsRaw = block?.maxItems;
    const maxItems =
        typeof maxItemsRaw === "number" && maxItemsRaw >= 1 && maxItemsRaw <= 100 ?
            Math.round(maxItemsRaw)
        :   QUEUE_ACTIVITY_TIMELINE_MAX_ITEMS;

    return {
        ...drawerDefaults,
        displayMode: "compact_feed",
        maxItems,
        includeRelatedRecords: false,
        relatedRecordScopes: [],
        timelineDirection: "newest_first",
    };
}

export function normalizeQueueRecordWidgetBlockConfig(block: WidgetBlock): WidgetBlock {
    if (block.widgetKey === "activity_timeline") {
        const timeline = queueRecordActivityTimelineConfig(block.config);
        return {
            ...block,
            config: {
                ...(block.config ?? {}),
                displayMode: "compact",
                maxItems: timeline.maxItems,
            },
        };
    }
    return {
        ...block,
        config: {
            displayMode: "compact",
            ...(block.config ?? {}),
        },
    };
}
