import { describe, expect, it } from "vitest";
import {
    formatOpportunityQueueNotesPreview,
    getWorkflowActivityActorLabel,
    getWorkflowActivityEventDetail,
    getWorkflowActivityEventTitle,
    humanizeSnakeCaseToken,
} from "@/lib/admin/opportunityActivityTimelineFormat";

describe("opportunityActivityTimelineFormat", () => {
    it("humanizes configured and generic snake_case", () => {
        expect(humanizeSnakeCaseToken("new_inquiry")).toBe("New Inquiry");
        expect(humanizeSnakeCaseToken("contact_attempted")).toBe("Contact Attempted");
        expect(humanizeSnakeCaseToken("tour_scheduled")).toBe("Tour Scheduled");
        expect(humanizeSnakeCaseToken("won")).toBe("Won");
    });

    it("titles use friendly labels", () => {
        expect(getWorkflowActivityEventTitle("opportunity_status_changed")).toBe("Status changed");
        expect(getWorkflowActivityEventTitle("action_executed")).toBe("Action completed");
        expect(getWorkflowActivityEventTitle("message_received")).toBe("SMS received");
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

    it("queue note picks latest dated line and formats date", () => {
        const raw = `2025-06-10 First note\n2026-06-20 Second note wins`;
        const out = formatOpportunityQueueNotesPreview(raw);
        expect(out).toBeTruthy();
        expect(out).toMatch(/Jun 20, 2026/);
        expect(out).toContain("Second note");
        expect(out).not.toContain("First note");
    });

    it("queue note uses last line when undated", () => {
        expect(formatOpportunityQueueNotesPreview("A\nB")).toBe("B");
    });
});
