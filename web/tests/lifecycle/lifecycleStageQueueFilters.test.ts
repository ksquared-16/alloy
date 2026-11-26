import { describe, expect, it } from "vitest";
import {
    assertLifecycleStageOpportunityQueryHasStatusFilters,
    LifecycleStageQueueFiltersEmptyError,
    requireLifecycleStageQueueStatusKeys,
} from "@/lib/lifecycle/lifecycleStageQueueFilters";
import { buildLifecycleStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { executableStatusKeysFromLifecycleQueueDefinition } from "@/lib/lifecycle/lifecycleStageQueueFilters";
import { validateLifecycleStageWorkUnitQueueFilter } from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";

describe("lifecycleStageQueueFilters", () => {
    it("requireLifecycleStageQueueStatusKeys rejects empty keys", () => {
        expect(() => requireLifecycleStageQueueStatusKeys("enrolling", [])).toThrow(
            LifecycleStageQueueFiltersEmptyError
        );
    });

    it("buildLifecycleStageQueueDefinition for enrolling writes case_status and status filters", () => {
        const doc = buildLifecycleStageQueueDefinition({
            stageKey: "enrolling",
            label: "Enrolling",
            statusKeys: ["enrolling"],
        });
        const queues = doc.queues as Array<Record<string, unknown>>;
        expect(queues.length).toBeGreaterThan(0);
        const lane = queues[0]!;
        const filters = lane.filters as Array<{ type: string; values: string[] }>;
        const compat = lane.filters_compat_v1 as Array<{ type: string; values: string[] }>;
        expect(filters.some((f) => f.type === "case_status" && f.values.includes("enrolling"))).toBe(
            true
        );
        expect(compat.some((f) => f.type === "status" && f.values.includes("enrolling"))).toBe(true);
    });

    it("executableStatusKeysFromLifecycleQueueDefinition reads enrolling from stored def", () => {
        const doc = buildLifecycleStageQueueDefinition({
            stageKey: "enrolling",
            label: "Enrolling",
            statusKeys: ["enrolling"],
        });
        const keys = executableStatusKeysFromLifecycleQueueDefinition(
            { key: "lifecycle_wu_enrolling", queue_definition: doc },
            "enrolling"
        );
        expect(keys).toContain("enrolling");
    });

    it("assertLifecycleStageOpportunityQueryHasStatusFilters blocks empty ops on lifecycle_wu", () => {
        expect(() =>
            assertLifecycleStageOpportunityQueryHasStatusFilters({
                workUnitKey: "lifecycle_wu_enrolling",
                opportunityScopeMode: "lifecycle_visibility",
                ops: [],
                workUnitMetadata: { lifecycle_stage_key: "enrolling", status_keys: ["enrolling"] },
            })
        ).toThrow(LifecycleStageQueueFiltersEmptyError);
    });

    it("assertLifecycleStageOpportunityQueryHasStatusFilters accepts stage_key eq membership", () => {
        expect(() =>
            assertLifecycleStageOpportunityQueryHasStatusFilters({
                workUnitKey: "lifecycle_wu_tour",
                opportunityScopeMode: "lifecycle_visibility",
                ops: [{ kind: "eq", column: "stage_key", value: "tour" }],
                workUnitMetadata: { lifecycle_stage_key: "tour" },
            })
        ).not.toThrow();
    });

    it("validation fails when expected statuses exist but queue filters are empty", () => {
        const activation: LifecycleActivationV1 = {
            version: 1,
            lifecycle_name: "Test",
            primary_entity: "opportunity",
            primary_record_label: "Lead",
            process_id: "p1",
            stage_key: "enrolling",
            stage_label: "Enrolling",
            work_unit_id: "wu1",
            work_unit_name: "Enrolling",
            status_keys: ["enrolling"],
            status_labels: ["Enrolling"],
            action_definition_id: null,
            action_placement_ids: [],
            activation_owned: true,
            completed_steps: 4,
            updated_at: "2026-01-01T00:00:00.000Z",
        };
        const payload: EnrollmentStatusStagesPayload = {
            entity_type: "opportunities",
            stage_keys: ["enrolling"],
            unassigned: [],
            stages: {
                enrolling: {
                    has_custom_assignments: true,
                    statuses: [
                        {
                            status_key: "enrolling",
                            status_label: "Enrolling",
                            sort_order: 1,
                            assignment_source: "metadata",
                            has_metadata_override: false,
                        },
                    ],
                },
            },
        };
        const row = validateLifecycleStageWorkUnitQueueFilter({
            stageKey: "enrolling",
            workUnit: {
                id: "wu1",
                key: "lifecycle_wu_enrolling",
                name: "Enrolling",
                queue_definition: {
                    version: 2,
                    entity_type: "opportunity",
                    queues: [
                        {
                            key: "lifecycle_enrolling",
                            label: "Enrolling",
                            filters: [],
                            filters_compat_v1: [],
                        },
                    ],
                },
                metadata: { lifecycle_stage_key: "enrolling" },
            },
            statusPayload: payload,
            activation,
        });
        expect(row.pass).toBe(false);
    });
});
