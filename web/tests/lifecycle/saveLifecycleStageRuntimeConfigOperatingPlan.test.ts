import { describe, expect, it } from "vitest";
import { persistStageOperatingPlanForLifecycleStageSave } from "@/lib/lifecycle/persistStageOperatingPlanV1";
import { STAGE_OPERATING_PLAN_METADATA_KEY, type StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

describe("persistStageOperatingPlanForLifecycleStageSave", () => {
    it("writes explicit operating plan to builder stage metadata", async () => {
        const metadata = {
            lifecycle_builder_v1: {
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
                                id: "st-lead",
                                key: "lead",
                                label: "Lead",
                                sort_order: 0,
                                is_active: true,
                            },
                        ],
                    },
                ],
            },
        };

        const explicit: StageOperatingPlanV1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            journey_segment: "family",
            purpose: "Custom purpose",
            work_templates: [],
            outcomes: [{ outcome_key: "reached_family", label: "Reached family", successful: true }],
            outcome_rules: [],
            attention_rules: [],
        };

        const store = { metadata: structuredClone(metadata) };
        const supabase = {
            from: () => ({
                update: (patch: { metadata: Record<string, unknown> }) => ({
                    eq: () => ({
                        eq: () => {
                            Object.assign(store, patch);
                            return Promise.resolve({ error: null });
                        },
                    }),
                }),
            }),
        };

        const result = await persistStageOperatingPlanForLifecycleStageSave(supabase as never, {
            orgId: "org-1",
            departmentId: "dept-1",
            stageKey: "lead",
            metadata: store.metadata as Record<string, unknown>,
            explicitPlan: explicit,
        });

        expect(result.builderStageUpdated).toBe(true);
        const stage = (
            (result.metadata.lifecycle_builder_v1 as { processes: Array<{ stages: unknown[] }> }).processes[0]
                .stages[0] as Record<string, unknown>
        );
        expect((stage[STAGE_OPERATING_PLAN_METADATA_KEY] as StageOperatingPlanV1).purpose).toBe("Custom purpose");
    });
});
