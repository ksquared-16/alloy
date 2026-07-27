import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
    provisioningAnswerUrl,
    prefetchWorkUnitProvisioning,
    prefetchWorkUnitProvisioningFromHref,
    consumeFreshProvisioning,
    seedProvisioningForRoute,
    fetchProvisioningEntryDeduped,
    clearProvisioningPrefetchForTests,
    clearInflightProvisioningEntriesForTests,
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
 * SEED CONTRACT (Runtime V1 Realization + RA-3). The server-composed answer is written into the SAME
 * cache K2 consumes, under the SAME URL key K2 builds. These tests are the permanent regression
 * protection for the otherwise-SILENT failure mode: if the seed key ever diverges from K2's consume key,
 * the seed misses and the surface only gets slower — no crash, no error. Every seed goes through the SOLE
 * public seam `seedProvisioningForRoute(routeIdentity)` — the kernel derives the key (`provisioningAnswerUrl`);
 * no layer can hand-build (and drift) it. Locking parity here makes any drift a red test.
 */
describe("seed contract — seedProvisioningForRoute (the sole public seed seam)", () => {
    beforeEach(() => clearProvisioningPrefetchForTests());
    afterEach(() => {
        delete (globalThis as any).window;
        vi.restoreAllMocks();
    });

    const answer = (terminal = "operational", tag = "x") =>
        ({ terminal, __tag: tag }) as unknown as ProvisioningAnswer;

    it("ROUTE SEAM (RA-1): the kernel derives K2's exact key from the route identity", async () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        // The layer passes ONLY the route identity; the kernel derives the key. K2 (bare ref) consumes it.
        seedProvisioningForRoute({ target: "new-leads" }, answer("operational", "route-seeded"), 1000);
        const warm = consumeFreshProvisioning(provisioningAnswerUrl("new-leads"), 1100);
        expect(warm).not.toBeNull();
        expect((await warm!) as any).toMatchObject({ terminal: "operational", __tag: "route-seeded" });
        // lens/subject flow through to the same key K2 would build for a scoped ref.
        seedProvisioningForRoute({ target: "new-leads", lens: "v1", subject: "s1" }, answer("operational", "scoped"), 1000);
        expect(consumeFreshProvisioning(provisioningAnswerUrl("new-leads", "v1", "s1"), 1100)).not.toBeNull();
    });

    it("KEY MISMATCH: a bare seed is NOT consumed by a subject-scoped fetch (falls open, no wrong record)", () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioningForRoute({ target: "new-leads" }, answer(), 1000);
        // A ?subject_id deep link keys differently → the bare seed must NOT serve it.
        expect(consumeFreshProvisioning(provisioningAnswerUrl("new-leads", null, "subjX"), 1100)).toBeNull();
    });

    it("consume is one-shot: a seeded answer serves exactly once", () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioningForRoute({ target: "new-leads" }, answer(), 1000);
        const key = provisioningAnswerUrl("new-leads");
        expect(consumeFreshProvisioning(key, 1100)).not.toBeNull();
        expect(consumeFreshProvisioning(key, 1100)).toBeNull();
    });

    it("FALL-OPEN: a null answer or an `error` terminal seeds nothing (K2 does its live fetch)", () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        const key = provisioningAnswerUrl("new-leads");
        seedProvisioningForRoute({ target: "new-leads" }, null, 1000);
        expect(consumeFreshProvisioning(key, 1100)).toBeNull();
        seedProvisioningForRoute({ target: "new-leads" }, answer("error"), 1000);
        expect(consumeFreshProvisioning(key, 1100)).toBeNull();
    });

    it("IDEMPOTENT (no clobber): a seed does not overwrite a still-fresh intent-prefetch entry", async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => answer("operational", "prefetched") }) as unknown as Response);
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        (globalThis as any).fetch = fetchMock as unknown as typeof fetch;
        prefetchWorkUnitProvisioning("new-leads", { now: 1000 }); // warm via hover
        seedProvisioningForRoute({ target: "new-leads" }, answer("operational", "seeded"), 1000 + 1);
        const warm = consumeFreshProvisioning(provisioningAnswerUrl("new-leads"), 1100);
        expect((await warm!) as any).toMatchObject({ __tag: "prefetched" }); // the fresher prefetch wins
        delete (globalThis as any).fetch;
    });

    it("IDEMPOTENT (re-seed no-op): a second seed of the same fresh route keeps the first answer", async () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioningForRoute({ target: "new-leads" }, answer("operational", "first"), 1000);
        seedProvisioningForRoute({ target: "new-leads" }, answer("operational", "second"), 1000 + 1); // still fresh
        const warm = consumeFreshProvisioning(provisioningAnswerUrl("new-leads"), 1100);
        expect((await warm!) as any).toMatchObject({ __tag: "first" }); // first wins; second is a no-op
    });

    it("is a no-op on the server (no window) — the cache is browser-only", () => {
        delete (globalThis as any).window;
        expect(() => seedProvisioningForRoute({ target: "new-leads" }, answer(), 1000)).not.toThrow();
    });
});

