import { describe, expect, it } from "vitest";
import {
    derivePerspectiveLanesFromPipeline,
} from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle stage perspectives — Phase 2 UI shell", () => {
    it("derives lanes from pipeline queues excluding pipeline_total", () => {
        const pipeline: EnrollmentPipelineWorkUnitSnapshot = {
            id: "wu-1",
            key: "enrollment_pipeline",
            name: "Enrollment Pipeline",
            is_active: true,
            queues: [
                { key: "tours", label: "Tours" },
                { key: "waitlist", label: "Waitlist" },
                { key: "pipeline_total", label: "Total" },
            ],
            queueDefinitionRaw: {
                queues: [
                    { key: "tours", label: "Tours", grain: "family" },
                    { key: "waitlist", label: "Waitlist", grain: "child" },
                ],
            },
        };
        const lanes = derivePerspectiveLanesFromPipeline(pipeline);
        expect(lanes.map((l) => l.queueKey)).toEqual(["tours", "waitlist"]);
        expect(lanes[0]?.grain).toBe("family");
        expect(lanes[1]?.grain).toBe("child");
    });

    it("stage workspace uses Universal Card grid with perspectives card before ready check", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("configuration-runtime-stage-card-grid");
        expect(workspace).toContain('id="perspectives"');
        expect(workspace).toContain("LifecycleStagePerspectivesEditor");
        expect(workspace).toContain("BUSINESS_PROCESS_CARD_PERSPECTIVES");
        expect(workspace).toContain("LifecycleStagePresentationCard");
        const perspIdx = workspace.indexOf('id="perspectives"');
        const presentationIdx = workspace.indexOf('id="presentation"');
        const opIdx = workspace.indexOf('id="operating_plan"');
        const readyIdx = workspace.indexOf('id="ready_check"');
        expect(perspIdx).toBeGreaterThan(-1);
        expect(presentationIdx).toBeGreaterThan(perspIdx);
        expect(opIdx).toBeGreaterThan(presentationIdx);
        expect(readyIdx).toBeGreaterThan(opIdx);
    });

    it("perspectives editor uses operational lens and links to Layouts not a Queue Builder", () => {
        const editor = read("components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor.tsx");
        expect(editor).toContain("LAYOUTS_SETTINGS_HREF");
        expect(editor).toContain("BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME");
        expect(editor).not.toContain("perspectives-save-pending-note");
        expect(editor).not.toContain("queue-builder");
        expect(editor).not.toContain("focus-panel-builder");
    });

    it("does not wire deriveRuntimePerspective merge in perspectives editor", () => {
        const editor = read("components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor.tsx");
        expect(editor).not.toContain("deriveRuntimePerspective");
    });
});
