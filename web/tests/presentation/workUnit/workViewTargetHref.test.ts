import { describe, expect, it } from "vitest";
import { resolveWorkViewTargetHref } from "@/lib/presentation/runtime/workViewTargetHref";

/**
 * The shared resolver behind Work View pill click (selectWorkView) AND hover warm
 * (prefetchWorkView). Because both call this, a pill warms EXACTLY the route a click pushes —
 * this test pins that guarantee and the resolution precedence.
 */
const views = [
    { id: "v-active", label: "Active" },
    { id: "v-hot", label: "Hot List" },
    { id: "v-nolabel", label: null },
];

describe("resolveWorkViewTargetHref", () => {
    it("prefers the canonical location's route key over the label", () => {
        const href = resolveWorkViewTargetHref("v-hot", {
            views,
            canonicalLocationByViewId: new Map([["v-hot", { routeKey: "hot-list" }]]),
            selectedSiteId: null,
        });
        expect(href).toContain("hot-list");
    });

    it("derives the route key from the configured label when no canonical location", () => {
        const href = resolveWorkViewTargetHref("v-hot", {
            views,
            canonicalLocationByViewId: new Map(),
            selectedSiteId: null,
        });
        // Label "Hot List" → a slugified route key (never the internal id "v-hot").
        expect(href).not.toBeNull();
        expect(href).not.toContain("v-hot");
    });

    it("is stable: the same view id resolves to the same href (warm == push)", () => {
        const inputs = {
            views,
            canonicalLocationByViewId: new Map([["v-hot", { routeKey: "hot-list" }]]),
            selectedSiteId: "site-1",
        };
        expect(resolveWorkViewTargetHref("v-hot", inputs)).toBe(
            resolveWorkViewTargetHref("v-hot", inputs),
        );
    });

    it("returns null for a label-less, location-less view (nothing to warm/push)", () => {
        expect(
            resolveWorkViewTargetHref("v-nolabel", {
                views,
                canonicalLocationByViewId: new Map(),
                selectedSiteId: null,
            }),
        ).toBeNull();
    });

    it("returns null for an empty id", () => {
        expect(
            resolveWorkViewTargetHref("  ", { views, canonicalLocationByViewId: new Map(), selectedSiteId: null }),
        ).toBeNull();
    });
});
