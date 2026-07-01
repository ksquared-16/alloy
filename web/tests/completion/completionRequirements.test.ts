import { describe, expect, it } from "vitest";
import { evaluateCompletionRequirements } from "@/lib/completion/evaluateCompletionRequirements";
import { evaluateCompletionRequirementsFromRecord } from "@/lib/completion/evaluateCompletionRequirements";
import { evaluateOpportunityCompletionRequirements } from "@/lib/completion/evaluateOpportunityCompletionRequirements";
import { evaluatePersonCompletionRequirements } from "@/lib/completion/evaluatePersonCompletionRequirements";
import { evaluateHouseholdCompletionRequirements } from "@/lib/completion/evaluateHouseholdCompletionRequirements";
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";
import { toBosCompletionRequirementPayload } from "@/lib/completion/bosIntegration";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";

function personCtx(
    overrides: Partial<CompletionEvaluationContext> & { values?: Record<string, unknown> }
): CompletionEvaluationContext {
    return {
        phase: "save",
        entity_type: "person",
        entity_id: "person-1",
        values: {},
        ...overrides,
    };
}

describe("completion guardrails — person", () => {
    it("requires child first and last name", () => {
        const r = evaluatePersonCompletionRequirements(
            personCtx({
                values: { first_name: "", last_name: "" },
                related: { customer_members: [{ relationship: "child" }] },
            })
        );
        expect(r.ok).toBe(false);
        expect(r.blocking.map((v) => v.field_key)).toEqual(["first_name", "last_name"]);
    });

    it("requires parent first and last name", () => {
        const r = evaluatePersonCompletionRequirements(
            personCtx({
                values: { first_name: "Ada", last_name: "" },
                related: { customer_persons: [{ role_type: "parent" }] },
            })
        );
        expect(r.blocking.some((v) => v.field_key === "last_name")).toBe(true);
    });

    it("parent requires at least phone or email as soft warning on save", () => {
        const r = evaluatePersonCompletionRequirements(
            personCtx({
                values: { first_name: "Ada", last_name: "Lovelace", email: "", phone: "" },
                related: { customer_persons: [{ role_type: "parent" }] },
            })
        );
        expect(r.ok).toBe(true);
        expect(r.warnings.some((v) => v.label === "Email or phone")).toBe(true);
    });

    it("parent with email passes contact requirement", () => {
        const r = evaluatePersonCompletionRequirements(
            personCtx({
                values: { first_name: "Ada", last_name: "Lovelace", email: "a@example.com", phone: "" },
                related: { customer_persons: [{ role_type: "parent" }] },
            })
        );
        expect(r.warnings.filter((v) => v.field_key === "email")).toHaveLength(0);
    });

    it("child start date required before active status transition", () => {
        const r = evaluatePersonCompletionRequirements(
            personCtx({
                phase: "status_change",
                status_to: "active",
                values: {
                    first_name: "Sam",
                    last_name: "Kid",
                    date_of_birth: "2020-01-01",
                    start_date: "",
                    status_key: "inactive",
                },
                related: { customer_members: [{ relationship: "child" }] },
            })
        );
        expect(r.blocking.some((v) => v.field_key === "start_date")).toBe(true);
    });

    it("child DOB is recommendation on preview when not enrolling", () => {
        const r = evaluatePersonCompletionRequirements(
            personCtx({
                phase: "preview",
                values: { first_name: "Sam", last_name: "Kid", date_of_birth: "" },
                related: { customer_members: [{ relationship: "child" }] },
            })
        );
        expect(r.ok).toBe(true);
        expect(r.recommendations.some((v) => v.field_key === "date_of_birth")).toBe(true);
    });

    it("draft save allowed when only soft warnings (parent contact)", () => {
        const r = evaluateCompletionRequirements(
            personCtx({
                phase: "save",
                values: { first_name: "Ada", last_name: "Lovelace", email: "", phone: "" },
                related: { customer_persons: [{ role_type: "parent" }] },
            })
        );
        expect(r.ok).toBe(true);
        expect(r.warnings.length).toBeGreaterThan(0);
    });
});

