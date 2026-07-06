import { describe, expect, it, vi, beforeEach } from "vitest";

describe("bustLifecycleSiblingFetchDedupe", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("clears TTL cache entries for queue and summary sibling fetches", async () => {
        const {
            dedupeAdminFetchWithTtl,
            bustLifecycleSiblingFetchDedupe,
            resetWorkspaceAdminFetchDedupeForTests,
        } = await import("@/lib/workspace/workspaceAdminFetchDedupe");

        resetWorkspaceAdminFetchDedupeForTests();
        const summaryUrl =
            "/api/admin/departments/dept-1/work-unit-queue-summaries?count_mode=exact";
        const queueUrl = "/api/admin/queues/wu-1/lifecycle_lead?limit=1";

        globalThis.fetch = vi.fn(async () =>
            new Response(JSON.stringify({ ok: true }), { status: 200 }),
        ) as typeof fetch;

        await dedupeAdminFetchWithTtl(summaryUrl, {}, 30_000);
        await dedupeAdminFetchWithTtl(queueUrl, {}, 30_000);

        bustLifecycleSiblingFetchDedupe();

        await dedupeAdminFetchWithTtl(summaryUrl, {}, 30_000);
        await dedupeAdminFetchWithTtl(queueUrl, {}, 30_000);
        expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    });
});
