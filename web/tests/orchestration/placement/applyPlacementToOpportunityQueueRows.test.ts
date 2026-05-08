import { describe, expect, it, vi } from "vitest";
import {
    applyPlacementToOpportunityQueueRows,
    comparePlacementSortTuples,
    PLACEMENT_QUEUE_SERVICE_EVALUATOR_VERSION,
} from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import * as EvalPlacementModule from "@/lib/orchestration/placement/evaluatePlacementPriority";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";

const WAITLISTED_QUEUE_KEY = "waitlisted";

function childcareWorkUnitMetadata(overrides: Record<string, unknown> = {}) {
    return {
        placement_priority_v1: {
            version: 1,
            enabled: true,
            profile_id: "childcare_enrollment_waitlist_v1",
            queue_keys_enabled: [WAITLISTED_QUEUE_KEY],
            evaluation_cap: 800,
            shadow_mode: false,
            ...overrides,
        },
    };
}

function resolveChildcarePlacement(queueKey: string, metaOverrides: Record<string, unknown> = {}) {
    const r = resolvePlacementQueueConfig({
        departmentMetadata: null,
        workUnitMetadata: childcareWorkUnitMetadata(metaOverrides),
        queue_key: queueKey,
    });
    if (r.status !== "enabled") throw new Error(`expected enabled, got ${r.status}`);
    return r;
}

