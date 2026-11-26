/**
 * ONE IN-FLIGHT OPERATION PER ANSWER — across BOTH provisioning paths.
 *
 * THE DEFECT THIS PINS WAS MEASURED ON FIREFLY (2026-09-15, rapid subject alternation):
 * ten provisioning requests, six distinct URLs, and FOUR concurrent overlaps of a byte-identical
 * URL — one pair issued 351ms into a request that took 854ms.
 *
 * The cause was two registries that could not see each other. `prefetchWorkUnitProvisioning` warmed
 * into the TTL `cache` and fetched directly; K2's entry fetch coalesced through `inflightEntry`.
 * A prewarm and a selection for the SAME answer therefore raced, and rapid switching made that the
 * common case rather than the rare one.
 *
 * The prewarm now issues through the same coalescer. What is guarded here is the pair of properties
 * that makes that safe rather than merely fewer:
 *   COALESCE  — genuinely concurrent, genuinely identical work shares one operation.
 *   SEPARATE  — anything whose authoritative scope differs does NOT share, and a settled entry is
 *               never served again (consume-once and drop-on-settle are both preserved).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
    prefetchWorkUnitProvisioning,
    fetchProvisioningEntryDeduped,
    provisioningAnswerUrl,
    clearInflightProvisioningEntriesForTests,
    clearProvisioningPrefetchForTests,
} from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";

const answer = (code?: string) => ({ terminal: code ? "error" : "operational", code: code ?? undefined, rows: [] });

/** A fetch whose responses are released by hand, so "concurrent" is a fact and not a timing hope. */
function deferredFetch() {
    const calls: string[] = [];
    const releases: Array<(v: unknown) => void> = [];
    const impl = vi.fn((url: string) => {
        calls.push(url);
        return new Promise((resolve) => {
            releases.push(() =>
                resolve({ ok: true, status: 200, json: async () => answer() } as unknown as Response),
            );
        });
    });
    return { calls, releases, impl };
}

beforeEach(() => {
    clearInflightProvisioningEntriesForTests();
    clearProvisioningPrefetchForTests();
    vi.stubGlobal("window", globalThis as unknown as Window);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("COALESCE — concurrent identical work shares one operation", () => {
    it("a selection joins a prewarm that is still in flight", async () => {
        const f = deferredFetch();
        vi.stubGlobal("fetch", f.impl);
        const url = provisioningAnswerUrl("all", "new_work_view_6", "8baf8418");

        const warm = prefetchWorkUnitProvisioning("all", { lens: "new_work_view_6", subject: "8baf8418" });
        const entry = fetchProvisioningEntryDeduped(url); // the click, while the warm is still open

        expect(f.calls.length).toBe(1); // ONE network operation, not two
        f.releases.forEach((r) => r(null));
        await Promise.all([warm, entry]);
        expect(f.calls[0]).toBe(url);
    });

    it("a prewarm joins a selection that is still in flight (the other direction)", async () => {
        const f = deferredFetch();
        vi.stubGlobal("fetch", f.impl);
        const url = provisioningAnswerUrl("all", null, "d097e1a8");

        const entry = fetchProvisioningEntryDeduped(url);
        const warm = prefetchWorkUnitProvisioning("all", { subject: "d097e1a8" });

        expect(f.calls.length).toBe(1);
        f.releases.forEach((r) => r(null));
        await Promise.all([entry, warm]);
    });
});

describe("SEPARATE — different authoritative scope never shares", () => {
    /**
     * The route composes its answer from the slug plus `work_view_id`, `subject_id`, `cohort` and
     * `aspect`. Each of those must key independently, or a coalesced request would answer a question
     * nobody asked. This is the guard against "the URLs look similar, so share them".
     */
    const CASES: Array<[string, () => string, () => string]> = [
        ["subject", () => provisioningAnswerUrl("all", null, "aaa"), () => provisioningAnswerUrl("all", null, "bbb")],
        ["work view", () => provisioningAnswerUrl("all", "wv1", "aaa"), () => provisioningAnswerUrl("all", "wv2", "aaa")],
        ["work unit", () => provisioningAnswerUrl("all", null, "aaa"), () => provisioningAnswerUrl("tours", null, "aaa")],
        ["cohort", () => provisioningAnswerUrl("all", null, "aaa"), () => provisioningAnswerUrl("all", null, "aaa", "none")],
        ["aspect", () => provisioningAnswerUrl("all", null, "aaa", "none", "x"), () => provisioningAnswerUrl("all", null, "aaa", "none", "y")],
    ];

    it.each(CASES)("%s differing issues two independent operations", async (_label, a, b) => {
        const f = deferredFetch();
        vi.stubGlobal("fetch", f.impl);
        expect(a()).not.toBe(b());
        const p1 = fetchProvisioningEntryDeduped(a());
        const p2 = fetchProvisioningEntryDeduped(b());
        expect(f.calls.length).toBe(2);
        f.releases.forEach((r) => r(null));
        await Promise.all([p1, p2]);
    });
});

describe("SEPARATE — a settled entry is never served again", () => {
    it("drops the in-flight entry when it settles, so the next request is fresh", async () => {
        const f = deferredFetch();
        vi.stubGlobal("fetch", f.impl);
        const url = provisioningAnswerUrl("all", null, "aaa");

        const first = fetchProvisioningEntryDeduped(url);
        f.releases.forEach((r) => r(null));
        await first;

        void fetchProvisioningEntryDeduped(url);
        expect(f.calls.length).toBe(2); // a later re-selection re-asks; nothing stale is replayed
    });
});

describe("a refusing subject does not poison unrelated subjects", () => {
    it("keeps other subjects independently fetchable after an error", async () => {
        const calls: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (url: string) => {
            calls.push(url);
            if (url.includes("refuses")) return { ok: false, status: 500 } as unknown as Response;
            return { ok: true, status: 200, json: async () => answer() } as unknown as Response;
        }));

        const bad = await fetchProvisioningEntryDeduped(provisioningAnswerUrl("all", null, "refuses"));
        expect(bad.ok).toBe(false);

        const good = await fetchProvisioningEntryDeduped(provisioningAnswerUrl("all", null, "healthy"));
        expect(good.ok).toBe(true);
        // And the failed one is retryable — a failure is never cached as an answer.
        const retry = await fetchProvisioningEntryDeduped(provisioningAnswerUrl("all", null, "refuses"));
        expect(retry.ok).toBe(false);
        expect(calls.filter((c) => c.includes("refuses")).length).toBe(2);
    });
});
