import { describe, expect, it } from "vitest";
import { resolveWorkUnitCommandProcessName } from "@/lib/workspace/workUnitCommandHeaderTitles";
import type { WorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";

function modelWithChip(args: {
    label: string;
    selected?: boolean;
    lifecycle?: boolean;
}): WorkUnitAboveFoldRenderModel {
    return {
        header: {
            visible: true,
            state: "ready",
            sections: [
                {
                    key: "stages",
                    label: "Stages",
                    chips: [
                        {
                            key: args.lifecycle ? "lifecycle_wu_nav:wu1" : "new_leads",
                            label: args.label,
                            priority: "standard",
                            selected: args.selected ?? true,
                            count: 3,
                        },
                    ],
                },
            ],
        },
        actions_rail: { visible: false, state: "ready", actions_rail: { primaries: [] } },
        queue_lane: { visible: true, state: "ready", skeleton_row_count: 0 },
    };
}

describe("resolveWorkUnitCommandProcessName", () => {
    it("uses lifecycle business process label for enrollment work units", () => {
        expect(
            resolveWorkUnitCommandProcessName({
                aboveFold: modelWithChip({ label: "New Leads", lifecycle: true }),
                processName: "Main Department",
            })
        ).toBe("Enrollment");
    });

    it("falls back to shell process name when not lifecycle", () => {
        expect(
            resolveWorkUnitCommandProcessName({
                aboveFold: modelWithChip({ label: "Queue", lifecycle: false }),
                processName: "Operations",
            })
        ).toBe("Operations");
    });
});
