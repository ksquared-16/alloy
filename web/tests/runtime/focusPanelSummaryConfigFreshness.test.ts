// @vitest-environment jsdom
/**
 * CONFIGURATION FRESHNESS — the Slice 10 policy, applied to the published Focus Panel Summary.
 *
 * THE DEFECT THIS CLOSES (Slice 7, measured): this owner invalidated on a PAYLOADLESS, SAME-TAB event
 * and had no TTL. A publish from another tab, another operator or a direct API call was never
 * observed, so a mounted session could hold a superseded layout indefinitely. The repeated embedded
 * copy in every subject payload was acting as an accidental safety net — which is exactly why S5-3
 * could not ship.
 *
 * The sibling published Queue Row surface already had the answer (scoped event + BroadcastChannel +
 * re-read on mount). These tests pin this surface to that standard, plus the two things Slice 7
 * recorded as missing: a bounded TTL and a generation guard.
 *
 * What is guarded here is the pair of properties that make longer client-side reuse SAFE:
 *   BOUND    — reuse has an explicit expiry and an explicit invalidation path.
 *   DISCARD  — an answer issued before an invalidation can never become current again.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    FOCUS_PANEL_SUMMARY_PUBLISHED_CHANNEL,
    FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT,
    dispatchFocusPanelSummaryPublished,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryLayoutService";
import { __focusPanelSummaryFreshnessTestApi as api } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";

const SCOPE_A = { businessProcessKey: "enrollment", workViewId: "new_work_view_6", stageKey: "lead" };
const SCOPE_B = { businessProcessKey: "enrollment", workViewId: "new_work_view_4", stageKey: "waitlist" };

/** A fetch whose completion is released by hand, so "in flight" is a fact rather than a race. */
function controllableFetch() {
    const releases: Array<(v: unknown) => void> = [];
    let version = 7;
    const impl = vi.fn(() => new Promise((resolve) => {
        const v = version;
        releases.push(() => resolve({
            ok: true,
            json: async () => ({ published: { doc: { marker: `v${v}` }, version: v } }),
        } as unknown as Response));
    }));
    return { impl, releases, setVersion: (v: number) => { version = v; }, calls: () => impl.mock.calls.length };
}

