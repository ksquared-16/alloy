import { describe, expect, it } from "vitest";

import {
    OPERATOR_LABEL_UNAVAILABLE,
    resolveOperatorLabel,
    resolveSpaceModeOperatorLabel,
} from "@/lib/adminV2/scheduling/resolveOperatorLabel";
import { summarizeIdentityFieldLinkTarget } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";
import { resolveAssignmentLifecycleState } from "@/lib/operationalAssignments/assignmentLifecycleState";

describe("resolveOperatorLabel", () => {
    const options = [
        { key: "pre_k", label: "Pre-K" },
        { key: "full_day", label: "Full Day" },
    ];

    it("resolves registry labels and never echoes raw keys", () => {
        expect(resolveOperatorLabel("pre_k", options)).toBe("Pre-K");
        expect(resolveOperatorLabel("full_day", options)).toBe("Full Day");
        expect(resolveOperatorLabel("unknown_key", options)).toBe(OPERATOR_LABEL_UNAVAILABLE);
        expect(resolveOperatorLabel("unknown_key", options)).not.toBe("unknown_key");
        expect(resolveOperatorLabel("", options)).toBe(OPERATOR_LABEL_UNAVAILABLE);
    });

    it("resolves Assignment Category space-mode labels", () => {
        expect(resolveSpaceModeOperatorLabel("program_match")).toBe(
            "Spaces matching the selected Program",
        );
        expect(resolveSpaceModeOperatorLabel("any")).toBe("Any valid space");
        expect(resolveSpaceModeOperatorLabel("weird")).toBe(OPERATOR_LABEL_UNAVAILABLE);
    });
});

describe("Proposed lifecycle presentation", () => {
    it("always labels commitment_kind proposed as Proposed (never Planned)", () => {
        const state = resolveAssignmentLifecycleState({
            commitmentKind: "proposed",
            status: "planned",
            asOf: "2026-08-01",
        });
        expect(state.label).toBe("Proposed");
        expect(state.tone).toBe("blue");
        expect(state.label).not.toBe("Planned");
    });
});

describe("linked field operator summary", () => {
    it("uses readable language instead of Linked → technical path", () => {
        const summary = summarizeIdentityFieldLinkTarget({
            toCard: "scheduling",
            open: "detail",
            subject: "this_child",
        });
        expect(summary).toMatch(/Primary Assignment/i);
        expect(summary).not.toMatch(/Linked →/);
    });
});