describe("applyPlacementToOpportunityQueueRows", () => {
    it("comparePlacementSortTuples orders lower bucket_priority_order first", () => {
        expect(comparePlacementSortTuples([10, 1], [100, 1])).toBeLessThan(0);
    });

    it("shadow_mode preserves SQL row order while attaching previews", () => {
        const placement = resolveChildcarePlacement(WAITLISTED_QUEUE_KEY, { shadow_mode: true });
        const rows: Array<Record<string, unknown>> = [
            {
                id: "general_first",
                created_at: "2026-01-01T12:00:00.000Z",
                metadata: {
                    enrollment_operational: { wait_since: "2026-01-01T00:00:00.000Z" },
                    placement_fact_inputs_v1: { program_room_group: "Toddler" },
                },
            },
            {
                id: "staff_second",
                created_at: "2026-01-02T12:00:00.000Z",
                metadata: {
                    enrollment_operational: { wait_since: "2026-02-01T00:00:00.000Z" },
                    placement_fact_inputs_v1: { program_room_group: "Infant" },
                    flag_staff_household: true,
                },
            },
        ];
        const { rows: out, diagnostics } = applyPlacementToOpportunityQueueRows({
            rows,
            placement,
            ctx: {
                workUnitId: "wu_1",
                queueKey: WAITLISTED_QUEUE_KEY,
                nowMs: 1_700_000_000_000,
                statusKeysAllowed: ["waitlisted"],
            },
        });
        expect(diagnostics.shadow_mode).toBe(true);
        expect(diagnostics.reorder_applied).toBe(false);
        expect(out.map((r) => r.id)).toEqual(["general_first", "staff_second"]);
        const p0 = out[0]._placement_priority as { bucket_key: string; program_room_group_label?: string | null };
        const p1 = out[1]._placement_priority as { bucket_key: string; program_room_group_label?: string | null };
        expect(p0.bucket_key).toBe("tier_general_waitlist");
        expect(p1.bucket_key).toBe("tier_staff_community");
        expect(p0.program_room_group_label).toBe("Toddler");
        expect(p1.program_room_group_label).toBe("Infant");
    });

    it("non-shadow mode reorders by sort_tuple (program group before bucket priority)", () => {
        const placement = resolveChildcarePlacement(WAITLISTED_QUEUE_KEY, { shadow_mode: false });
        const rows: Array<Record<string, unknown>> = [
            {
                id: "general_first_in_sql",
                created_at: "2026-01-01T12:00:00.000Z",
                metadata: {
                    enrollment_operational: { wait_since: "2026-01-01T00:00:00.000Z" },
                    placement_fact_inputs_v1: { program_room_group: "Toddler" },
                },
            },
            {
                id: "staff_second_in_sql",
                created_at: "2026-01-02T12:00:00.000Z",
                metadata: {
                    enrollment_operational: { wait_since: "2026-06-01T00:00:00.000Z" },
                    placement_fact_inputs_v1: { program_room_group: "Infant" },
                    flag_staff_household: true,
                },
            },
        ];
        const { rows: out, diagnostics } = applyPlacementToOpportunityQueueRows({
            rows,
            placement,
            ctx: {
                workUnitId: "wu_1",
                queueKey: WAITLISTED_QUEUE_KEY,
                nowMs: 1_700_000_000_000,
                statusKeysAllowed: ["waitlisted"],
            },
        });
        expect(diagnostics.shadow_mode).toBe(false);
        expect(diagnostics.reorder_applied).toBe(true);
        /** Infant group sorts before Toddler; within Infant, staff tier beats general in SQL order reversal. */
        expect(out.map((r) => r.id)).toEqual(["staff_second_in_sql", "general_first_in_sql"]);
    });

    it("respects evaluation_cap: only head rows evaluated; tail rows omit _placement_priority", () => {
        const placement = resolveChildcarePlacement(WAITLISTED_QUEUE_KEY, {
            shadow_mode: false,
            evaluation_cap: 1,
        });
        const rows: Array<Record<string, unknown>> = [
            {
                id: "head",
                created_at: "2026-01-01T12:00:00.000Z",
                metadata: { enrollment_operational: { wait_since: "2026-01-01T00:00:00.000Z" } },
            },
            {
                id: "tail",
                created_at: "2026-01-02T12:00:00.000Z",
                metadata: { flag_staff_household: true, enrollment_operational: { wait_since: "2026-02-01T00:00:00.000Z" } },
            },
        ];
        const { rows: out, diagnostics } = applyPlacementToOpportunityQueueRows({
            rows,
            placement,
            ctx: {
                workUnitId: "wu_1",
                queueKey: WAITLISTED_QUEUE_KEY,
                nowMs: 1_700_000_000_000,
                statusKeysAllowed: ["waitlisted"],
            },
        });
        expect(diagnostics.evaluated_count).toBe(1);
        expect(diagnostics.skipped_due_to_cap_count).toBe(1);
        expect(out[0]).toHaveProperty("_placement_priority");
        expect(out[1]._placement_priority).toBeUndefined();
        /** Tail keeps priority ordering relative to evaluated head only — staff row stays second. */
        expect(out.map((r) => r.id)).toEqual(["head", "tail"]);
    });

    it("row-level evaluator failure attaches error preview without throwing", () => {
        const placementResolved = resolvePlacementQueueConfig({
            departmentMetadata: null,
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: "childcare_enrollment_waitlist_v1",
                    shadow_mode: false,
                    evaluation_cap: 800,
                },
            },
            queue_key: "pipeline_total",
        });
        expect(placementResolved.status).toBe("enabled");
        const placement = placementResolved as Extract<typeof placementResolved, { status: "enabled" }>;

        const rows: Array<Record<string, unknown>> = [
            {
                id: "bad_queue_cohort",
                created_at: "2026-01-01T12:00:00.000Z",
                metadata: {},
            },
        ];
        const { rows: out, diagnostics } = applyPlacementToOpportunityQueueRows({
            rows,
            placement,
            ctx: {
                workUnitId: "wu_1",
                /** Profile cohort_filter excludes `pipeline_total` → UNSUPPORTED_COHORT per row */
                queueKey: "pipeline_total",
                nowMs: 1_700_000_000_000,
                statusKeysAllowed: ["waitlisted"],
            },
        });
        expect(diagnostics.row_evaluation_errors).toBe(1);
        expect(diagnostics.evaluated_count).toBe(0);
        const prev = out[0]._placement_priority as { evaluate_error?: boolean; code?: string };
        expect(prev.evaluate_error).toBe(true);
        expect(prev.code).toBe("UNSUPPORTED_COHORT");
    });

    it("missing optional facts can emit warnings (not crashes)", () => {
        const placement = resolveChildcarePlacement(WAITLISTED_QUEUE_KEY, { shadow_mode: true });
        const rows: Array<Record<string, unknown>> = [
            {
                id: "sibling_unknown",
                created_at: "2026-01-01T12:00:00.000Z",
                metadata: {
                    enrollment_operational: { wait_since: "2026-01-01T00:00:00.000Z" },
                    flag_sibling_enrolled: "unknown",
                },
            },
        ];
        const { rows: out, diagnostics } = applyPlacementToOpportunityQueueRows({
            rows,
            placement,
            ctx: {
                workUnitId: "wu_1",
                queueKey: WAITLISTED_QUEUE_KEY,
                nowMs: 1_700_000_000_000,
                statusKeysAllowed: ["waitlisted"],
            },
        });
        expect(diagnostics.evaluated_count).toBe(1);
        const prev = out[0]._placement_priority as { warnings: { code: string }[] };
        expect(prev.warnings.some((w) => w.code === "unknown_fact")).toBe(true);
    });

    it("unexpected throws from evaluator are contained per row", () => {
        const placement = resolveChildcarePlacement(WAITLISTED_QUEUE_KEY);
        const spy = vi.spyOn(EvalPlacementModule, "evaluatePlacementPriority").mockImplementationOnce(() => {
            throw new Error("boom");
        });
        try {
            const rows = [{ id: "x", created_at: "2026-01-01T00:00:00.000Z", metadata: {} }];
            const { rows: out, diagnostics } = applyPlacementToOpportunityQueueRows({
                rows,
                placement,
                ctx: {
                    workUnitId: "wu",
                    queueKey: WAITLISTED_QUEUE_KEY,
                    nowMs: 1,
                    statusKeysAllowed: ["waitlisted"],
                },
            });
            expect(diagnostics.row_evaluation_errors).toBe(1);
            const prev = out[0]._placement_priority as { evaluate_error: boolean; code: string };
            expect(prev.evaluate_error).toBe(true);
            expect(prev.code).toBe("UNEXPECTED");
        } finally {
            spy.mockRestore();
        }
    });

    it("evaluator integration smoke: snapshot uses QueueService evaluator version string", () => {
        const placement = resolveChildcarePlacement(WAITLISTED_QUEUE_KEY);
        const r = EvalPlacementModule.evaluatePlacementPriority({
            evaluator_version: PLACEMENT_QUEUE_SERVICE_EVALUATOR_VERSION,
            now_ms: 1,
            entity: { entity_type: "opportunity", entity_id: "o1" },
            cohort: { work_unit_id: "wu", queue_key: WAITLISTED_QUEUE_KEY, status_keys_allowed: ["waitlisted"] },
            facts: buildOpportunityPlacementFactsInline(),
            profile: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.snapshot.evaluator_version).toBe(PLACEMENT_QUEUE_SERVICE_EVALUATOR_VERSION);
    });
});

function buildOpportunityPlacementFactsInline() {
    return {
        wait_since: { presence: "present" as const, value: "2026-01-01T00:00:00.000Z" },
    };
}
