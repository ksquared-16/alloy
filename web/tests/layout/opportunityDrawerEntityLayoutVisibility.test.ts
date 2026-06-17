/**
 * Phase 4 — opportunity drawer entity_layouts runtime visibility tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import type { LayoutSection } from "@/lib/layout/layoutV2";
import { LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { resolveEffectiveProductionLayoutDoc } from "@/lib/layout/runtime/resolveEffectiveProductionLayoutDoc";
import {
    buildOpportunityDrawerRuntimeSectionVisibilityContext,
    shouldSuppressOpportunityDrawerSectionForEditorHidden,
} from "@/lib/layout/runtime/opportunityDrawerEntityLayoutVisibility";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { PLATFORM_RESERVED_SECTION_KEYS } from "@/lib/layout/surfaceLayoutRegistry";
import { setSectionEditorHidden } from "@/lib/layout/opportunityDrawerLayoutEditorModel";

function withHiddenSection(sectionKey: string): LayoutSection {
    const doc = buildLeadDrawerDefaultDoc();
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section) throw new Error(`missing section ${sectionKey}`);
    return {
        ...section,
        metadata: { ...(section.metadata ?? {}), [LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY]: true },
    };
}

describe("opportunityDrawerEntityLayoutVisibility", () => {
    const record = buildProofOpportunityRecord();

    it("hides registered opportunity sections when adoption is on", () => {
        const activity = withHiddenSection("activity");
        const ctx = buildOpportunityDrawerRuntimeSectionVisibilityContext({}, { adoptionEnabled: true });
        expect(shouldRenderLayoutRuntimeSection(activity, record, ctx)).toBe(false);
    });

    it("does not hide sections when adoption is off", () => {
        const activity = withHiddenSection("activity");
        const ctx = buildOpportunityDrawerRuntimeSectionVisibilityContext({}, { adoptionEnabled: false });
        expect(shouldRenderLayoutRuntimeSection(activity, record, ctx)).toBe(true);
    });

    it("does not hide platform-reserved section keys even with layoutEditorHidden metadata", () => {
        for (const key of PLATFORM_RESERVED_SECTION_KEYS) {
            const section: LayoutSection = {
                id: `sec-${key}`,
                key,
                title: key,
                collapsible: false,
                defaultExpanded: true,
                rows: [],
                metadata: { [LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY]: true },
            };
            expect(shouldSuppressOpportunityDrawerSectionForEditorHidden(section, true)).toBe(false);
        }
    });

    it("does not hide arbitrary unregistered section keys without visual-editor metadata", () => {
        const section: LayoutSection = {
            id: "sec-custom",
            key: "custom_section",
            title: "Custom",
            collapsible: false,
            defaultExpanded: true,
            rows: [],
            metadata: { [LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY]: true },
        };
        expect(shouldSuppressOpportunityDrawerSectionForEditorHidden(section, true)).toBe(false);
    });

    it("hides visual-editor custom sections when layoutEditorHidden is set", () => {
        const section: LayoutSection = {
            id: "sec-custom",
            key: "custom_section_abc",
            title: "",
            collapsible: false,
            defaultExpanded: true,
            rows: [],
            metadata: {
                [LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY]: true,
                createdByVisualEditor: true,
                layoutEditorKpiTile: true,
            },
        };
        expect(shouldSuppressOpportunityDrawerSectionForEditorHidden(section, true)).toBe(true);
    });

    it("treats absent metadata as visible (no throw)", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections.find((s) => s.key === "household_contact")!;
        expect(section.metadata?.[LAYOUT_SECTION_EDITOR_HIDDEN_METADATA_KEY]).toBeUndefined();
        expect(
            shouldRenderLayoutRuntimeSection(section, record, {
                compositionShell: true,
                opportunityEntityLayoutsVisualConfig: true,
            }),
        ).toBe(true);
    });

    it("published layout with layoutEditorHidden suppresses section in runtime resolver", () => {
        let doc = buildLeadDrawerDefaultDoc();
        doc = setSectionEditorHidden(doc, "lead_source", true);
        const parsed = parseLayoutDoc(doc, { inferSurfaceKey: true });
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
        const section = parsed.doc!.sections.find((s) => s.key === "lead_source")!;
        expect(
            shouldRenderLayoutRuntimeSection(section, record, {
                compositionShell: true,
                opportunityEntityLayoutsVisualConfig: true,
            }),
        ).toBe(false);
    });

    it("parseLayoutDoc accepts layoutEditorHidden on registered sections (legacy-compatible metadata)", () => {
        const doc = setSectionEditorHidden(buildLeadDrawerDefaultDoc(), "activity", true);
        const parsed = parseLayoutDoc(doc, { inferSurfaceKey: true });
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
        expect(
            parsed.doc?.sections.find((s) => s.key === "activity")?.metadata?.layoutEditorHidden,
        ).toBe(true);
    });
});

describe("resolveEffectiveProductionLayoutDoc — Phase 4 fallback", () => {
    it("falls back to builtin default when published org doc is empty", () => {
        const result = resolveEffectiveProductionLayoutDoc({
            doc: { formatVersion: 1, surface: "drawer", entityType: "opportunities", sections: [] },
            source: "org",
            entityType: "opportunities",
            surface: "drawer",
        });
        expect(result.usedFallback).toBe(true);
        expect(result.doc.sections.some((s) => s.key === "children_enrollment")).toBe(true);
    });

    it("falls back when org doc has no production-supported items", () => {
        const result = resolveEffectiveProductionLayoutDoc({
            doc: {
                formatVersion: 1,
                surface: "drawer",
                entityType: "opportunities",
                sections: [
                    {
                        id: "empty-sec",
                        key: "household_contact",
                        title: "Empty",
                        collapsible: true,
                        defaultExpanded: true,
                        rows: [],
                    },
                ],
            },
            source: "org",
            entityType: "opportunities",
            surface: "drawer",
        });
        expect(result.usedFallback).toBe(true);
        expect(result.source).toBe("builtin_fallback");
    });
});
