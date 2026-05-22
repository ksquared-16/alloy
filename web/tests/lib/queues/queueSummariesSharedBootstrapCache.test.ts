import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => {
        throw new Error("supabase_should_not_be_called");
    },
}));
import {
    buildQueueSummariesSharedBootstrap,
    resetQueueSummariesSharedBootstrapCacheForTests,
    seedSharedQueueSummariesBootstrapCacheForTests,
    type QueueSummariesSharedBootstrap,
} from "@/lib/queues/QueueService";

const MOCK_BOOTSTRAP = {
    operationalDay: { dayBounds: null, calendar_meta: null },
    opportunityStatusDefs: [],
} as unknown as QueueSummariesSharedBootstrap;

describe("buildQueueSummariesSharedBootstrap cache", () => {
    beforeEach(() => {
        resetQueueSummariesSharedBootstrapCacheForTests();
    });

    it("returns cached value without refetch within TTL", async () => {
        seedSharedQueueSummariesBootstrapCacheForTests("org-1", MOCK_BOOTSTRAP);
        const a = await buildQueueSummariesSharedBootstrap("org-1");
        const b = await buildQueueSummariesSharedBootstrap("org-1");
        expect(a).toBe(MOCK_BOOTSTRAP);
        expect(b).toBe(MOCK_BOOTSTRAP);
    });

    it("refetches after TTL expires", async () => {
        seedSharedQueueSummariesBootstrapCacheForTests(
            "org-1",
            MOCK_BOOTSTRAP,
            Date.now() - 50_000
        );
        await expect(buildQueueSummariesSharedBootstrap("org-1")).rejects.toThrow();
    });
});
