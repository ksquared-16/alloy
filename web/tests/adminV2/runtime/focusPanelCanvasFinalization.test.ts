import { describe, it, expect } from "vitest";

import {
    clampPerspectiveForCard,
    isOperationalTruthCard,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import { inferWorkItemOwner } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence";
import type { OperationalWorkItem } from "@/lib/adminV2/runtime/operationalContext/types";

function workItem(label: string): OperationalWorkItem {
    return {
        id: "t1",
        label,
        state: "open",
        dueLabel: null,
        dueAt: null,
        urgency: "upcoming",
        source: null,
        kind: "task",
    };
}

describe("Focus Panel canvas rule — operational-truth vs diagnostic", () => {
    it("classifies Household and Children as operational-truth (may elevate)", () => {
        expect(isOperationalTruthCard("household")).toBe(true);
        expect(isOperationalTruthCard("children")).toBe(true);
    });

    it("classifies Readiness and Current Work as diagnostic (never elevate)", () => {
        expect(isOperationalTruthCard("readiness_kpi")).toBe(false);
        expect(isOperationalTruthCard("current_work")).toBe(false);
    });

    it("passes truth-card depth through unchanged", () => {
        expect(clampPerspectiveForCard("children", "focused")).toBe("focused");
        expect(clampPerspectiveForCard("children", "edit")).toBe("edit");
        expect(clampPerspectiveForCard("household", "focused")).toBe("focused");
    });

    it("clamps diagnostic-card depth to Evidence (no Focus Card workspace)", () => {
        expect(clampPerspectiveForCard("readiness_kpi", "focused")).toBe("evidence");
        expect(clampPerspectiveForCard("current_work", "focused")).toBe("evidence");
        expect(clampPerspectiveForCard("current_work", "edit")).toBe("evidence");
        // base/evidence are left intact.
        expect(clampPerspectiveForCard("current_work", "base")).toBe("base");
        expect(clampPerspectiveForCard("readiness_kpi", "evidence")).toBe("evidence");
    });
});

describe("Current Work → owner handoff inference", () => {
    it("routes contact/reach intents to Household", () => {
        expect(inferWorkItemOwner(workItem("Contact family"))?.card).toBe("household");
        expect(inferWorkItemOwner(workItem("Call the Johnsons"))?.card).toBe("household");
        expect(inferWorkItemOwner(workItem("Send follow-up email"))?.card).toBe("household");
    });

    it("routes enrollment/program intents to Children", () => {
        expect(inferWorkItemOwner(workItem("Confirm program selection"))?.card).toBe("children");
        expect(inferWorkItemOwner(workItem("Set schedule for child"))?.card).toBe("children");
    });

    it("returns null for ambiguous work (expands inline instead)", () => {
        expect(inferWorkItemOwner(workItem("Review lead"))).toBeNull();
        expect(inferWorkItemOwner(workItem("Advance to enrolled"))).toBeNull();
    });
});
