import { describe, expect, it } from "vitest";
import {
    applyOpportunityQueueWorkUnitScope,
    resolveLifecycleOpportunityQueueScope,
} from "@/lib/lifecycle/lifecycleOpportunityQueueScope";
import {
    resolveLifecycleVisibilityPredicate,
} from "@/lib/lifecycle/lifecycleVisibilityEvaluator";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";

describe("lifecycleVisibilityEvaluator", () => {
    it("returns lifecycle_visibility without work_unit gate for lifecycle_wu_*", () => {
        const predicate = resolveLifecycleVisibilityPredicate({
            orgId: "org-1",
            departmentId: "dept-1",
            workUnitId: "wu-lead",
            workUnitKey: "lifecycle_wu_lead",
            workUnitMetadata: {
                lifecycle_builder_owned_v1: { builder_owned: true },
                lifecycle_stage_key: "lead",
                status_keys: ["new_inquiry"],
            },
        });
        expect(predicate.query_mode).toBe("lifecycle_visibility");
        expect(predicate.requires_work_unit_visibility_gate).toBe(false);
        expect(predicate.status_keys).toContain("new_inquiry");
        expect(predicate.assignment_home_work_unit_id).toBe("wu-lead");
    });

    it("returns legacy_pipeline for enrollment_pipeline work unit", () => {
        const predicate = resolveLifecycleVisibilityPredicate({
            orgId: "org-1",
            workUnitId: "wu-pipe",
            workUnitKey: ENROLLMENT_PIPELINE_WORK_UNIT_KEY,
        });
        expect(predicate.query_mode).toBe("legacy_pipeline");
        expect(predicate.requires_work_unit_visibility_gate).toBe(true);
    });

    it("returns assignment_home for generic work units", () => {
        const predicate = resolveLifecycleVisibilityPredicate({
            orgId: "org-1",
            workUnitId: "wu-jobs",
            workUnitKey: "field_jobs",
        });
        expect(predicate.query_mode).toBe("assignment_home");
        expect(predicate.requires_work_unit_visibility_gate).toBe(true);
    });
});

describe("lifecycle opportunity queue scope (visibility)", () => {
    it("uses lifecycle_visibility scope for builder-owned lifecycle_wu rows", () => {
        const scope = resolveLifecycleOpportunityQueueScope({
            orgId: "org-1",
            workUnitId: "wu-lead",
            workUnitKey: "lifecycle_wu_lead",
            departmentId: "dept-1",
            workUnitMetadata: {
                lifecycle_builder_owned_v1: { builder_owned: true },
                lifecycle_stage_key: "lead",
            },
        });
        expect(scope.mode).toBe("lifecycle_visibility");
        if (scope.mode === "lifecycle_visibility") {
            expect(scope.departmentId).toBe("dept-1");
            expect(scope.lifecycleWorkUnitId).toBe("wu-lead");
        }
    });

    it("does not add work_unit_id filter for lifecycle_visibility queries", () => {
        const scope = resolveLifecycleOpportunityQueueScope({
            orgId: "org-1",
            workUnitId: "wu-lead",
            workUnitKey: "lifecycle_wu_lead",
            departmentId: "dept-1",
            workUnitMetadata: {
                lifecycle_builder_owned_v1: { builder_owned: true },
                lifecycle_stage_key: "lead",
            },
        });
        const eqCalls: Array<[string, string]> = [];
        const q = {
            eq: (col: string, val: string) => {
                eqCalls.push([col, val]);
                return q;
            },
            or: (expr: string) => {
                void expr;
                return q;
            },
        };
        applyOpportunityQueueWorkUnitScope(q, scope, []);
        expect(eqCalls).toEqual([]);
    });

    it("keeps work_unit_id scope for enrollment_pipeline", () => {
        const scope = resolveLifecycleOpportunityQueueScope({
            orgId: "org-1",
            workUnitId: "wu-pipe",
            workUnitKey: ENROLLMENT_PIPELINE_WORK_UNIT_KEY,
            departmentId: "dept-1",
        });
        expect(scope).toEqual({ mode: "work_unit_id", workUnitId: "wu-pipe" });
        const eqCalls: Array<[string, string]> = [];
        const q = {
            eq: (col: string, val: string) => {
                eqCalls.push([col, val]);
                return q;
            },
            or: (expr: string) => {
                void expr;
                return q;
            },
        };
        applyOpportunityQueueWorkUnitScope(q, scope, []);
        expect(eqCalls).toEqual([["work_unit_id", "wu-pipe"]]);
    });
});
