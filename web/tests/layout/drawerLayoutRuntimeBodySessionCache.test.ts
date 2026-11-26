import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    buildDrawerLayoutRuntimeBodyCacheKey,
    clearDrawerLayoutRuntimeBodySessionCacheForTests,
    drawerLayoutRuntimeBodyInflightCountForTests,
    fetchDrawerLayoutRuntimeBodyDeduped,
    peekDrawerLayoutRuntimeBodyCacheEntry,
    prefetchDrawerLayoutRuntimeBody,
    putDrawerLayoutRuntimeBodyCacheEntry,
    serializeDrawerLayoutRuntimeBodyQueryParams,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const webRoot = join(process.cwd());
const OPP_BODY_PATH = "/api/admin/layout-runtime/opportunity-drawer-body";

const minimalDoc: LayoutDoc = {
    formatVersion: 1,
    surface: "drawer",
    entityType: "opportunities",
    metadata: {},
    sections: [
        {
            id: "main",
            key: "main",
            title: "Main",
            rows: [{ id: "row-1", columns: [{ id: "col-1", width: 12, items: [] }] }],
        },
    ],
};

const workspaceQueryParams = {
    departmentId: "dept-1",
    workUnitId: "wu-1",
};

describe("drawerLayoutRuntimeBodySessionCache", () => {
    beforeEach(() => {
        clearDrawerLayoutRuntimeBodySessionCacheForTests();
    });

    it("stores and retrieves layout body payloads by key", () => {
        const key = buildDrawerLayoutRuntimeBodyCacheKey(OPP_BODY_PATH, "opp-1", "{}");
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
    });

    it("scoped opportunity body keys differ when workspace query params differ", () => {
        const emptyKey = buildDrawerLayoutRuntimeBodyCacheKey(
            OPP_BODY_PATH,
            "opp-1",
            serializeDrawerLayoutRuntimeBodyQueryParams({}),
        );
        const scopedKey = buildDrawerLayoutRuntimeBodyCacheKey(
            OPP_BODY_PATH,
            "opp-1",
            serializeDrawerLayoutRuntimeBodyQueryParams(workspaceQueryParams),
        );
        expect(emptyKey).not.toBe(scopedKey);
    });

    describe("in-flight dedup", () => {
        const originalFetch = globalThis.fetch;

        afterEach(() => {
            globalThis.fetch = originalFetch;
            clearDrawerLayoutRuntimeBodySessionCacheForTests();
        });

        it("issues a single network request per body cache key when prewarm and fetch race", async () => {
            let fetchCount = 0;
            globalThis.fetch = vi.fn(async () => {
                fetchCount += 1;
                await new Promise((r) => setTimeout(r, 10));
                return {
                    ok: true,
                    json: async () => ({
                        doc: minimalDoc,
                        record: { id: "opp-1" },
                        layoutSource: "test",
                        layoutKey: "default",
                        layoutRecordId: null,
                        layoutVersion: 1,
                    }),
                } as Response;
            });

            const params = {
                apiPath: OPP_BODY_PATH,
                entityId: "opp-1",
                queryParams: workspaceQueryParams,
            };

            prefetchDrawerLayoutRuntimeBody(params);
            const [a, b] = await Promise.all([
                fetchDrawerLayoutRuntimeBodyDeduped(params),
                fetchDrawerLayoutRuntimeBodyDeduped(params),
            ]);

            expect(fetchCount).toBe(1);
            expect(drawerLayoutRuntimeBodyInflightCountForTests()).toBe(0);
            expect(a?.record.id).toBe("opp-1");
            expect(b?.record.id).toBe("opp-1");
            const cacheKey = buildDrawerLayoutRuntimeBodyCacheKey(
                OPP_BODY_PATH,
                "opp-1",
                serializeDrawerLayoutRuntimeBodyQueryParams(workspaceQueryParams),
            );
            expect(peekDrawerLayoutRuntimeBodyCacheEntry(cacheKey)?.record.id).toBe("opp-1");
        });
    });
});
