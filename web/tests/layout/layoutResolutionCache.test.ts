/**
 * layoutResolutionCache — keying, TTL expiry, and invalidation.
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { ExtendedLayoutResolution } from "@/lib/layout/layoutResolver";
import {
    buildLayoutResolutionCacheKey,
    clearLayoutResolutionCache,
    getCachedLayoutResolution,
    invalidateLayoutResolutionForEntity,
    setCachedLayoutResolution,
} from "@/lib/layout/layoutResolutionCache";

function fakeResolution(version: number | null): ExtendedLayoutResolution {
    return {
        doc: { formatVersion: 1, surface: "drawer", entityType: "opportunities", sections: [] },
        source: "org",
        record: version == null ? undefined : ({ version } as ExtendedLayoutResolution["record"]),
    } as ExtendedLayoutResolution;
}

beforeEach(() => clearLayoutResolutionCache());

describe("buildLayoutResolutionCacheKey", () => {
    it("distinguishes surface, published vs registry, and queue context", () => {
        const drawer = buildLayoutResolutionCacheKey({ orgId: "o1", entityType: "opportunities", surface: "drawer", fetchPublishedLayouts: true });
        const queue = buildLayoutResolutionCacheKey({ orgId: "o1", entityType: "opportunities", surface: "queue", fetchPublishedLayouts: true });
        const registry = buildLayoutResolutionCacheKey({ orgId: "o1", entityType: "opportunities", surface: "drawer", fetchPublishedLayouts: false });
        expect(new Set([drawer, queue, registry]).size).toBe(3);

        const ctxA = buildLayoutResolutionCacheKey({ orgId: "o1", entityType: "opportunities", surface: "queue", queueContext: { stage_key: "tour" } });
        const ctxB = buildLayoutResolutionCacheKey({ orgId: "o1", entityType: "opportunities", surface: "queue", queueContext: { stage_key: "waitlist" } });
        expect(ctxA).not.toBe(ctxB);
    });
});

describe("get/set with TTL", () => {
    it("returns the value before expiry and null after", () => {
        const key = "k1";
        setCachedLayoutResolution(key, fakeResolution(3), 1000, 0);
        expect(getCachedLayoutResolution(key, 500)).not.toBeNull();
        expect(getCachedLayoutResolution(key, 1500)).toBeNull(); // expired + evicted
        expect(getCachedLayoutResolution(key, 1600)).toBeNull();
    });

    it("ttl <= 0 disables caching", () => {
        setCachedLayoutResolution("k2", fakeResolution(1), 0, 0);
        expect(getCachedLayoutResolution("k2", 0)).toBeNull();
    });
});

describe("invalidateLayoutResolutionForEntity", () => {
    it("drops only matching org+entity keys", () => {
        const oppKey = buildLayoutResolutionCacheKey({ orgId: "o1", entityType: "opportunities", surface: "drawer", fetchPublishedLayouts: true });
        const personKey = buildLayoutResolutionCacheKey({ orgId: "o1", entityType: "person", surface: "drawer", fetchPublishedLayouts: true });
        setCachedLayoutResolution(oppKey, fakeResolution(1), 10_000, 0);
        setCachedLayoutResolution(personKey, fakeResolution(1), 10_000, 0);

        invalidateLayoutResolutionForEntity("o1", "opportunities");

        expect(getCachedLayoutResolution(oppKey, 1)).toBeNull();
        expect(getCachedLayoutResolution(personKey, 1)).not.toBeNull();
    });
});
