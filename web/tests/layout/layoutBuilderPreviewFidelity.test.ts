/**
 * Sprint 5.18F — Experience Builder placement + preview fidelity tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import {
    applyExperienceBuilderPlacement,
    moveSectionAfterSelected,
    resolveExperienceBuilderPlacementZone,
} from "@/lib/layout/layoutBuilderPlacement";
import { readCardWidthFraction } from "@/lib/layout/layoutBuilderCardWidth";
import { readSectionRowSpan } from "@/lib/layout/layoutEditorSectionLayout";
import {
    applyDisplayConfigToColumnPatch,
    readLayoutEditorDisplayConfig,
    typographyIntentClass,
} from "@/lib/layout/layoutEditorDisplayConfig";
import {
    readLayoutEditorRelatedListConfig,
    syncRelatedListSectionToItem,
    writeLayoutEditorRelatedListConfig,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { patchLayoutEditorFieldDisplay } from "@/lib/layout/layoutEditorCompositionModel";
import { renameSectionTitle } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { resolveOpportunityDrawerSectionZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { formatLayoutRuntimeCompactRowLine } from "@/lib/layout/runtime/formatLayoutRuntimeCompactRowLine";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import { resolveChildRowTemplateRowLayout } from "@/lib/layout/runtime/resolveChildRowTemplateRowLayout";
import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

describe("layoutBuilderPreviewFidelity", () => {
    it("places KPI tile after selected fields card in the same zone", () => {
        const base = buildLeadDrawerDefaultDoc();
        const fields = createExperienceBuilderCard(base, {
            title: "Enrollment Details",
            widthKey: "quarter",
            cardType: "fields",
            placementIntent: "main",
        });
        const kpi = createExperienceBuilderCard(fields.doc, {
            title: "Open Tasks",
            widthKey: "three_quarter",
            cardType: "widget",
            widgetKey: "tasks",
            placementIntent: "after_selected",
            afterSectionKey: fields.sectionKey,
        });

        const fieldsSection = kpi.doc.sections.find((s) => s.key === fields.sectionKey)!;
        const kpiSection = kpi.doc.sections.find((s) => s.key === kpi.sectionKey)!;
        expect(resolveOpportunityDrawerSectionZone(fieldsSection)).toBe("main");
        expect(resolveOpportunityDrawerSectionZone(kpiSection)).toBe("main");
        expect(readCardWidthFraction(fieldsSection)).toBe("quarter");
        expect(readCardWidthFraction(kpiSection)).toBe("three_quarter");

        const fieldsIdx = kpi.doc.sections.findIndex((s) => s.key === fields.sectionKey);
        const kpiIdx = kpi.doc.sections.findIndex((s) => s.key === kpi.sectionKey);
        expect(kpiIdx).toBe(fieldsIdx + 1);
    });

    it("defaults widget placement to selected section zone instead of summary strip", () => {
        const base = buildLeadDrawerDefaultDoc();
        const fields = createExperienceBuilderCard(base, {
            title: "Household",
            widthKey: "full",
            cardType: "fields",
            placementIntent: "main",
        });
        const zone = resolveExperienceBuilderPlacementZone(fields.doc, fields.sectionKey, "after_selected");
        expect(zone).toBe("main");
    });

    it("packs fractional peer cards into the same row group", () => {
        const base = buildLeadDrawerDefaultDoc();
        const fields = createExperienceBuilderCard(base, {
            title: "Fields",
            widthKey: "quarter",
            cardType: "fields",
            placementIntent: "main",
        });
        const kpi = createExperienceBuilderCard(fields.doc, {
            title: "Tasks",
            widthKey: "three_quarter",
            cardType: "widget",
            placementIntent: "after_selected",
            afterSectionKey: fields.sectionKey,
        });
        const fieldsSection = kpi.doc.sections.find((s) => s.key === fields.sectionKey)!;
        const kpiSection = kpi.doc.sections.find((s) => s.key === kpi.sectionKey)!;
        expect(readSectionRowSpan(fieldsSection)).toBe(3);
        expect(readSectionRowSpan(kpiSection)).toBe(9);
    });

    it("renders compact related-list rows from configured child row groups", () => {
        const base = buildLeadDrawerDefaultDoc();
        const list = createExperienceBuilderCard(base, {
            title: "Children",
            widthKey: "full",
            cardType: "related_list",
            placementIntent: "main",
        });
        const section = list.doc.sections.find((s) => s.key === list.sectionKey)!;
        const config = readLayoutEditorRelatedListConfig(section);
        const withRows = syncRelatedListSectionToItem(
            {
                ...list.doc,
                sections: list.doc.sections.map((s) =>
                    s.key === list.sectionKey ?
                        {
                            ...s,
                            metadata: writeLayoutEditorRelatedListConfig(s.metadata, {
                                ...config,
                                presentationMode: "compact",
                                primaryRow: { fields: ["child.first_name", "child.last_name", "child.age"] },
                                secondaryRow: {
                                    fields: ["child.dob_age", "inquiry_child.start_date", "child.status"],
                                },
                                tertiaryRow: { fields: ["child.location", "child.program", "child.room"] },
                            }),
                        }
                    :   s,
                ),
            },
            list.sectionKey,
        );
        const item = withRows.sections
            .find((s) => s.key === list.sectionKey)!
            .rows[0]!
            .columns[0]!
            .items.find((it) => it.kind === "related_list")!;
        const rowLayout = resolveChildRowTemplateRowLayout(item);
        expect(rowLayout).toHaveLength(3);
        expect(rowLayout![0]!.slots.map((c) => c?.refKey)).toEqual([
            "child.first_name",
            "child.last_name",
            "child.age",
        ]);

        const child = (LAYOUT_DRAWER_PREVIEW_RECORD.children as ProofRuntimeRecord[])[0]!;
        const line1 = formatLayoutRuntimeCompactRowLine(child, rowLayout![0]!.slots, 0);
        expect(line1.segments.some((s) => s.value.includes("Avery"))).toBe(true);
        expect(line1.segments.some((s) => s.value.includes("Johnson"))).toBe(true);
        expect(line1.segments.some((s) => s.value.includes("4"))).toBe(true);
    });

    it("persists typography display config on related-list columns", () => {
        const col: LayoutCollectionColumn = {
            label: "Email",
            refKey: "person.primary_email",
        };
        const patch = applyDisplayConfigToColumnPatch(col, { typographyIntent: "secondary" });
        expect(readLayoutEditorDisplayConfig({ metadata: patch.metadata }).typographyIntent).toBe("secondary");
        expect(typographyIntentClass("secondary")).toContain("text-alloy-midnight/70");
    });

    it("applies typography emphasis to field items in builder preview paths", () => {
        const base = buildLeadDrawerDefaultDoc();
        const fields = createExperienceBuilderCard(base, {
            title: "Primary Contact",
            widthKey: "full",
            cardType: "fields",
        });
        const sectionKey = fields.sectionKey;
        const withField = {
            ...fields.doc,
            sections: fields.doc.sections.map((s) =>
                s.key === sectionKey ?
                    {
                        ...s,
                        rows: [
                            {
                                ...s.rows[0]!,
                                columns: [
                                    {
                                        ...s.rows[0]!.columns[0]!,
                                        items: [
                                            {
                                                id: "email-field",
                                                kind: "field" as const,
                                                refKey: "person.primary_email",
                                                label: "Email",
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    }
                :   s,
            ),
        };
        const next = patchLayoutEditorFieldDisplay(
            withField,
            { kind: "field", sectionKey, itemId: "email-field" },
            { typographyIntent: "secondary" },
        );
        const field = next.sections
            .find((s) => s.key === sectionKey)!
            .rows[0]!
            .columns[0]!
            .items[0]!;
        expect(readLayoutEditorDisplayConfig(field).typographyIntent).toBe("secondary");
    });

    it("preserves internal spaces in section and field labels", () => {
        const base = buildLeadDrawerDefaultDoc();
        const sectionKey = base.sections[0]!.key;
        const renamed = renameSectionTitle(base, sectionKey, "Primary Contact");
        expect(renamed.sections.find((s) => s.key === sectionKey)?.title).toBe("Primary Contact");

        const created = createExperienceBuilderCard(base, {
            title: "Primary Contact",
            widthKey: "full",
            cardType: "fields",
        });
        expect(created.doc.sections.find((s) => s.key === created.sectionKey)?.title).toBe("Primary Contact");
    });

    it("moves a new section immediately after the selected section", () => {
        const base = buildLeadDrawerDefaultDoc();
        const first = base.sections[0]!.key;
        const second = base.sections[1]!.key;
        const created = createExperienceBuilderCard(base, {
            title: "Inserted",
            widthKey: "full",
            cardType: "fields",
            placementIntent: "after_selected",
            afterSectionKey: first,
        });
        const idxFirst = created.doc.sections.findIndex((s) => s.key === first);
        const idxNew = created.doc.sections.findIndex((s) => s.key === created.sectionKey);
        const idxSecond = created.doc.sections.findIndex((s) => s.key === second);
        expect(idxNew).toBe(idxFirst + 1);
        expect(idxSecond).toBeGreaterThan(idxNew);

        const moved = moveSectionAfterSelected(created.doc, created.sectionKey, second);
        const idxAfterMove = moved.sections.findIndex((s) => s.key === created.sectionKey);
        expect(idxAfterMove).toBe(moved.sections.findIndex((s) => s.key === second) + 1);
    });

    it("can place explicit zone sections at zone start", () => {
        const base = buildLeadDrawerDefaultDoc();
        const created = createExperienceBuilderCard(base, {
            title: "Rail note",
            widthKey: "full",
            cardType: "text",
            placementIntent: "right_rail",
        });
        const placed = applyExperienceBuilderPlacement(
            created.doc,
            created.sectionKey,
            "right_rail",
            null,
            "right_rail",
        );
        const zoneSections = placed.sections.filter(
            (s) => resolveOpportunityDrawerSectionZone(s) === "right_rail",
        );
        expect(zoneSections[0]?.key).toBe(created.sectionKey);
    });
});
