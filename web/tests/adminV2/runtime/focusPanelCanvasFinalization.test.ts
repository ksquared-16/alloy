import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import {
    clampPerspectiveForCard,
    isOperationalTruthCard,
    isWorkOwningCard,
    resolveElevatedCellKey,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { inferWorkItemOwner } from "@/lib/adminV2/runtime/focusPanel/currentWork/inferWorkItemOwner";
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

    it("classifies Current Work as work-owning (workspace, not centered elevate)", () => {
        expect(isWorkOwningCard("current_work")).toBe(true);
        expect(isOperationalTruthCard("current_work")).toBe(false);
    });

    it("passes truth-card depth through unchanged; Current Work does not elevate", () => {
        expect(clampPerspectiveForCard("children", "focused")).toBe("focused");
        expect(clampPerspectiveForCard("children", "edit")).toBe("edit");
        expect(clampPerspectiveForCard("household", "focused")).toBe("focused");
        // Current Work opens a Focus Panel workspace instead of a centered Focus Card.
        expect(clampPerspectiveForCard("current_work", "focused")).toBe("evidence");
    });

    it("clamps diagnostic-card depth to Evidence (no Focus Card workspace)", () => {
        expect(clampPerspectiveForCard("readiness_kpi", "focused")).toBe("evidence");
        expect(clampPerspectiveForCard("readiness_kpi", "edit")).toBe("evidence");
        expect(clampPerspectiveForCard("current_work", "base")).toBe("base");
        expect(clampPerspectiveForCard("readiness_kpi", "evidence")).toBe("evidence");
    });

    it("resolves elevated cell keys from card type to layout instance keys", () => {
        const resolution = new Map<string, { typeKey: FocusPanelCardKey }>([
            ["household-main", { typeKey: "household" }],
            ["cw-slot", { typeKey: "current_work" }],
        ]);

        expect(resolveElevatedCellKey("current_work", resolution)).toBe("cw-slot");
        expect(resolveElevatedCellKey("household", resolution)).toBe("household-main");
        expect(resolveElevatedCellKey(null, resolution)).toBeNull();
        expect(resolveElevatedCellKey("documents", resolution)).toBe("documents");
    });

    it("Current Work wrapper uses display:contents so Focus elevation anchors to the grid", () => {
        const css = readFileSync(
            path.join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"),
            "utf8",
        );
        expect(css).toMatch(/\.alloy-os-currentwork\s*\{[^}]*display:\s*contents/);
        expect(css).not.toMatch(
            /\.alloy-os-focus-panel-grid:not\(\.alloy-os-focus-panel-grid--work\)\s*\.alloy-os-currentwork\s*\{[^}]*position:\s*relative/,
        );
    });
});

describe("Current Work → owner handoff inference", () => {
    it("routes outreach (contact/call/reach) to Communications", () => {
        expect(inferWorkItemOwner(workItem("Contact family"))?.card).toBe("communications");
        expect(inferWorkItemOwner(workItem("Call the Johnsons"))?.card).toBe("communications");
    });

    it("routes message/email intents to Communications", () => {
        expect(inferWorkItemOwner(workItem("Send follow-up email"))?.card).toBe("communications");
    });

    it("routes contact-data verification to Household", () => {
        expect(inferWorkItemOwner(workItem("Verify contact information"))?.card).toBe("household");
        expect(inferWorkItemOwner(workItem("Find phone number"))?.card).toBe("household");
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
