/**
 * Visual Layout Configuration Builder — Phase 5.8 tests.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    addLayoutBlockToSection,
    isLayoutEditorBlockRuntimeEffective,
    validateOpportunityDrawerLayoutBlocks,
} from "@/lib/layout/layoutEditorBlockRegistry";
import { patchLayoutBlockContactRole } from "@/lib/layout/layoutEditorBlockRegistry";
import { readLayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import { LAYOUT_LINK_BEHAVIOR_LABELS } from "@/lib/layout/layoutEditorDisplayConfig";
import {
    leadOverviewVisualEditorCompositionHints,
} from "@/lib/layout/runtime/leadOverviewComposition";
import {
    resolveLeadEnrollmentRowTemplatePresentation,
    shouldApplyLeadEnrollmentRowTemplatePresentation,
} from "@/lib/layout/runtime/resolveLeadEnrollmentRowTemplatePresentation";
import {
    shouldHonorLayoutDocHouseholdBlocks,
    shouldUseDrawerHouseholdProfileSubstitution,
} from "@/lib/layout/runtime/resolveLayoutEditorHouseholdRendering";
import { validateOpportunityDrawerLayoutDoc } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { writeLayoutEditorRowTemplateConfig } from "@/lib/layout/layoutEditorRowTemplateConfig";

const root = resolve(__dirname, "../..");

describe("household runtime substitution", () => {
    it("honors LayoutDoc blocks when visual config or editor preview is active", () => {
        expect(
            shouldHonorLayoutDocHouseholdBlocks({
                sectionKey: "household_contact",
                opportunityEntityLayoutsVisualConfig: true,
            }),
        ).toBe(true);
        expect(
            shouldHonorLayoutDocHouseholdBlocks({
                sectionKey: "household_contact",
                honorLayoutDocBlocks: true,
            }),
        ).toBe(true);
        expect(
            shouldUseDrawerHouseholdProfileSubstitution({
                sectionKey: "household_contact",
                compositionSectionSurface: true,
                operatorSurfaces: true,
                opportunityEntityLayoutsVisualConfig: true,
            }),
        ).toBe(false);
    });

    it("uses visual editor composition hints with honorLayoutDocBlocks", () => {
        expect(leadOverviewVisualEditorCompositionHints().honorLayoutDocBlocks).toBe(true);
    });
});

describe("child row template runtime adoption", () => {
    it("derives card list presentation from row template metadata", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const item = doc.sections.find((s) => s.key === "children_enrollment")?.rows[0]?.columns[0]?.items[0];
        expect(item?.kind).toBe("related_list");
        item!.metadata = writeLayoutEditorRowTemplateConfig(item!.metadata, {
            layoutMode: "compact",
            actions: ["open_child_drawer", "edit_enrollment", "open_schedule"],
            display: { avatar: false, statusPill: false, secondaryMetadata: true },
        });
        expect(
            shouldApplyLeadEnrollmentRowTemplatePresentation(item!, { honorLayoutDocBlocks: true }),
        ).toBe(true);
        const presentation = resolveLeadEnrollmentRowTemplatePresentation(item!);
        expect(presentation.useCardList).toBe(true);
        expect(presentation.showAvatar).toBe(false);
        expect(presentation.showStatusPill).toBe(false);
        expect(presentation.enabledActions.has("edit_enrollment")).toBe(true);
        expect(presentation.unsupportedActions).toContain("open_schedule");
    });

    it("uses detailed grid when row layout mode is detailed", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const item = doc.sections.find((s) => s.key === "children_enrollment")?.rows[0]?.columns[0]?.items[0]!;
        item.metadata = writeLayoutEditorRowTemplateConfig(item.metadata, {
            layoutMode: "detailed",
            actions: ["open_child_drawer"],
            display: { avatar: true, statusPill: true, secondaryMetadata: true },
        });
        const presentation = resolveLeadEnrollmentRowTemplatePresentation(item);
        expect(presentation.useDetailedGrid).toBe(true);
        expect(presentation.useCardList).toBe(false);
    });
});

describe("block runtime validity", () => {
    it("rejects duplicate primary contact cards", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const result = addLayoutBlockToSection(doc, "household_contact", "contact_primary");
        expect(result.ok, result.ok ? "" : result.error).toBe(false);
        expect(validateOpportunityDrawerLayoutBlocks(doc)).toHaveLength(0);
    });

    it("marks preview-only templates in registry", () => {
        expect(isLayoutEditorBlockRuntimeEffective("contact_secondary")).toBe(true);
        expect(isLayoutEditorBlockRuntimeEffective("contact_custom")).toBe(true);
        expect(isLayoutEditorBlockRuntimeEffective("address_card")).toBe(false);
    });

    it("updates secondary role field refs when role changes", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const contact = doc.sections
            .find((s) => s.key === "household_contact")
            ?.rows[0]?.columns[1]?.items.find((it) => it.kind === "field_group");
        const next = patchLayoutBlockContactRole(doc, "household_contact", contact!.id, "secondary");
        const updated = next.sections
            .find((s) => s.key === "household_contact")
            ?.rows[0]?.columns[1]?.items.find((it) => it.id === contact!.id);
        expect(readLayoutEditorContactRole(updated?.metadata)).toBe("secondary");
    });
});

describe("inline editing UX", () => {
    it("closes field settings with Done without toggling selection handler", () => {
        const rowEditor = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutSectionRowEditor.tsx"),
            "utf8",
        );
        expect(rowEditor).toContain("onClose={() => onSelectItemId(null)}");
    });
});

describe("link behavior labels", () => {
    it("uses human-readable link behavior labels", () => {
        // Retired, and labelled so: the value stays for published layouts, but an author must not
        // read it as an offer.
        expect(LAYOUT_LINK_BEHAVIOR_LABELS.open_drawer).toBe("Open record (retired)");
        expect(LAYOUT_LINK_BEHAVIOR_LABELS.open_record).toBe("Link to record");
    });
});

describe("layout validation integration", () => {
    it("includes block validation in opportunity drawer doc validation", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const duplicate = addLayoutBlockToSection(doc, "household_contact", "contact_secondary");
        expect(duplicate.ok).toBe(true);
        if (!duplicate.ok) return;
        const forcedPrimaryDuplicate = {
            ...duplicate.doc,
            sections: duplicate.doc.sections.map((section) =>
                section.key !== "household_contact" ? section : {
                    ...section,
                    rows: section.rows.map((row) => ({
                        ...row,
                        columns: row.columns.map((col) => ({
                            ...col,
                            items: [
                                ...col.items,
                                {
                                    ...(col.items.find((it) => it.kind === "field_group" && it.refKey === "contact_block") ?? col.items[0]!),
                                    id: "duplicate-primary",
                                    metadata: {
                                        layoutEditorContactRole: "primary",
                                        layoutEditorBlockTemplate: "contact_primary",
                                    },
                                },
                            ],
                        })),
                    })),
                },
            ),
        };
        const validation = validateOpportunityDrawerLayoutDoc(forcedPrimaryDuplicate);
        expect(validation.ok).toBe(false);
        expect(validation.errors.some((e) => e.includes("Primary Contact Card"))).toBe(true);
    });
});

describe("runtime wiring", () => {
    it("routes household rendering through parity helper in runtime plan view", () => {
        const runtime = readFileSync(resolve(root, "components/layout/LayoutRuntimePlanView.tsx"), "utf8");
        expect(runtime).toContain("shouldUseDrawerHouseholdProfileSubstitution");
        expect(runtime).toContain("resolveLeadEnrollmentRowTemplatePresentation");
    });

    it("passes row template props into enrollment card list", () => {
        const cardList = readFileSync(resolve(root, "components/layout/lead/LeadEnrollmentCardList.tsx"), "utf8");
        expect(cardList).toContain("rowTemplate");
        expect(cardList).toContain("showStatusPill");
        expect(cardList).toContain("showAvatar");
    });
});
