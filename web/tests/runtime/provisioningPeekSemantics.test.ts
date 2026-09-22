/**
 * OBSERVATION MUST NOT CLAIM OWNERSHIP.
 *
 * `consumeFreshProvisioning` deletes on read, and that consume-once behaviour is load-bearing: one
 * logical answer per navigation, consumed by the surface that owns the route. Its own header
 * records what a missed consume costs — the surface waited 4.7s (6.6s cold) for an answer that had
 * been in the cache four milliseconds earlier.
 *
 * The persistent left nav needs the same answer's Work View counts and does NOT own the route. If
 * it consumed, it would steal the answer from the surface and reproduce that exact defect. So it
 * peeks.
 *
 * A peek that got any of this subtly wrong would be worse than the duplicate request it exists to
 * remove: it would break the surface rather than the nav, on a path with a documented production
 * failure. These gates pin every way that can happen — deletion, TTL extension, mutation, cross-key
 * observation, and any effect on what the owner later consumes.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
    PREFETCH_TTL_MS,
    clearProvisioningPrefetchForTests,
    consumeFreshProvisioning,
    peekFreshProvisioning,
    seedProvisioningForRoute,
} from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/*
 * `seedProvisioning` refuses to write when `typeof window === "undefined"` — it is a BROWSER
 * cache and will not populate itself server-side. This suite runs in node, so without a window
 * every seed is a silent no-op and every assertion below would pass against an empty cache while
 * proving nothing. The first run of these gates failed exactly that way, which is the useful
 * outcome: a peek suite that cannot see a seeded entry is not testing the peek.
 */
beforeAll(() => {
    if (typeof (globalThis as { window?: unknown }).window === "undefined") {
        (globalThis as { window?: unknown }).window = globalThis;
    }
});

const ROUTE = { target: "new-leads", lens: null, subject: null, cohort: null, aspect: null };
const OTHER = { target: "other-unit", lens: null, subject: null, cohort: null, aspect: null };

/** Minimal stand-in: these gates are about cache mechanics, not answer content. */
const answerFor = (tag: string) => ({ terminal: "empty", orgId: tag } as unknown as ProvisioningAnswer);

const urlFor = (target: string) => `/api/admin/work-units/${target}/provisioning-answer`;

afterEach(() => clearProvisioningPrefetchForTests());

describe("peek observes", () => {
    it("returns a fresh entry", async () => {
        seedProvisioningForRoute(ROUTE, answerFor("a"));
        const got = peekFreshProvisioning(urlFor("new-leads"));
        expect(got).not.toBeNull();
        expect((await got!).orgId).toBe("a");
    });

    it("returns nothing for an absent key", () => {
        expect(peekFreshProvisioning(urlFor("new-leads"))).toBeNull();
    });

    it("CANNOT OBSERVE ANOTHER ROUTE'S ANSWER", () => {
        // A nav that peeked the wrong key would render one work unit's counts under another.
        seedProvisioningForRoute(ROUTE, answerFor("a"));
        expect(peekFreshProvisioning(urlFor("other-unit"))).toBeNull();
        seedProvisioningForRoute(OTHER, answerFor("b"));
        expect(peekFreshProvisioning(urlFor("other-unit"))).not.toBeNull();
    });

    it("returns nothing once the entry is past its freshness window", () => {
        seedProvisioningForRoute(ROUTE, answerFor("a"));
        const future = Date.now() + PREFETCH_TTL_MS + 1;
        expect(peekFreshProvisioning(urlFor("new-leads"), future)).toBeNull();
    });
});

describe("peek does not claim", () => {
    it("DOES NOT DELETE — the owner can still consume after any number of peeks", async () => {
        seedProvisioningForRoute(ROUTE, answerFor("a"));
        for (let i = 0; i < 5; i++) expect(peekFreshProvisioning(urlFor("new-leads"))).not.toBeNull();
        const consumed = consumeFreshProvisioning(urlFor("new-leads"));
        expect(consumed).not.toBeNull();
        expect((await consumed!).orgId).toBe("a");
    });

    it("peek and consume return the SAME value", async () => {
        seedProvisioningForRoute(ROUTE, answerFor("a"));
        const peeked = peekFreshProvisioning(urlFor("new-leads"));
        const consumed = consumeFreshProvisioning(urlFor("new-leads"));
        // The same stored promise, not a copy: two different objects could diverge.
        expect(peeked).toBe(consumed);
    });

    it("DOES NOT EXTEND FRESHNESS", () => {
        /*
         * A peek that re-stamped the entry would keep a stale answer alive indefinitely on a
         * surface that peeks often — the nav peeks on every route change.
         */
        seedProvisioningForRoute(ROUTE, answerFor("a"));
        const nearExpiry = Date.now() + PREFETCH_TTL_MS - 5;
        expect(peekFreshProvisioning(urlFor("new-leads"), nearExpiry)).not.toBeNull();
        // Peeking at the near-expiry moment must not push the window out.
        const pastExpiry = Date.now() + PREFETCH_TTL_MS + 1;
        expect(peekFreshProvisioning(urlFor("new-leads"), pastExpiry)).toBeNull();
    });

    it("an expired peek does not evict what consume would report", () => {
        // Peek reports absence for an expired entry but leaves eviction to the consuming paths,
        // so a peek can neither resurrect stale truth nor change consume's own verdict.
        seedProvisioningForRoute(ROUTE, answerFor("a"));
        const pastExpiry = Date.now() + PREFETCH_TTL_MS + 1;
        expect(peekFreshProvisioning(urlFor("new-leads"), pastExpiry)).toBeNull();
        expect(consumeFreshProvisioning(urlFor("new-leads"), pastExpiry)).toBeNull();
    });

    it("CONSUME STILL DELETES — peek must not have made it idempotent", async () => {
        seedProvisioningForRoute(ROUTE, answerFor("a"));
        const first = consumeFreshProvisioning(urlFor("new-leads"));
        expect(first).not.toBeNull();
        await first!;
        expect(consumeFreshProvisioning(urlFor("new-leads"))).toBeNull();
    });

    it("consume-then-peek returns nothing", () => {
        seedProvisioningForRoute(ROUTE, answerFor("a"));
        expect(consumeFreshProvisioning(urlFor("new-leads"))).not.toBeNull();
        // The owner has claimed it; an observer must not see a claimed answer.
        expect(peekFreshProvisioning(urlFor("new-leads"))).toBeNull();
    });
});

describe("the peek is read-only by construction", () => {
    const SRC = readSource();
    function readSource() {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        const { join } = require("node:path") as typeof import("node:path");
        const raw = readFileSync(join(process.cwd(), "lib/runtime/kernel/workUnitProvisioningPrefetch.ts"), "utf8");
        const at = raw.indexOf("export function peekFreshProvisioning");
        return raw.slice(at, raw.indexOf("\n}", at));
    }

    it("the peek body never deletes, sets, or re-stamps", () => {
        expect(SRC).toContain("cache.get(url)");
        expect(SRC).not.toContain("cache.delete");
        expect(SRC).not.toContain("cache.set");
        expect(SRC).not.toMatch(/startedAt\s*=/);
    });

    it("it reads the SAME cache as consume — not a second source of truth", () => {
        // A private map here would be a second owner of the same answer.
        expect(SRC).not.toMatch(/new Map\(/);
    });
});
