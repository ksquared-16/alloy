import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
    provisioningAnswerUrl,
    prefetchWorkUnitProvisioning,
    prefetchWorkUnitProvisioningFromHref,
    consumeFreshProvisioning,
    clearProvisioningPrefetchForTests,
    PREFETCH_TTL_MS,
} from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";

/** Minimal window + fetch stubs so the module's `typeof window` guard passes. */
function stubEnv(fetchImpl: typeof fetch) {
    (globalThis as any).window = { location: { origin: "https://alloy.local" } };
    (globalThis as any).fetch = fetchImpl as any;
}

const okAnswer = (terminal = "operational") =>
    ({ ok: true, json: async () => ({ terminal }) }) as unknown as Response;

describe("workUnitProvisioningPrefetch", () => {
    beforeEach(() => clearProvisioningPrefetchForTests());
    afterEach(() => {
        delete (globalThis as any).window;
        delete (globalThis as any).fetch;
        vi.restoreAllMocks();
    });

    it("builds the exact K2 URL (no query when unscoped; work_view_id/subject_id when scoped)", () => {
        expect(provisioningAnswerUrl("new-leads")).toBe("/api/admin/work-units/new-leads/provisioning-answer");
        expect(provisioningAnswerUrl("new-leads", "v1")).toBe("/api/admin/work-units/new-leads/provisioning-answer?work_view_id=v1");
        expect(provisioningAnswerUrl("new-leads", "v1", "s1")).toBe("/api/admin/work-units/new-leads/provisioning-answer?work_view_id=v1&subject_id=s1");
    });

    it("prefetch warms an answer that a fresh consume returns (blank-time removal path)", async () => {
        const fetchMock = vi.fn(async () => okAnswer());
        stubEnv(fetchMock as unknown as typeof fetch);
        prefetchWorkUnitProvisioning("new-leads", { now: 1000 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const warm = consumeFreshProvisioning(provisioningAnswerUrl("new-leads"), 1100);
        expect(warm).not.toBeNull();
        expect((await warm!).terminal).toBe("operational");
    });

    it("dedups: a second prefetch within TTL does not refetch", () => {
        const fetchMock = vi.fn(async () => okAnswer());
        stubEnv(fetchMock as unknown as typeof fetch);
        prefetchWorkUnitProvisioning("new-leads", { now: 1000 });
        prefetchWorkUnitProvisioning("new-leads", { now: 1000 + PREFETCH_TTL_MS - 1 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("re-warms after the TTL lapses", () => {
        const fetchMock = vi.fn(async () => okAnswer());
        stubEnv(fetchMock as unknown as typeof fetch);
        prefetchWorkUnitProvisioning("new-leads", { now: 1000 });
        prefetchWorkUnitProvisioning("new-leads", { now: 1000 + PREFETCH_TTL_MS + 1 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("consume is one-shot (a second consume misses) and stale entries never serve", () => {
        const fetchMock = vi.fn(async () => okAnswer());
        stubEnv(fetchMock as unknown as typeof fetch);
        prefetchWorkUnitProvisioning("new-leads", { now: 1000 });
        const url = provisioningAnswerUrl("new-leads");
        expect(consumeFreshProvisioning(url, 1100)).not.toBeNull();
        expect(consumeFreshProvisioning(url, 1100)).toBeNull(); // consumed
        // stale
        prefetchWorkUnitProvisioning("new-leads", { now: 2000 });
        expect(consumeFreshProvisioning(url, 2000 + PREFETCH_TTL_MS + 1)).toBeNull();
    });

    it("a failed prefetch is not cached — consume returns null so K2 fetches fresh", async () => {
        const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response);
        stubEnv(fetchMock as unknown as typeof fetch);
        prefetchWorkUnitProvisioning("new-leads", { now: 1000 });
        await new Promise((r) => setTimeout(r, 10)); // let fetch→then→catch settle + delete the entry
        expect(consumeFreshProvisioning(provisioningAnswerUrl("new-leads"), 1100)).toBeNull();
    });

    it("href helper derives target + Work-View lens exactly like the K1 gesture", () => {
        const fetchMock = vi.fn(async () => okAnswer());
        stubEnv(fetchMock as unknown as typeof fetch);
        prefetchWorkUnitProvisioningFromHref("/workspace/work-unit/new-leads?work_view_id=all_leads");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/work-units/new-leads/provisioning-answer?work_view_id=all_leads",
            expect.anything(),
        );
        // default tile (no lens) → unscoped URL
        clearProvisioningPrefetchForTests();
        prefetchWorkUnitProvisioningFromHref("/workspace/work-unit/new-leads");
        expect(fetchMock).toHaveBeenLastCalledWith(
            "/api/admin/work-units/new-leads/provisioning-answer",
            expect.anything(),
        );
    });
});
