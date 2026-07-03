import { describe, expect, it } from "vitest";
import { buildOpportunityPlacementFacts } from "@/lib/orchestration/placement/adapters/opportunityPlacementFacts";
import {
    CHILDCARE_PLACEMENT_FACT_START_DATE,
    CHILDCARE_PLACEMENT_FACT_FLAG_COMMUNITY_PRIORITY,
    CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD,
    CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED,
    CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER,
    CHILDCARE_PLACEMENT_FACT_FLAG_STAFF_HOUSEHOLD,
    CHILDCARE_PLACEMENT_FACT_PROGRAM_ROOM_GROUP,
    CHILDCARE_PLACEMENT_FACT_WAIT_SINCE,
} from "@/lib/orchestration/placement/childcarePlacementFactContractV1";
import { evaluatePlacementPriority } from "@/lib/orchestration/placement/evaluatePlacementPriority";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";

describe("buildOpportunityPlacementFacts", () => {
    it("extracts wait_since from enrollment_operational", () => {
        const bag = buildOpportunityPlacementFacts({
            created_at: "2024-01-01T00:00:00.000Z",
            metadata: {
                enrollment_operational: {
                    wait_since: "2024-06-15T10:00:00.000Z",
                },
            },
        });
        expect(bag[CHILDCARE_PLACEMENT_FACT_WAIT_SINCE]).toEqual({
            presence: "present",
            value: "2024-06-15T10:00:00.000Z",
            source: "metadata.enrollment_operational.wait_since",
        });
    });

    it("extracts wait_since from metadata.wait_since when enrollment_operational absent", () => {
        const bag = buildOpportunityPlacementFacts({
            metadata: { wait_since: "2024-03-01T00:00:00.000Z" },
        });
        expect(bag[CHILDCARE_PLACEMENT_FACT_WAIT_SINCE]?.presence).toBe("present");
        expect((bag[CHILDCARE_PLACEMENT_FACT_WAIT_SINCE] as { value?: string }).value).toBe("2024-03-01T00:00:00.000Z");
    });

    it("does not use created_at fallback by default", () => {
        const bag = buildOpportunityPlacementFacts({
            created_at: "2024-01-01T00:00:00.000Z",
            metadata: {},
        });
        expect(bag[CHILDCARE_PLACEMENT_FACT_WAIT_SINCE]?.presence).toBe("absent");
    });

    it("uses created_at fallback only when opt-in flag set", () => {
        const bag = buildOpportunityPlacementFacts(
            {
                created_at: "2024-01-01T00:00:00.000Z",
                metadata: {},
            },
            { wait_since_fallback_created_at: true }
        );
        expect(bag[CHILDCARE_PLACEMENT_FACT_WAIT_SINCE]).toEqual({
            presence: "present",
            value: "2024-01-01T00:00:00.000Z",
            source: "created_at_fallback_documented",
        });
    });

    it("extracts start_date fact from legacy opportunity metadata key", () => {
        const bag = buildOpportunityPlacementFacts({
            // `desired_start_date` is the opportunity-level legacy metadata key — not the OCM column.
            metadata: { desired_start_date: "2025-09-01" },
        });
        expect(bag[CHILDCARE_PLACEMENT_FACT_START_DATE]?.presence).toBe("present");
        expect((bag[CHILDCARE_PLACEMENT_FACT_START_DATE] as { value?: string }).value).toBe("2025-09-01");
    });

    it("extracts boolean flags from placement_fact_inputs_v1", () => {
        const bag = buildOpportunityPlacementFacts({
            metadata: {
                placement_fact_inputs_v1: {
                    flag_employee_household: true,
                    flag_staff_household: false,
                    flag_community_priority: true,
                },
            },
        });
        expect(bag[CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD]).toMatchObject({
            presence: "present",
            value: true,
        });
        expect(bag[CHILDCARE_PLACEMENT_FACT_FLAG_STAFF_HOUSEHOLD]).toMatchObject({
            presence: "present",
            value: false,
        });
        expect(bag[CHILDCARE_PLACEMENT_FACT_FLAG_COMMUNITY_PRIORITY]).toMatchObject({
            presence: "present",
            value: true,
        });
    });

    it("maps sister_center_transfer to flag_sister_center", () => {
        const bag = buildOpportunityPlacementFacts({
            metadata: { sister_center_transfer: true },
        });
        expect(bag[CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER]).toMatchObject({
            presence: "present",
            value: true,
            source: "metadata.sister_center_transfer",
        });
    });

    it("handles unknown sibling flag via string", () => {
        const bag = buildOpportunityPlacementFacts({
            metadata: { flag_sibling_enrolled: "unknown" },
        });
        expect(bag[CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED]).toEqual({
            presence: "unknown",
            source: "metadata.flag_sibling_enrolled",
        });
    });

    it("emits absent when optional flags omitted", () => {
        const bag = buildOpportunityPlacementFacts({ metadata: {} });
        expect(bag[CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD]?.presence).toBe("absent");
        expect(bag[CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED]?.presence).toBe("absent");
    });

    it("does not throw on malformed metadata", () => {
        expect(() =>
            buildOpportunityPlacementFacts({
                metadata: [] as unknown as Record<string, unknown>,
            })
        ).not.toThrow();
        expect(() =>
            buildOpportunityPlacementFacts({
                metadata: null,
            })
        ).not.toThrow();
    });

    it("program_room_group falls back to program_label", () => {
        const bag = buildOpportunityPlacementFacts({
            metadata: { program_label: "Infant A" },
        });
        expect(bag[CHILDCARE_PLACEMENT_FACT_PROGRAM_ROOM_GROUP]).toMatchObject({
            presence: "present",
            value: "Infant A",
            source: "metadata.program_label_fallback",
        });
    });

    it("wires through evaluator without childcare logic in core", () => {
        const facts = buildOpportunityPlacementFacts({
            metadata: {
                enrollment_operational: { wait_since: "2024-01-01T00:00:00.000Z" },
                placement_fact_inputs_v1: { flag_employee_household: true },
            },
        });
        const r = evaluatePlacementPriority({
            evaluator_version: "1",
            now_ms: 1_715_176_800_000,
            entity: { entity_type: "opportunity", entity_id: "opp_1" },
            cohort: {
                work_unit_id: "wu",
                queue_key: "waitlisted",
                status_keys_allowed: ["waitlisted"],
            },
            facts,
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.snapshot.bucket_key).toBe("tier_employee_family");
    });
});
