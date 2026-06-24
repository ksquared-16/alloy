/**
 * Layout Runtime Polish Sprint 1 — activation audit tests.
 *
 * Proves person/child drawers receive surface-appropriate composition hints
 * (not lead hints) when the v2 composition shell is inactive.
 */

import { describe, expect, it } from "vitest";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    layoutRuntimeCompositionHintsProfile,
    resolveDrawerLayoutRuntimeCompositionHints,
} from "@/lib/layout/runtime/resolveDrawerLayoutRuntimeCompositionHints";

describe("layout runtime polish activation", () => {
    it("person drawer fallback uses person hints, not lead hints", () => {
        const doc = {
            ...buildPersonDrawerDefaultDoc(),
            metadata: { template: "legacy_person_layout" },
            sections: buildPersonDrawerDefaultDoc().sections.filter(
                (section) => section.key !== "household_relationships",
            ),
        };
        const hints = resolveDrawerLayoutRuntimeCompositionHints({
            surface: "person_drawer_overview",
            doc,
            honorLayoutDocBlocks: true,
        });
        expect(hints.personOverviewComposition).toBe(true);
        expect(hints.personConnectedChildrenCardList).toBe(true);
        expect(hints.compositionSectionSurface).toBe(true);
        expect(layoutRuntimeCompositionHintsProfile(hints)).toBe("person");
    });

    it("lead drawer keeps lead hints", () => {
        const hints = resolveDrawerLayoutRuntimeCompositionHints({
            surface: "opportunity_drawer_overview",
            doc: buildLeadDrawerDefaultDoc(),
            honorLayoutDocBlocks: true,
        });
        expect(layoutRuntimeCompositionHintsProfile(hints)).toBe("lead");
        expect(hints.personOverviewComposition).toBeUndefined();
    });

    it("person v2 doc activates person shell profile markers", () => {
        const doc = buildPersonDrawerDefaultDoc();
        expect(doc.metadata?.template).toBe("person_drawer_v2");
        const hints = resolveDrawerLayoutRuntimeCompositionHints({
            surface: "person_drawer_overview",
            doc,
            honorLayoutDocBlocks: true,
        });
        expect(layoutRuntimeCompositionHintsProfile(hints)).toBe("person");
    });
});
