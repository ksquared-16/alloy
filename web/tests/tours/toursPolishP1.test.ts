/**
 * Tours P1 (post-release polish) — the duplicated Monday, the organization-defaults entry point, the
 * three-section Tours surface, the configurable CTA, the button colour pair, and Preview & Share.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computeSlotsFromRulesAndBookings } from "@/lib/tours/availability/internalCompute";
import type { TourAvailabilityRuleRow } from "@/lib/tours/availability/types";
import {
    buildTourWeekdayView,
    duplicateTourScheduleDraft,
    expandTourScheduleToRuleValues,
    findRepeatedTourSchedules,
    groupTourRulesIntoSchedules,
    TOUR_ORGANIZATION_DEFAULTS_HREF,
    type TourRuleForAuthoring,
    type TourScheduleDraft,
} from "@/lib/tours/schedules/tourWeeklySchedule";
import {
    BRAND_TEXT_CONTRAST_MIN,
    brandButtonColors,
    contrastRatio,
    PUBLIC_TOUR_CTA_DEFAULT,
    readPublicBrandValues,
    resolveEffectivePublicBrand,
    validatePublicBrandInput,
} from "@/lib/branding/publicBrand";
import {
    buildTourCalendarIframeSnippet,
    buildTourCtaButtonSnippet,
    projectTourCalendarShareLinks,
    type TourCalendarShareLinkRow,
} from "@/lib/tours/publicCalendar/tourCalendarShare";

const ORG = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const OTHER_LOC = "44444444-4444-4444-8444-444444444444";

const WEEKDAY_TOURS: TourScheduleDraft = {
    name: "Weekday tours",
    days: [1, 2, 3, 4, 5],
    windows: [
        { start_time: "09:00:00", end_time: "10:00:00" },
        { start_time: "14:00:00", end_time: "15:00:00" },
    ],
    timezone: "America/Los_Angeles",
    slot_duration_minutes: 30,
    buffer_minutes: 0,
    max_bookings_per_slot: 1,
    approval_required: true,
    is_active: true,
};

let seq = 0;
function asRules(rows: ReturnType<typeof expandTourScheduleToRuleValues>): (TourAvailabilityRuleRow & TourRuleForAuthoring)[] {
    return rows.map((r) => ({ ...r, id: `rule-${++seq}`, user_id: null }));
}

const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");

describe("P1-A root cause — why Monday appears twice", () => {
    // The org-wide schedule, and the location copy the old UI invited ("duplicate one to give this
    // location its own version"). The copy ADDS to the original; the original keeps applying.
    const orgWide = asRules(expandTourScheduleToRuleValues(WEEKDAY_TOURS, { orgId: ORG, locationId: null, scheduleId: "s-org" }));
    const copy = duplicateTourScheduleDraft(groupTourRulesIntoSchedules(orgWide, LOC)[0]!);
    const local = asRules(expandTourScheduleToRuleValues(copy, { orgId: ORG, locationId: LOC, scheduleId: "s-loc" }));
    const seen = [...orgWide, ...local];

    it("the old week view listed every rule per weekday: two schedules × two windows = four Monday entries", () => {
        const monday = buildTourWeekdayView(groupTourRulesIntoSchedules(seen, LOC)).find((d) => d.day === 1)!;
        expect(monday.entries.map((e) => `${e.start_time} ${e.scheduleName}`)).toEqual([
            "09:00:00 Copy of Weekday tours",
            "09:00:00 Weekday tours",
            "14:00:00 Copy of Weekday tours",
            "14:00:00 Weekday tours",
        ]);
    });

    it("they are two real source schedules in two scopes, not duplicate rows within one", () => {
        const groups = groupTourRulesIntoSchedules(seen, LOC);
        expect(groups.map((g) => [g.name, g.inherited, g.rules.length])).toEqual([
            ["Copy of Weekday tours", false, 10],
            ["Weekday tours", true, 10],
        ]);
    });

    it("families are NOT offered duplicate slots — the engine offers each identical time once", () => {
        const window = { locationId: LOC, fromUtc: new Date("2027-01-11T08:00:00Z"), toUtc: new Date("2027-01-12T08:00:00Z") };
        const orgOnly = computeSlotsFromRulesAndBookings(orgWide as TourAvailabilityRuleRow[], [], window);
        const both = computeSlotsFromRulesAndBookings(seen as TourAvailabilityRuleRow[], [], window);
        expect(orgOnly.length).toBe(4);
        expect(both.map((s) => s.startAt)).toEqual(orgOnly.map((s) => s.startAt));
    });

    it("the repeat is now named on both cards instead of hidden in a second listing", () => {
        const groups = groupTourRulesIntoSchedules(seen, LOC);
        const repeats = findRepeatedTourSchedules(groups);
        expect(repeats.get(groups[0]!.key)).toBe("Weekday tours");
        expect(repeats.get(groups[1]!.key)).toBe("Copy of Weekday tours");
        // A genuinely different schedule is not flagged.
        const other = asRules(
            expandTourScheduleToRuleValues({ ...WEEKDAY_TOURS, name: "Saturday", days: [6] }, { orgId: ORG, locationId: LOC, scheduleId: "s-sat" })
        );
        const distinct = groupTourRulesIntoSchedules([...orgWide, ...other], LOC);
        expect(findRepeatedTourSchedules(distinct).size).toBe(0);
    });
});

describe("P1-A — the Director's staging data, as censused (certification/tours-calendar-forms/p1)", () => {
    // ALLOY_STAGING, 2026-10-27: six legacy windows (no schedule identity). Organization-wide Monday
    // 09:00–12:00 exists as TWO identical rows; South Campus adds its own Monday 10:00–12:00.
    const legacy = (id: string, locationId: string | null, day: number, start: string, end: string): TourRuleForAuthoring => ({
        id, location_id: locationId, day_of_week: day, start_time: start, end_time: end, timezone: "America/Los_Angeles",
        slot_duration_minutes: 30, buffer_minutes: 0, max_bookings_per_slot: 1, approval_required: false, is_active: true, metadata: {},
    });
    const southCampusSees = [
        legacy("org-mon-a", null, 1, "09:00:00", "12:00:00"),
        legacy("org-mon-b", null, 1, "09:00:00", "12:00:00"),
        legacy("org-wed", null, 3, "09:00:00", "12:00:00"),
        legacy("org-fri", null, 5, "09:00:00", "12:00:00"),
        legacy("south-mon", LOC, 1, "10:00:00", "12:00:00"),
    ];

    it("Monday read twice because two identical organization-wide rows each became a card and a weekday entry", () => {
        const groups = groupTourRulesIntoSchedules(southCampusSees, LOC);
        const inheritedMonday = groups.filter((g) => g.inherited && g.days.join() === "1");
        expect(inheritedMonday.map((g) => [g.name, g.windows[0]!.start_time])).toEqual([
            ["Monday window", "09:00:00"],
            ["Monday window", "09:00:00"],
        ]);
        const monday = buildTourWeekdayView(groups).find((d) => d.day === 1)!;
        expect(monday.entries.map((e) => `${e.start_time}${e.inherited ? " org" : " local"}`)).toEqual(["09:00:00 org", "09:00:00 org", "10:00:00 local"]);
    });

    it("the duplicate row is now named on both cards; families were never offered a time twice", () => {
        const groups = groupTourRulesIntoSchedules(southCampusSees, LOC);
        const repeats = findRepeatedTourSchedules(groups);
        expect([...repeats.values()]).toEqual(["Monday window", "Monday window"]);
        const slots = computeSlotsFromRulesAndBookings(southCampusSees as TourAvailabilityRuleRow[], [], {
            locationId: LOC,
            fromUtc: new Date("2027-01-11T08:00:00Z"),
            toUtc: new Date("2027-01-12T08:00:00Z"),
        });
        const starts = slots.map((s) => s.startAt);
        expect(new Set(starts).size).toBe(starts.length);
        expect(slots.length).toBe(6); // 9:00 … 11:30, once each
        expect(Math.max(...slots.map((s) => s.capacity))).toBe(1); // not summed across the duplicate rows
    });
});

describe("P1-A — Tours surface information architecture", () => {
    const client = read("app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient.tsx");
    const code = client.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

    it("drops the per-rule weekday listing that repeated every schedule", () => {
        expect(code).not.toContain("Week at a glance");
        expect(code).not.toContain("buildTourWeekdayView");
        expect(code).not.toContain("tours-weekday-view");
    });

    it("is organized as Availability, Booking experience and Preview & Share with the settings tab primitive", () => {
        expect(code).toContain("SettingsEntityTabBar");
        for (const label of ['"Availability"', '"Booking experience"', '"Preview & Share"']) expect(code).toContain(label);
        expect(code).toContain("<TourPublicBrandPanel");
        expect(code).toContain("<TourShareSection");
    });

    it("never offers Edit or Delete on an inherited organization-wide schedule", () => {
        const inherited = code.slice(code.indexOf('data-testid="tours-inherited-schedules"'));
        const card = inherited.slice(0, inherited.indexOf("</section>"));
        expect(card).toContain("<ScheduleCard");
        expect(card).not.toMatch(/onEdit=|onDelete=|onToggle=/);
        expect(card).toContain("TOUR_ORGANIZATION_DEFAULTS_HREF");
    });

    it("gives organization-wide schedules a real route, served by the existing surface (no second authority)", () => {
        expect(TOUR_ORGANIZATION_DEFAULTS_HREF).toBe("/organization/tours");
        const config = read("next.config.ts");
        expect(config).toContain('{ source: "/organization/tours", destination: "/adminV2/settings/tours/availability" }');
        expect(config.indexOf('source: "/organization/tours"')).toBeLessThan(config.indexOf('{ source: "/organization", destination'));
    });
});

describe("P1-B — configurable tour CTA", () => {
    it("defaults to “Schedule a Tour” and inherits location → organization", () => {
        expect(PUBLIC_TOUR_CTA_DEFAULT).toBe("Schedule a Tour");
        expect(resolveEffectivePublicBrand({}).tourCtaLabel).toBe("Schedule a Tour");
        const org = { display_name: null, accent_color: null, logo_url: null, tour_cta_label: "Visit Firefly" };
        const loc = { display_name: null, accent_color: null, logo_url: null, tour_cta_label: null };
        expect(resolveEffectivePublicBrand({ organization: org, location: loc })).toMatchObject({
            tourCtaLabel: "Visit Firefly",
            sources: { tourCtaLabel: "organization" },
        });
        expect(
            resolveEffectivePublicBrand({ organization: org, location: { ...loc, tour_cta_label: "Tour our Eastside campus" } }).sources
                .tourCtaLabel
        ).toBe("location");
    });

    it("is validated as one line of plain text, max 40, and survives a stored round trip", () => {
        expect(validatePublicBrandInput({ tour_cta_label: "  Book   a visit " })).toEqual({
            ok: true,
            values: { display_name: null, accent_color: null, logo_url: null, tour_cta_label: "Book a visit" },
        });
        expect(validatePublicBrandInput({ tour_cta_label: "<b>Hi</b>" })).toMatchObject({ ok: false });
        expect(validatePublicBrandInput({ tour_cta_label: "x".repeat(41) })).toMatchObject({ ok: false });
        expect(validatePublicBrandInput({ tour_cta_label: "" })).toMatchObject({ ok: true, values: { tour_cta_label: null } });
        expect(readPublicBrandValues({ public_brand_v1: { tour_cta_label: "Come see us" } }).tour_cta_label).toBe("Come see us");
    });

    it("is the public calendar's heading, resolved server-side for the link's own location", () => {
        const page = read("app/tours/[token]/page.tsx");
        expect(page).toContain("resolveLocationPublicBrand(supabase, { orgId: calendar.value.orgId, locationId: calendar.value.locationId })");
        const client = read("app/tours/[token]/PublicTourJourneyClient.tsx");
        expect(client).toContain("{ctaLabel}");
        expect(client).not.toContain(">Book a tour<");
    });
});

describe("P1-B — button colours: brand kept, pair derived, always 4.5:1", () => {
    it("Bend Pine no longer gets near-black text: it is deepened in hue under white", () => {
        const p = brandButtonColors("#00A283");
        expect(p).toEqual({ fill: "#00856B", ink: "#FFFFFF", treatment: "deepened_brand_light_text" });
    });

    it("a brand that already holds white is used exactly as authored", () => {
        expect(brandButtonColors("#1F6FEB")).toEqual({ fill: "#1F6FEB", ink: "#FFFFFF", treatment: "brand_light_text" });
    });

    it("a light brand keeps its fill and takes a deep shade of its own hue, not a fixed black", () => {
        const p = brandButtonColors("#FFD400");
        expect(p.fill).toBe("#FFD400");
        expect(p.ink).not.toMatch(/^#(000000|18273A|FFFFFF)$/);
        expect(p.treatment).toBe("brand_dark_text");
    });

    it("every 12-bit colour yields a pair at or above the floor", () => {
        for (let i = 0; i < 4096; i++) {
            const hex = `#${i.toString(16).padStart(3, "0")}`;
            const { fill, ink } = brandButtonColors(hex);
            expect(contrastRatio(fill, ink), hex).toBeGreaterThanOrEqual(BRAND_TEXT_CONTRAST_MIN);
        }
    });
});

describe("P1-A — Preview & Share", () => {
    const row = (over: Partial<TourCalendarShareLinkRow> & { metadata?: Record<string, unknown> }): TourCalendarShareLinkRow => ({
        id: "link-1",
        form_definition_id: "form-1",
        is_active: true,
        expires_at: null,
        allowed_embed_origins: null,
        ...over,
        metadata: {
            default_location_id: LOC,
            form_context_mode: "processing_intake",
            lead_capture: true,
            share_embed_path: "/forms/embed/tok_ABC",
            ...(over.metadata ?? {}),
        },
    });

    it("projects only this location's links, with the hosted calendar address derived from the persisted share path", () => {
        const links = projectTourCalendarShareLinks(
            [
                row({ id: "published", metadata: { tour_calendar_v1: { enabled: true, enabled_at: "2026-10-27T00:00:00Z" } } }),
                row({ id: "elsewhere", metadata: { default_location_id: OTHER_LOC } }),
                row({ id: "candidate" }),
            ],
            { locationId: LOC, baseUrl: "https://app.example.com/", formTitles: { "form-1": "Tour inquiry" } }
        );
        expect(links.map((l) => l.linkId)).toEqual(["published", "candidate"]);
        expect(links[0]).toMatchObject({
            calendarPublished: true,
            calendarPath: "/tours/tok_ABC",
            calendarUrl: "https://app.example.com/tours/tok_ABC",
            formTitle: "Tour inquiry",
            usable: true,
        });
    });

    it("names why a link cannot carry the calendar and never invents an absolute URL", () => {
        const [expired] = projectTourCalendarShareLinks([row({ expires_at: "2020-01-01T00:00:00Z" })], {
            locationId: LOC,
            baseUrl: "",
            formTitles: {},
        });
        expect(expired).toMatchObject({ usable: false, unusableReason: "expired", calendarUrl: null, calendarPath: "/tours/tok_ABC" });
    });

    it("snippets escape their inputs", () => {
        const iframe = buildTourCalendarIframeSnippet({ url: "https://a.example/tours/x?a=1&b=2", title: 'Tour "East" <campus>' });
        expect(iframe).toContain('src="https://a.example/tours/x?a=1&amp;b=2"');
        expect(iframe).toContain('title="Tour &quot;East&quot; &lt;campus&gt;"');
        const button = buildTourCtaButtonSnippet({ url: "https://a.example/tours/x", label: "Visit <us>", fill: "#00856B", ink: "#FFFFFF" });
        expect(button).toContain(">Visit &lt;us&gt;</a>");
        expect(button).toContain("background:#00856B;color:#FFFFFF");
        expect(button).toContain('target="_blank" rel="noopener"');
    });

    it("publishing reuses the guarded link PATCH, never a new write path", () => {
        const share = read("app/adminV2/settings/tours/availability/TourShareSection.tsx");
        expect(share).toContain("/public-links/");
        expect(share).toContain("JSON.stringify({ tour_calendar: enabled })");
        const route = read("app/api/admin/tours/calendar-links/route.ts");
        expect(route).not.toMatch(/\.(update|insert|upsert|delete)\(/);
        expect(route).not.toContain("token_hash");
    });
});
