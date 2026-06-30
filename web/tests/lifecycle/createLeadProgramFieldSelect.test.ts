import { describe, expect, it } from "vitest";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";
import { gatherFieldsFromActionIntakeSpec } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";

const enrollmentLeadMetadata = {
    lifecycle_builder_stage_field_rules_v1: {
        version: 1,
        by_stage_key: {
            lead: {
                required_rule_ids: ["child:program_interest", "child:classroom", "child:location"],
                recommended_rule_ids: [],
            },
        },
    },
};

describe("Create Lead intake — Program field is a location-aware select (not free text)", () => {
    const spec = resolveCreateLeadActionIntakeSpec({
        department_id: "dept-1",
        operator_stage: "lead",
        builder_stage_key: "lead",
        department_metadata: enrollmentLeadMetadata,
    });
    const fields = gatherFieldsFromActionIntakeSpec(spec);
    const byKey = Object.fromEntries(fields.map((f) => [f.payload_key, f]));

    it("renders Program as a select using the site_program (location-aware) option source — like Room", () => {
        const program = byKey.child_program;
        expect(program).toBeTruthy();
        expect(program!.value_kind).toBe("select");
        expect(program!.placement_select).toBe("site_program");
    });

    it("keeps Room as a site_room select (regression guard for parity)", () => {
        const room = byKey.child_program_room_cohort_key;
        expect(room!.value_kind).toBe("select");
        expect(room!.placement_select).toBe("site_room");
    });
});
