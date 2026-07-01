import { describe, expect, it } from "vitest";

import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import {
    parseQueueRecordLayoutConfig,
    resolveQueueRecordLayoutConfig,
} from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";

describe("resolveQueueRecordLayoutConfig", () => {
    it("reads saved queue_record_layout from layout doc metadata", () => {
        const doc = buildLeadQueueDefaultDoc();
        const custom = defaultLeadQueueLayoutV3();
        custom.columns[1]!.label = "Children";
        const withMeta = {
            ...doc,
            metadata: {
                ...(doc.metadata ?? {}),
                queue_record_layout: custom,
            },
        };
        const resolved = resolveQueueRecordLayoutConfig(withMeta);
        expect(resolved.columns[1]?.label).toBe("Children");
        expect(resolved.version).toBe(3);
    });

    it("falls back to lead default when metadata is missing or invalid", () => {
        const doc = buildLeadQueueDefaultDoc();
        const stripped = { ...doc, metadata: { ...(doc.metadata ?? {}) } };
        delete (stripped.metadata as Record<string, unknown>).queue_record_layout;
        const resolved = resolveQueueRecordLayoutConfig(stripped);
        expect(resolved.variant).toBe("operational-row");
        expect(resolved.version).toBe(3);
        expect(resolved.columns.length).toBeGreaterThan(0);
        expect(parseQueueRecordLayoutConfig({ variant: "operational-row", columns: [] })).toBeNull();
    });
});
