/**
 * RETAINED-TRUTH §scroll — the operator's scroll position is retained continuity, restored on return
 * and NOT across an org / principal / permission change. These tests pin the scope keying (Workspace
 * per site, Queue per work view, Focus Panel per record) and the org-change/logout flush.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
    clearRetainedOperatorContext,
    focusPanelScrollScope,
    peekRetainedScroll,
    putRetainedScroll,
    queueScrollScope,
    workspaceScrollScope,
} from "@/lib/presentation/runtime/workUnitOperatorContext";
import { setCurrentWorkspaceScope } from "@/lib/workspace/currentWorkspaceScope";

afterEach(() => clearRetainedOperatorContext());

describe("scroll scope keying", () => {
    it("queue scroll is per (org, work unit, work view) — Work View A vs B are independent", () => {
        const a = queueScrollScope("org1", "wu1", "viewA");
        const b = queueScrollScope("org1", "wu1", "viewB");
        expect(a).not.toBe(b);
        putRetainedScroll(a, 120);
        putRetainedScroll(b, 40);
        expect(peekRetainedScroll(a)).toBe(120);
        expect(peekRetainedScroll(b)).toBe(40);
    });

    it("queue scroll for Work Unit A vs B are independent (A→B→A restores A)", () => {
        const a = queueScrollScope("org1", "wuA", "v");
        const b = queueScrollScope("org1", "wuB", "v");
        putRetainedScroll(a, 300);
        putRetainedScroll(b, 10);
        expect(peekRetainedScroll(a)).toBe(300); // returning to A restores A's place
    });

    it("focus panel scroll is per (org, record)", () => {
        const r1 = focusPanelScrollScope("org1", "rec1");
        const r2 = focusPanelScrollScope("org1", "rec2");
        expect(r1).not.toBe(r2);
        putRetainedScroll(r1, 88);
        expect(peekRetainedScroll(r2)).toBeNull();
    });

    it("workspace scroll is per (org, site scope)", () => {
        expect(workspaceScrollScope("org1", "siteA")).not.toBe(workspaceScrollScope("org1", "siteB"));
    });

    it("org isolation — the same work view under a different org is a different scope", () => {
        expect(queueScrollScope("org1", "wu1", "v")).not.toBe(queueScrollScope("org2", "wu1", "v"));
    });
});

describe("write hygiene", () => {
    it("ignores negative / non-finite offsets, rounds fractional", () => {
        const s = queueScrollScope("o", "w", "v");
        putRetainedScroll(s, -5);
        expect(peekRetainedScroll(s)).toBeNull();
        putRetainedScroll(s, Number.NaN);
        expect(peekRetainedScroll(s)).toBeNull();
        putRetainedScroll(s, 42.7);
        expect(peekRetainedScroll(s)).toBe(43);
    });
});

describe("org / principal / permission change flushes retained scroll", () => {
    it("a scope change from a prior scope clears retained scroll (no restore across org change)", () => {
        // Establish an initial scope (first mount — must NOT flush).
        setCurrentWorkspaceScope({ orgId: "org1", userId: "u1", scopeFingerprint: "scope:1" });
        const s = queueScrollScope("org1", "wu1", "v");
        putRetainedScroll(s, 200);
        expect(peekRetainedScroll(s)).toBe(200);

        // Permission/access-scope change (same org+user, different fingerprint) → flush.
        setCurrentWorkspaceScope({ orgId: "org1", userId: "u1", scopeFingerprint: "scope:2" });
        expect(peekRetainedScroll(s)).toBeNull();
    });

    it("an org change clears retained scroll", () => {
        setCurrentWorkspaceScope({ orgId: "org1", userId: "u1", scopeFingerprint: "scope:1" });
        const s = queueScrollScope("org1", "wu1", "v");
        putRetainedScroll(s, 150);
        setCurrentWorkspaceScope({ orgId: "org2", userId: "u1", scopeFingerprint: "scope:1" });
        expect(peekRetainedScroll(s)).toBeNull();
    });

    it("the initial null→scope set does NOT flush (same session mount retains)", () => {
        // Simulate a fresh module state: set scope to null then to a real scope.
        setCurrentWorkspaceScope({ orgId: null, userId: null, scopeFingerprint: null });
        const s = queueScrollScope("org9", "wu9", "v");
        putRetainedScroll(s, 77);
        setCurrentWorkspaceScope({ orgId: "org9", userId: "u9", scopeFingerprint: "scope:9" });
        expect(peekRetainedScroll(s)).toBe(77); // retained across the initial mount
    });
});
