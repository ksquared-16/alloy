import { describe, expect, it } from "vitest";
import {
    addStageToProcess,
    createLifecycleProcess,
    defaultLifecycleBuilderV1,
    emptyLifecycleBuilderV1,
    lifecycleBuilderFromDepartmentMetadata,
    parseLifecycleBuilderV1,
    reorderStage,
    renameStage,
    stageKeysForProcess,
    updateProcessName,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

describe("lifecycleBuilderConfig", () => {
    it("empty config has no processes", () => {
        const config = emptyLifecycleBuilderV1();
        expect(config.processes).toHaveLength(0);
        expect(config.active_process_id).toBeNull();
    });

    it("metadata without builder returns empty config", () => {
        expect(lifecycleBuilderFromDepartmentMetadata({})).toEqual(emptyLifecycleBuilderV1());
    });

    it("seeds default enrollment process shell without pre-built stages", () => {
        const config = defaultLifecycleBuilderV1();
        const process = config.processes[0]!;
        expect(process.name).toBe("Enrollment Process");
        expect(stageKeysForProcess(process)).toHaveLength(0);
        expect(process.tracks_v1).toBeUndefined();
    });

    it("createLifecycleProcess adds a new process with no stages", () => {
        const base = emptyLifecycleBuilderV1();
        const next = createLifecycleProcess("Billing", base);
        expect(next.processes).toHaveLength(1);
        expect(next.processes[0]?.stages).toHaveLength(0);
        expect(next.active_process_id).toBe(next.processes[0]?.id);
    });

    it("rename and reorder stages", () => {
        let config = defaultLifecycleBuilderV1();
        const process = config.processes[0]!;
        config = addStageToProcess(config, process.id, "Lead");
        config = addStageToProcess(config, process.id, "Qualification");
        const stage = config.processes[0]!.stages[1]!;
        config = renameStage(config, process.id, stage.id, "Qualify");
        config = reorderStage(config, process.id, stage.id, "up");
        const updated = config.processes[0]!.stages.find((s) => s.id === stage.id);
        expect(updated?.label).toBe("Qualify");
        expect(updated?.sort_order).toBe(0);
    });

    it("addStageToProcess appends a stage", () => {
        let config = defaultLifecycleBuilderV1();
        const process = config.processes[0]!;
        config = addStageToProcess(config, process.id, "Onboarding");
        expect(config.processes[0]!.stages.some((s) => s.label === "Onboarding")).toBe(true);
    });

    it("updateProcessName changes display name", () => {
        let config = defaultLifecycleBuilderV1();
        const id = config.processes[0]!.id;
        config = updateProcessName(config, id, "Family Enrollment");
        expect(config.processes[0]?.name).toBe("Family Enrollment");
    });

    it("round-trips through parseLifecycleBuilderV1", () => {
        let config = defaultLifecycleBuilderV1();
        config = addStageToProcess(config, config.processes[0]!.id, "Lead");
        const parsed = parseLifecycleBuilderV1(config);
        expect(parsed?.processes[0]?.stages.length).toBe(1);
    });
});
