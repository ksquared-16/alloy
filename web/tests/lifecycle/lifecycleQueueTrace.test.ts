import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
    buildLifecycleQueueFilterEquivalent,
    describeLifecycleQueueScopeFilter,
    queueStatusKeysFromQueueConfig,
} from "@/lib/lifecycle/lifecycleQueueTrace";
import { resolveLifecycleOpportunityQueueScope } from "@/lib/lifecycle/lifecycleOpportunityQueueScope";

const repoRoot = path.resolve(__dirname, "../..");

describe("lifecycle queue trace", () => {
    it("strict WU scope when lifecycle WU has no dept id preload", () => {
        const scope = resolveLifecycleOpportunityQueueScope({
            workUnitId: "wu-1",
            workUnitKey: "lifecycle_wu_lead",
            departmentId: "dept-1",
            workUnitMetadata: {
                lifecycle_builder_owned_v1: { builder_owned: true },
                lifecycle_stage_key: "lead",
            },
        });
        expect(scope.mode).toBe("lifecycle_status");
        const desc = describeLifecycleQueueScopeFilter(scope, []);
        expect(desc.scope_mode).toBe("lifecycle_status_strict_wu");
        expect(desc.lifecycle_status_scope_applied).toBe(true);
    });

    it("dept scope when department work unit ids preloaded", () => {
        const scope = resolveLifecycleOpportunityQueueScope({
            workUnitId: "wu-1",
            workUnitKey: "lifecycle_wu_lead",
            departmentId: "dept-1",
            workUnitMetadata: {
                lifecycle_builder_owned_v1: { builder_owned: true },
                lifecycle_stage_key: "lead",
            },
        });
        const desc = describeLifecycleQueueScopeFilter(scope, ["wu-1", "wu-legacy"]);
        expect(desc.scope_mode).toBe("lifecycle_status_dept_scope");
    });

    it("QueueService attaches dev lifecycle_queue_debug on empty lifecycle queues", () => {
        const qs = fs.readFileSync(path.join(repoRoot, "lib/queues/QueueService.ts"), "utf8");
        expect(qs).toContain("lifecycle_queue_debug");
        expect(qs).toContain("buildLifecycleQueueEmptyDebug");
        expect(qs).toContain('process.env.NODE_ENV === "development"');
    });

    it("trace script exists", () => {
        expect(fs.existsSync(path.join(repoRoot, "scripts/traceLifecycleQueueRecords.ts"))).toBe(true);
    });

    it("extracts status keys from queue config", () => {
        const keys = queueStatusKeysFromQueueConfig({
            key: "lifecycle_lead",
            label: "Lead",
            filters: [{ type: "status", operator: "in", values: ["new_inquiry", "open"] }],
        });
        expect(keys).toEqual(expect.arrayContaining(["new_inquiry", "open"]));
        const eq = buildLifecycleQueueFilterEquivalent({
            orgId: "org",
            scope: {
                mode: "lifecycle_status",
                departmentId: "d",
                lifecycleWorkUnitId: "wu",
                stageKey: "lead",
            },
            departmentWorkUnitIds: ["a", "b"],
            statusKeys: keys,
        });
        expect(eq.status_keys).toContain("new_inquiry");
    });
});
