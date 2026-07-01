/**
 * Perspectives v1 save wiring static tests (Configuration Runtime Phase 2B).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Lifecycle stage perspectives persistence wiring", () => {
    it("stage workspace exposes perspectives dirty/save handle", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("isPerspectivesDirty");
        expect(workspace).toContain("getPerspectivesDraft");
        expect(workspace).toContain("perspectivesDirty");
        expect(workspace).toContain("savedPerspectives={bootstrap?.perspectives_v1 ?? null}");
    });

    it("unified save includes perspectives_v1 when dirty", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("isPerspectivesDirty");
        expect(board).toContain("getPerspectivesDraft");
        expect(board).toContain("perspectives_v1");
    });

    it("stage-runtime-config accepts perspectives_v1", () => {
        const route = read("app/api/admin/enrollment-process/stage-runtime-config/route.ts");
        expect(route).toContain("perspectives_v1");
        expect(route).toContain("parsePerspectivesV1");
    });

    it("save transaction persists perspectives_v1 metadata", () => {
        const save = read("lib/lifecycle/saveLifecycleStageRuntimeConfig.ts");
        expect(save).toContain("persistPerspectivesForLifecycleStageSave");
        expect(save).toContain("perspectivesV1");
    });

    it("bootstrap loads coerced perspectives_v1 from stage metadata", () => {
        const bootstrap = read("lib/lifecycle/buildLifecycleStageBootstrap.ts");
        expect(bootstrap).toContain("resolvePerspectivesForStage");
        expect(bootstrap).toContain("coercePerspectivesV1ForLanes");
        expect(bootstrap).toContain("perspectives_v1");
    });

    it("does not wire deriveRuntimePerspective merge yet", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor.tsx")).not.toContain(
            "deriveRuntimePerspective",
        );
        expect(read("lib/lifecycle/saveLifecycleStageRuntimeConfig.ts")).not.toContain("deriveRuntimePerspective");
    });

    it("removed Phase 2 save-pending banner from perspectives editor", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor.tsx")).not.toContain(
            "perspectives-save-pending-note",
        );
    });
});
