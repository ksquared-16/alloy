import { describe, expect, it } from "vitest";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    buildWorkUnitAboveFoldPlaceholderSections,
    buildWorkUnitAboveFoldPillSections,
} from "@/lib/workspace/workUnitQueueDerived";
import {
    resolveDeptWorkUnitDisplayLabel,
    resolveWorkUnitShellDisplayTitle,
    WORK_UNIT_SHELL_DISPLAY_FALLBACK,
} from "@/lib/workspace/workUnitShellDisplayTitle";
import { buildDefaultDepartmentKpis } from "@/lib/kpi/baseline";

describe("workUnitShellDisplayTitle", () => {
    it("uses configured work unit name when present", () => {
        expect(
            resolveWorkUnitShellDisplayTitle({
                workUnitId: "wu-1",
                workUnitName: "Enrollment Pipeline",
            })
        ).toBe("Enrollment Pipeline");
    });

    it("falls back deterministically when name is missing", () => {
        expect(resolveWorkUnitShellDisplayTitle({ workUnitId: "wu-1", workUnitName: null })).toBe(
            WORK_UNIT_SHELL_DISPLAY_FALLBACK
        );
    });

    it("resolveDeptWorkUnitDisplayLabel prefers work_units.name over legacy KPI copy", () => {
        expect(
            resolveDeptWorkUnitDisplayLabel({
                name: "Enrollment Pipeline",
                key: "enrollment_pipeline",
            })
        ).toBe("Enrollment Pipeline");
    });

    it("buildDefaultDepartmentKpis uses configured work unit name", () => {
        const kpis = buildDefaultDepartmentKpis({
            deptWorkUnits: [{ id: "wu-1", name: "Enrollment Pipeline", key: "enrollment_pipeline" }],
            deptWorkUnitSummaries: { "wu-1": { total: 12, needs_attention: 2 } },
            deptQueueSummariesLoading: false,
            deptQueueSummariesError: null,
        });
        const facet = kpis.find((k) => k.id === "wu_wu-1");
        expect(facet?.label).toBe("Enrollment Pipeline");
        expect(facet?.label).not.toBe("Active inquiries");
    });
});

describe("buildWorkUnitAboveFoldPillSections defensive", () => {
    const ui = getQueueUiConfig(ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def);

    it("returns null when sectionedSummaries is undefined", () => {
        expect(
            buildWorkUnitAboveFoldPillSections({
                ui,
                sectionedSummaries: undefined,
            })
        ).toBeNull();
    });

    it("placeholder builder accepts sections alias and does not crash", () => {
        const out = buildWorkUnitAboveFoldPlaceholderSections({
            ui,
            sections: [
                {
                    key: "new_leads",
                    label: "New Leads",
                    queues: [{ key: "new_leads", label: "New Leads", priority: "standard" }],
                },
                {
                    key: "needs_attention",
                    label: "Needs Attention",
                    tone: "critical",
                    queues: [{ key: "needs_attention", label: "Needs Attention", priority: "critical" }],
                },
            ],
        });
        expect(out?.map((s) => s.key)).toEqual(["pipeline", "needs_attention"]);
        expect(out?.[0]?.queues[0]?.label).toBe("New Leads");
    });
});
