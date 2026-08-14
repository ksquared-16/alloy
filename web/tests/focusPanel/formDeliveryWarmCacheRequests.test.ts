/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    clearWarmFormDeliveryForTests,
    invalidateWarmFormDelivery,
    loadFormDelivery,
    peekWarmFormDelivery,
    prefetchFormDelivery,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/formDeliveryWarmCache";

/**
 * FORM DELIVERY — request-count certification for the warm-cache load seam.
 *
 * The defect: the surface peeked the warm cache to paint synchronously (correct), then ran
 * all three fetches again unconditionally, in a hand-copied duplicate of the cache's own
 * fetch functions. Every Send-form open therefore cost 3 redundant requests, and an open
 * that raced an in-flight warm cost 6 requests for 3 resources. The copy also duplicated
 * the response parsing, which is why an identical `/api/admin/forms` shape bug had to be
 * found and fixed in both files.
 *
 * These assert REQUEST COUNTS PER RESOURCE, not elapsed time — the contract is "how many
 * times did we ask", which is deterministic and cannot be corrupted by a loaded host.
 *
 * Scenario coverage is the full matrix: cold open · warm completed then open · warm still
 * in flight then open · cache expired then open · failed warm then open · reopen in TTL.
 */

const OID = "opp-1";
const TTL_MS = 45_000;

type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void; promise: Promise<unknown> };

let calls: string[];
let deferrals: Deferred[] | null;

/** Which resource a URL belongs to, so counts are per-resource rather than per-URL. */
function resourceOf(url: string): string {
    if (url.startsWith("/api/admin/forms")) return "forms";
    if (url.includes("drawer-recipients")) return "drawer-recipients";
    if (url.includes("delivery-subjects")) return "delivery-subjects";
    return `other:${url}`;
}

function countsByResource(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of calls) out[resourceOf(c)] = (out[resourceOf(c)] ?? 0) + 1;
    return out;
}

function okBody(url: string): unknown {
    if (url.startsWith("/api/admin/forms")) return { data: [{ id: "f1", name: "Enrollment packet", is_active: true }] };
    if (url.includes("drawer-recipients")) {
        return { recipients: [{ person_id: "p1", display_name: "Alex Rivera", email: "a@example.com", phone: null }] };
    }
    return { subjects: [{ id: "c1", label: "Sam", entity_type: "children" }] };
}

beforeEach(() => {
    calls = [];
    deferrals = null;
    clearWarmFormDeliveryForTests();
    vi.stubGlobal("window", {} as unknown as Window);
    vi.stubGlobal("fetch", ((input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        const response = { ok: true, json: async () => okBody(url) };
        if (deferrals) {
            let resolve!: (v: unknown) => void;
            let reject!: (e: unknown) => void;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            deferrals.push({ resolve, reject, promise });
            return promise.then(() => response);
        }
        return Promise.resolve(response);
    }) as unknown as typeof fetch);
});

afterEach(() => {
    vi.unstubAllGlobals();
    clearWarmFormDeliveryForTests();
});

