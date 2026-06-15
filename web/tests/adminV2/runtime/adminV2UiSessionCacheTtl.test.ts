import { describe, expect, it } from "vitest";

import {
    ADMINV2_QUEUE_ROW_CLIENT_CACHE_TTL_MS,
    ADMINV2_UI_SESSION_CACHE_TTL_MS,
} from "@/lib/adminV2/runtime/adminV2UiSessionCacheTtl";
import { QUEUE_ROW_CLIENT_CACHE_TTL_MS } from "@/lib/workspace/queueRowClientCache";

describe("adminV2UiSessionCacheTtl", () => {
    it("UI session caches support at least 10-minute warm return", () => {
        expect(ADMINV2_UI_SESSION_CACHE_TTL_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
        expect(ADMINV2_QUEUE_ROW_CLIENT_CACHE_TTL_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
        expect(QUEUE_ROW_CLIENT_CACHE_TTL_MS).toBe(ADMINV2_QUEUE_ROW_CLIENT_CACHE_TTL_MS);
    });
});
