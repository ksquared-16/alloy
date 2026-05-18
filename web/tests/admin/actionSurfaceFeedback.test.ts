import { describe, expect, it, vi, afterEach } from "vitest";
import {
    classifyRegistryDefinitionExecutor,
    formatLegacyRecordActionFailure,
    formatRegistryActionFailure,
    handleRegistrySectionActionOutcome,
    isRegistryMutatingActionType,
    registryExecutorLabel,
    shouldNotifyOpportunityRecordUpdated,
} from "@/lib/admin/actions/actionSurfaceFeedback";

describe("actionSurfaceFeedback", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("classifies registry definition executors", () => {
        expect(classifyRegistryDefinitionExecutor("ui_intent")).toBe("registry_ui_intent");
        expect(classifyRegistryDefinitionExecutor("navigate")).toBe("registry_navigate");
        expect(classifyRegistryDefinitionExecutor("open_drawer")).toBe("registry_open_drawer");
        expect(classifyRegistryDefinitionExecutor("open_form")).toBe("registry_open_form");
        expect(classifyRegistryDefinitionExecutor("start_workflow")).toBe("registry_execute");
    });

    it("labels executors for Settings display", () => {
        expect(registryExecutorLabel("registry_execute")).toContain("Registry");
        expect(registryExecutorLabel("legacy_record_action_patch")).toContain("Legacy");
    });

    it("detects mutating registry action types", () => {
        expect(isRegistryMutatingActionType("open_form")).toBe(false);
        expect(isRegistryMutatingActionType("mutate_status")).toBe(true);
    });

    it("formats registry and legacy failures", () => {
        expect(formatRegistryActionFailure("Denied")).toBe("Denied");
        expect(formatRegistryActionFailure()).toContain("could not be completed");
        expect(formatLegacyRecordActionFailure("mark_won", "Bad status")).toContain("mark_won");
    });

    it("notifies opportunity refresh only on mutating registry success", () => {
        expect(shouldNotifyOpportunityRecordUpdated("ui_intent", { ok: true })).toBe(false);
        expect(shouldNotifyOpportunityRecordUpdated("start_workflow", { ok: true })).toBe(true);
    });

    it("handleRegistrySectionActionOutcome dispatches on mutating success", () => {
        const dispatch = vi.fn();
        vi.stubGlobal("window", { dispatchEvent: dispatch });
        const out = handleRegistrySectionActionOutcome(
            "opp-1",
            { key: "qualify", action_type: "mutate_status" },
            { ok: true, execution_result: { kind: "row" } }
        );
        expect(out.error).toBeNull();
        expect(out.notified).toBe(true);
        expect(dispatch).toHaveBeenCalled();
    });

    it("handleRegistrySectionActionOutcome returns error on failure", () => {
        const out = handleRegistrySectionActionOutcome(
            "opp-1",
            { key: "qualify", action_type: "mutate_status" },
            { ok: false, error: "Forbidden" }
        );
        expect(out.error).toBe("Forbidden");
        expect(out.notified).toBe(false);
    });

    it("handleRegistrySectionActionOutcome does not dispatch for open_form or navigate success", () => {
        const dispatch = vi.fn();
        vi.stubGlobal("window", { dispatchEvent: dispatch });
        for (const action_type of ["open_form", "navigate", "ui_intent"] as const) {
            const out = handleRegistrySectionActionOutcome(
                "opp-1",
                { key: "schedule_tour", action_type },
                { ok: true }
            );
            expect(out.error).toBeNull();
            expect(out.notified).toBe(false);
        }
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("handleRegistrySectionActionOutcome does not dispatch when mutating execute fails", () => {
        const dispatch = vi.fn();
        vi.stubGlobal("window", { dispatchEvent: dispatch });
        const out = handleRegistrySectionActionOutcome(
            "opp-1",
            { key: "qualify", action_type: "mutate_status" },
            { ok: false, error: "Denied" }
        );
        expect(out.notified).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
    });
});
