import { describe, expect, it } from "vitest";
import { deriveIntakeCommandCenterSnapshot } from "@/lib/forms/intakeCommandCenterPresentation";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const submission = (overrides: Partial<SubmissionInboxRow> = {}): SubmissionInboxRow => ({
    id: "sub-1",
    status: "submitted",
    created_at: "2026-05-01T10:00:00.000Z",
    submitted_at: "2026-05-02T12:00:00.000Z",
    form_definition_id: "form-1",
    person_id: "person-1",
    payload: { meta: { intake_needs_review: true } },
    ...overrides,
});

describe("intakeCommandCenterPresentation OI-1", () => {
    it("derives urgent KPIs from submissions and completed sessions", () => {
        const snapshot = deriveIntakeCommandCenterSnapshot({
            submissions: [
                submission(),
                submission({
                    id: "sub-2",
                    person_id: null,
                    customer_id: null,
                    payload: { meta: {} },
                }),
                submission({ id: "sub-3", status: "draft", submitted_at: null, payload: undefined }),
            ],
            sessions: [
                {
                    id: "sess-1",
                    status: "completed",
                    created_at: "2026-05-03T10:00:00.000Z",
                    packet_name: "Enrollment",
                },
                { id: "sess-2", status: "in_progress", created_at: "2026-05-01T08:00:00.000Z", packet_name: "Waitlist" },
            ],
            forms: [
                { id: "form-1", name: "Waitlist", has_published_version: true },
                { id: "form-2", name: "Draft form", has_published_version: false },
            ],
            formsById: { "form-1": "Waitlist" },
        });

        expect(snapshot.kpis.find((k) => k.id === "needs-action")?.value).toBe(3);
        expect(snapshot.kpis.find((k) => k.id === "waiting-on")?.value).toBe(2);
        expect(snapshot.actionQueue.length).toBeGreaterThan(0);
        expect(snapshot.actionQueue[0]?.ctaLabel).toMatch(/Review/);
        expect(snapshot.primaryCta?.label).toBe("Review next packet");
        expect(snapshot.waitingOn.some((w) => w.id === "drafts")).toBe(true);
    });

    it("reports calm headline when no urgent items", () => {
        const snapshot = deriveIntakeCommandCenterSnapshot({
            submissions: [],
            sessions: [],
            forms: [{ id: "f1", name: "Form", has_published_version: true }],
            formsById: {},
        });

        expect(snapshot.urgencyHeadline).toContain("calm");
        expect(snapshot.primaryCta).toBeNull();
    });
});