describe("form delivery — one request per resource per load", () => {
    it("cold open: exactly one request per resource", async () => {
        await loadFormDelivery(OID, 0);
        expect(countsByResource()).toEqual({
            "forms": 1,
            "drawer-recipients": 1,
            "delivery-subjects": 1,
        });
    });

    it("warm prefetch completed, then open: ZERO further requests", async () => {
        await prefetchFormDelivery(OID, 0);
        expect(calls).toHaveLength(3);
        calls = [];

        // The surface paints from the peek, then asks the seam to load.
        expect(peekWarmFormDelivery(OID, 1_000)).not.toBeNull();
        const value = await loadFormDelivery(OID, 1_000);

        expect(countsByResource()).toEqual({});
        expect(value?.forms).toHaveLength(1);
        expect(value?.recipients).toHaveLength(1);
    });

    it("warm prefetch still IN FLIGHT, then open: still one request per resource, not two", async () => {
        deferrals = [];
        const warm = prefetchFormDelivery(OID, 0);
        expect(calls).toHaveLength(3);

        // Opening mid-flight must join the same promise. This is the 6-requests-for-3-resources case.
        const opened = loadFormDelivery(OID, 10);
        expect(opened).toBe(warm);

        deferrals.forEach((d) => d.resolve(null));
        await warm;
        await opened;

        expect(countsByResource()).toEqual({
            "forms": 1,
            "drawer-recipients": 1,
            "delivery-subjects": 1,
        });
    });

    it("cache EXPIRED, then open: one fresh request per resource", async () => {
        await loadFormDelivery(OID, 0);
        calls = [];
        await loadFormDelivery(OID, TTL_MS + 1);
        expect(countsByResource()).toEqual({
            "forms": 1,
            "drawer-recipients": 1,
            "delivery-subjects": 1,
        });
    });

    it("FAILED warm, then open: the failure is not cached and the open recovers", async () => {
        deferrals = [];
        const warm = prefetchFormDelivery(OID, 0);
        deferrals.forEach((d) => d.reject(new Error("network down")));
        await expect(warm).rejects.toThrow("network down");

        // A failed entry must be evicted, or every later open would replay the same rejection.
        expect(peekWarmFormDelivery(OID, 10)).toBeNull();

        deferrals = null;
        calls = [];
        const value = await loadFormDelivery(OID, 10);
        expect(countsByResource()).toEqual({
            "forms": 1,
            "drawer-recipients": 1,
            "delivery-subjects": 1,
        });
        expect(value?.forms).toHaveLength(1);
    });

    it("reopen within the TTL: still zero requests", async () => {
        await loadFormDelivery(OID, 0);
        calls = [];
        await loadFormDelivery(OID, 5_000);
        await loadFormDelivery(OID, 20_000);
        await loadFormDelivery(OID, TTL_MS - 1);
        expect(countsByResource()).toEqual({});
    });

    it("after a delivery, the next open re-verifies", async () => {
        await loadFormDelivery(OID, 0);
        calls = [];

        // Sending changes what the next open should show; the entry is retired explicitly.
        invalidateWarmFormDelivery(OID);
        expect(peekWarmFormDelivery(OID, 100)).toBeNull();

        await loadFormDelivery(OID, 100);
        expect(countsByResource()).toEqual({
            "forms": 1,
            "drawer-recipients": 1,
            "delivery-subjects": 1,
        });
    });

    it("warming and loading are the same seam, so they can never diverge", () => {
        expect(prefetchFormDelivery).toBe(loadFormDelivery);
    });

    it("the surface loads THROUGH the seam and owns no fetch of its own", () => {
        // The counts above are only true while this holds. The original defect was not a bad
        // cache — it was a consumer that bypassed the cache and re-implemented it, so every
        // assertion in this file would have passed against the broken code.
        const src = readFileSync(
            join(__dirname, "..", "..", "components/admin/focusPanel/cards/FormDeliverySurface.tsx"),
            "utf8",
        );
        // Comments stripped: the file's own header legitimately NAMES these endpoints when
        // explaining where each contract answer comes from. Only real code counts.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

        expect(code).toContain("loadFormDelivery(opportunityId)");
        for (const resource of ["/api/admin/forms", "drawer-recipients", "delivery-subjects"]) {
            expect(code, `${resource} must be fetched by the warm-cache seam, not by the surface`)
                .not.toContain(resource);
        }
        // The delivery POST is the surface's own concern and stays.
        expect(code).toContain("form-deliver");
    });

    it("separate records do not share an entry", async () => {
        await loadFormDelivery("opp-1", 0);
        calls = [];
        await loadFormDelivery("opp-2", 0);
        expect(countsByResource()).toEqual({
            "forms": 1,
            "drawer-recipients": 1,
            "delivery-subjects": 1,
        });
    });
});
