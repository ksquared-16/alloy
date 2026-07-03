import { describe, expect, it } from "vitest";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { formatLeadEnrollmentCardMetaLine } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { formatLayoutRuntimeOperatorDate } from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";
import { resolveLeadSummaryLastTouch } from "@/lib/layout/runtime/resolveLeadSummaryLastTouch";
import { summarizeLeadDrawerEnrollmentHealth } from "@/lib/layout/runtime/summarizeLeadDrawerEnrollmentHealth";
import { resolveLayoutRuntimeEnrollmentPlacementContext } from "@/lib/layout/runtime/resolveLayoutRuntimeEnrollmentPlacementContext";
import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";

describe("resolveLeadSummaryLastTouch", () => {
    it("prefers follow-up note when present", () => {
        const touch = resolveLeadSummaryLastTouch(
            buildProofOpportunityRecord({ follow_up_notes: "Called and left voicemail" }),
        );
        expect(touch.kind).toBe("note");
        expect(touch.primaryLine).toContain("voicemail");
        expect(touch.title).toBe("Last Touch");
    });

    it("falls back to recent communication when no note", () => {
        const touch = resolveLeadSummaryLastTouch(
            buildProofOpportunityRecord({
                follow_up_notes: "",
                recent_communication: [{ subject: "Tour reminder", sent_at: "2026-06-01T14:30:00.000Z" }],
            }),
        );
        expect(touch.kind).toBe("communication");
        expect(touch.primaryLine).toBe("Tour reminder");
        expect(touch.secondaryLine).toMatch(/Jun 1, 2026 · 2:30 PM/);
    });

    it("does not duplicate open tasks from Tasks card", () => {
        const touch = resolveLeadSummaryLastTouch(
            buildProofOpportunityRecord({
                follow_up_notes: "",
                recent_communication: [],
                notes: [],
                _inquiry_summary_tasks: {
                    state: "loaded",
                    open_count: 1,
                    open_tasks: [
                        {
                            id: "task-1",
                            title: "Call family back",
                            due_at: "2026-06-10",
                            status: "open",
                            source: "manual",
                        },
                    ],
                },
            }),
        );
        expect(touch.kind).not.toBe("task");
        expect(touch.primaryLine).not.toBe("Call family back");
    });

    it("shows subtle empty affordance when no note or touch", () => {
        const touch = resolveLeadSummaryLastTouch(
            buildProofOpportunityRecord({
                follow_up_notes: "",
                recent_communication: [],
                notes: [],
                _inquiry_summary_tasks: { state: "loaded", open_count: 0, open_tasks: [] },
            }),
        );
        expect(touch.kind).toBe("empty");
        expect(touch.primaryLine).toBe("No recent note or touch");
        expect(touch.emptyHint).toBeTruthy();
    });
});

describe("formatLayoutRuntimeOperatorDate", () => {
    it("formats date-only as display doctrine month", () => {
        expect(formatLayoutRuntimeOperatorDate("2026-09-01")).toBe("Sep 1, 2026");
    });

    it("formats date+time with middle dot separator", () => {
        expect(formatLayoutRuntimeOperatorDate("2026-05-20T14:30:00.000Z")).toBe("May 20, 2026 · 2:30 PM");
    });
});

describe("formatLeadEnrollmentCardMetaLine", () => {
    it("shows configured column values and labeled placeholders for empty fields", () => {
        const row = (buildProofOpportunityRecord().enrollment_children as Record<string, string>[])[0]!;
        const metaColumns: LayoutCollectionColumn[] = [
            { refKey: "child.program", label: "Preschool" },
            { refKey: "inquiry_child.start_date", label: "Desired start", renderHint: "date" },
            { refKey: "inquiry_child.outcome_status_key", label: "Status" },
        ];
        const line = formatLeadEnrollmentCardMetaLine(row, metaColumns);
        expect(line).toContain("Preschool —");
        expect(line).toContain("Sep 1, 2026");
        expect(line).toContain("Active inquiry");
    });
});

describe("summarizeLeadDrawerEnrollmentHealth", () => {
    it("summarizes child counts and formats latest start as display doctrine date", () => {
        const summary = summarizeLeadDrawerEnrollmentHealth(buildProofOpportunityRecord());
        expect(summary.childCount).toBeGreaterThan(0);
        expect(summary.headline).toMatch(/child/i);
        expect(summary.detailLine).toMatch(/Sep 1, 2026|Complete|Latest start/);
    });
});

describe("resolveLayoutRuntimeEnrollmentPlacementContext", () => {
    it("falls back to opportunity location_id for program cascade", () => {
        const ctx = resolveLayoutRuntimeEnrollmentPlacementContext(
            { "inquiry_child.location_id": "" },
            { location_id: "site-north" },
            () => "",
            "row-1",
        );
        expect(ctx.locationId).toBe("site-north");
    });
});