describe("completion guardrails — household", () => {
    it("household requires one primary contact when guardians exist", () => {
        const r = evaluateHouseholdCompletionRequirements({
            phase: "save",
            entity_type: "customer",
            entity_id: "cust-1",
            values: {},
            related: {
                customer_id: "cust-1",
                household_guardian_count: 2,
                household_has_primary_contact: false,
            },
        });
        expect(r.ok).toBe(false);
        expect(r.blocking[0]?.label).toBe("Primary contact");
    });
});

describe("completion guardrails — opportunity", () => {
    function oppCtx(overrides: Partial<CompletionEvaluationContext>): CompletionEvaluationContext {
        return {
            phase: "status_change",
            entity_type: "opportunity",
            entity_id: "opp-1",
            values: {},
            ...overrides,
        };
    }

    it("cannot move to tour_scheduled without tour date", () => {
        const r = evaluateOpportunityCompletionRequirements(
            oppCtx({
                status_to: "tour_scheduled",
                values: {
                    primary_person_id: "p1",
                    status_key: "new_lead",
                    metadata: { tour_time: "10:00" },
                },
                related: {
                    inquiry_children: [{ id: "c1", first_name: "Kid", last_name: "One" }],
                },
            })
        );
        expect(r.ok).toBe(false);
        expect(r.blocking.some((v) => v.field_key === "tour_date")).toBe(true);
    });

    it("cannot move to enrolled without child enrollment requirements", () => {
        const r = evaluateOpportunityCompletionRequirements(
            oppCtx({
                status_to: "enrolled",
                values: {
                    primary_person_id: "p1",
                    location_id: "loc-1",
                },
                related: {
                    inquiry_children: [
                        {
                            id: "c1",
                            first_name: "Kid",
                            last_name: "One",
                            desired_program_type: "infant",
                            desired_start_date: "",
                        },
                    ],
                },
            })
        );
        expect(r.blocking.some((v) => v.field_key === "desired_start_date")).toBe(true);
    });

    it("requires primary contact and at least one child", () => {
        const r = evaluateOpportunityCompletionRequirements(
            oppCtx({
                phase: "save",
                values: { status_key: "new_lead" },
                related: { inquiry_children: [] },
            })
        );
        expect(r.blocking.some((v) => v.field_key === "primary_person_id")).toBe(true);
        expect(r.blocking.some((v) => v.field_key === "inquiry_children")).toBe(true);
    });

    it("location required before waitlist", () => {
        const r = evaluateOpportunityCompletionRequirements(
            oppCtx({
                status_to: "waitlisted",
                values: { primary_person_id: "p1", location_id: null },
                related: {
                    inquiry_children: [{ id: "c1", first_name: "A", last_name: "B" }],
                },
            })
        );
        expect(r.blocking.some((v) => v.field_key === "location_id")).toBe(true);
    });
});

describe("completion guardrails — structured output", () => {
    it("status/action validation returns structured errors", () => {
        const r = evaluateOpportunityCompletionRequirements({
            phase: "status_change",
            entity_type: "opportunity",
            entity_id: "opp-1",
            status_to: "tour_scheduled",
            values: { primary_person_id: "p1" },
            related: { inquiry_children: [{ id: "c1", first_name: "X", last_name: "Y" }] },
        });
        expect(r.blocking[0]).toMatchObject({
            entity_type: "opportunity",
            blocking_level: "hard_block",
            requirement_type: "required_before_status_transition",
        });
        expect(formatRequirementValidationSummary(r)).toMatch(/Tour date/);
    });

    it("BOS payload exposes blocking labels", () => {
        const r = evaluatePersonCompletionRequirements(
            personCtx({ values: { first_name: "", last_name: "" } })
        );
        const bos = toBosCompletionRequirementPayload(r);
        expect(bos.ok).toBe(false);
        expect(bos.blocking_labels).toContain("First name");
        expect(bos.summary).toMatch(/First name/);
    });
});

describe("MissingRequirementsSummary data path", () => {
    it("evaluateCompletionRequirementsFromRecord works on drawer record shape", () => {
        const r = evaluateCompletionRequirementsFromRecord({
            entity_type: "person",
            entity_id: "p1",
            phase: "preview",
            record: {
                id: "p1",
                first_name: "Ada",
                last_name: "",
                _customer_persons: [{ role_type: "parent" }],
            },
        });
        expect(r.blocking.some((v) => v.field_key === "last_name")).toBe(true);
    });
});
