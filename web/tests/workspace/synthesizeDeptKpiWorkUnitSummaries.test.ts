import { describe, expect, it } from "vitest";
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

    it("merge prefers synthesized keys over empty base", () => {
        const merged = mergeDeptWorkUnitSummariesForKpis({}, { "na-1": { total: 3, needs_attention: 3 } });
        expect(merged["na-1"].total).toBe(3);
    });
});
