/**
 * One operator action → one Activity line. Mechanics stay in the ledger; Last action never reports
 * delivery states or consequence notifications.
 */
import { describe, expect, it } from "vitest";

import { collapseBusinessEventMechanics } from "@/lib/admin/collapseBusinessEventMechanics";
import { formatOpportunityActivityTimelineEvent } from "@/lib/admin/opportunityActivityTimelineFormat";
import { selectLastAction } from "@/lib/adminV2/runtime/focusPanel/businessProcess/adaptBusinessProcessEvidenceToProcessCard";

const t = (s: number) => new Date(Date.UTC(2026, 9, 17, 12, 0, s)).toISOString();
const ev = (id: string, type: string, sec: number, payload: Record<string, unknown> = {}) => ({ id, event_type: type, occurred_at: t(sec), payload });

describe("collapseBusinessEventMechanics", () => {
    it("Offer spot: the decision is one line; Ava's status and stage writes fold into it, Ben's do not", () => {
        const rows = [
            ev("d", "participant_decision_recorded", 3, { decision_label: "Offer spot", child_display_name: "Ava Q", opportunity_customer_member_id: "ocm-ava", answers: [{ label: "Placement offered", value_label: "Toddler room" }] }),
            ev("s2", "child_lifecycle_status_changed", 2, { next_status_key: "offered", opportunity_customer_member_id: "ocm-ava", child_display_name: "Ava Q" }),
            ev("s1", "child_lifecycle_status_changed", 1, { next_status_key: "waitlisted", opportunity_customer_member_id: "ocm-ava", child_display_name: "Ava Q" }),
            ev("b1", "child_lifecycle_status_changed", 1, { next_status_key: "waitlisted", opportunity_customer_member_id: "ocm-ben", child_display_name: "Ben Q" }),
        ];
        expect(collapseBusinessEventMechanics(rows).map((r) => r.id)).toEqual(["d", "b1"]);
        expect(formatOpportunityActivityTimelineEvent(rows[0]!).title).toBe("Offer spot · Ava Q · Toddler room");
    });

    it("Offer accepted: one line, the two 'moved to Enrolling' writes fold", () => {
        const rows = [
            ev("o", "stage_work_outcome_recorded", 5, { business_outcome: true, outcome_label: "Offer accepted", child_display_name: "Ava Q", customer_member_id: "ava" }),
            ev("a", "child_lifecycle_status_changed", 4, { next_status_key: "enrolling", child_display_name: "Ava Q" }),
            ev("b", "child_lifecycle_status_changed", 4, { next_status_key: "enrolling", child_display_name: "Ava Q" }),
        ];
        const out = collapseBusinessEventMechanics(rows);
        expect(out.map((r) => r.id)).toEqual(["o"]);
        expect(formatOpportunityActivityTimelineEvent(out[0]!).title).toBe("Offer accepted · Ava Q");
    });

    it("A tour closed by its outcome reads as the outcome; an explicit Cancel Tour stays 'cancelled'", () => {
        const byOutcome = [
            ev("o", "stage_work_outcome_recorded", 5, { business_outcome: true, outcome_label: "Tour Completed — Interested" }),
            ev("c", "tour_canceled", 4, { closed_by_outcome: { outcome_key: "outcome_7", outcome_label: "Tour Completed — Interested" } }),
            ev("m", "opportunity_status_changed", 3, { next_status_key: "decision" }),
        ];
        const out = collapseBusinessEventMechanics(byOutcome);
        expect(out.map((r) => r.id)).toEqual(["o"]);
        expect(formatOpportunityActivityTimelineEvent(out[0]!).title).toBe("Tour Completed — Interested");

        const explicit = [ev("c", "tour_canceled", 4, {}), ev("q", "message_queued", 6, { channel: "sms" })];
        const kept = collapseBusinessEventMechanics(explicit);
        expect(kept.map((r) => r.id)).toEqual(["c", "q"]);
        expect(kept[1]!.payload).toMatchObject({ _consequence: true });
    });

    it("a lifecycle line far from any business event is kept", () => {
        const rows = [ev("o", "participant_decision_recorded", 100, { decision_label: "Waitlist", child_display_name: "Ava Q" }), ev("x", "child_lifecycle_status_changed", 1, { child_display_name: "Ava Q" })];
        expect(collapseBusinessEventMechanics(rows).map((r) => r.id)).toEqual(["o", "x"]);
    });
});

describe("Last action", () => {
    it("skips delivery states and consequence notifications", () => {
        expect(
            selectLastAction([
                { label: "SMS queued", when: "now", kind: "communication", notAnAction: true },
                { label: "Message sent", when: "now", kind: "communication", notAnAction: true },
                { label: "Tour cancelled", when: "now", kind: "communication" },
            ]),
        ).toMatchObject({ label: "Tour cancelled" });
    });
});
