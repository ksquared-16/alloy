import { describe, expect, it } from "vitest";
import { resolveLeadActivityPreview } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { leadActivitySectionHasVisibleContent } from "@/lib/layout/runtime/leadOverviewSectionContent";

describe("Lead activity preview finalization", () => {
    it("includes lifecycle summary and status metadata when present", () => {
        const entries = resolveLeadActivityPreview(
            buildProofOpportunityRecord({
                _child_lifecycle_summary: { display_summary: "2 children enrolling · 1 waitlisted" },
                _status_display: "Contact Attempted",
                updated_at: "2026-06-01T15:00:00.000Z",
            }),
        );
        expect(entries.some((e) => e.label === "Lifecycle" && e.detail?.includes("waitlisted"))).toBe(true);
        expect(entries.some((e) => e.label === "Status" && e.detail === "Contact Attempted")).toBe(true);
    });

    it("returns no entries when record has no activity-ish fields", () => {
        const record = buildProofOpportunityRecord({
            follow_up_notes: "",
            recent_communication: [],
            notes: [],
            _inquiry_summary_tasks: { state: "loaded", open_count: 0, open_tasks: [] },
        });
        expect(resolveLeadActivityPreview(record)).toHaveLength(0);
        expect(leadActivitySectionHasVisibleContent(record)).toBe(false);
    });
});
