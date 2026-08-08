import { describe, expect, it } from "vitest";

import {
    relatedSubjectResolutionForExecutionKey,
    resolveCurrentWorkTemplateAction,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateAction";

describe("resolveCurrentWorkTemplateAction — Move to Waitlist related subjects", () => {
    it("maps waitlist_child and move_to_waitlist to enrollment_child resolution", () => {
        expect(relatedSubjectResolutionForExecutionKey("waitlist_child")).toBe("enrollment_child");
        expect(relatedSubjectResolutionForExecutionKey("move_to_waitlist")).toBe("enrollment_child");
        expect(relatedSubjectResolutionForExecutionKey("schedule_tour")).toBeNull();
    });

    it("resolves move_to_waitlist intent to waitlist_child with related-subject metadata", () => {
        const resolved = resolveCurrentWorkTemplateAction({
            actionRef: "move_to_waitlist",
            truth: {
                eligible_enrollment_children: [
                    { id: "ocm-1", label: "Ava", customerMemberId: "cm-1" },
                    { id: "ocm-2", label: "Ben", customerMemberId: "cm-2" },
                ],
            },
        });
        expect(resolved).not.toBeNull();
        expect(resolved!.intentKey).toBe("move_to_waitlist");
        expect(resolved!.handlerKey).toBe("waitlist_child");
        expect(resolved!.relatedSubjectResolution).toBe("enrollment_child");
        expect(resolved!.requiresSubjectPicker).toBe(true);
        expect(resolved!.blockedReason).toBeNull();
    });

    it("auto-resolves single eligible child without requiring a picker flag", () => {
        const resolved = resolveCurrentWorkTemplateAction({
            actionRef: "move_to_waitlist",
            truth: {
                eligible_enrollment_children: [
                    { id: "ocm-1", label: "Ava", customerMemberId: "cm-1" },
                ],
            },
        });
        expect(resolved!.requiresSubjectPicker).toBe(false);
        expect(resolved!.relatedSubjectResolution).toBe("enrollment_child");
        expect(resolved!.blockedReason).toBeNull();
    });

    it("blocks when truth shows zero eligible children", () => {
        const resolved = resolveCurrentWorkTemplateAction({
            actionRef: "move_to_waitlist",
            truth: { eligible_enrollment_children: [] },
        });
        expect(resolved!.relatedSubjectResolution).toBe("enrollment_child");
        expect(resolved!.blockedReason).toMatch(/child/i);
    });

    it("does not block when Focus Panel truth omits child projection (execute-time resolve)", () => {
        const resolved = resolveCurrentWorkTemplateAction({
            actionRef: "move_to_waitlist",
            truth: { opportunity_id: "opp-1" },
        });
        expect(resolved!.relatedSubjectResolution).toBe("enrollment_child");
        expect(resolved!.blockedReason).toBeNull();
        expect(resolved!.requiresSubjectPicker).toBe(false);
    });
});