beforeEach(() => { api.reset(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("1 — publish invalidation, and a version already held", () => {
    it("invalidates cached configuration when a NEW version publishes", async () => {
        const f = controllableFetch(); vi.stubGlobal("fetch", f.impl);
        const p = api.load(SCOPE_A); f.releases.forEach((r) => r(null)); await p;
        expect(api.peek(SCOPE_A)?.version).toBe(7);

        api.invalidateForPublish({ version: 9 });          // a version we do NOT hold
        expect(api.scopeCount()).toBe(0);                   // dropped, will refetch
    });

    it("does NOT refetch when the publish announces the version already held", async () => {
        const f = controllableFetch(); vi.stubGlobal("fetch", f.impl);
        const p = api.load(SCOPE_A); f.releases.forEach((r) => r(null)); await p;
        const before = f.calls();

        api.invalidateForPublish({ version: 7 });           // our own publish echoing back
        expect(api.scopeCount()).toBe(1);
        expect(f.calls()).toBe(before);
    });
});

describe("2 — payloadless compatibility (the legacy caller must keep working)", () => {
    it("invalidates everything when the event carries no detail", async () => {
        const f = controllableFetch(); vi.stubGlobal("fetch", f.impl);
        const p = api.load(SCOPE_A); f.releases.forEach((r) => r(null)); await p;
        expect(api.scopeCount()).toBe(1);

        api.invalidateForPublish(null);                     // the pre-contract shape
        expect(api.scopeCount()).toBe(0);
    });
});

describe("3/4 — cross-tab propagation, and its absence", () => {
    it("posts a scoped publish to the shared channel AND the local window", () => {
        const posted: unknown[] = []; const closed = { n: 0 };
        class FakeChannel {
            constructor(public name: string) {}
            postMessage(m: unknown) { posted.push({ name: this.name, m }); }
            close() { closed.n += 1; }
        }
        vi.stubGlobal("BroadcastChannel", FakeChannel as unknown as typeof BroadcastChannel);
        const seen: unknown[] = [];
        const onEvent = (e: Event) => seen.push((e as CustomEvent).detail);
        window.addEventListener(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, onEvent);

        dispatchFocusPanelSummaryPublished({ surfaceId: "s1", layoutKey: "focus-panel-summary", entityType: "opportunity", version: 12 });

        window.removeEventListener(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, onEvent);
        expect(seen).toEqual([{ surfaceId: "s1", layoutKey: "focus-panel-summary", entityType: "opportunity", version: 12 }]);
        expect(posted).toEqual([{ name: FOCUS_PANEL_SUMMARY_PUBLISHED_CHANNEL, m: { type: "published", surfaceId: "s1", layoutKey: "focus-panel-summary", entityType: "opportunity", version: 12 } }]);
        expect(closed.n).toBe(1); // closed immediately — the sender cannot echo to itself
    });

    it("still publishes locally when BroadcastChannel is unavailable", () => {
        vi.stubGlobal("BroadcastChannel", function () { throw new Error("unavailable"); } as unknown as typeof BroadcastChannel);
        const seen: unknown[] = [];
        const onEvent = (e: Event) => seen.push((e as CustomEvent).detail);
        window.addEventListener(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, onEvent);
        expect(() => dispatchFocusPanelSummaryPublished({ surfaceId: "s1", layoutKey: null, entityType: null, version: 3 })).not.toThrow();
        window.removeEventListener(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, onEvent);
        expect(seen).toHaveLength(1); // same-tab + TTL remain the guarantee
    });
});

describe("5 — TTL and stale-while-revalidate", () => {
    it("reuses a fresh entry without refetching", async () => {
        const f = controllableFetch(); vi.stubGlobal("fetch", f.impl);
        let p = api.load(SCOPE_A); f.releases.forEach((r) => r(null)); await p;
        vi.advanceTimersByTime(api.ttlMs - 1_000);
        p = api.load(SCOPE_A); await p;
        expect(f.calls()).toBe(1);
    });

    it("revalidates past the TTL while keeping the cached document usable", async () => {
        const f = controllableFetch(); vi.stubGlobal("fetch", f.impl);
        let p = api.load(SCOPE_A); f.releases.forEach((r) => r(null)); await p;
        vi.advanceTimersByTime(api.ttlMs + 1_000);

        f.setVersion(11);
        const stale = await api.load(SCOPE_A);          // resolves IMMEDIATELY with the old doc
        expect(stale).toEqual({ marker: "v7" });
        expect(f.calls()).toBe(2);                      // and a refresh was started underneath
        f.releases.forEach((r) => r(null));
        await vi.waitFor(() => expect(api.peek(SCOPE_A)?.version).toBe(11));
    });

    it("keeps the last known configuration when revalidation FAILS", async () => {
        const f = controllableFetch(); vi.stubGlobal("fetch", f.impl);
        const p = api.load(SCOPE_A); f.releases.forEach((r) => r(null)); await p;
        const settledAt = api.peek(SCOPE_A)?.settledAt;

        vi.advanceTimersByTime(api.ttlMs + 1_000);
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
        const kept = await api.load(SCOPE_A);

        expect(kept).toEqual({ marker: "v7" });                     // still visible
        expect(api.peek(SCOPE_A)?.version).toBe(7);                 // not falsely refreshed
        expect(api.peek(SCOPE_A)?.settledAt).toBe(settledAt);       // so the next read retries
    });
});

describe("6 — scope isolation", () => {
    it("keeps scopes in separate slots", async () => {
        const f = controllableFetch(); vi.stubGlobal("fetch", f.impl);
        const a = api.load(SCOPE_A); f.releases.forEach((r) => r(null)); await a;
        const b = api.load(SCOPE_B); f.releases.forEach((r) => r(null)); await b;
        expect(api.scopeCount()).toBe(2);
        expect(f.calls()).toBe(2); // scope is part of identity — never served from another scope
    });
});

describe("7 — GENERATION GUARD: a superseded answer can never become current", () => {
    /**
     * WHY THIS IS NOT THE OBVIOUS TEST, recorded so nobody rewrites it into a false green.
     *
     * The intuitive test — start a load, invalidate, release the old response, assert the cache was
     * not overwritten — PASSES WITH THE GUARD REMOVED. Verified by planting exactly that. The reason
     * is structural: `invalidateAll()` clears the map, so the superseded response writes into an
     * ORPHANED slot that nothing can read. At cache level the stale write is already impossible.
     *
     * The component is where the race actually lives: its own promise resolves to whatever the
     * abandoned request returned, and `setState` would paint it. So the guard belongs at the APPLY
     * step, and what binds is (a) that an invalidation advances the generation and (b) that apply
     * compares it.
     */
    it("advances the generation on every invalidation", () => {
        const before = api.generation();
        api.invalidateForPublish({ version: 99 });
        expect(api.generation()).toBeGreaterThan(before);
    });

    it("guards the component apply step with that generation", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc.ts"),
            "utf-8",
        );
        // apply must be conditional on the generation it was issued under — never on arrival order.
        expect(src).toMatch(/issued !== currentGeneration\(\)/);
        expect(src).not.toMatch(/setState\(\{ doc: resolved, loaded: true \}\);\n\s*\}\);/);
    });
});
