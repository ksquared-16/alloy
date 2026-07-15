/**
 * Trust Closure — retained operator context (§9) and accurate navigation-mode classification (§10).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    putRetainedWorkView,
    peekRetainedWorkView,
    clearRetainedWorkView,
    clearRetainedOperatorContext,
} from "@/lib/presentation/runtime/workUnitOperatorContext";
import { resolveWorkspaceNavMode } from "@/lib/perf/workspaceNavGraph";

beforeEach(() => clearRetainedOperatorContext());

describe("retained Work View per work unit", () => {
    it("restores the last selected view for the same org + unit", () => {
        putRetainedWorkView("org-1", "wu-1", "attention");
        expect(peekRetainedWorkView("org-1", "wu-1")).toBe("attention");
    });

    it("is isolated by org and by work unit", () => {
        putRetainedWorkView("org-1", "wu-1", "attention");
        expect(peekRetainedWorkView("org-2", "wu-1")).toBeNull();
        expect(peekRetainedWorkView("org-1", "wu-2")).toBeNull();
    });

    it("can be cleared per unit and globally", () => {
        putRetainedWorkView("org-1", "wu-1", "attention");
        putRetainedWorkView("org-1", "wu-2", "new");
        clearRetainedWorkView("org-1", "wu-1");
        expect(peekRetainedWorkView("org-1", "wu-1")).toBeNull();
        expect(peekRetainedWorkView("org-1", "wu-2")).toBe("new");
        clearRetainedOperatorContext();
        expect(peekRetainedWorkView("org-1", "wu-2")).toBeNull();
    });

    it("ignores empty selections", () => {
        putRetainedWorkView("org-1", "wu-1", "");
        expect(peekRetainedWorkView("org-1", "wu-1")).toBeNull();
    });
});

describe("resolveWorkspaceNavMode — cache/prefetch evidence, not slug alone", () => {
    it("cached + seen before → return", () => {
        expect(resolveWorkspaceNavMode({ seenBefore: true, firstSinceLoad: false, hasCachedComposition: true })).toBe("return");
    });
    it("cached + NOT seen before → prefetched (prewarm wrote it ahead of first visit)", () => {
        expect(resolveWorkspaceNavMode({ seenBefore: false, firstSinceLoad: false, hasCachedComposition: true })).toBe("prefetched");
    });
    it("no cache + first nav since page load → cold", () => {
        expect(resolveWorkspaceNavMode({ seenBefore: false, firstSinceLoad: true, hasCachedComposition: false })).toBe("cold");
    });
    it("no cache + soft nav in hydrated app → warm (a remount is not 'warm' just because the slug was seen)", () => {
        expect(resolveWorkspaceNavMode({ seenBefore: true, firstSinceLoad: false, hasCachedComposition: false })).toBe("warm");
    });
});
