import { describe, expect, it } from "vitest";
import {
    buildDrawerLayoutRuntimeBodyCacheKey,
    clearDrawerLayoutRuntimeBodySessionCacheForTests,
    peekDrawerLayoutRuntimeBodyCacheEntry,
    putDrawerLayoutRuntimeBodyCacheEntry,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const minimalDoc: LayoutDoc = {
    formatVersion: 1,
    surface: "drawer",
    entityType: "opportunities",
    metadata: {},
    sections: [{ id: "main", key: "main", title: "Main", rows: [{ id: "row-1", columns: [{ id: "col-1", width: 12, items: [] }] }] }],
};

describe("drawerLayoutRuntimeBodySessionCache", () => {
    it("stores and retrieves layout body payloads by key", () => {
        clearDrawerLayoutRuntimeBodySessionCacheForTests();
        const key = buildDrawerLayoutRuntimeBodyCacheKey(
            "/api/admin/layout-runtime/opportunity-drawer-body",
            "opp-1",
            "{}",
        );
        putDrawerLayoutRuntimeBodyCacheEntry(key, {
            doc: minimalDoc,
            record: { id: "opp-1" },
            layoutSource: "test",
            layoutKey: "default",
            layoutRecordId: null,
            layoutVersion: 1,
        });
        const hit = peekDrawerLayoutRuntimeBodyCacheEntry(key);
        expect(hit?.record.id).toBe("opp-1");
        expect(hit?.layoutKey).toBe("default");
        clearDrawerLayoutRuntimeBodySessionCacheForTests();
    });
});
