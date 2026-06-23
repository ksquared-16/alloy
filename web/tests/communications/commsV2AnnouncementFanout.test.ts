import { describe, expect, it } from "vitest";
import {
    planAnnouncementFanout,
    summarizeFanout,
    type ChannelAvailability,
    type RecipientPerson,
} from "@/lib/communications/v2/announcementFanout";

/** Comms V2 Phase 1 / B7 — pure fan-out decision logic (no DB, no send). */

const both: ChannelAvailability = { email: true, sms: true };
const neither: ChannelAvailability = { email: false, sms: false };

function person(p: Partial<RecipientPerson> & { person_id: string }): RecipientPerson {
    return { person_id: p.person_id, email: p.email ?? null, phone: p.phone ?? null, opted_out: p.opted_out ?? false };
}

describe("planAnnouncementFanout — in-app", () => {
    it("is always operator-side only (skipped, no execution row)", () => {
        const rows = planAnnouncementFanout([person({ person_id: "p1", email: "a@x.com" })], ["in_app"], both);
        expect(rows).toHaveLength(1);
        expect(rows[0].outcome).toBe("skipped");
        expect(rows[0].suppressed_reason).toBe("in_app_operator_only");
        expect(rows[0].needs_scheduled_send).toBe(false);
    });
});

describe("planAnnouncementFanout — email/sms decisions", () => {
    it("schedules email when binding + address present", () => {
        const [row] = planAnnouncementFanout([person({ person_id: "p", email: " a@x.com " })], ["email"], both);
        expect(row.outcome).toBe("scheduled");
        expect(row.address).toBe("a@x.com");
        expect(row.needs_scheduled_send).toBe(true);
    });

    it("skips with provider_unavailable when no binding (never queued)", () => {
        const [row] = planAnnouncementFanout([person({ person_id: "p", email: "a@x.com" })], ["email"], neither);
        expect(row.outcome).toBe("skipped");
        expect(row.suppressed_reason).toBe("provider_unavailable");
        expect(row.needs_scheduled_send).toBe(false);
    });

    it("skips with no_address when contact method missing", () => {
        const [row] = planAnnouncementFanout([person({ person_id: "p", email: null })], ["email"], both);
        expect(row.suppressed_reason).toBe("no_address");
    });

    it("skips with opted_out before checking provider/address", () => {
        const [row] = planAnnouncementFanout([person({ person_id: "p", email: "a@x.com", opted_out: true })], ["email"], both);
        expect(row.suppressed_reason).toBe("opted_out");
        expect(row.needs_scheduled_send).toBe(false);
    });

    it("handles sms with phone", () => {
        const [row] = planAnnouncementFanout([person({ person_id: "p", phone: "555" })], ["sms"], both);
        expect(row.outcome).toBe("scheduled");
        expect(row.address).toBe("555");
        expect(row.channel).toBe("sms");
    });

    it("produces one row per (person, channel)", () => {
        const rows = planAnnouncementFanout(
            [person({ person_id: "p", email: "a@x.com", phone: "555" })],
            ["email", "sms", "in_app"],
            both
        );
        expect(rows).toHaveLength(3);
    });
});

describe("summarizeFanout", () => {
    it("counts scheduled/skipped, reasons, and execution rows", () => {
        const rows = planAnnouncementFanout(
            [
                person({ person_id: "a", email: "a@x.com", phone: "1" }), // email+sms scheduled
                person({ person_id: "b", email: null, phone: null }), // both no_address
                person({ person_id: "c", email: "c@x.com", opted_out: true }), // opted_out
            ],
            ["email", "sms"],
            both
        );
        const s = summarizeFanout(rows);
        // a: 2 scheduled; b: 2 no_address; c: 2 opted_out
        expect(s.scheduled).toBe(2);
        expect(s.execution_rows).toBe(2);
        expect(s.skipped).toBe(4);
        expect(s.by_reason.no_address).toBe(2);
        expect(s.by_reason.opted_out).toBe(2);
    });
});