/**
 * SINGLE-PRODUCER INVARIANT (RA-3). The provisioning cache has three producers — intent prefetch, server
 * seed, and K2's cold fetch — and one consumer (K2). All four MUST key off the ONE builder
 * `provisioningAnswerUrl` for a given route identity, or a warm entry silently misses. This locks the
 * key-agreement so the invariant is enforced by a test, not by every producer re-deriving the key by hand.
 */
describe("single-producer invariant — one key builder, three producers agree", () => {
    beforeEach(() => {
        clearProvisioningPrefetchForTests();
        clearInflightProvisioningEntriesForTests();
    });
    afterEach(() => {
        delete (globalThis as any).window;
        delete (globalThis as any).fetch;
        vi.restoreAllMocks();
    });

    const answer = (tag: string) => ({ terminal: "operational", __tag: tag }) as unknown as ProvisioningAnswer;

    it("prefetch, seed, and K2's cold fetch all target the identical key for one identity", async () => {
        const seen: string[] = [];
        const fetchMock = vi.fn(async (u: string) => {
            seen.push(u);
            return okAnswer();
        });
        stubEnv(fetchMock as unknown as typeof fetch);
        const identity = { target: "new-leads", lens: "v1", subject: "s1" } as const;
        const k2Key = provisioningAnswerUrl(identity.target, identity.lens, identity.subject);

        // Producer 1: intent prefetch → fetches the K2 key.
        prefetchWorkUnitProvisioning(identity.target, { lens: identity.lens, subject: identity.subject, now: 1000 });
        // Producer 3: K2 cold fetch (the coalescing entry fetch) → same key.
        await fetchProvisioningEntryDeduped(k2Key);
        // Producer 2: server seed via the route seam → derives the same key; a consume at k2Key HITs.
        seedProvisioningForRoute(identity, answer("seeded"), 1000);
        expect(consumeFreshProvisioning(k2Key, 1100)).not.toBeNull();

        // Every network producer hit the ONE key K2 consumes — no drift.
        expect(new Set(seen)).toEqual(new Set([k2Key]));
    });

    it("cold fetch coalesces concurrent identical requests, then drops on settle (owning-lifecycle, CP-2)", async () => {
        const fetchMock = vi.fn(async () => okAnswer());
        stubEnv(fetchMock as unknown as typeof fetch);
        const key = provisioningAnswerUrl("new-leads");

        // Two overlapping identical entry fetches (Strict-Mode double-invoke) → ONE network call.
        const [a, b] = await Promise.all([fetchProvisioningEntryDeduped(key), fetchProvisioningEntryDeduped(key)]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(a).toEqual(b);

        // The in-flight entry is dropped on settle, so a later fetch genuinely re-hits (never stale).
        await fetchProvisioningEntryDeduped(key);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("cold fetch maps a non-ok transport to a status result (K2 turns it into an honest terminal error)", async () => {
        const fetchMock = vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response);
        stubEnv(fetchMock as unknown as typeof fetch);
        const result = await fetchProvisioningEntryDeduped(provisioningAnswerUrl("new-leads"));
        expect(result).toEqual({ ok: false, status: 503 });
    });
});
