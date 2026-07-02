import { describe, expect, it } from "vitest";
import {
    applyWorkViewOperationalSignalsToCards,
    resolveLifecycleRollupsFromDepartmentSummaries,
} from "@/lib/admin/resolveOperatorLifecycleLandingRollups";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

describe("resolveLifecycleRollupsFromDepartmentSummaries", () => {
    it("derives active and needs-attention counts from pipeline summaries", () => {
        const rollups = resolveLifecycleRollupsFromDepartmentSummaries({
            departmentId: "dept-1",
            workUnits: [
                {
                    id: "wu-pipeline",
                    department_id: "dept-1",
                    key: "enrollment_pipeline",
                    name: "Enrollment Pipeline",
                    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
                },
            ],
            summaries: [
                {
                    id: "wu-pipeline",
                    work_unit_scope_total: 128,
                    queues: [{ key: "new_leads", count: 42, counts_deferred: false }],
                },
                {
                    id: "wu-na",
                    queues: [{ key: "needs_attention", count: 7, counts_deferred: false }],
                },
            ],
        });

        expect(rollups.activeRecordCount).toBe(128);
        expect(rollups.needsAttentionCount).toBe(7);
    });

    it("returns null metrics when summaries are unavailable", () => {
        const rollups = resolveLifecycleRollupsFromDepartmentSummaries({
            departmentId: "dept-1",
            workUnits: [
                {
                    id: "wu-pipeline",
                    department_id: "dept-1",
                    key: "enrollment_pipeline",
                    name: "Enrollment Pipeline",
                    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
                },
            ],
            summaries: [],
        });

        expect(rollups.activeRecordCount).toBeNull();
        expect(rollups.needsAttentionCount).toBeNull();
    });
});

describe("applyWorkViewOperationalSignalsToCards", () => {
    const card = (): OperatorLifecycleLandingCard => ({
        id: "life-1",
        departmentId: "dept-1",
        processKey: "enrollment",
        label: "Enrollment",
        description: "",
        entryHref: "/workspace/work-unit/new-leads",
        stageCount: 0,
        activeRecordCount: null,
        needsAttentionCount: null,
        workQueues: [
            { label: "New Leads", platformKey: "new_leads", href: "/workspace/work-unit/new-leads", work_view_id: "new_leads" },
            { label: "Waitlist", platformKey: "waitlist", href: "/workspace/work-unit/waitlist", work_view_id: "waitlist" },
        ],
    });

    it("attaches per-view attention/overdue to matching entries by work_view_id + department", () => {
        const signals = new Map([
            ["dept-1", { new_leads: { attentionCount: 2, overdueCount: 1 } }],
        ]);
        const [out] = applyWorkViewOperationalSignalsToCards([card()], signals);
        expect(out.workQueues[0]).toMatchObject({ work_view_id: "new_leads", attention_count: 2, overdue_count: 1 });
        // A view with no computed signal is left untouched (no indicator).
        expect(out.workQueues[1].attention_count).toBeUndefined();
    });

    it("leaves cards untouched when the department has no signals", () => {
        const input = [card()];
        const out = applyWorkViewOperationalSignalsToCards(input, new Map());
        expect(out[0]).toBe(input[0]);
    });
});
