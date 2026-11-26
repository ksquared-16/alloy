/**
 * One operator action → one Activity line. Mechanics stay in the ledger; Last action never reports
 * delivery states or consequence notifications.
 */
import { describe, expect, it } from "vitest";

import { activityRowSubject, collapseBusinessEventMechanics } from "@/lib/admin/collapseBusinessEventMechanics";
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

    // Staging (6e02feb4): Ben ZZQA1467FAMB's panel read "Ava ZZQA1467FAMB moved to Enrolling" as HIS last action.
    const ava = { childIds: ["ocm-ava"], childName: "Ava Z" };
    const ben = { childIds: ["cm-ben", "ocm-ben"], childName: "Ben Z" };
    const feed = [
        { label: "Ava Z moved to Enrolling", when: "3", kind: "activity", subject: ava },
        { label: "Tour booked", when: "2", kind: "activity", subject: null },
        { label: "Offer accepted", when: "1", kind: "activity", subject: ben },
    ];
    const benScope = { ids: ["pi-ben", "cm-ben", "ocm-ben"], name: "Ben Z" };

    it("a child's panel never shows a sibling's event as its own — shared family activity is labelled", () => {
        expect(selectLastAction(feed, benScope)).toEqual({ label: "Tour booked", detail: null, when: "2", scope: "family" });
    });

    it("…and shows the child's own event when it is the newest relevant one", () => {
        expect(selectLastAction(feed.filter((r) => r.subject !== null), benScope)).toEqual({ label: "Offer accepted", detail: null, when: "1" });
        expect(selectLastAction([{ label: "Offer accepted", when: "1", kind: "activity", subject: { childIds: [], childName: "ben z" } }], benScope)).toMatchObject({ label: "Offer accepted" });
    });

    it("a family panel is unchanged: the newest action, whoever it is about", () => {
        expect(selectLastAction(feed)).toEqual({ label: "Ava Z moved to Enrolling", detail: null, when: "3" });
    });

    it("the subject is read from the event payload the timeline already carries", () => {
        expect(activityRowSubject({ opportunity_customer_member_id: "ocm-ava", child_display_name: "Ava Z" })).toEqual({ childIds: ["ocm-ava"], childName: "Ava Z" });
        expect(activityRowSubject({ opportunity_id: "opp-1" })).toBeNull();
    });
});
