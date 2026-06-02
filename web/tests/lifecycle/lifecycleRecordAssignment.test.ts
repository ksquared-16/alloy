import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    applyLifecycleDepartmentOpportunityScopeToQuery,
    resolveLifecycleOpportunityQueueScope,
} from "@/lib/lifecycle/lifecycleOpportunityQueueScope";
import { lifecycleRecordsMisassignedCopy } from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import { resolveLifecycleCreateLeadBinding } from "@/lib/lifecycle/lifecycleRuntimeBinding";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle opportunity queue scope", () => {
    it("uses lifecycle_status scope for builder-owned lifecycle_wu rows", () => {
        const scope = resolveLifecycleOpportunityQueueScope({
            workUnitId: "wu-lead",
            workUnitKey: "lifecycle_wu_lead",
            departmentId: "dept-1",
            departmentMetadata: {
                lifecycle_builder_owned_v1: {
                    source: "lifecycle_builder",
                    created_by: "u",
                    created_at: "t",
                    process_id: "p",
                },
            },
            workUnitMetadata: {
                lifecycle_builder_owned_v1: { builder_owned: true },
                lifecycle_stage_key: "lead",
            },
        });
        expect(scope.mode).toBe("lifecycle_status");
        if (scope.mode === "lifecycle_status") {
            expect(scope.departmentId).toBe("dept-1");
            expect(scope.lifecycleWorkUnitId).toBe("wu-lead");
        }
    });

    it("keeps work_unit_id scope for non-lifecycle work units", () => {
        const scope = resolveLifecycleOpportunityQueueScope({
            workUnitId: "wu-pipe",
            workUnitKey: "enrollment_pipeline",
            departmentId: "dept-1",
            workUnitMetadata: null,
        });
        expect(scope).toEqual({ mode: "work_unit_id", workUnitId: "wu-pipe" });
    });

    it("department scope OR includes null and department work unit ids", () => {
        const calls: string[] = [];
        const q = {
            or: (expr: string) => {
                calls.push(expr);
                return q;
            },
        };
        applyLifecycleDepartmentOpportunityScopeToQuery(q, ["wu-a", "wu-b"]);
        expect(calls[0]).toBe("work_unit_id.is.null,work_unit_id.in.(wu-a,wu-b)");
    });
});

describe("lifecycle record assignment wiring", () => {
    it("QueueService applies lifecycle department scope without extra dept fetch on bootstrap", () => {
        const qs = read("lib/queues/QueueService.ts");
        expect(qs).toContain("resolveOpportunityQueueScopeBundle");
        expect(qs).toContain("departmentWorkUnitIdsForLifecycleScope");
        expect(qs).not.toContain("listDepartmentWorkUnitIdsForOpportunityScope");
        expect(qs).toContain("applyOpportunityQueueWorkUnitScope");
        expect(qs).toContain("opportunityScopeBundle");
    });

    it("attach-records API and validation misassigned copy exist", () => {
        expect(read("app/api/admin/lifecycle-catalog/attach-records/route.ts")).toContain(
            "attachMatchingRecordsToLifecycleWorkUnits"
        );
        expect(read("lib/lifecycle/attachLifecycleWorkUnitRecords.ts")).toContain(
            "work_unit_id: wu.id"
        );
        expect(lifecycleRecordsMisassignedCopy(3)).toContain("Repair available");
        expect(read("lib/lifecycle/validateLifecycleActivationRuntime.ts")).toContain(
            "countLifecycleOpportunityRecordsForWorkUnit"
        );
    });

    it("validation UI offers attach matching records", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationValidation.tsx")).toContain(
            "lifecycle-activation-attach-records"
        );
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "attach-records"
        );
    });

    it("create lead uses entry binding from lifecycle config for builder-owned depts", () => {
        const src = read("lib/lifecycle/lifecycleRuntimeBinding.ts");
        expect(src).toContain("resolveBuilderOwnedLifecycleCreateLeadBinding");
        expect(resolveLifecycleCreateLeadBinding).toBeDefined();
        expect(read("lib/admin/actions/entryLifecycleActions.ts")).toContain(
            "resolveLifecycleCreateLeadBinding"
        );
        expect(read("lib/lifecycle/lifecycleCreateLeadEntryBinding.ts")).toContain(
            "resolveCreateLeadEntryStageKey"
        );
    });
});
