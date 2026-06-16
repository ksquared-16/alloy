import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dedupeAdminFetchWithTtl } = vi.hoisted(() => ({
    dedupeAdminFetchWithTtl: vi.fn(),
}));

vi.mock("@/lib/workspace/workspaceAdminFetchDedupe", () => ({
    dedupeAdminFetchWithTtl,
}));

import {
    fetchCommunicationsBindingsCached,
    resetCommunicationsBindingsCacheForTests,
} from "@/lib/communications/communicationsBindingsCache";

describe("communicationsBindingsCache", () => {
    beforeEach(() => {
        resetCommunicationsBindingsCacheForTests();
        dedupeAdminFetchWithTtl.mockReset();
        dedupeAdminFetchWithTtl.mockResolvedValue(
            new Response(JSON.stringify({ channels_available: ["email", "sms"] }), { status: 200 })
        );
    });

    afterEach(() => {
        resetCommunicationsBindingsCacheForTests();
    });

    it("dedupes concurrent callers", async () => {
        const [a, b] = await Promise.all([
            fetchCommunicationsBindingsCached(),
            fetchCommunicationsBindingsCached(),
        ]);
        expect(dedupeAdminFetchWithTtl).toHaveBeenCalledTimes(1);
        expect(a.json).toEqual(b.json);
    });

    it("serves cached bindings on subsequent read within TTL", async () => {
        await fetchCommunicationsBindingsCached();
        const hit = await fetchCommunicationsBindingsCached();
        expect(hit.ok).toBe(true);
        expect(hit.json.channels_available).toEqual(["email", "sms"]);
    });
});
