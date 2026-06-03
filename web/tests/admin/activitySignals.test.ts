import { describe, expect, it } from "vitest";
import {
    formatActivitySignalSummary,
    getActivitySignalForEntity,
    summarizeWorkflowEventForSignal,
    type ActivitySignalRule,
} from "@/lib/admin/activitySignals";

describe("getActivitySignalForEntity", () => {
    const rules: ActivitySignalRule[] = [
        {
            key: "stale_intake",
            entity_type: "opportunities",
            status_keys: ["intake"],
            threshold_minutes: 60,
            severity: "medium",
            label: "Intake idle",
        },
        {
            key: "stale_any",
            entity_type: "opportunities",
            threshold_minutes: 60,
            severity: "low",
            label: "Any stale",
        },
    ];

    it("returns no stale when no events", () => {
        const out = getActivitySignalForEntity({
            events: [],
            entity: { id: "a", status_key: "intake" },
            rules,
            nowMs: Date.UTC(2026, 0, 15, 12, 0, 0),
        });
        expect(out.last_activity_at).toBeNull();
        expect(out.stale_signal).toBeNull();
    });

    it("returns last activity and first matching stale rule by order", () => {
        const t0 = Date.UTC(2026, 0, 15, 10, 0, 0);
        const now = Date.UTC(2026, 0, 15, 12, 0, 0);
        const out = getActivitySignalForEntity({
            events: [{ occurred_at: new Date(t0).toISOString(), event_type: "note_added", payload: {} }],
            entity: { id: "a", status_key: "intake" },
            rules,
            nowMs: now,
        });
        expect(out.last_activity_at).toBeTruthy();
        expect(out.stale_signal?.key).toBe("stale_intake");
    });

    it("skips rule when status_keys do not match", () => {
        const t0 = Date.UTC(2026, 0, 15, 10, 0, 0);
        const now = Date.UTC(2026, 0, 15, 12, 0, 0);
        const out = getActivitySignalForEntity({
            events: [{ occurred_at: new Date(t0).toISOString(), event_type: "note_added", payload: {} }],
            entity: { id: "a", status_key: "won" },
            rules,
            nowMs: now,
        });
        expect(out.stale_signal?.key).toBe("stale_any");
    });

    it("no stale when rules null", () => {
        const t0 = Date.UTC(2026, 0, 15, 10, 0, 0);
        const out = getActivitySignalForEntity({
            events: [{ occurred_at: new Date(t0).toISOString(), event_type: "note_added", payload: {} }],
            entity: { id: "a", status_key: "intake" },
            rules: null,
            nowMs: Date.UTC(2026, 0, 15, 12, 0, 0),
        });
        expect(out.stale_signal).toBeNull();
    });
});

describe("summarizeWorkflowEventForSignal", () => {
    it("humanizes action_executed keys for operator-facing copy", () => {
        expect(
            summarizeWorkflowEventForSignal({
                occurred_at: new Date().toISOString(),
                event_type: "action_executed",
                payload: { action_key: "add_family_member" },
            })
        ).toBe("Add Family Member");
    });

    it("uses configured status labels instead of raw keys", () => {
        expect(
            summarizeWorkflowEventForSignal(
                {
                    occurred_at: new Date().toISOString(),
                    event_type: "opportunity_status_changed",
                    payload: { old_status_key: "new_inquiry", new_status_key: "contact_attempted" },
                },
                { new_inquiry: "New Inquiry", contact_attempted: "Contact Attempted" }
            )
        ).toBe("Status: New Inquiry → Contact Attempted");
    });
});

describe("formatActivitySignalSummary", () => {
    it("rewrites legacy raw-key summaries for drawer display", () => {
        expect(
            formatActivitySignalSummary("Status: new_inquiry → contact_attempted", {
                new_inquiry: "New Inquiry",
                contact_attempted: "Contact Attempted",
            })
        ).toBe("Status: New Inquiry → Contact Attempted");
    });
});
