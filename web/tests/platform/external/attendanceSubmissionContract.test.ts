/**
 * The public submission contract: what a partner may send, and what they are told back.
 *
 * The part worth guarding is the return trip. The ingestion authority answers with internal codes
 * and detail strings, and those detail strings carry database messages — a refused write surfaces
 * the constraint that refused it, by name. Useful in an inbox an operator reads; not for a partner.
 * So this asserts the translation is an allow-list in both directions, and that nothing internal
 * travels outward by default.
 */
import { describe, expect, it } from "vitest";

import {
    MAX_SUBMISSION_BATCH,
    SUBMITTABLE_EVENT_KINDS,
    parseSubmission,
    toPublicOutcome,
} from "@/lib/platform/external/resources/attendanceSubmission";
import { PUBLIC_OPERATIONS, scopeForOperation } from "@/lib/platform/external/scopeCatalog";

const VALID = {
    external_event_id: "provider-evt-1",
    event_kind: "check_in",
    child_external_id: "provider-child-7",
    room_external_id: "provider-room-3",
    occurred_at: "2026-03-02T08:15:00Z",
};

describe("the operation is a governed submission on the attendance resource", () => {
    it("requires the write scope, which the read scope does not imply", () => {
        expect(scopeForOperation("submitAttendanceEvents")).toBe("attendance.write");
        expect(scopeForOperation("listAttendanceEvents")).toBe("attendance.read");
        expect(PUBLIC_OPERATIONS.submitAttendanceEvents.route).toBe("/api/v1/attendance-events");
    });

    it("accepts only the fact kinds the producer contract carries", () => {
        /*
         * Measured from `NormalizedExternalAttendanceEvent`, not from the internal vocabulary.
         * `present` and `schedule_override` are real attendance kinds that external ingestion does
         * not accept, and publishing them would invent a path the authority has not agreed to.
         */
        expect([...SUBMITTABLE_EVENT_KINDS]).toEqual(["check_in", "check_out", "absence", "room_transfer"]);
        for (const kind of ["present", "schedule_override", "nonsense"]) {
            const r = parseSubmission({ events: [{ ...VALID, event_kind: kind }] });
            expect(r.ok, kind).toBe(false);
        }
    });
});

describe("request shape is validated, and judgement is left to the authority", () => {
    it("accepts a well-formed event", () => {
        const r = parseSubmission({ events: [VALID] });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.events[0].externalEventId).toBe("provider-evt-1");
            expect(r.events[0].correctionMode).toBeNull();
        }
    });

    it("refuses a body that is not a batch", () => {
        for (const body of [null, "x", {}, { events: {} }, { events: [] }]) {
            expect(parseSubmission(body).ok, JSON.stringify(body)).toBe(false);
        }
    });

    it("refuses a batch larger than the platform ceiling", () => {
        const events = Array.from({ length: MAX_SUBMISSION_BATCH + 1 }, (_, i) => ({
            ...VALID, external_event_id: `e-${i}`,
        }));
        const r = parseSubmission({ events });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("batch_too_large");
    });

    it("refuses a repeated identity inside one batch rather than choosing between them", () => {
        /*
         * Two entries sharing an identity are either the same fact twice or two facts wearing one
         * id. Applying either would decide which, and this boundary is not entitled to.
         */
        const r = parseSubmission({ events: [VALID, { ...VALID, occurred_at: "2026-03-02T09:00:00Z" }] });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("duplicate_event_id_in_batch");
    });

    it("requires a timestamp that means one instant", () => {
        // The same reason `updated_since` refuses one: a bare local time is a different moment to
        // every reader, and attendance is a claim about when a child was somewhere.
        expect(parseSubmission({ events: [{ ...VALID, occurred_at: "2026-03-02T08:15:00" }] }).ok).toBe(false);
        expect(parseSubmission({ events: [{ ...VALID, occurred_at: "yesterday" }] }).ok).toBe(false);
        expect(parseSubmission({ events: [{ ...VALID, occurred_at: "2026-03-02T08:15:00+02:00" }] }).ok).toBe(true);
    });

    it("a correction must name the event it supersedes, and may not name itself", () => {
        expect(parseSubmission({ events: [{ ...VALID, correction_mode: "correction" }] }).ok).toBe(false);
        expect(parseSubmission({
            events: [{ ...VALID, correction_mode: "reversal", corrects_external_event_id: VALID.external_event_id }],
        }).ok).toBe(false);

        const ok = parseSubmission({
            events: [{ ...VALID, correction_mode: "reversal", corrects_external_event_id: "provider-evt-0" }],
        });
        expect(ok.ok).toBe(true);
        if (ok.ok) expect(ok.events[0].correctionMode).toBe("reversal");
    });

    it("naming a target without a mode means a correction", () => {
        const r = parseSubmission({ events: [{ ...VALID, corrects_external_event_id: "provider-evt-0" }] });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.events[0].correctionMode).toBe("correction");
    });
});

