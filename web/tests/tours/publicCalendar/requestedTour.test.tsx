/**
 * S7 — the requested-tour record on a Processing case, and what the operator is told about it.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
    buildRequestedTourRecord,
    parsePublicTourSelection,
    readRequestedTour,
    REQUESTED_TOUR_METADATA_KEY,
} from "@/lib/tours/publicCalendar/requestedTour";
import { formatRequestedTourInterval, type RequestedTourOperatorView } from "@/lib/tours/publicCalendar/requestedTourOperatorView";
import { RequestedTourView } from "@/components/pos/RequestedTourPanel";

const LOC = "55555555-5555-4555-8555-555555555555";
const SUB = "66666666-6666-4666-8666-666666666666";
const LINK = "77777777-7777-4777-8777-777777777777";

describe("public tour selection", () => {
    it("accepts two instants and nothing else", () => {
        const r = parsePublicTourSelection({ start_at: "2033-03-01T18:00:00Z", end_at: "2033-03-01T18:30:00Z", location_id: "x", org_id: "y" });
        expect(r.ok && r.value).toEqual({ startAt: new Date("2033-03-01T18:00:00Z"), endAt: new Date("2033-03-01T18:30:00Z") });
    });
    it("refuses malformed, inverted and absurd intervals", () => {
        for (const raw of [null, "x", [], {}, { start_at: "nope", end_at: "2033-03-01T18:30:00Z" }, { start_at: "2033-03-01T18:30:00Z", end_at: "2033-03-01T18:00:00Z" }, { start_at: "2033-03-01T08:00:00Z", end_at: "2033-03-02T08:00:00Z" }]) {
            expect(parsePublicTourSelection(raw).ok).toBe(false);
        }
    });
});

describe("requested tour record", () => {
    const record = buildRequestedTourRecord({
        locationId: LOC,
        startAt: new Date("2033-03-01T18:00:00Z"),
        endAt: new Date("2033-03-01T18:30:00Z"),
        timezone: "America/Los_Angeles",
        ruleId: null,
        formPublicLinkId: LINK,
        formSubmissionId: SUB,
        now: new Date("2033-02-01T00:00:00Z"),
    });
    it("starts as pending intent, identified by its submission, with public provenance", () => {
        expect(record).toMatchObject({
            state: "pending_acceptance",
            submission_key: `form_submission:${SUB}`,
            provenance: { source: "public_tour_calendar", form_public_link_id: LINK, form_submission_id: SUB },
        });
        expect(record).not.toHaveProperty("booking_id");
    });
    it("round-trips from case metadata, and anything malformed reads as absent — never as a booking", () => {
        expect(readRequestedTour({ [REQUESTED_TOUR_METADATA_KEY]: record })).toEqual(record);
        expect(readRequestedTour({})).toBeNull();
        expect(readRequestedTour({ [REQUESTED_TOUR_METADATA_KEY]: { ...record, schema: "other" } })).toBeNull();
        expect(readRequestedTour({ [REQUESTED_TOUR_METADATA_KEY]: { ...record, state: "confirmed" } })).toBeNull();
        expect(readRequestedTour({ [REQUESTED_TOUR_METADATA_KEY]: { ...record, location_id: "not-a-uuid" } })).toBeNull();
    });
    it("formats in the location's zone with 12-hour times, whatever the server's zone", () => {
        expect(formatRequestedTourInterval("2033-03-01T18:00:00Z", "2033-03-01T18:30:00Z", "America/Los_Angeles")).toBe("Tue, Mar 1, 2033 · 10:00 AM – 10:30 AM PST");
        expect(formatRequestedTourInterval("2033-03-01T18:00:00Z", "2033-03-01T18:30:00Z", "America/New_York")).toBe("Tue, Mar 1, 2033 · 1:00 PM – 1:30 PM EST");
    });
});

describe("operator panel", () => {
    const base: RequestedTourOperatorView = {
        state: "pending_acceptance",
        acceptance: "pending",
        headline: "Tour requested — pending acceptance (not booked)",
        reason: null,
        reasonLabel: null,
        requested: { startAt: "", endAt: "", timezone: "America/Los_Angeles", label: "Tue, Mar 1, 2033 · 10:00 AM – 10:30 AM PST" },
        location: { id: LOC, label: "North Campus" },
        requestedAt: "",
        stillAvailable: true,
        opportunityId: null,
        booking: null,
        comms: null,
        alternatives: [],
        error: null,
    };
    it("a pending request says it is not booked and nothing was sent", () => {
        const html = renderToStaticMarkup(<RequestedTourView view={base} />);
        expect(html).toContain("pending acceptance");
        expect(html).toContain("Nothing is booked and nothing has been sent to the family yet.");
        expect(html).not.toMatch(/confirmed|Confirmation sent/i);
    });
    it("rescheduling names the reason, keeps the original time and lists current openings", () => {
        const html = renderToStaticMarkup(
            <RequestedTourView
                view={{
                    ...base,
                    state: "needs_rescheduling",
                    acceptance: "accepted",
                    headline: "Lead accepted — tour needs rescheduling",
                    reason: "slot_unavailable",
                    reasonLabel: "The requested time is no longer available (it filled up or the schedule changed).",
                    alternatives: [{ start_at: "a", end_at: "b", timezone: "America/Los_Angeles", label: "Wed, Mar 2, 2033 · 9:00 AM – 9:30 AM PST" }],
                    comms: { status: "not_applicable", detail: "no_booking" },
                }}
            />
        );
        expect(html).toContain("needs rescheduling");
        expect(html).toContain("Tue, Mar 1, 2033 · 10:00 AM");
        expect(html).toContain("Alloy does not choose one");
        expect(html).toContain("Wed, Mar 2, 2033 · 9:00 AM");
    });
    it("a suppressed confirmation is shown as suppressed, not as sent", () => {
        const html = renderToStaticMarkup(
            <RequestedTourView view={{ ...base, state: "booked", acceptance: "accepted", headline: "Tour booked", booking: { id: "b", status: "confirmed", label: "x" }, comms: { status: "suppressed", detail: "email:failed:eligibility_blocked:OPTED_OUT" } }} />
        );
        expect(html).toContain("Confirmation suppressed by communication eligibility");
        expect(html).toContain('data-comms-status="suppressed"');
    });
});
