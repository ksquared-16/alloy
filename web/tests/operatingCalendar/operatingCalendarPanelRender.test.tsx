/**
 * The operator surface, rendered: inherited vs location entries, edit controls only where the
 * caller holds the authority, bookings needing attention with a path to the record, and the
 * review step naming dates, hours and bookings before anything is saved.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    ImpactReview,
    LocationOperatingCalendarPanel,
    type CalendarResponse,
    type PreviewState,
} from "@/components/adminV2/settings/locations/LocationOperatingCalendarPanel";
import type { CalendarEntryView } from "@/lib/operatingCalendar/operatingCalendarEntries";

const entry = (over: Partial<CalendarEntryView>): CalendarEntryView => ({
    entryId: "e1",
    lineageId: "l1",
    source: "calendar",
    scope: "location",
    roomId: null,
    status: "active",
    name: "Winter break",
    designation: "closure",
    effect: "closed",
    fromDate: "2026-12-21",
    toDate: "2026-12-25",
    startTime: null,
    endTime: null,
    timezone: "America/Los_Angeles",
    reasonKey: null,
    note: null,
    revisions: 1,
    lastChangedAt: "2026-10-01T00:00:00Z",
    authoredByUserId: null,
    ...over,
});

const data = (over: Partial<CalendarResponse> = {}): CalendarResponse => ({
    site_id: "site",
    site_label: "Main",
    timezone: "America/Los_Angeles",
    timezone_resolved: true,
    organization_timezone: "America/Los_Angeles",
    today: "2026-10-25",
    rooms: [{ id: "room1", label: "Toddlers" }],
    entries: [
        entry({}),
        entry({ entryId: "e2", lineageId: "l2", scope: "organization", name: "Thanksgiving", designation: "holiday", fromDate: "2026-11-26", toDate: "2026-11-27" }),
        entry({ entryId: "e3", lineageId: "l3", name: "Early close", effect: "modified_hours", startTime: "09:00", endTime: "13:00", fromDate: "2026-12-24", toDate: "2026-12-24" }),
        entry({ entryId: "e4", lineageId: "l4", source: "attendance", scope: "room", roomId: "room1", name: "Closed (recorded in Attendance)", fromDate: "2026-11-02", toDate: "2026-11-02" }),
    ],
    bookings_needing_attention: [
        {
            booking_id: "b1",
            opportunity_id: "o1",
            primary_person_id: "p1",
            start_at: "2026-12-22T18:00:00Z",
            timezone: "America/Los_Angeles",
            status_key: "confirmed",
            reason: "closed",
            entry_names: ["Winter break"],
        },
    ],
    can_edit_organization: false,
    can_edit_location: true,
    ...over,
});

const render = (d: CalendarResponse) => renderToStaticMarkup(<LocationOperatingCalendarPanel orgId="org" locationId="site" initialData={d} />);

describe("Operating calendar panel", () => {
    it("lists location, inherited and Attendance entries with their scope, dates and effect", () => {
        const html = render(data());
        expect(html).toContain("Winter break");
        expect(html).toContain("Mon, Dec 21 – Fri, Dec 25, 2026 (5 days)");
        expect(html).toContain("Organization default · inherited");
        expect(html).toContain("Open 9:00 AM – 1:00 PM");
        expect(html).toContain("Room · Toddlers · Attendance");
        expect(html).toContain("Dates and times are this location’s: America/Los_Angeles");
    });

    it("shows edit controls only where the caller holds that scope's authority", () => {
        const html = render(data());
        expect(html).toContain('data-testid="operating-calendar-edit-l1"');
        expect(html).not.toContain('data-testid="operating-calendar-edit-l2"');
        expect(html).not.toContain('data-testid="operating-calendar-withdraw-l2"');
        // A location administrator may add a location exception to the inherited default.
        expect(html).toContain('data-testid="operating-calendar-override-l2"');
        // Attendance's own closures are never edited here.
        expect(html).not.toContain('data-testid="operating-calendar-edit-l4"');

        const readOnly = render(data({ can_edit_location: false, can_edit_organization: false }));
        expect(readOnly).not.toContain("operating-calendar-add-closure");
        expect(readOnly).not.toContain("operating-calendar-edit-");
        expect(readOnly).not.toContain("operating-calendar-override-");

        const orgAdmin = render(data({ can_edit_organization: true }));
        expect(orgAdmin).toContain('data-testid="operating-calendar-edit-l2"');
        expect(orgAdmin).toContain("Edit default");
    });

    it("bookings needing attention are listed, unchanged, with a path to the record", () => {
        const html = render(data());
        expect(html).toContain("1 tour booking needs attention");
        expect(html).toContain("They are unchanged and still hold their places; nothing was sent to the families.");
        expect(html).toContain("Tue, Dec 22, 2026 · 10:00 AM PST · Location closed (Winter break)");
        expect(html).toContain('href="/workspace/record/person/p1"');
        expect(render(data({ bookings_needing_attention: [] }))).not.toContain("operating-calendar-attention");
    });

    it("the review step names dates, hours and affected bookings before saving", () => {
        const preview: PreviewState = {
            action: "create",
            entryId: null,
            draft: null,
            sites: [{ siteId: "s", siteLabel: "Main" }],
            sites_not_previewed: 0,
            dates: [
                {
                    siteId: "s",
                    siteLabel: "Main",
                    timezone: "America/Los_Angeles",
                    date: "2026-12-24",
                    before: { status: "open", openIntervals: null },
                    after: { status: "modified", openIntervals: [{ start: 540, end: 780 }] },
                    conflicts: [],
                },
            ],
            bookings_newly_affected: data().bookings_needing_attention,
            bookings_no_longer_affected: [],
        };
        const html = renderToStaticMarkup(<ImpactReview preview={preview} busy={false} onConfirm={() => {}} onBack={() => {}} />);
        expect(html).toContain("Main · 1 date");
        expect(html).toContain("Thu, Dec 24, 2026: Ordinary hours → <span class=\"font-semibold\">Open 9:00 AM – 1:00 PM</span>");
        expect(html).toContain("1 existing tour booking falls in this change");
        expect(html).toContain("They will not be cancelled, moved or messaged.");
    });
});
