import { describe, expect, it } from "vitest";
import {
    formatOpportunityQueueNotesPreview,
    formatOpportunityQueueNotesPreviewParts,
    formatQueueNoteDateTime,
    getWorkflowActivityActorLabel,
    getWorkflowActivityEventDetail,
    getWorkflowActivityEventTitle,
    humanizeOpportunitySnakeCaseToken,
} from "@/lib/admin/opportunityActivityTimelineFormat";

describe("opportunityActivityTimelineFormat", () => {
    it("humanizes configured and generic snake_case", () => {
        expect(humanizeOpportunitySnakeCaseToken("new_inquiry")).toBe("New Inquiry");
        expect(humanizeOpportunitySnakeCaseToken("contact_attempted")).toBe("Contact Attempted");
        expect(humanizeOpportunitySnakeCaseToken("tour_scheduled")).toBe("Tour Scheduled");
        expect(humanizeOpportunitySnakeCaseToken("won")).toBe("Won");
    });

    it("titles use friendly labels", () => {
        expect(getWorkflowActivityEventTitle("opportunity_status_changed")).toBe("Status changed");
        expect(getWorkflowActivityEventTitle("action_executed")).toBe("Action completed");
        expect(getWorkflowActivityEventTitle("message_received")).toBe("SMS received");
        expect(getWorkflowActivityEventTitle("opportunity_enrollment_packet_created")).toBe("Enrollment packet created");
        expect(getWorkflowActivityEventTitle("opportunity_enrollment_packet_step_completed")).toBe(
            "Enrollment packet step completed"
        );
    });

    it("enrollment projection detail uses payload.summary", () => {
        const d = getWorkflowActivityEventDetail("opportunity_enrollment_packet_completed", {
            summary: "Enrollment packet completed: Fall intake",
        });
        expect(d).toBe("Enrollment Packet completed: Fall Intake");
    });

    it("detail prefers summary with humanized keys", () => {
        const d = getWorkflowActivityEventDetail("opportunity_status_changed", {
            summary: "new_inquiry -> tour_scheduled",
        });
        expect(d).toBe("New Inquiry → Tour Scheduled");
    });

    it("detail falls back to humanized status transition", () => {
        const d = getWorkflowActivityEventDetail("opportunity_status_changed", {
            old_status_key: "new_inquiry",
            new_status_key: "contact_attempted",
        });
        expect(d).toBe("New Inquiry → Contact Attempted");
    });

    it("actor prefers name then email then Staff", () => {
        expect(getWorkflowActivityActorLabel({ actor_name: "Jane Staff", actor_user_id: "u1" }, null)).toBe("Jane Staff");
        expect(getWorkflowActivityActorLabel({ actor_email: "j@x.co", actor_user_id: "u1" }, null)).toBe("j@x.co");
        expect(getWorkflowActivityActorLabel({ actor_user_id: "u1" }, null)).toBe("Staff");
    });

    it("actor handles contact and automation heuristics", () => {
        expect(getWorkflowActivityActorLabel({ actor: { type: "contact" } }, "message_received")).toBe("Contact");
        expect(getWorkflowActivityActorLabel({ source: "workflow" }, "message_sent")).toBe("Automation");
        expect(getWorkflowActivityActorLabel({ actor: "system" }, null)).toBe("System");
    });

    it("queue note picks latest dated line and formats date (datetime — note, local tz)", () => {
        const raw = `2025-06-10 First note\n2026-06-20 Second note wins`;
        const out = formatOpportunityQueueNotesPreview(raw);
        const wantDate = formatQueueNoteDateTime(Date.parse("2026-06-20"));
        expect(out).toBeTruthy();
        expect(out).toBe(`${wantDate} — Second note wins`);
        expect(wantDate).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
        expect(wantDate).not.toContain(",");
    });

    it("queue note preview parts match string formatter (dateFirst)", () => {
        const raw = "[2026-04-29T21:15:05Z] Tried to contact via phone today";
        const parts = formatOpportunityQueueNotesPreviewParts(raw);
        const line = formatOpportunityQueueNotesPreview(raw);
        expect(parts).toEqual({
            timestamp: formatQueueNoteDateTime(Date.parse("2026-04-29T21:15:05Z")),
            body: "Tried to contact via phone today",
        });
        expect(line).toBe(`${parts!.timestamp} — ${parts!.body}`);
    });

    it("queue note parses bracketed ISO timestamp (local tz)", () => {
        const raw = "[2026-04-29T21:15:05Z] Tried to contact via phone today";
        const out = formatOpportunityQueueNotesPreview(raw);
        const wantDate = formatQueueNoteDateTime(Date.parse("2026-04-29T21:15:05Z"));
        expect(out).toBe(`${wantDate} — Tried to contact via phone today`);
    });

    it("queue note keeps already-formatted enrichment line (no duplicate timestamps)", () => {
        const raw = "05/04/2026, 10:28 PM — Left voicemail, will try again tomorrow afternoon.";
        expect(formatOpportunityQueueNotesPreview(raw, "America/Los_Angeles")).toBe(
            "05/04/2026 10:28 PM — Left voicemail, will try again tomorrow afternoon."
        );
        expect(formatOpportunityQueueNotesPreviewParts(raw, "America/Los_Angeles")).toEqual({
            timestamp: "05/04/2026 10:28 PM",
            body: "Left voicemail, will try again tomorrow afternoon.",
        });
    });

    it("queue note uses last line when undated", () => {
        expect(formatOpportunityQueueNotesPreview("A\nB")).toBe("B");
    });
});
