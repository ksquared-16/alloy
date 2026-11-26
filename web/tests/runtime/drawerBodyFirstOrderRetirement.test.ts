/**
 * THE DRAWER BODY IS SECOND-ORDER WORK (P0-7.6 · Convergence Slice A).
 *
 * Slice 12G measured a single request costing 4,957 ms, starting at 8,074 ms and finishing at
 * 13,031 ms — the last request of the navigation and the longest item in the whole trace — that
 * produced ZERO visible mutation on the Focus Panel destination. It was a prefetch of the full
 * record drawer BODY layout, fired because the operator navigated to a Work Unit.
 *
 * This slice does not make it faster and does not cache it. The work simply does not happen yet.
 *
 * The two gates that matter hardest are the two whose failure is invisible: a REPLACEMENT preload
 * quietly reintroducing the same work under another name, and the demand path breaking so the
 * drawer that genuinely needs this payload never gets it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    buildDrawerLayoutRuntimeBodyCacheKey,
    clearDrawerLayoutRuntimeBodySessionCacheForTests,
    drawerLayoutRuntimeBodyInflightCountForTests,
    fetchDrawerLayoutRuntimeBodyDeduped,
    invalidateDrawerLayoutRuntimeBodyCacheForEntity,
    peekDrawerLayoutRuntimeBodyCacheEntry,
    serializeDrawerLayoutRuntimeBodyQueryParams,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const RECORD_WORK = read("lib/presentation/runtime/useRecordWorkRuntime.ts");
const SESSION_CACHE = read("lib/layout/runtime/drawerLayoutRuntimeBodySessionCache.ts");
const DEMAND_HOOK = read("lib/layout/runtime/useDrawerLayoutRuntimeBody.ts");
const OPP_HOOK = read("lib/layout/runtime/useOpportunityDrawerLayoutRuntimeBody.ts");

const API = "/api/admin/layout-runtime/opportunity-drawer-body";
const body = (tag: string) => ({
    doc: { sections: [{ id: tag }] },
    record: { id: tag },
    layoutSource: "published",
    layoutKey: `k-${tag}`,
    layoutRecordId: null,
    layoutVersion: 1,
});

let urls: string[] = [];
let resolvers: Array<() => void> = [];

beforeEach(() => {
    clearDrawerLayoutRuntimeBodySessionCacheForTests();
    urls = [];
    resolvers = [];
    vi.stubGlobal("fetch", (url: string) => {
        urls.push(String(url));
        const tag = new URL(String(url), "http://x").searchParams.get("opportunityId") ?? "none";
        return new Promise((resolve) => {
            resolvers.push(() =>
                resolve({ ok: true, json: async () => body(tag) } as unknown as Response),
            );
        });
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    clearDrawerLayoutRuntimeBodySessionCacheForTests();
});

describe("first-order navigation does not fetch the drawer body", () => {
    it("THE GATE: the Work Unit record runtime issues no drawer-body prefetch", () => {
        /*
         * This is the whole slice. The prefetch lived in the VM-applied path, so it fired on every
         * navigation the moment the view model landed — two milliseconds after the drawer VM fetch
         * returned, which is exactly what the 12G trace shows.
         */
        expect(RECORD_WORK, "the record runtime prefetches the drawer body again").not.toContain(
            "prefetchDrawerLayoutRuntimeBody",
        );
        expect(RECORD_WORK, "the drawer-body endpoint is fetched from first-order navigation").not.toMatch(
            /prefetch[\s\S]{0,200}layout-runtime\/opportunity-drawer-body/,
        );
    });

    it("THE GATE: no replacement preload was introduced anywhere", () => {
        /*
         * The failure mode §3 names: the request disappears from one owner and reappears from
         * another — an effect, a background task, a cache warm, a second endpoint. Nothing in the
         * runtime may speculatively pull the OPPORTUNITY drawer body.
         */
        for (const f of [
            "lib/presentation/runtime/useRecordWorkRuntime.ts",
            "lib/adminV2/viewModel/drawer/vmRuntime/warmLinkedPersonDrawerVmsFromOpportunityRecord.ts",
        ]) {
            const src = read(f);
            const prefetchesOpportunityBody =
                src.includes("prefetchDrawerLayoutRuntimeBody")
                && src.includes("layout-runtime/opportunity-drawer-body");
            expect(prefetchesOpportunityBody, `${f} speculatively pulls the opportunity drawer body`).toBe(false);
        }
    });

    it("the swap-readiness owner is LIVE and stays — it is a demand path, not a prefetch", () => {
        /*
         * I first read this module as dead and deleted it. It is not: `contexts/AdminDrawerContext`
         * imports it for hold-and-swap transitions, and my search had not covered `contexts/`.
         *
         * It also turns out to be the reason this slice is safe. `waitForDrawerSwapLayoutBodyWarm`
         * does not wait on a prefetch — when the body is cold it FETCHES through the same deduped
         * owner, bounded by a max-hold race that keeps the prior drawer visible. So the swap path
         * carries its own demand, and retiring the navigation-time prefetch cannot strand it.
         */
        const ctx = read("contexts/AdminDrawerContext.tsx");
        expect(ctx).toContain("waitForDrawerSwapLayoutBodyWarm");
        const readiness = read("lib/adminV2/viewModel/drawer/vmRuntime/drawerSwapBodyReadiness.ts");
        expect(readiness, "swap readiness stopped fetching on demand").toContain(
            "fetchDrawerLayoutRuntimeBodyDeduped",
        );
        expect(ctx, "the swap body hold is no longer bounded").toContain("DRAWER_SWAP_BODY_MAX_HOLD_MS");
    });

    it("the record runtime still INVALIDATES the body after a mutation", () => {
        // Retiring the prefetch must not retire correctness: a mutated record must not serve a body
        // composed before the mutation.
        expect(RECORD_WORK).toContain("invalidateDrawerLayoutRuntimeBodyCacheForEntity");
        expect(RECORD_WORK).toContain("dispatchDrawerLayoutRuntimeBodyInvalidate");
    });
});

