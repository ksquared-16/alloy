import { describe, expect, it } from "vitest";
import { resolveSubjectStatusLabel } from "@/lib/workUnits/buildPartialQueueRowContextHelpers";
import { formatLayoutRuntimeStatusLabel } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";
import { canonicalNewLeadStatusLabel } from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";

/**
 * PRV2 Final Integration — one status-label pipeline. A lingering legacy New Lead key must render
 * "New Lead" everywhere and the raw `new_inquiry` key must never reach the UI.
 */
describe("New Lead status label — single pipeline", () => {
    it("canonicalNewLeadStatusLabel resolves the legacy keys and nothing else", () => {
        expect(canonicalNewLeadStatusLabel("new_inquiry")).toBe("New Lead");
        expect(canonicalNewLeadStatusLabel("new_lead")).toBe("New Lead");
        expect(canonicalNewLeadStatusLabel("new")).toBe("New");
        expect(canonicalNewLeadStatusLabel("waitlisted")).toBeNull();
    });

    it("resolveSubjectStatusLabel: New Lead canonicalized, others humanized, empty → dash", () => {
        expect(resolveSubjectStatusLabel("new_inquiry")).toBe("New Lead");
        expect(resolveSubjectStatusLabel("new_lead")).toBe("New Lead");
        expect(resolveSubjectStatusLabel("waitlisted")).toBe("Waitlisted");
        expect(resolveSubjectStatusLabel("tour_scheduled")).toBe("Tour Scheduled");
        expect(resolveSubjectStatusLabel("")).toBe("—");
        expect(resolveSubjectStatusLabel(null)).toBe("—");
    });

    it("formatLayoutRuntimeStatusLabel maps new_inquiry to New Lead in a status context", () => {
        expect(
            formatLayoutRuntimeStatusLabel("new_inquiry", {
                refKey: "status_key",
                renderHint: "status",
            }),
        ).toBe("New Lead");
        // Still never emits the raw key.
        expect(
            formatLayoutRuntimeStatusLabel("new_inquiry", { renderHint: "status" }),
        ).not.toBe("new_inquiry");
        // Canonical collapsed keys keep their vocabulary labels.
        expect(
            formatLayoutRuntimeStatusLabel("waitlisted", {
                refKey: "inquiry_child.outcome_status_key",
                renderHint: "status",
            }),
        ).toBe("Waitlisted");
        // Bare lowercase status tokens must never reach the UI unchanged.
        expect(formatLayoutRuntimeStatusLabel("new", { renderHint: "status" })).toBe("New");
    });
});
