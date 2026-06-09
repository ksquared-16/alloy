import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LeadActivityPreview from "@/components/layout/lead/LeadActivityPreview";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    leadActivitySectionHasVisibleContent,
    leadLeadSourceSectionHasVisibleContent,
    leadNotesCommunicationSectionHasVisibleContent,
} from "@/lib/layout/runtime/leadOverviewSectionContent";
import { readLayoutSectionPresentationMetadata } from "@/lib/layout/runtime/layoutSectionPresentationMetadata";
import { resolveLeadActivityPreview } from "@/lib/layout/runtime/resolveLeadActivityPreview";
import { resolveLeadOverviewRightRailSections } from "@/lib/layout/runtime/resolveLeadOverviewRightRailSections";
import { partitionLeadOverviewBodySections } from "@/lib/layout/runtime/leadOverviewComposition";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";

describe("resolveLeadActivityPreview", () => {
    it("builds entries from notes, communication, tasks, and activity signal fields", () => {
        const entries = resolveLeadActivityPreview(
            buildProofOpportunityRecord({
                follow_up_notes: "Tour follow-up scheduled",
                recent_communication: [{ subject: "Welcome email", sent_at: "2026-06-01T14:30:00.000Z" }],
                _inquiry_summary_tasks: {
                    state: "loaded",
                    open_count: 1,
                    open_tasks: [
                        { id: "t1", title: "Call family", due_at: "2026-06-10", status: "open", source: "manual" },
                    ],
                },
                last_activity_summary: "Status updated",
                last_activity_at: "2026-06-02T10:00:00.000Z",
                created_at: "2026-05-01T12:00:00.000Z",
            }),
        );
        expect(entries.length).toBeGreaterThan(0);
        expect(entries.some((e) => e.kind === "note")).toBe(true);
        expect(entries.some((e) => e.kind === "communication")).toBe(true);
        expect(entries.some((e) => e.kind === "task")).toBe(true);
    });

    it("does not invent entries when record has no activity-ish data", () => {
        const entries = resolveLeadActivityPreview(
            buildProofOpportunityRecord({
                follow_up_notes: "",
                recent_communication: [],
                notes: [],
                _inquiry_summary_tasks: { state: "loaded", open_count: 0, open_tasks: [] },
            }),
        );
        expect(entries.length).toBe(0);
    });
});

describe("layout section collapse metadata", () => {
    const doc = buildLeadDrawerDefaultDoc();
    const slots = partitionLeadOverviewBodySections(doc);

    it("collapses empty notes and activity sections by default", () => {
        const emptyRecord = buildProofOpportunityRecord({
            follow_up_notes: "",
            recent_communication: [],
            notes: [],
        });
        expect(shouldRenderLayoutRuntimeSection(slots.notes!, emptyRecord, { compositionShell: true })).toBe(false);
        expect(shouldRenderLayoutRuntimeSection(slots.activity!, emptyRecord, { compositionShell: true })).toBe(false);
    });

    it("shows populated right-rail sections sorted by priority", () => {
        const record = buildProofOpportunityRecord({ follow_up_notes: "Called back" });
        const rail = resolveLeadOverviewRightRailSections(slots, record);
        expect(rail.map((s) => s.key)).toEqual(["activity", "notes_communication"]);
        expect(readLayoutSectionPresentationMetadata(rail[0]!).priority).toBeLessThan(
            readLayoutSectionPresentationMetadata(rail[1]!).priority,
        );
    });

    it("collapses empty lead source section", () => {
        const record = buildProofOpportunityRecord({
            "opportunity.source": "",
            "opportunity.channel": "",
            "opportunity.campaign": "",
            source: "",
            channel: "",
            campaign: "",
        });
        expect(leadLeadSourceSectionHasVisibleContent(record)).toBe(false);
        expect(shouldRenderLayoutRuntimeSection(slots.leadSource!, record, { compositionShell: true })).toBe(false);
    });
});

describe("LeadActivityPreview", () => {
    it("renders empty state marker when no entries", () => {
        const html = renderToStaticMarkup(<LeadActivityPreview entries={[]} />);
        expect(html).toContain('data-lead-activity-preview-empty="true"');
    });

    it("renders entry rows when data exists", () => {
        const html = renderToStaticMarkup(
            <LeadActivityPreview
                entries={[{ kind: "note", label: "Note", detail: "Hello", at: "06-01-2026" }]}
            />,
        );
        expect(html).toContain('data-lead-activity-preview-entry="true"');
    });
});

describe("leadOverviewSectionContent", () => {
    it("detects notes communication content", () => {
        expect(leadNotesCommunicationSectionHasVisibleContent(buildProofOpportunityRecord())).toBe(false);
        expect(
            leadNotesCommunicationSectionHasVisibleContent(
                buildProofOpportunityRecord({ follow_up_notes: "Note" }),
            ),
        ).toBe(true);
    });

    it("detects activity section content via preview resolver", () => {
        expect(leadActivitySectionHasVisibleContent(buildProofOpportunityRecord())).toBe(false);
        expect(
            leadActivitySectionHasVisibleContent(
                buildProofOpportunityRecord({ follow_up_notes: "Recent note" }),
            ),
        ).toBe(true);
    });
});
