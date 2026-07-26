import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
    provisioningAnswerUrl,
    prefetchWorkUnitProvisioning,
    prefetchWorkUnitProvisioningFromHref,
    consumeFreshProvisioning,
    seedProvisioning,
    seedProvisioningForRoute,
    clearProvisioningPrefetchForTests,
    PREFETCH_TTL_MS,
} from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

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

/**
 * SEED CONTRACT (Runtime V1 Realization). The server-composed answer is written into the SAME cache K2
 * consumes, under the SAME URL key K2 builds. These tests are the permanent regression protection for the
 * otherwise-SILENT failure mode: if the seed key ever diverges from K2's consume key, the seed misses and
 * the surface only gets slower — no crash, no error. Locking key parity here makes that drift a red test.
 */
describe("seedProvisioning (Runtime V1 Realization seed contract)", () => {
    beforeEach(() => clearProvisioningPrefetchForTests());
    afterEach(() => {
        delete (globalThis as any).window;
        vi.restoreAllMocks();
    });

    const answer = (terminal = "operational", tag = "x") =>
        ({ terminal, __tag: tag }) as unknown as ProvisioningAnswer;

    it("KEY PARITY: a seed at the bare-route key is consumed by the exact key K2 builds", async () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        // The layout seeds with provisioningAnswerUrl(RAW slug, null, null); K2 (bare AttentionRef) builds
        // the identical key. Same function, same args → same string → HIT.
        const seedKey = provisioningAnswerUrl("new-leads", null, null);
        const k2Key = provisioningAnswerUrl("new-leads"); // K2 for a bare ref: no lens, no subject
        expect(seedKey).toBe(k2Key);
        seedProvisioning(seedKey, answer("operational", "seeded"), 1000);
        const warm = consumeFreshProvisioning(k2Key, 1100);
        expect(warm).not.toBeNull();
        expect((await warm!) as any).toMatchObject({ terminal: "operational", __tag: "seeded" });
    });

    it("ROUTE SEAM (RA-1): seedProvisioningForRoute derives K2's exact key from the route identity", async () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        // The layer passes ONLY the route identity; the kernel derives the key. K2 (bare ref) consumes it.
        seedProvisioningForRoute({ target: "new-leads" }, answer("operational", "route-seeded"), 1000);
        const warm = consumeFreshProvisioning(provisioningAnswerUrl("new-leads"), 1100);
        expect(warm).not.toBeNull();
        expect((await warm!) as any).toMatchObject({ __tag: "route-seeded" });
        // lens/subject flow through to the same key K2 would build for a scoped ref.
        seedProvisioningForRoute({ target: "new-leads", lens: "v1", subject: "s1" }, answer("operational", "scoped"), 1000);
        expect(consumeFreshProvisioning(provisioningAnswerUrl("new-leads", "v1", "s1"), 1100)).not.toBeNull();
    });

    it("KEY MISMATCH: a bare seed is NOT consumed by a subject-scoped fetch (falls open, no wrong record)", () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioning(provisioningAnswerUrl("new-leads", null, null), answer(), 1000);
        // A ?subject_id deep link keys differently → the bare seed must NOT serve it.
        expect(consumeFreshProvisioning(provisioningAnswerUrl("new-leads", null, "subjX"), 1100)).toBeNull();
    });

    it("consume is one-shot: a seeded answer serves exactly once", async () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        const key = provisioningAnswerUrl("new-leads");
        seedProvisioning(key, answer(), 1000);
        expect(consumeFreshProvisioning(key, 1100)).not.toBeNull();
        expect(consumeFreshProvisioning(key, 1100)).toBeNull();
    });

    it("FALL-OPEN: a null answer or an `error` terminal seeds nothing (K2 does its live fetch)", () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        const key = provisioningAnswerUrl("new-leads");
        seedProvisioning(key, null, 1000);
        expect(consumeFreshProvisioning(key, 1100)).toBeNull();
        seedProvisioning(key, answer("error"), 1000);
        expect(consumeFreshProvisioning(key, 1100)).toBeNull();
    });

    it("IDEMPOTENT: a seed does not clobber a still-fresh intent-prefetch entry for the same URL", async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => answer("operational", "prefetched") }) as unknown as Response);
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        (globalThis as any).fetch = fetchMock as unknown as typeof fetch;
        prefetchWorkUnitProvisioning("new-leads", { now: 1000 }); // warm via hover
        seedProvisioning(provisioningAnswerUrl("new-leads"), answer("operational", "seeded"), 1000 + 1);
        const warm = consumeFreshProvisioning(provisioningAnswerUrl("new-leads"), 1100);
        expect((await warm!) as any).toMatchObject({ __tag: "prefetched" }); // the fresher prefetch wins
        delete (globalThis as any).fetch;
    });

    it("is a no-op on the server (no window) — the cache is browser-only", () => {
        delete (globalThis as any).window;
        expect(() => seedProvisioning(provisioningAnswerUrl("new-leads"), answer(), 1000)).not.toThrow();
    });
});
