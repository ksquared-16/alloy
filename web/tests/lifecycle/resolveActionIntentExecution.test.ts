import { describe, expect, it } from "vitest";

import {
    evaluateRequiresSubjectPicker,
    resolveActionIntentExecution,
} from "@/lib/lifecycle/resolveActionIntentExecution";

describe("resolveActionIntentExecution", () => {
    it("stores move_to_waitlist intent and resolves family-grain execution", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "move_to_waitlist",
            stageDefinition: { journey_segment: "family" },
        });

        expect(plan.intentKey).toBe("move_to_waitlist");
        expect(plan.executionKey).toBe("move_to_waitlist");
        expect(plan.requiresSubjectPicker).toBe(false);
    });

    it("resolves child-grain execution from process configuration without changing intent ref", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "move_to_waitlist",
            stageDefinition: { journey_segment: "child" },
        });

        expect(plan.intentKey).toBe("move_to_waitlist");
        expect(plan.executionKey).toBe("waitlist_child");
    });

    it("executes legacy saved alias refs without breaking", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "waitlist_child",
            stageDefinition: { journey_segment: "family" },
        });

        expect(plan.intentKey).toBe("move_to_waitlist");
        expect(plan.executionKey).toBe("waitlist_child");
    });

    it("passes through non-intent action refs unchanged", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "schedule_tour",
        });

        expect(plan.intentKey).toBe("schedule_tour");
        expect(plan.executionKey).toBe("schedule_tour");
    });

    it("does not branch on enrollment-specific process keys", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "move_to_waitlist",
            processDefinition: { key: "billing", primary_entity: "opportunity" },
            stageDefinition: { journey_segment: "family" },
        });

        expect(plan.executionKey).toBe("move_to_waitlist");
    });

    it("evaluates multi-subject selection requirement without enrollment conditionals", () => {
        expect(
            evaluateRequiresSubjectPicker(
                [
                    { id: "sub-1", label: "Subject A" },
                    { id: "sub-2", label: "Subject B" },
                ],
                "one_or_more",
            ),
        ).toBe(true);
        expect(
            evaluateRequiresSubjectPicker([{ id: "sub-1", label: "Subject A" }], "configured"),
        ).toBe(false);
    });
});
