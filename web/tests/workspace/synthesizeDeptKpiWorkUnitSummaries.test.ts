import { describe, expect, it } from "vitest";
import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import {
    mergeDeptWorkUnitSummariesForKpis,
    synthesizeDeptKpiWorkUnitSummaries,
} from "@/lib/workspace/synthesizeDeptKpiWorkUnitSummaries";

describe("synthesizeDeptKpiWorkUnitSummaries", () => {
    it("derives needs_attention and enrollment_pipeline totals from bootstrap oper payload", () => {
        const synth = synthesizeDeptKpiWorkUnitSummaries({
            workUnits: [
                { id: "na-1", key: "needs_attention" },
                { id: "en-1", key: "enrollment_pipeline" },
            ],
            attention: { total: 12 },
            pipelineSurface: {
                workUnitId: "en-1",
                panelTitle: "Pipeline",
                lanes: [
                    { key: "a", label: "A", icon: null, count: 5, countsDeferred: false },
                    { key: "b", label: "B", icon: null, count: 7, countsDeferred: false },
                ],
            },
        });
        expect(synth["na-1"]).toEqual({ total: 12, needs_attention: 12 });
        expect(synth["en-1"]).toEqual({ total: 12, needs_attention: 0 });
    });

    it("maps attention total onto enrollment_pipeline when needs_attention is a queue lane", () => {
        const synth = synthesizeDeptKpiWorkUnitSummaries({
            departmentId: "dept-1",
            workUnits: [
                {
                    id: "en-1",
                    key: "enrollment_pipeline",
                    department_id: "dept-1",
                    queue_definition: CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1,
                },
            ],
            attention: { total: 9 },
            pipelineSurface: {
                workUnitId: "en-1",
                panelTitle: "Pipeline",
                lanes: [
                    { key: "a", label: "A", icon: null, count: 4, countsDeferred: false },
                    { key: "b", label: "B", icon: null, count: 5, countsDeferred: false },
                ],
            },
        });
        expect(synth["en-1"]).toEqual({ total: 9, needs_attention: 9 });
        expect(synth["na-1"]).toBeUndefined();
    });

    it("merge prefers synthesized keys over empty base", () => {
        const merged = mergeDeptWorkUnitSummariesForKpis({}, { "na-1": { total: 3, needs_attention: 3 } });
        expect(merged["na-1"].total).toBe(3);
    });
});
