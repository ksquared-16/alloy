import { describe, expect, it } from "vitest";

import {
    layoutRuntimeSectionCollapseStorageKey,
    patchLayoutDocSectionCollapse,
    patchLayoutSectionCollapseMetadata,
    readLayoutRuntimeSectionCollapseConfig,
} from "@/lib/layout/runtime/layoutRuntimeSectionCollapse";
import type { LayoutSection } from "@/lib/layout/layoutV2";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";

function section(overrides: Partial<LayoutSection> = {}): LayoutSection {
    return {
        id: "sec-1",
        key: "activity",
        title: "Activity",
        rows: [],
        ...overrides,
    };
}

describe("readLayoutRuntimeSectionCollapseConfig", () => {
    it("reads collapsible and defaultExpanded from section fields", () => {
        const config = readLayoutRuntimeSectionCollapseConfig(
            section({ collapsible: true, defaultExpanded: false }),
        );
        expect(config.collapsible).toBe(true);
        expect(config.defaultExpanded).toBe(false);
    });

    it("reads persist and collapsed summary from metadata", () => {
        const config = readLayoutRuntimeSectionCollapseConfig(
            section({
                collapsible: true,
                metadata: {
                    persistCollapseState: true,
                    collapsedSummary: "3 notes",
                },
            }),
        );
        expect(config.persistCollapseState).toBe(true);
        expect(config.collapsedSummary).toBe("3 notes");
    });
});

describe("patchLayoutDocSectionCollapse", () => {
    it("patches section collapse fields on layout doc", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const activityKey = doc.sections.find((s) => s.key === "activity")?.key;
        expect(activityKey).toBeTruthy();
        const next = patchLayoutDocSectionCollapse(doc, activityKey!, {
            collapsible: true,
            defaultExpanded: false,
            persistCollapseState: true,
            collapsedSummary: "Timeline hidden",
        });
        const patched = next.sections.find((s) => s.key === activityKey)!;
        expect(readLayoutRuntimeSectionCollapseConfig(patched)).toMatchObject({
            collapsible: true,
            defaultExpanded: false,
            persistCollapseState: true,
            collapsedSummary: "Timeline hidden",
        });
    });

    it("clears collapsed summary when set to empty", () => {
        const base = patchLayoutSectionCollapseMetadata(section(), {
            collapsedSummary: "Before",
        });
        const cleared = patchLayoutSectionCollapseMetadata(base, { collapsedSummary: "" });
        expect(readLayoutRuntimeSectionCollapseConfig(cleared).collapsedSummary).toBeNull();
    });
});

describe("layoutRuntimeSectionCollapseStorageKey", () => {
    it("scopes session storage by anchor entity and record id", () => {
        expect(
            layoutRuntimeSectionCollapseStorageKey({
                anchorEntity: "person",
                entityId: "person-1",
                sectionKey: "family_relationships",
            }),
        ).toBe("layout-runtime-section-collapse:person:person-1:family_relationships");
    });
});
