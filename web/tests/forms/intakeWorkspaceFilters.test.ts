import { describe, expect, it } from "vitest";
import {
    buildIntakeWorkspaceFilterPanel,
    countIntakeWorkspaceFilters,
    defaultIntakeWorkspaceFilter,
} from "@/lib/forms/intakeWorkspaceFilters";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const submission = (overrides: Partial<SubmissionInboxRow> = {}): SubmissionInboxRow => ({
    id: "sub-1",
    status: "submitted",
    created_at: "2026-05-01T10:00:00.000Z",
    submitted_at: "2026-05-02T12:00:00.000Z",
    form_definition_id: "form-1",
    payload: { meta: { intake_needs_review: true } },
    ...overrides,
});

describe("intakeWorkspaceFilters FD-1", () => {
    it("counts review, linking, and waiting workloads", () => {
        const counts = countIntakeWorkspaceFilters({
            submissions: [
                submission(),
                submission({ id: "sub-2", payload: { meta: {} }, person_id: null }),
            ],
            sessions: [
                { id: "sess-1", status: "completed", created_at: "2026-05-03T10:00:00.000Z", packet_name: "Enrollment" },
                { id: "sess-2", status: "in_progress", created_at: "2026-05-03T11:00:00.000Z", packet_name: "Waitlist" },
            ],
            forms: [{ id: "form-1" }, { id: "form-2" }],
            packets: [{ id: "pkt-1" }],
        });

        expect(counts.needs_review).toBeGreaterThanOrEqual(2);
        expect(counts.needs_linking).toBeGreaterThanOrEqual(1);
        expect(counts.waiting).toBe(1);
        expect(counts.forms).toBe(2);
        expect(counts.packets).toBe(1);
    });

    it("defaults to needs_review when review count is positive", () => {
        expect(defaultIntakeWorkspaceFilter({ needs_review: 2, needs_linking: 0, waiting: 0, forms: 1, packets: 0 })).toBe(
            "needs_review"
        );
    });

    it("builds needs linking panel items", () => {
        const panel = buildIntakeWorkspaceFilterPanel("needs_linking", {
            submissions: [submission({ payload: { meta: {} } })],
            sessions: [],
            forms: [{ id: "form-1", name: "Waitlist" }],
            packets: [],
            formsById: { "form-1": "Waitlist" },
        });

        expect(panel.title).toBe("Needs linking");
        expect(panel.items).toHaveLength(1);
        expect(panel.items[0]?.cta).toBe("Link records");
    });
});
