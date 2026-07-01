/**
 * Patch 20 — Child drawer enrollment/care workspace composition.
 */

import { describe, expect, it } from "vitest";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { buildProofChildRecord } from "@/lib/layout/runtime/buildProofChildRecord";
import {
    CHILD_OVERVIEW_SECTION_KEYS,
    CHILD_OVERVIEW_SHELL_GRID,
    COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY,
    DEFAULT_CHILD_FAMILY_PRIMARY_COLUMN_REFS,
    partitionChildOverviewBodySections,
    readCompositionPrimaryColumnRefs,
    shouldUseChildOverviewComposition,
    sliceLayoutDocSections,
    summarizeChildDrawerFamilyStrip,
} from "@/lib/layout/runtime/childOverviewComposition";
import { resolveChildDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolveChildDrawerHeaderContext";
import { resolveChildOverviewRightRailSections } from "@/lib/layout/runtime/resolveChildOverviewRightRailSections";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";
import { buildChildLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildChildLayoutRuntimeRecordFromVm";

describe("childOverviewComposition", () => {
    it("activates for child_drawer_v2 template", () => {
        const doc = buildChildDrawerDefaultDoc();
        expect(shouldUseChildOverviewComposition(doc)).toBe(true);
        expect(doc.metadata?.template).toBe("child_drawer_v2");
    });

    it("partitions v2 body sections into enrollment/care slots", () => {
        const doc = buildChildDrawerDefaultDoc();
        const slots = partitionChildOverviewBodySections(doc);
        expect(slots.program?.key).toBe(CHILD_OVERVIEW_SECTION_KEYS.program);
        expect(slots.family?.key).toBe(CHILD_OVERVIEW_SECTION_KEYS.family);
        expect(slots.schedule?.key).toBe(CHILD_OVERVIEW_SECTION_KEYS.schedule);
        expect(slots.activity?.key).toBe(CHILD_OVERVIEW_SECTION_KEYS.activity);
        expect(slots.notes?.key).toBe(CHILD_OVERVIEW_SECTION_KEYS.notes);
        expect(slots.documents?.key).toBe(CHILD_OVERVIEW_SECTION_KEYS.documents);
        expect(slots.overflow).toEqual([]);
    });

    it("splits child_summary into shell summary strip", () => {
        const doc = buildChildDrawerDefaultDoc();
        const zones = splitDrawerLayoutDocShellZones(doc, "child");
        expect(zones.summarySectionKeys).toEqual(["child_summary"]);
        expect(zones.bodySectionKeys).toContain("program_enrollment");
        expect(zones.bodySectionKeys).toContain("family_relationships");
    });

    it("reads primary column refs from family table metadata", () => {
        const doc = buildChildDrawerDefaultDoc();
        const familySection = doc.sections.find((s) => s.key === CHILD_OVERVIEW_SECTION_KEYS.family);
        const tableItem = familySection?.rows[1]?.columns[0]?.items[0];
        expect(tableItem).toBeTruthy();
        const refs = readCompositionPrimaryColumnRefs(tableItem!);
        expect(refs).toEqual([...DEFAULT_CHILD_FAMILY_PRIMARY_COLUMN_REFS]);
        expect(tableItem!.metadata?.[COMPOSITION_PRIMARY_COLUMN_REFS_METADATA_KEY]).toBeDefined();
    });

    it("defines shell grid placement constants", () => {
        expect(
            CHILD_OVERVIEW_SHELL_GRID.family + CHILD_OVERVIEW_SHELL_GRID.program + CHILD_OVERVIEW_SHELL_GRID.rightRail,
        ).toBe(12);
    });

    it("summarizes family strip from family_adults rows", () => {
        const record = buildProofChildRecord();
        const summary = summarizeChildDrawerFamilyStrip(record);
        expect(summary.count).toBe(1);
        expect(summary.label).toMatch(/adult/i);
    });

    it("orders right rail sections by metadata priority", () => {
        const doc = buildChildDrawerDefaultDoc();
        const slots = partitionChildOverviewBodySections(doc);
        const record = buildProofChildRecord();
        const rail = resolveChildOverviewRightRailSections(slots, record);
        expect(rail.map((s) => s.key)).toEqual(["documents", "notes_communication", "recent_activity"]);
    });

    it("slices doc sections for slot rendering", () => {
        const doc = buildChildDrawerDefaultDoc();
        const slice = sliceLayoutDocSections(doc, [CHILD_OVERVIEW_SECTION_KEYS.program]);
        expect(slice.sections).toHaveLength(1);
        expect(slice.sections[0]?.key).toBe("program_enrollment");
    });
});

describe("child drawer resolvers", () => {
    it("builds command header meta from age, household, and program fields", () => {
        const record = buildProofChildRecord();
        const meta = resolveChildDrawerCommandHeaderMeta(record);
        expect(meta.ageDobRow).toContain("Infant");
        expect(meta.householdName).toBe("Johnson Household");
        expect(meta.programRow).toContain("Infant Full Day");
    });

    it("maps VM household adults into family_adults runtime rows", () => {
        const record = buildChildLayoutRuntimeRecordFromVm({
            personId: "child-1",
            vmRecord: {
                display_name: "Riley Brooks",
                _household_context: [{ customer_id: "cust-1", customer_name: "Johnson Household" }],
                _household_adult_links: [
                    {
                        person_id: "person-1",
                        display_name: "Jamie Johnson",
                        role_label: "Primary contact",
                        customer_id: "cust-1",
                        is_primary: true,
                        is_household_primary_contact: true,
                    },
                ],
                _enrollment_mirror: [
                    {
                        id: "em-1",
                        opportunity_id: "opp-1",
                        customer_member_id: "cm-1",
                        program_label: "Infant Full Day",
                        room_label: "Nest",
                        outcome_status_label: "Waitlisted",
                    },
                ],
            },
        });

        expect(record["customer.household_name"]).toBe("Johnson Household");
        expect(record["inquiry_child.program"]).toBe("Infant Full Day");
        expect(record["inquiry_child.program_room_cohort_key"]).toBe("Nest");
        const adults = record.family_adults as Record<string, unknown>[];
        expect(adults).toHaveLength(1);
        expect(adults[0]?.["person.primary_contact_name"]).toBe("Jamie Johnson");
        expect(adults[0]?.["person.household_role"]).toBe("Primary contact");
    });
});
