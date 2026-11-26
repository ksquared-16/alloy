import { describe, expect, it } from "vitest";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";
import { gatherFieldsFromActionIntakeSpec } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";

/**
 * Issue E — BOS Create Lead intake fields must use the SAME source as the standard Create Lead
 * gather fields (see createLeadPlatformGather). Locks field-source parity so a configured field
 * never silently regresses to a free-text input.
 */
const metadata = {
    lifecycle_builder_stage_field_rules_v1: {
        version: 1,
        by_stage_key: {
            lead: {
                required_rule_ids: [
                    "opportunity:location",
                    "child:program_interest",
                    "child:classroom",
                    "child:desired_schedule",
                    "child:start_date",
                    "person:first_name",
                    "person:last_name",
                    "person:email",
                    "person:phone",
                ],
                recommended_rule_ids: [],
            },
        },
    },
};

describe("Create Lead BOS intake — field source parity with the standard experience", () => {
    const spec = resolveCreateLeadActionIntakeSpec({
        department_id: "dept-1",
        operator_stage: "lead",
        builder_stage_key: "lead",
        department_metadata: metadata,
    });
    const byKey = Object.fromEntries(gatherFieldsFromActionIntakeSpec(spec).map((f) => [f.payload_key, f]));

    it("Location is a canonical site select (placement_select=site)", () => {
        expect(byKey.location_id?.value_kind).toBe("select");
        expect(byKey.location_id?.placement_select).toBe("site");
    });

    it("Program is a location-aware select (placement_select=site_program), never free text", () => {
        expect(byKey.child_program?.value_kind).toBe("select");
        expect(byKey.child_program?.placement_select).toBe("site_program");
    });

    it("Room is a location-aware select (placement_select=site_room)", () => {
        expect(byKey.child_program_room_cohort_key?.value_kind).toBe("select");
        expect(byKey.child_program_room_cohort_key?.placement_select).toBe("site_room");
    });

    it("Schedule is a canonical option-set select (childcare_schedule_type)", () => {
        expect(byKey.child_schedule_type?.value_kind).toBe("select");
        expect(byKey.child_schedule_type?.option_set_key).toBe("childcare_schedule_type");
    });

    it("Desired start is a date; parents are text/email/phone (no placement select)", () => {
        expect(byKey.child_start_date?.value_kind).toBe("date");
        expect(byKey.first_name?.value_kind).toBe("text");
        expect(byKey.last_name?.value_kind).toBe("text");
        expect(byKey.email?.value_kind).toBe("email");
        expect(byKey.phone?.value_kind).toBe("phone");
    });

    it("placement-backed fields (Location/Program/Room) never resolve to a text input", () => {
        for (const key of ["location_id", "child_program", "child_program_room_cohort_key"]) {
            expect(byKey[key]?.value_kind).not.toBe("text");
        }
    });
});
