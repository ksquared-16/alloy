import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { personDrawerChildLeadPillLabel } from "@/lib/admin/person/personDrawerChildLeadPill";
import {
    PERSON_DRAWER_EDIT_PLACEMENT_ON_LEAD_LABEL,
    personRecordHasPersonLevelPlacementFields,
    resolvePersonDrawerChildPlacementFromRecord,
} from "@/lib/admin/person/personDrawerChildPlacementContext";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";
import { personRecordHasParentLevelPlacementFields } from "@/lib/admin/person/personDrawerLocationCategoryOwnership";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import { resolveChildHouseholdCardLines } from "@/lib/admin/person/personDrawerLocationCategoryOwnership";

const childMirrorRecord = {
    id: "child-1",
    first_name: "Mia",
    last_name: "Mitchell",
    _enrollment_mirror: [
        {
            id: "ocm-1",
            opportunity_id: "opp-1",
            opportunity_name: "Family inquiry",
            opportunity_status_label: "Family inquiry",
            customer_member_id: "m-mia",
            program_label: "Preschool",
            location_label: "North Campus",
            room_label: "Room 3",
        },
    ],
    _enrollment_opportunities: [],
};

describe("child placement ownership (OCM / enrollment mirror)", () => {
    it("header summary reads program and site location from mirror only", () => {
        const placement = resolvePersonDrawerChildPlacementFromRecord(childMirrorRecord);
        expect(placement.source).toBe("enrollment_mirror");
        expect(placement.program_label).toBe("Preschool");
        expect(placement.location_label).toBe("North Campus");
        expect(placement.room_label).toBe("Room 3");
        expect(placement.primary_ocm_id).toBe("ocm-1");
        expect(placement.primary_opportunity_id).toBe("opp-1");

        const summary = resolvePersonDrawerChildSummaryModel(childMirrorRecord);
        expect(summary.program_label).toBe("Preschool");
        expect(summary.location_label).toBe("North Campus");
        expect(summary.status_label).toBe("Family Lead");
    });

    it("lead pill uses Lead: {status} without placeholder when status missing", () => {
        expect(personDrawerChildLeadPillLabel("Family inquiry", null)).toBe("Lead: Family Lead");
        expect(personDrawerChildLeadPillLabel(null, null)).toBe("Lead: Open");
        const sparse = resolvePersonDrawerChildPlacementFromRecord({
            _enrollment_mirror: [],
            _enrollment_opportunities: [],
        });
        expect(sparse.program_label).toBeNull();
        expect(sparse.location_label).toBeNull();
    });

    it("household child row shows age, program, and site from mirror", () => {
        const record = {
            id: "parent-1",
            _household_context: [{ customer_id: "c1", customer_name: "Mitchell" }],
            _household_child_links: [
                {
                    customer_member_id: "m-mia",
                    customer_id: "c1",
                    person_id: "child-1",
                    display_name: "Mia Mitchell",
                    age_label: "3 yrs",
                },
            ],
            _household_adult_links: [],
            _enrollment_mirror: childMirrorRecord._enrollment_mirror,
        };
        const child = resolvePersonDrawerHouseholdModel(record, { viewing_person_id: "parent-1" })
            .groups[0]?.children[0];
        const lines = resolveChildHouseholdCardLines(child!);
        expect(lines.placement_line).toBe("3 yrs · Preschool · North Campus");
        expect(lines.classroom_line).toBe("Room 3");
    });

    it("does not treat person-root placement fields as SoT", () => {
        expect(
            personRecordHasPersonLevelPlacementFields({
                location_id: "loc-1",
                program_label: "X",
            })
        ).toBe(true);
        const withPersonFields = {
            ...childMirrorRecord,
            location_id: "bad",
            program_label: "bad",
        };
        const placement = resolvePersonDrawerChildPlacementFromRecord(withPersonFields);
        expect(placement.program_label).toBe("Preschool");
        expect(placement.location_label).toBe("North Campus");
    });

    it("parent drawer stays location-agnostic on person record", () => {
        expect(
            personRecordHasParentLevelPlacementFields({
                location_id: "loc-1",
                program_label: "Pre-K",
            })
        ).toBe(true);
    });

    it("edit placement opens Family Lead from header — not persons PATCH", () => {
        const header = readFileSync(
            resolve(process.cwd(), "components/admin/entity/PersonDrawerChildHeaderExecutive.tsx"),
            "utf8"
        );
        expect(header).toContain("data-person-drawer-edit-placement-on-lead");
        expect(header).toContain("onOpenLeadOpportunity");
        expect(header).not.toContain("patchPersonDrawerFields");
    });
});