describe("outcomes are translated, and internal detail never travels", () => {
    it("maps every disposition the authority can answer with", () => {
        const cases = [
            { disposition: "applied" as const, expect: "accepted" },
            { disposition: "duplicate" as const, expect: "replayed" },
            { disposition: "conflicted" as const, expect: "conflict" },
            { disposition: "unmapped" as const, expect: "pending_mapping" },
            { disposition: "rejected" as const, expect: "rejected" },
        ];
        for (const c of cases) {
            expect(toPublicOutcome("e", { disposition: c.disposition }).outcome, c.disposition).toBe(c.expect);
        }
    });

    it("an accepted fact carries the canonical id and no reason", () => {
        const out = toPublicOutcome("e", { disposition: "applied", attendanceEventId: "fact-1", evidenceId: "ev-1" });
        expect(out).toEqual({
            external_event_id: "e",
            outcome: "accepted",
            attendance_event_id: "fact-1",
            code: null,
            message: null,
        });
    });

    it("a replay returns the fact that already existed, not a new one", () => {
        const out = toPublicOutcome("e", { disposition: "duplicate", attendanceEventId: "fact-1" });
        expect(out.outcome).toBe("replayed");
        expect(out.attendance_event_id).toBe("fact-1");
    });

    it("never echoes the internal detail string", () => {
        /*
         * THE LEAK THIS PREVENTS. `write_failed` carries the database's own message, which names
         * the table and the constraint that refused the row. It is the single most likely way for
         * internal schema to reach a partner, and it arrives as a field somebody might reasonably
         * think is for them.
         */
        const out = toPublicOutcome("e", {
            disposition: "rejected",
            code: "write_failed",
            detail: 'new row for relation "child_attendance_events" violates check constraint "child_attendance_events_presence_room"',
            evidenceId: "ev-1",
        });
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain("child_attendance_events");
        expect(serialized).not.toContain("check constraint");
        expect(out.code).toBe("not_accepted");
        expect(out.message).toMatch(/can be retried/i);
    });

    it("never exposes the evidence row", () => {
        // The inbox is Alloy's record of what asked, not part of the partner's contract.
        const out = toPublicOutcome("e", { disposition: "unmapped", code: "unmapped_external_id", evidenceId: "ev-99" });
        expect(JSON.stringify(out)).not.toContain("ev-99");
        expect(out.code).toBe("unknown_external_id");
    });

    it("gives each refusal a code a partner can act on", () => {
        const mapped: [string, string][] = [
            ["payload_conflict", "idempotency_conflict"],
            ["external_id_missing", "missing_external_id"],
            ["unmapped_external_id", "unknown_external_id"],
            ["ambiguous", "ambiguous_external_id"],
            ["mapping_wrong_entity_kind", "external_id_not_a_child"],
            ["no_enrollment_agreement", "child_not_enrolled"],
            ["site_not_authorized", "location_not_authorized"],
            ["capability_not_granted", "scope_not_granted"],
            ["unknown_correction_target", "unknown_correction_target"],
        ];
        for (const [internal, publicCode] of mapped) {
            const out = toPublicOutcome("e", { disposition: "rejected", code: internal });
            expect(out.code, internal).toBe(publicCode);
            expect(out.message, internal).toBeTruthy();
        }
    });

    it("an unrecognised internal code degrades to a safe generic reason", () => {
        const out = toPublicOutcome("e", { disposition: "rejected", code: "some_future_internal_code" });
        expect(out.code).toBe("not_accepted");
        expect(JSON.stringify(out)).not.toContain("some_future_internal_code");
    });
});
