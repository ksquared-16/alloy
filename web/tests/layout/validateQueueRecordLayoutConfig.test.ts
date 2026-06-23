import { describe, expect, it } from "vitest";

import {
    allowedQueueRecordWidgetKeys,
    isAllowedQueueRecordWidgetKey,
    QUEUE_RECORD_PIPELINE_WIDGET_KEYS,
} from "@/lib/layout/queueRecordLayoutAllowList";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import { createWidgetBlock } from "@/lib/layout/queueRecordLayoutV3";
import { validateQueueRecordLayoutConfig } from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
import { normalizeQueueRecordLayoutConfig } from "@/lib/layout/runtime/normalizeQueueRecordLayoutConfig";

describe("validateQueueRecordLayoutConfig", () => {
    it("accepts default lead layout widgets", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const result = validateQueueRecordLayoutConfig(config, { isWaitlist: false });
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it("rejects disallowed widget keys", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const col = config.columns[3]!;
        const next = {
            ...config,
            columns: config.columns.map((c) =>
                c.id === col.id ?
                    { ...c, blocks: [...c.blocks, createWidgetBlock("follow_ups", "Follow-ups")] }
                :   c,
            ),
        };
        const result = validateQueueRecordLayoutConfig(next, { isWaitlist: false });
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.path.includes("widgetKey") && e.message.includes("follow_ups"))).toBe(true);
    });

    it("rejects child field on main_record scope", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const col = config.columns[0]!;
        const block = col.blocks[0];
        if (!block || block.type === "widget") throw new Error("expected field group");
        const next = {
            ...config,
            columns: config.columns.map((c) =>
                c.id === col.id ?
                    {
                        ...c,
                        blocks: c.blocks.map((b) =>
                            b.id === block.id && b.type !== "widget" ?
                                {
                                    ...b,
                                    fields: [
                                        ...b.fields,
                                        {
                                            id: "bad-child-field",
                                            fieldKey: "child.name",
                                            display: "text" as const,
                                        },
                                    ],
                                }
                            :   b,
                        ),
                    }
                :   c,
            ),
        };
        const result = validateQueueRecordLayoutConfig(next, { isWaitlist: false });
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.message.includes("child.name"))).toBe(true);
    });

    it("accepts activity_timeline widget block", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const col = config.columns[3]!;
        const next = {
            ...config,
            columns: config.columns.map((c) =>
                c.id === col.id ?
                    {
                        ...c,
                        blocks: [...c.blocks, createWidgetBlock("activity_timeline", "Activity", { displayMode: "compact" })],
                    }
                :   c,
            ),
        };
        const normalized = normalizeQueueRecordLayoutConfig(next);
        const result = validateQueueRecordLayoutConfig(normalized, { isWaitlist: false });
        expect(result.ok).toBe(true);
        const widget = normalized.columns
            .flatMap((c) => c.blocks)
            .find((b) => b.type === "widget" && b.widgetKey === "activity_timeline");
        expect(widget?.type).toBe("widget");
        if (widget?.type === "widget") {
            expect(widget.config?.displayMode).toBe("compact");
            expect(widget.config?.maxItems).toBe(3);
        }
    });
});

describe("queue record widget allow-list", () => {
    it("matches picker invariant for pipeline and waitlist", () => {
        expect(allowedQueueRecordWidgetKeys(false)).toEqual([...QUEUE_RECORD_PIPELINE_WIDGET_KEYS]);
        expect(isAllowedQueueRecordWidgetKey("activity_timeline", false)).toBe(true);
        expect(isAllowedQueueRecordWidgetKey("current_work", false)).toBe(true);
        expect(isAllowedQueueRecordWidgetKey("tasks", true)).toBe(true);
    });
});
