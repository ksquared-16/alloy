import { describe, expect, it } from "vitest";

import {
    evaluateRequiresSubjectPicker,
    resolveActionIntentExecution,
} from "@/lib/lifecycle/resolveActionIntentExecution";

describe("resolveActionIntentExecution", () => {
    it("stores move_to_waitlist intent and resolves family-grain execution to waitlist_child", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "move_to_waitlist",
            stageDefinition: { journey_segment: "family" },
        });

        expect(plan.intentKey).toBe("move_to_waitlist");
        expect(plan.executionKey).toBe("waitlist_child");
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

    it("does not resolve move_to_waitlist to legacy opportunity mutation", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "move_to_waitlist",
            stageDefinition: { journey_segment: "family" },
            processDefinition: { primary_entity: "opportunity" },
        });
        expect(plan.executionKey).toBe("waitlist_child");
        expect(plan.executionKey).not.toBe("move_to_waitlist");
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

        expect(plan.executionKey).toBe("waitlist_child");
    });

    it("requires subject picker when truth lists multiple eligible children", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "move_to_waitlist",
            stageDefinition: { journey_segment: "family" },
            truth: {
                eligible_enrollment_children: [
                    { id: "ocm-1", customerMemberId: "cm-1", label: "Ava" },
                    { id: "ocm-2", customerMemberId: "cm-2", label: "Ben" },
                ],
            },
        });
        expect(plan.requiresSubjectPicker).toBe(true);
        expect(plan.applicableSubjects).toHaveLength(2);
    });

    it("does not require picker for exactly one eligible child", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "move_to_waitlist",
            stageDefinition: { journey_segment: "family" },
            truth: {
                eligible_enrollment_children: [
                    { id: "ocm-1", customerMemberId: "cm-1", label: "Ava" },
                ],
            },
        });
        expect(plan.requiresSubjectPicker).toBe(false);
        expect(plan.applicableSubjects).toHaveLength(1);
    });

    it("does not block Move to Waitlist when truth omits enrollment-child projection", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "move_to_waitlist",
            stageDefinition: { journey_segment: "family" },
            truth: { opportunity_id: "opp-1" },
        });
        expect(plan.blockedReason).toBeUndefined();
        expect(plan.executionKey).toBe("waitlist_child");
    });

    it("blocks Move to Waitlist only when truth projected an empty child list", () => {
        const plan = resolveActionIntentExecution({
            actionRef: "move_to_waitlist",
            stageDefinition: { journey_segment: "family" },
            truth: { eligible_enrollment_children: [] },
        });
        expect(plan.blockedReason).toMatch(/child/i);
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
            evaluateRequiresSubjectPicker(
                [
                    { id: "sub-1", label: "Subject A" },
                    { id: "sub-2", label: "Subject B" },
                ],
                "single",
            ),
        ).toBe(true);
        expect(
            evaluateRequiresSubjectPicker([{ id: "sub-1", label: "Subject A" }], "configured"),
        ).toBe(false);
    });
});
