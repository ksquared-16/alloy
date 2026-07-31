/**
 * The publication gate (Law 4, editor slice 2 — decision D3's publish half).
 *
 * The required proof: a draft may hold `transition_ref: "lead_to_tour"` with no such outgoing
 * transition — that is a legitimate mid-build state and must save — but it may NOT become runtime
 * truth. This is the defect that started the sprint; the validator that could see it was wired into
 * one of ~15 write paths. It now sits on the only path that changes runtime.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { validateTouchedStageReferences } from "@/lib/lifecycle/validateTouchedStageReferences";
import { parseLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";

function payloadWithLeadToTour(): Record<string, unknown> {
    return {
        version: 1,
        active_process_id: "proc-1",
        processes: [
            {
                id: "proc-1",
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                stages: [
                    {
                        id: "stage-lead",
                        key: "lead",
                        label: "Lead",
                        sort_order: 0,
                        is_active: true,
                        stage_operating_plan_v1: {
                            version: 1,
                            lifecycle_key: "enrollment",
                            stage_key: "lead",
                            journey_segment: "family",
                            // No `outgoing_transitions` at all — the modern editor's shape.
                            outcome_rules: [
                                {
                                    rule_key: "qualified",
                                    when_outcome_key: "qualified",
                                    targets: [
                                        { kind: "move_to_stage", transition_ref: "lead_to_tour" },
                                    ],
                                },
                            ],
                        },
                    },
                    { id: "stage-tour", key: "tour", label: "Tour", sort_order: 1, is_active: true },
                ],
            },
        ],
    };
}

describe("publication gate", () => {
    it("blocks publication of an outcome naming a transition that does not exist", () => {
        const result = validateBusinessProcessForPublish(payloadWithLeadToTour());

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({
            code: "movement_transition_not_found",
            stage_key: "lead",
        });
        expect(result.errors[0]!.detail?.transition_ref).toBe("lead_to_tour");
        // Operator language: names the OUTCOME, says the transition does not exist, and says where
        // to create it. The message it replaced read `targets stage "lead_to_tour"` — describing a
        // transition reference as if it were a stage.
        expect(result.errors[0]!.message).toContain("Qualified");
        expect(result.errors[0]!.message).toContain("does not exist");
        expect(result.errors[0]!.path).toBe(
            "processes[enrollment].stages[lead].stage_operating_plan_v1.outcome_rules",
        );
    });

    it("but the same defect does NOT block an unrelated stage's draft save (decision D3)", () => {
        const before = parseLifecycleBuilderV1(payloadWithLeadToTour())!;
        // The operator edits `tour`, which is fine. `lead` is still broken.
        const after = parseLifecycleBuilderV1(payloadWithLeadToTour())!;

        const touched = validateTouchedStageReferences({ before, after, stageKey: "tour" });

        expect(touched.errors).toHaveLength(0);
        expect(touched.warnings).toHaveLength(1);
        expect(touched.warnings[0]!.stage_key).toBe("lead");
    });

    it("refuses an unreadable payload rather than degrading it to a default", () => {
        expect(validateBusinessProcessForPublish("not an object").errors[0]).toMatchObject({
            code: "configuration_unreadable",
        });
        expect(validateBusinessProcessForPublish(null).errors[0]).toMatchObject({
            code: "configuration_unreadable",
        });
    });

    it("blocks a duplicate stage key, which would silently shadow at runtime", () => {
        const payload = payloadWithLeadToTour();
        const stages = (payload.processes as Array<{ stages: Record<string, unknown>[] }>)[0]!.stages;
        stages.push({ id: "stage-tour-2", key: "tour", label: "Tour again", sort_order: 2, is_active: true });

        const result = validateBusinessProcessForPublish(payload);
        expect(result.errors.some((e) => e.code === "duplicate_stage_key")).toBe(true);
    });

    it("reports a process with no stages as a warning, not a blocker", () => {
        const payload = payloadWithLeadToTour();
        (payload.processes as Array<{ stages: unknown[] }>)[0]!.stages = [];

        const result = validateBusinessProcessForPublish(payload);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings.some((w) => w.code === "process_has_no_stages")).toBe(true);
    });

    it("passes a graph whose references all resolve", () => {
        const payload = payloadWithLeadToTour();
        const plan = (
            payload.processes as Array<{ stages: Array<Record<string, unknown>> }>
        )[0]!.stages[0]!.stage_operating_plan_v1 as Record<string, unknown>;
        plan.outgoing_transitions = [
            {
                transition_ref: "lead_to_tour",
                source_stage_key: "lead",
                target_stage_key: "tour",
                label: "Book a tour",
            },
        ];

        expect(validateBusinessProcessForPublish(payload).errors).toHaveLength(0);
    });
});

describe("17: the editor's editable state no longer comes from department metadata", () => {
    const root = resolve(__dirname, "../..");
    const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

    it("the stage bootstrap resolves builder state from the draft", () => {
        const src = read("lib/lifecycle/buildLifecycleStageBootstrap.ts");
        expect(src).toContain("loadBusinessProcessEditorState");
        expect(src).toContain("builderMetadata");
        // The builder record must be derived from the draft-backed view, never the raw column.
        expect(src).toContain("lifecycleBuilderFromDepartmentMetadata(builderMetadata)");
        expect(src).not.toContain("lifecycleBuilderFromDepartmentMetadata(metadata)");
    });

    it("no code-default fallback survives on the editor read path", () => {
        const src = read("lib/lifecycle/buildLifecycleStageBootstrap.ts");
        // Both used to make an unconfigured stage look configured, which a save then wrote back
        // as authored configuration (decision D1).
        expect(src).not.toContain("enrollmentQueueMembershipLegacyFallback");
        expect(src).not.toContain("defaultStageOperatingPlanForEnrollmentStage");
    });

    it("the publish route never writes the runtime projection itself", () => {
        const src = read("app/api/admin/business-process/configuration/publish/route.ts");
        expect(src).toContain("publishDraft");
        expect(src).not.toContain('from("departments")');
    });
});
