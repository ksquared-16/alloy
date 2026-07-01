/**
 * Patch 8 — Lead overview composition mapping and activation.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY,
    DEFAULT_LEAD_ENROLLMENT_COMPOSITION_PRIMARY_COLUMN_REFS,
    filterRelatedListColumnsForComposition,
    LEAD_OVERVIEW_ENROLLMENT_MAX_VISIBLE_ROWS,
    LEAD_OVERVIEW_SECTION_KEYS,
    LEAD_OVERVIEW_SHELL_GRID,
    partitionLeadOverviewBodySections,
    readCompositionPrimaryColumnRefs,
    shouldUseLeadOverviewComposition,
    sliceLayoutDocSections,
    summarizeLeadDrawerChildrenStrip,
} from "@/lib/layout/runtime/leadOverviewComposition";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";

describe("leadOverviewComposition", () => {
    it("activates for lead_drawer_v2 template", () => {
        const doc = buildLeadDrawerDefaultDoc();
        expect(shouldUseLeadOverviewComposition(doc)).toBe(true);
    });

    it("partitions v2 body sections into composition slots", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const slots = partitionLeadOverviewBodySections(doc);
        expect(slots.household?.key).toBe(LEAD_OVERVIEW_SECTION_KEYS.household);
        expect(slots.enrollment?.key).toBe(LEAD_OVERVIEW_SECTION_KEYS.enrollment);
        expect(slots.activity?.key).toBe(LEAD_OVERVIEW_SECTION_KEYS.activity);
        expect(slots.notes?.key).toBe(LEAD_OVERVIEW_SECTION_KEYS.notes);
        expect(slots.leadSource?.key).toBe(LEAD_OVERVIEW_SECTION_KEYS.leadSource);
        expect(slots.overflow).toEqual([]);
    });

    it("slices doc sections for slot rendering", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const slice = sliceLayoutDocSections(doc, [LEAD_OVERVIEW_SECTION_KEYS.household]);
        expect(slice.sections).toHaveLength(1);
        expect(slice.sections[0]?.key).toBe("household_contact");
    });

    it("summarizes children strip as count/status only", () => {
        const record = buildProofOpportunityRecord();
        const summary = summarizeLeadDrawerChildrenStrip(record);
        expect(summary.count).toBeGreaterThan(0);
        expect(summary.label).toMatch(/child/i);
    });

    it("caps enrollment rows at five in composition hints constant", () => {
        expect(LEAD_OVERVIEW_ENROLLMENT_MAX_VISIBLE_ROWS).toBe(5);
    });

    it("defines shell grid placement constants (not field content)", () => {
        expect(LEAD_OVERVIEW_SHELL_GRID.household + LEAD_OVERVIEW_SHELL_GRID.enrollment + LEAD_OVERVIEW_SHELL_GRID.rightRail).toBe(12);
    });

    it("routes unknown sections to overflow fallback", () => {
        const doc = buildLeadDrawerDefaultDoc();
        doc.sections.push({
            id: "custom-section",
            key: "custom_follow_up",
            title: "Custom follow up",
            rows: [],
        });
        const slots = partitionLeadOverviewBodySections(doc);
        expect(slots.overflow.map((s) => s.key)).toContain("custom_follow_up");
    });

    it("reads primary column refs from layout item metadata", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const enrollmentSection = doc.sections.find((s) => s.key === LEAD_OVERVIEW_SECTION_KEYS.enrollment);
        const tableItem = enrollmentSection?.rows[0]?.columns[0]?.items[0];
        expect(tableItem).toBeTruthy();
        const refs = readCompositionPrimaryColumnRefs(tableItem!);
        expect(refs).toEqual([...DEFAULT_LEAD_ENROLLMENT_COMPOSITION_PRIMARY_COLUMN_REFS]);
        expect(tableItem!.metadata?.[COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY]).toBeDefined();
    });

    it("filters columns from layout metadata, not hardcoded refs", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const enrollmentSection = doc.sections.find((s) => s.key === LEAD_OVERVIEW_SECTION_KEYS.enrollment);
        const tableItem = enrollmentSection!.rows[0]!.columns[0]!.items[0]!;
        const columns = (tableItem as { columns: { refKey: string }[] }).columns;
        const filtered = filterRelatedListColumnsForComposition(columns, tableItem, true);
        expect(filtered.map((c) => c.refKey)).toEqual([...DEFAULT_LEAD_ENROLLMENT_COMPOSITION_PRIMARY_COLUMN_REFS]);
        expect(filtered.some((c) => c.refKey === "child.dob_age")).toBe(true);
        expect(filtered.length).toBeLessThan(columns.length);
    });

    it("shows all layout columns when metadata is absent", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const enrollmentSection = doc.sections.find((s) => s.key === LEAD_OVERVIEW_SECTION_KEYS.enrollment);
        const tableItem = { ...(enrollmentSection!.rows[0]!.columns[0]!.items[0]!), metadata: {} };
        const columns = (tableItem as { columns: { refKey: string }[] }).columns;
        expect(filterRelatedListColumnsForComposition(columns, tableItem, true)).toEqual(columns);
    });
});
