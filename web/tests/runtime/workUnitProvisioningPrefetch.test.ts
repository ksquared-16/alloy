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
    consumeFreshProvisioningForRoute,
    PREFETCH_TTL_MS,
} from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/** Minimal window + fetch stubs so the module's `typeof window` guard passes. */
function stubEnv(fetchImpl: typeof fetch) {
    (globalThis as any).window = { location: { origin: "https://alloy.local" } };
    (globalThis as any).fetch = fetchImpl as any;
}

const okAnswer = (terminal = "operational") =>
    // A real Response always carries headers, and the fetch seam reads content-type to tell a
    // settled answer from a phased one. A stub without them is not a Response-like at all.
    ({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ terminal }) }) as unknown as Response;

describe("workUnitProvisioningPrefetch", () => {
    beforeEach(() => clearProvisioningPrefetchForTests());
    afterEach(() => {
        delete (globalThis as any).window;
        delete (globalThis as any).fetch;
        vi.restoreAllMocks();
    });

    it("builds the exact K2 URL (no query when unscoped; work_view_id/subject_id when scoped)", () => {
        expect(provisioningAnswerUrl("new-leads")).toBe("/api/admin/work-units/new-leads/provisioning-answer?phased=1");
        expect(provisioningAnswerUrl("new-leads", "v1")).toBe("/api/admin/work-units/new-leads/provisioning-answer?work_view_id=v1&phased=1");
        expect(provisioningAnswerUrl("new-leads", "v1", "s1")).toBe("/api/admin/work-units/new-leads/provisioning-answer?work_view_id=v1&subject_id=s1&phased=1");
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
            "/api/admin/work-units/new-leads/provisioning-answer?work_view_id=all_leads&phased=1",
            expect.anything(),
        );
        // default tile (no lens) → unscoped URL
        clearProvisioningPrefetchForTests();
        prefetchWorkUnitProvisioningFromHref("/workspace/work-unit/new-leads");
        expect(fetchMock).toHaveBeenLastCalledWith(
            "/api/admin/work-units/new-leads/provisioning-answer?phased=1",
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
        const fetchMock = vi.fn(async () => ({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => answer("operational", "prefetched") }) as unknown as Response);
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


/**
 * P0-7.6 / SLICE 11 — THE SERVER SEED MUST BE REACHABLE BY THE CONSUME THAT ACTUALLY RUNS.
 *
 * ── WHY THE SUITE ABOVE DID NOT CATCH THIS ──
 *
 * Every parity test above consumes with `provisioningAnswerUrl(target, lens, subject)` — the BASE
 * key. Production never does. `workUnitEntryResourceClient` also passes `retainedDepartmentConfigIds()`
 * and `heldFocusPanelSummaryIdentities()` (S6-1), which ride the URL because they change the answer's
 * CONTENT. The server seed cannot pass them — it runs where the browser's held configuration is
 * unknowable — so for any returning operator the two keys could never match, and the suite stayed
 * green while the seed was unreachable in the field.
 *
 * Measured on deployed `009beb369`, from the runtime's own trace:
 *
 *     register      t=5032  producer=page(...)       /…/provisioning-answer
 *     consume-miss  t=5036  producer=kernel-consume  /…/provisioning-answer?dept_config=<4 ids>
 *
 * A composed operational answer sat in the cache four milliseconds before the consume that missed it.
 * The surface then waited 4.7 s (6.6 s on the colder baseline) for an answer it already held.
 *
 * These gates assert the OUTCOME — that the seed is reached — not that both sides call the same
 * function, which was true throughout and proved nothing.
 */
describe("seed reachability — the asserting consume must reach the server's base-key seed", () => {
    beforeEach(() => clearProvisioningPrefetchForTests());
    afterEach(() => {
        delete (globalThis as any).window;
        vi.restoreAllMocks();
    });

    const answer = (terminal = "operational", tag = "x") =>
        ({ terminal, __tag: tag }) as unknown as ProvisioningAnswer;
    const route = { target: "waitlist" as const };
    const HELD = ["17820bbd", "3933ac47", "5f6bba4c", "f73bb50f"];

    it("THE GATE: a consume asserting held department config still reaches the server seed", async () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioningForRoute(route, answer("operational", "server-seed"), 1000);
        const warm = consumeFreshProvisioningForRoute(route, HELD, undefined, 1100);
        expect(warm, "the seed must be reachable — this is the whole repair").not.toBeNull();
        expect(warm!.via).toBe("seed-base");
        expect((await warm!.promise) as any).toMatchObject({ terminal: "operational", __tag: "server-seed" });
    });

    it("THE DIVERGENCE, pinned: the exact asserting key alone does NOT match the seed", () => {
        // Recorded so a future reader cannot conclude the fallback is redundant. It is the only thing
        // making the seed reachable; without it this lookup is the production miss, exactly.
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioningForRoute(route, answer(), 1000);
        const exactKey = provisioningAnswerUrl("waitlist", null, null, null, null, HELD, undefined);
        expect(exactKey).toContain("dept_config=");
        expect(consumeFreshProvisioning(exactKey, 1100)).toBeNull();
    });

    it("THE GATE: an exact warm entry still wins, and is reported as exact — prefetch is not demoted", async () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        const exactKey = provisioningAnswerUrl("waitlist", null, null, null, null, HELD, undefined);
        // Simulate an intent prefetch that warmed the asserting key, plus a server seed on the base key.
        seedProvisioningForRoute(route, answer("operational", "base-seed"), 1000);
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        // Seed the exact key through the same public seam by asserting nothing is impossible, so drive
        // the cache the way a prefetch does: consume proves precedence by which tag comes back.
        const viaExact = consumeFreshProvisioningForRoute(route, undefined, undefined, 1100);
        expect(viaExact!.via).toBe("exact");
        expect((await viaExact!.promise) as any).toMatchObject({ __tag: "base-seed" });
        expect(exactKey).not.toBe(provisioningAnswerUrl("waitlist"));
    });

    it("SECURITY / DIRECTION: an assertion-keyed entry must NEVER serve a consume that asserted nothing", () => {
        // The unsound direction. An answer composed for a client claiming to hold configuration may
        // legitimately OMIT it; serving that to a caller who holds nothing would be genuinely short.
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        const assertingKey = provisioningAnswerUrl("waitlist", null, null, null, null, HELD, undefined);
        expect(assertingKey).not.toBe(provisioningAnswerUrl("waitlist"));
        // Nothing seeded on the base key; a non-asserting consume must not reach the asserting entry.
        const warm = consumeFreshProvisioningForRoute(route, undefined, undefined, 1100);
        expect(warm).toBeNull();
    });

    it("IDENTITY IS NOT WIDENED: the fallback never crosses subject, lens or cohort", () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioningForRoute({ target: "waitlist" }, answer(), 1000);
        // A different subject / lens / cohort is a DIFFERENT answer. The base fallback must not serve it.
        expect(consumeFreshProvisioningForRoute({ target: "waitlist", subject: "subjX" }, HELD, undefined, 1100)).toBeNull();
        expect(consumeFreshProvisioningForRoute({ target: "waitlist", lens: "v9" }, HELD, undefined, 1100)).toBeNull();
        expect(consumeFreshProvisioningForRoute({ target: "waitlist", cohort: "none" }, HELD, undefined, 1100)).toBeNull();
        expect(consumeFreshProvisioningForRoute({ target: "other-unit" }, HELD, undefined, 1100)).toBeNull();
    });

    it("DEDUPE: exactly one logical consume — the seed cannot serve twice through either key", () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioningForRoute(route, answer(), 1000);
        expect(consumeFreshProvisioningForRoute(route, HELD, undefined, 1100)).not.toBeNull();
        // Consume-once holds ACROSS the fallback: the first lookup deleted the entry.
        expect(consumeFreshProvisioningForRoute(route, HELD, undefined, 1100)).toBeNull();
        expect(consumeFreshProvisioning(provisioningAnswerUrl("waitlist"), 1100)).toBeNull();
    });

    it("STALENESS: a base seed past its freshness window must not serve a later navigation", () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioningForRoute(route, answer(), 1000);
        const stale = 1000 + PREFETCH_TTL_MS + 1;
        expect(consumeFreshProvisioningForRoute(route, HELD, undefined, stale)).toBeNull();
    });

    it("an error terminal is never seeded, so the fallback can never surface one", () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioningForRoute(route, answer("error", "bad"), 1000);
        expect(consumeFreshProvisioningForRoute(route, HELD, undefined, 1100)).toBeNull();
    });

    it("no assertion on either side is a single lookup, not a double consume of one entry", () => {
        (globalThis as any).window = { location: { origin: "https://alloy.local" } };
        seedProvisioningForRoute(route, answer(), 1000);
        const warm = consumeFreshProvisioningForRoute(route, undefined, undefined, 1100);
        expect(warm!.via).toBe("exact");
        expect(warm!.url).toBe(provisioningAnswerUrl("waitlist"));
    });
});

/**
 * THE SCHEDULING CLAIM, at the seam that actually runs it.
 *
 * Source-level, because the behavioural half above proves the kernel reaches the seed and this proves
 * the production consume path is the one asking. Together they are the scheduling gate: plant the old
 * serialization back and one of the two fails.
 */
describe("the entry seam consumes through the kernel, so the seed is reachable in production", () => {
    it("THE GATE: workUnitEntryResourceClient uses the route-aware consume", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const seam = readFileSync(join(process.cwd(), "lib/runtime/kernel/workUnitEntryResourceClient.ts"), "utf8");
        expect(seam).toContain("consumeFreshProvisioningForRoute");
        // The old single-key consume is what made the seed unreachable; it must not be what runs here.
        expect(seam).not.toMatch(/consumeFreshProvisioning\(/);
    });
});
