/**
 * "Missing required fields" must say WHICH fields, and must not read as if the form cannot be
 * saved. Publish has always been allowed (isFormLifecycleReadyForRecordCreation.ts) — only
 * record-creating share links are gated — but the old copy said "cannot create a Lead" with no
 * list, so operators read it as a build-time block on an unnamed set.
 */

import { describe, expect, it } from "vitest";

import { buildFormLifecycleCoveragePresentation } from "@/lib/forms/lifecycle/buildFormLifecycleCoveragePresentation";
import type {
    FormsLifecycleCoverageItem,
    FormsLifecycleCoverageResult,
    FormsLifecycleRequirementContract,
} from "@/lib/forms/lifecycle/formsLifecycleCoverageTypes";
import type { FormsLifecycleUsageV1 } from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";

const USAGE: FormsLifecycleUsageV1 = {
    version: 1,
    department_id: "dept-1",
    stage_key: "lead",
    intake_intent: "enrollment_lead",
};

function item(id: string, label: string, requiredness: "required" | "recommended"): FormsLifecycleCoverageItem {
    return {
        requirementId: id,
        requirementLabel: label,
        requirementEntityType: id.startsWith("child") ? "child" : "person",
        requirementFieldKey: id.split(":")[1] ?? id,
        requiredness,
        status: "missing",
    };
}

function coverage(over: Partial<FormsLifecycleCoverageResult> = {}): FormsLifecycleCoverageResult {
    return {
        ready: false,
        missingRequired: [],
        missingRecommended: [],
        satisfiedRequired: [],
        satisfiedRecommended: [],
        constraintFailures: [],
        byEntity: {},
        ...over,
    } as FormsLifecycleCoverageResult;
}

describe("missing required fields are named", () => {
    it("lists the missing field labels and counts them in the headline", () => {
        const p = buildFormLifecycleCoveragePresentation({
            usage: USAGE,
            contract: null,
            schema_source: "draft",
            coverage: coverage({
                missingRequired: [
                    item("person:first_name", "First Name", "required"),
                    item("person:last_name", "Last Name", "required"),
                ],
            }),
        });

        expect(p.status).toBe("missing_required");
        expect(p.missing_required_labels).toEqual(["First Name", "Last Name"]);
        expect(p.status_headline).toBe("2 required fields missing");
        expect(p.status_message).toContain("First Name and Last Name");
    });

    it("uses singular copy for one gap", () => {
        const p = buildFormLifecycleCoveragePresentation({
            usage: USAGE,
            contract: null,
            schema_source: "draft",
            coverage: coverage({ missingRequired: [item("person:first_name", "First Name", "required")] }),
        });
        expect(p.status_headline).toBe("1 required field missing");
        expect(p.status_message).toContain("Add: First Name.");
    });

    it("says the form can still be saved and published — only record creation is gated", () => {
        const p = buildFormLifecycleCoveragePresentation({
            usage: USAGE,
            contract: null,
            schema_source: "draft",
            coverage: coverage({ missingRequired: [item("person:first_name", "First Name", "required")] }),
        });
        expect(p.status_message).toContain("can be saved and published");
        expect(p.status_message).not.toMatch(/^This form cannot create/);
    });

    it("counts an unmet constraint as a named gap", () => {
        const p = buildFormLifecycleCoveragePresentation({
            usage: USAGE,
            contract: null,
            schema_source: "draft",
            coverage: coverage({
                constraintFailures: [
                    {
                        requirementId: "person:contact",
                        requirementLabel: "Phone or email.",
                        requirementEntityType: "person",
                        requirementFieldKey: "contact",
                        requiredness: "required",
                        status: "missing",
                    } as FormsLifecycleCoverageItem,
                ],
            }),
        });
        expect(p.missing_required_labels).toEqual(["Phone or email"]);
        expect(p.status_message).toContain("Phone or email");
    });

    it("serializes three or more gaps as an Oxford list", () => {
        const p = buildFormLifecycleCoveragePresentation({
            usage: USAGE,
            contract: null,
            schema_source: "draft",
            coverage: coverage({
                missingRequired: [
                    item("person:first_name", "First Name", "required"),
                    item("person:last_name", "Last Name", "required"),
                    item("child:first_name", "Child First Name", "required"),
                ],
            }),
        });
        expect(p.status_message).toContain("First Name, Last Name, and Child First Name");
    });

    it("non-blocking states carry an empty list rather than an absent field", () => {
        const empty = buildFormLifecycleCoveragePresentation({
            usage: null,
            contract: null,
            coverage: null,
            schema_source: "none",
        });
        expect(empty.missing_required_labels).toEqual([]);

        const ready = buildFormLifecycleCoveragePresentation({
            usage: USAGE,
            contract: null,
            schema_source: "draft",
            coverage: coverage({ ready: true }),
        });
        expect(ready.status).toBe("ready");
        expect(ready.missing_required_labels).toEqual([]);
    });
});

describe("deferred requirements explain themselves", () => {
    it("a process-required rule owned by a later moment says which moment owns it", () => {
        const contract: FormsLifecycleRequirementContract = {
            stageKey: "lead",
            intent: "enrollment_lead",
            requirementsSource: "department",
            required: [],
            recommended: [
                {
                    id: "child:classroom",
                    entityType: "child",
                    fieldKey: "program_room_cohort_key",
                    label: "Classroom",
                    requiredness: "recommended",
                    requirementSource: "lifecycle_stage",
                    deferredTiming: ["stage_exit"],
                },
            ],
            constraints: [],
        };

        const p = buildFormLifecycleCoveragePresentation({
            usage: USAGE,
            contract,
            schema_source: "draft",
            coverage: coverage({
                missingRequired: [item("person:first_name", "First Name", "required")],
                byEntity: {
                    Child: {
                        required: [],
                        recommended: [item("child:classroom", "Classroom", "recommended")],
                    },
                } as unknown as FormsLifecycleCoverageResult["byEntity"],
            }),
        });

        const row = p.entity_groups.flatMap((g) => g.rows).find((r) => r.field_label === "Classroom");
        expect(row?.deferred_note).toBe("Required before leaving this stage — not needed on this form");
        // It is not counted as a gap in THIS form.
        expect(p.missing_required_labels).not.toContain("Classroom");
    });

    it("a genuinely optional recommendation carries no timing note", () => {
        const contract: FormsLifecycleRequirementContract = {
            stageKey: "lead",
            intent: "enrollment_lead",
            requirementsSource: "platform",
            required: [],
            recommended: [
                {
                    id: "child:first_name",
                    entityType: "child",
                    fieldKey: "first_name",
                    label: "Child First Name",
                    requiredness: "recommended",
                    requirementSource: "lifecycle_stage",
                },
            ],
            constraints: [],
        };

        const p = buildFormLifecycleCoveragePresentation({
            usage: USAGE,
            contract,
            schema_source: "draft",
            coverage: coverage({
                missingRequired: [item("person:first_name", "First Name", "required")],
                byEntity: {
                    Child: {
                        required: [],
                        recommended: [item("child:first_name", "Child First Name", "recommended")],
                    },
                } as unknown as FormsLifecycleCoverageResult["byEntity"],
            }),
        });

        const row = p.entity_groups.flatMap((g) => g.rows).find((r) => r.field_label === "Child First Name");
        expect(row).toBeDefined();
        expect(row?.deferred_note).toBeUndefined();
    });
});
