import { afterEach, describe, expect, it } from "vitest";
import {
    cachedConfigRead,
    invalidateConfigReadCache,
    invalidateTenantConfigReadCache,
    __clearConfigReadCacheForTests,
} from "@/lib/runtime/provisioning/configReadCache";

afterEach(() => __clearConfigReadCacheForTests());

/** Seed a cache entry and return a loader-call counter for that key. */
function seed(key: string): () => number {
    let calls = 0;
    const loader = () => {
        calls += 1;
        return Promise.resolve(calls);
    };
    void cachedConfigRead(key, loader);
    // A cached (non-expired) key returns without re-running the loader; a busted key re-runs it.
    return () => {
        void cachedConfigRead(key, loader);
        return calls;
    };
}

describe("configReadCache invalidation (B5)", () => {
    it("invalidateConfigReadCache(prefix) busts only matching keys", () => {
        const hdr = seed("hdr:orgA:");
        const qrl = seed("qrl:orgA:s1");
        invalidateConfigReadCache("hdr:orgA:");
        expect(hdr()).toBe(2); // re-loaded → was busted
        expect(qrl()).toBe(1); // untouched → served from cache
    });

    it("invalidateTenantConfigReadCache busts every kind for that tenant only", () => {
        const a = {
            wu: seed("wu:orgA:new-leads"),
            dept: seed("dept:orgA:d1"),
            qrl: seed("qrl:orgA:s1:p:v"),
            hdr: seed("hdr:orgA:"),
        };
        const b = {
            wu: seed("wu:orgB:new-leads"),
            hdr: seed("hdr:orgB:"),
        };

        invalidateTenantConfigReadCache("orgA");

        // Every orgA kind re-loads (busted).
        expect(a.wu()).toBe(2);
        expect(a.dept()).toBe(2);
        expect(a.qrl()).toBe(2);
        expect(a.hdr()).toBe(2);
        // orgB is untouched (tenant isolation).
        expect(b.wu()).toBe(1);
        expect(b.hdr()).toBe(1);
    });

    it("does not confuse tenant orgA with orgA2 (prefix boundary)", () => {
        const a = seed("hdr:orgA:");
        const a2 = seed("hdr:orgA2:");
        invalidateTenantConfigReadCache("orgA");
        expect(a()).toBe(2); // busted
        // The trailing delimiter on every prefix means `hdr:orgA:` is NOT a prefix of `hdr:orgA2:`,
        // so a tenant whose id is a string-prefix of another is never cross-invalidated.
        expect(a2()).toBe(1);
    });
});
