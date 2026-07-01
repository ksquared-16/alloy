/**
 * Effective layout doc fallback tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { resolveEffectiveProductionLayoutDoc } from "@/lib/layout/runtime/resolveEffectiveProductionLayoutDoc";

describe("resolveEffectiveProductionLayoutDoc", () => {
    it("falls back to builtin lead drawer when org doc has no production items", () => {
        const result = resolveEffectiveProductionLayoutDoc({
            doc: {
                formatVersion: 1,
                surface: "drawer",
                entityType: "opportunities",
                sections: [],
            },
            source: "org",
            entityType: "opportunities",
            surface: "drawer",
        });
        expect(result.usedFallback).toBe(true);
        expect(result.doc.sections.length).toBeGreaterThan(0);
        expect(result.source).toBe("builtin_fallback");
    });

    it("keeps renderable org doc when valid", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = resolveEffectiveProductionLayoutDoc({
            doc,
            source: "org",
            layoutKey: "lead_drawer_v2",
            entityType: "opportunities",
            surface: "drawer",
        });
        expect(result.usedFallback).toBe(false);
        expect(result.source).toBe("org");
    });
});
