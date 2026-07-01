/**
 * Patch 19 — Person drawer relationship workspace composition.
 */

import { describe, expect, it } from "vitest";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildProofPersonRecord } from "@/lib/layout/runtime/buildProofPersonRecord";
import {
    COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY,
    DEFAULT_PERSON_CONNECTED_CHILDREN_PRIMARY_COLUMN_REFS,
    PERSON_OVERVIEW_CONNECTED_CHILDREN_MAX_VISIBLE_ROWS,
    PERSON_OVERVIEW_SECTION_KEYS,
    PERSON_OVERVIEW_SHELL_GRID,
    partitionPersonOverviewBodySections,
    readCompositionPrimaryColumnRefs,
    shouldUsePersonOverviewComposition,
    sliceLayoutDocSections,
    summarizePersonDrawerChildrenStrip,
} from "@/lib/layout/runtime/personOverviewComposition";
import { resolvePersonActivityPreview } from "@/lib/layout/runtime/resolvePersonActivityPreview";
import { resolvePersonDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolvePersonDrawerHeaderContext";
import { resolvePersonOverviewRightRailSections } from "@/lib/layout/runtime/resolvePersonOverviewRightRailSections";
import { resolvePersonSummaryLastTouch } from "@/lib/layout/runtime/resolvePersonSummaryLastTouch";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";

describe("personOverviewComposition", () => {
    it("activates for person_drawer_v2 template", () => {
        const doc = buildPersonDrawerDefaultDoc();
        expect(shouldUsePersonOverviewComposition(doc)).toBe(true);
        expect(doc.metadata?.template).toBe("person_drawer_v2");
    });

    it("partitions v2 body sections into relationship workspace slots", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const slots = partitionPersonOverviewBodySections(doc);
        expect(slots.household?.key).toBe(PERSON_OVERVIEW_SECTION_KEYS.household);
        expect(slots.children?.key).toBe(PERSON_OVERVIEW_SECTION_KEYS.children);
        expect(slots.contact?.key).toBe(PERSON_OVERVIEW_SECTION_KEYS.contact);
        expect(slots.activity?.key).toBe(PERSON_OVERVIEW_SECTION_KEYS.activity);
        expect(slots.notes?.key).toBe(PERSON_OVERVIEW_SECTION_KEYS.notes);
        expect(slots.documents?.key).toBe(PERSON_OVERVIEW_SECTION_KEYS.documents);
        expect(slots.overflow).toEqual([]);
    });

    it("splits person_summary into shell summary strip", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const zones = splitDrawerLayoutDocShellZones(doc, "person");
        expect(zones.summarySectionKeys).toEqual(["person_summary"]);
        expect(zones.bodySectionKeys).toContain("household_relationships");
        expect(zones.bodySectionKeys).toContain("connected_children");
    });

    it("routes unknown sections to overflow fallback", () => {
        const doc = buildPersonDrawerDefaultDoc();
        doc.sections.push({
            id: "custom-section",
            key: "custom_guardian_notes",
            title: "Custom guardian notes",
            rows: [],
        });
        const slots = partitionPersonOverviewBodySections(doc);
        expect(slots.overflow.map((s) => s.key)).toContain("custom_guardian_notes");
    });

    it("reads primary column refs from connected children metadata", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const childrenSection = doc.sections.find((s) => s.key === PERSON_OVERVIEW_SECTION_KEYS.children);
        const tableItem = childrenSection?.rows[0]?.columns[0]?.items[0];
        expect(tableItem).toBeTruthy();
        const refs = readCompositionPrimaryColumnRefs(tableItem!);
        expect(refs).toEqual([...DEFAULT_PERSON_CONNECTED_CHILDREN_PRIMARY_COLUMN_REFS]);
        expect(tableItem!.metadata?.[COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY]).toBeDefined();
    });

    it("defines shell grid placement constants", () => {
        expect(
            PERSON_OVERVIEW_SHELL_GRID.household
                + PERSON_OVERVIEW_SHELL_GRID.children
                + PERSON_OVERVIEW_SHELL_GRID.rightRail,
        ).toBe(12);
    });

    it("caps connected children rows at five in composition hints constant", () => {
        expect(PERSON_OVERVIEW_CONNECTED_CHILDREN_MAX_VISIBLE_ROWS).toBe(5);
    });

    it("summarizes children strip as count/status only", () => {
        const record = buildProofPersonRecord();
        const summary = summarizePersonDrawerChildrenStrip(record);
        expect(summary.count).toBe(2);
        expect(summary.label).toMatch(/child/i);
    });

    it("slices doc sections for slot rendering", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const slice = sliceLayoutDocSections(doc, [PERSON_OVERVIEW_SECTION_KEYS.household]);
        expect(slice.sections).toHaveLength(1);
        expect(slice.sections[0]?.key).toBe("household_relationships");
    });
});

describe("person drawer resolvers", () => {
    it("builds command header meta from household + contact fields", () => {
        const record = buildProofPersonRecord({
            "person.relationship": "Primary guardian",
            "customer.household_name": "Johnson Household",
            "person.primary_phone": "(555) 234-8901",
            "person.primary_email": "jamie.j@example.com",
        });
        const meta = resolvePersonDrawerCommandHeaderMeta(record);
        expect(meta.relationshipLabel).toBe("Primary guardian");
        expect(meta.householdName).toBe("Johnson Household");
        expect(meta.contactRow).toContain("(555) 234-8901");
        expect(meta.contactRow).toContain("jamie.j@example.com");
    });

    it("resolves last touch from notes before activity", () => {
        const record = buildProofPersonRecord({
            follow_up_notes: "Called about summer enrollment.",
            last_activity_summary: "Older activity",
        });
        const touch = resolvePersonSummaryLastTouch(record);
        expect(touch.kind).toBe("note");
        expect(touch.primaryLine).toContain("summer enrollment");
    });

    it("builds activity preview from real record fields only", () => {
        const record = buildProofPersonRecord({
            follow_up_notes: "Follow-up note",
            created_at: "2026-01-15T10:00:00Z",
        });
        const entries = resolvePersonActivityPreview(record);
        expect(entries.length).toBeGreaterThan(0);
        expect(entries.some((e) => e.kind === "note" || e.kind === "created")).toBe(true);
    });

    it("orders right rail by metadata priority and keeps empty documents visible", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const slots = partitionPersonOverviewBodySections(doc);
        const record = buildProofPersonRecord({
            follow_up_notes: "Called about pickup schedule.",
            last_activity_summary: "Profile updated",
            last_activity_at: "2026-02-01T12:00:00Z",
        });
        const rail = resolvePersonOverviewRightRailSections(slots, record);
        expect(rail.map((s) => s.key)).toEqual(["documents", "notes_communication", "recent_activity"]);
    });
});

describe("person drawer default doc", () => {
    it("includes relationship workspace sections and summary widgets", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const keys = doc.sections.map((s) => s.key);
        expect(keys).toEqual([
            "person_summary",
            "household_relationships",
            "connected_children",
            "contact_information",
            "notes_communication",
            "recent_activity",
            "documents",
        ]);
    });
});