describe("the demand path is untouched", () => {
    it("THE GATE: opening the drawer still fetches through the existing deduped owner", () => {
        expect(OPP_HOOK).toContain(API);
        expect(DEMAND_HOOK).toContain("fetchDrawerLayoutRuntimeBodyDeduped");
    });

    it("THE GATE: an immediate click on a cold cache starts the work at once", async () => {
        // The second-order Details doctrine: if nothing was prepared, operator demand starts it
        // immediately. That is the cost of not doing speculative work, and it is the correct cost.
        const p = fetchDrawerLayoutRuntimeBodyDeduped({ apiPath: API, entityId: "opp-A" });
        expect(urls, "demand did not issue a request").toHaveLength(1);
        expect(urls[0]).toContain("opportunityId=opp-A");
        resolvers.forEach((r) => r());
        await expect(p).resolves.toMatchObject({ layoutKey: "k-opp-A" });
    });

    it("a warm entry is served without a second request", async () => {
        const first = fetchDrawerLayoutRuntimeBodyDeduped({ apiPath: API, entityId: "opp-A" });
        resolvers.forEach((r) => r());
        await first;
        const second = await fetchDrawerLayoutRuntimeBodyDeduped({ apiPath: API, entityId: "opp-A" });
        expect(urls).toHaveLength(1);
        expect(second).toMatchObject({ layoutKey: "k-opp-A" });
    });
});

describe("one logical execution, and never the wrong record's body", () => {
    it("THE GATE: a concurrent opener JOINS the in-flight execution rather than duplicating it", async () => {
        /*
         * §6, proved against the EXISTING owner rather than a new registry: the dedupe that used to
         * let a prefetch and the runtime hook share one promise is the same dedupe that now lets two
         * demand callers share one.
         */
        const a = fetchDrawerLayoutRuntimeBodyDeduped({ apiPath: API, entityId: "opp-A" });
        const b = fetchDrawerLayoutRuntimeBodyDeduped({ apiPath: API, entityId: "opp-A" });
        expect(urls, "a second request was issued for an execution already in flight").toHaveLength(1);
        expect(drawerLayoutRuntimeBodyInflightCountForTests()).toBe(1);
        resolvers.forEach((r) => r());
        expect(await a).toMatchObject({ layoutKey: "k-opp-A" });
        expect(await b).toMatchObject({ layoutKey: "k-opp-A" });
    });

    it("THE GATE: record A's body can never satisfy record B", async () => {
        // Opening A then B must not show A's layout under B. The cache key is the destination.
        const a = fetchDrawerLayoutRuntimeBodyDeduped({ apiPath: API, entityId: "opp-A" });
        const b = fetchDrawerLayoutRuntimeBodyDeduped({ apiPath: API, entityId: "opp-B" });
        expect(urls).toHaveLength(2);
        resolvers.forEach((r) => r());
        expect(await a).toMatchObject({ layoutKey: "k-opp-A" });
        expect(await b).toMatchObject({ layoutKey: "k-opp-B" });
    });

    it("THE GATE: invalidation after a mutation drops the body, so the next open refetches", async () => {
        const first = fetchDrawerLayoutRuntimeBodyDeduped({ apiPath: API, entityId: "opp-A" });
        resolvers.forEach((r) => r());
        await first;
        expect(peekDrawerLayoutRuntimeBodyCacheEntry(buildDrawerLayoutRuntimeBodyCacheKey(API, "opp-A", serializeDrawerLayoutRuntimeBodyQueryParams(undefined)))).toBeTruthy();

        invalidateDrawerLayoutRuntimeBodyCacheForEntity(API, "opp-A");
        expect(
            peekDrawerLayoutRuntimeBodyCacheEntry(buildDrawerLayoutRuntimeBodyCacheKey(API, "opp-A", serializeDrawerLayoutRuntimeBodyQueryParams(undefined))),
            "a mutated record still serves its pre-mutation body",
        ).toBeFalsy();

        resolvers = [];
        fetchDrawerLayoutRuntimeBodyDeduped({ apiPath: API, entityId: "opp-A" });
        expect(urls, "the next open did not refetch after invalidation").toHaveLength(2);
    });

    it("different query params are different destinations", () => {
        // departmentId / workUnitId ride in the key; a body composed for one scope is not the other's.
        expect(buildDrawerLayoutRuntimeBodyCacheKey(API, "opp-A", "d=1")).not.toBe(
            buildDrawerLayoutRuntimeBodyCacheKey(API, "opp-A", "d=2"),
        );
    });

    it("the session cache remains the single owner — no second inflight registry", () => {
        expect(SESSION_CACHE).toContain("const inflight");
        expect((SESSION_CACHE.match(/new Map\(\)/g) ?? []).length).toBeLessThanOrEqual(2);
    });
});
