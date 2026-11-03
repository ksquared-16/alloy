/**
 * Tours review findings (2026-11-02), EB9A9359C92B.
 *
 * 1. Branding after attaching a form: the location's pink button turned the attached form's #CEDD54. A tour
 *    now uses the school's brand (location → organization → platform) on the calendar, the form step inside
 *    it, the website button and both admin previews; the form's own published brand leads only under the
 *    explicit `tour_brand_source: "form"`. Neither configuration is rewritten.
 * 2. Schedule readiness: status (Active / Inactive) and approval are separate. Approval never hides times or
 *    deactivates a schedule; a new schedule — including a copy — starts Active; a named schedule can be
 *    activated in place.
 * 3. Published-link behaviour: "live" is said only when the public page's own checks pass; a published
 *    calendar with no active schedule is "Published — not bookable yet"; a link restricted to websites is
 *    "website only"; the hosted address uses the deployment's public origin.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolverMock = vi.hoisted(() => ({ resolvePublicTourCalendar: vi.fn() }));
vi.mock("@/lib/tours/publicCalendar/publicTourCalendarServer", () => resolverMock);

import {
    brandCtaButtonColors,
    readPublicBrandValues,
    resolveEffectivePublicBrand,
    resolveTourPublicBrand,
    tourBrandUsesForm,
    validatePublicBrandInput,
    formBrandLayer,
    type PublicBrandValues,
} from "@/lib/branding/publicBrand";
import { computeSlotsFromRulesAndBookings } from "@/lib/tours/availability/internalCompute";
import type { TourAvailabilityRuleRow } from "@/lib/tours/availability/types";
import {
    duplicateTourScheduleDraft,
    expandTourScheduleToRuleValues,
    groupTourRulesIntoSchedules,
    validateTourScheduleDraft,
    type TourRuleForAuthoring,
    type TourScheduleDraft,
} from "@/lib/tours/schedules/tourWeeklySchedule";
import {
    describeTourCalendarReadiness,
    projectTourCalendarShareLinks,
    type TourCalendarShareLink,
} from "@/lib/tours/publicCalendar/tourCalendarShare";
import { measureTourCalendarReadiness } from "@/lib/tours/publicCalendar/tourCalendarReadiness";

const web = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

const ORG = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const PINK = "#E272AC";
const FORM_GREEN = "#CEDD54";

const brand = (over: Partial<PublicBrandValues> = {}): PublicBrandValues => ({
    display_name: null,
    accent_color: null,
    logo_url: null,
    tour_cta_label: null,
    tour_cta_text_color: null,
    tour_brand_source: null,
    ...over,
});
/** The attached form as published: a legacy form whose builder saved its own colour. */
const publishedForm = (accent: string) => formBrandLayer({ accent_color: accent, brand_name: "Inquiry form" });

// ── 1. Branding ──────────────────────────────────────────────────────────────────────────────────────

describe("1 — a tour uses the location's brand after a form is attached", () => {
    const location = brand({ accent_color: PINK, tour_cta_text_color: "#FFFFFF" });
    const organization = brand({ accent_color: "#123456", display_name: "Firefly" });

    it("the reported case: location pink, attached form #CEDD54 → the tour (and its button) stays pink", () => {
        const form = publishedForm(FORM_GREEN);
        expect(form?.accent_color).toBe(FORM_GREEN); // the form genuinely sets its own colour…
        const tour = resolveTourPublicBrand({ form, location, organization });
        expect(tour.accentColor).toBe(PINK); // …and the tour still uses the location's
        expect(tour.sources.accentColor).toBe("location");
        expect(tour.displayName).toBe("Firefly"); // not the form's name either
        expect(brandCtaButtonColors(tour.accentColor, tour.tourCtaTextColor).fill).toBe(PINK);
    });

    it("the form keeps its own brand on its own link — neither configuration is rewritten", () => {
        const form = publishedForm(FORM_GREEN);
        expect(resolveEffectivePublicBrand({ form, location, organization }).accentColor).toBe(FORM_GREEN);
        expect(location.accent_color).toBe(PINK);
        expect(form?.accent_color).toBe(FORM_GREEN);
    });

    it("republishing the form with new colours does not move the tour by default", () => {
        const before = resolveTourPublicBrand({ form: publishedForm(FORM_GREEN), location, organization });
        const after = resolveTourPublicBrand({ form: publishedForm("#7C3AED"), location, organization });
        expect(after).toEqual(before);
    });

    it("explicit override: tour_brand_source 'form' makes the published form lead, and a republish then shows", () => {
        const chosen = { ...location, tour_brand_source: "form" as const };
        expect(resolveTourPublicBrand({ form: publishedForm(FORM_GREEN), location: chosen, organization }).accentColor).toBe(FORM_GREEN);
        expect(resolveTourPublicBrand({ form: publishedForm("#7C3AED"), location: chosen, organization }).accentColor).toBe("#7C3AED");
        // A form that inherits sets nothing, so the location still shows even under the override.
        const inherit = formBrandLayer({ brand_source: "inherit", accent_color: FORM_GREEN });
        expect(resolveTourPublicBrand({ form: inherit, location: chosen, organization }).accentColor).toBe(PINK);
    });

    it("the location's own choice beats the organization's; unset everywhere = the school's brand", () => {
        const orgForm = { ...organization, tour_brand_source: "form" as const };
        expect(tourBrandUsesForm({ location: brand(), organization: orgForm })).toBe(true);
        expect(tourBrandUsesForm({ location: brand({ tour_brand_source: "location" }), organization: orgForm })).toBe(false);
        expect(tourBrandUsesForm({ location: brand(), organization: brand() })).toBe(false);
    });

    it("the choice is validated, sanitised on read, and never inferred", () => {
        expect(validatePublicBrandInput({ tour_brand_source: "form" })).toMatchObject({ ok: true, values: { tour_brand_source: "form" } });
        expect(validatePublicBrandInput({ tour_brand_source: "" })).toMatchObject({ ok: true, values: { tour_brand_source: null } });
        expect(validatePublicBrandInput({ tour_brand_source: "pink" })).toMatchObject({ ok: false });
        expect(readPublicBrandValues({ public_brand_v1: { tour_brand_source: "anything" } }).tour_brand_source).toBeNull();
        expect(formBrandLayer({ accent_color: FORM_GREEN, tour_brand_source: "form" })?.tour_brand_source).toBeNull();
    });

    it("hosted page, form step, admin API and both previews resolve through the same rule", () => {
        const page = web("app/tours/[token]/page.tsx");
        expect(page).toContain("if (!tourBrandUsesForm(layers)) brand = participantBrandFromEffective(school);");
        expect(page).toContain("initialResolve = { ...initialResolve, brand }");
        expect(page).toContain("formBrandOverride={brand !== formBrand ? brand : undefined}");
        const journey = web("app/tours/[token]/PublicTourJourneyClient.tsx");
        expect(journey).toContain("brandOverride={formBrandOverride}");
        const embed = web("app/forms/embed/[token]/FormEmbedClient.tsx");
        expect(embed.match(/setBrand\(brandOverrideRef\.current !== undefined \? brandOverrideRef\.current : \(json\.data\.brand \?\? null\)\)/g)).toHaveLength(2);
        expect(embed).not.toMatch(/setBrand\(json\.data\.brand \?\? null\)/);
        const route = web("app/api/admin/public-brand/route.ts");
        expect(route).toContain("effective: resolveTourPublicBrand(");
        const panel = web("app/adminV2/settings/tours/availability/TourPublicBrandPanel.tsx");
        expect(panel).toContain("const preview = resolveTourPublicBrand(");
        expect(panel).toContain('data-testid="tours-brand-source-location"');
        expect(panel).toContain('data-testid="tours-brand-source-form"');
        expect(panel).not.toContain("it takes precedence here");
        // Share's button/snippet read the API's `effective` — the tour brand.
        const share = web("app/adminV2/settings/tours/availability/TourShareSection.tsx");
        expect(share).toContain("{ effective: EffectivePublicBrand }).effective");
        expect(share).not.toContain("The form's own branding takes precedence over Booking experience.");
    });
});

// ── 2. Schedule readiness ────────────────────────────────────────────────────────────────────────────

const WEEKDAY: TourScheduleDraft = {
    name: "Weekday tours",
    days: [1, 2, 3, 4, 5],
    windows: [{ start_time: "09:00:00", end_time: "11:00:00" }],
    timezone: "America/Los_Angeles",
    slot_duration_minutes: 30,
    buffer_minutes: 0,
    max_bookings_per_slot: 1,
    approval_required: true,
    is_active: true,
};
let seq = 0;
const asRules = (rows: ReturnType<typeof expandTourScheduleToRuleValues>): (TourAvailabilityRuleRow & TourRuleForAuthoring)[] =>
    rows.map((r) => ({ ...r, id: `rule-${++seq}`, user_id: null }));
const week = { locationId: LOC, fromUtc: new Date("2027-01-11T08:00:00Z"), toUtc: new Date("2027-01-18T08:00:00Z") };

describe("2 — schedule status and booking approval are separate", () => {
    it("saving a valid schedule makes it active by default; approval does not change that", () => {
        const { is_active: _omit, ...withoutStatus } = WEEKDAY;
        const v = validateTourScheduleDraft(withoutStatus);
        expect(v.ok && v.draft.is_active).toBe(true);
        expect(v.ok && v.draft.approval_required).toBe(true);
        const rows = expandTourScheduleToRuleValues(v.ok ? v.draft : WEEKDAY, { orgId: ORG, locationId: LOC, scheduleId: "s1" });
        expect(rows.every((r) => r.is_active === true && r.approval_required === true)).toBe(true);
    });

    it("an approval-required schedule still offers every time — approval never hides availability", () => {
        const approval = computeSlotsFromRulesAndBookings(asRules(expandTourScheduleToRuleValues(WEEKDAY, { orgId: ORG, locationId: LOC, scheduleId: "s1" })), [], week);
        const auto = computeSlotsFromRulesAndBookings(
            asRules(expandTourScheduleToRuleValues({ ...WEEKDAY, approval_required: false }, { orgId: ORG, locationId: LOC, scheduleId: "s2" })),
            [],
            week
        );
        expect(approval.length).toBe(20); // 4 times × 5 weekdays
        expect(approval.map((s) => s.startAt)).toEqual(auto.map((s) => s.startAt));
    });

    it("only an explicit Inactive hides times; the configured times are kept", () => {
        const inactive = asRules(expandTourScheduleToRuleValues({ ...WEEKDAY, is_active: false }, { orgId: ORG, locationId: LOC, scheduleId: "s3" }));
        expect(computeSlotsFromRulesAndBookings(inactive, [], week)).toHaveLength(0);
        const [group] = groupTourRulesIntoSchedules(inactive, LOC);
        expect(group!.is_active).toBe(false);
        expect(group!.windows).toEqual(WEEKDAY.windows);
        expect(group!.days).toEqual(WEEKDAY.days);
    });

    it("a copy of an inactive schedule starts Active (a new schedule), keeping every time", () => {
        const [group] = groupTourRulesIntoSchedules(
            asRules(expandTourScheduleToRuleValues({ ...WEEKDAY, is_active: false }, { orgId: ORG, locationId: LOC, scheduleId: "s4" })),
            LOC
        );
        const copy = duplicateTourScheduleDraft(group!);
        expect(copy.is_active).toBe(true);
        expect(copy.windows).toEqual(WEEKDAY.windows);
        expect(copy.approval_required).toBe(true);
    });

    it("the editor: Active is the default, Inactive is an explicit choice with a warning, approval says what it does", () => {
        const client = web("app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient.tsx");
        expect(client).toMatch(/const BLANK_DRAFT: TourScheduleDraft = \{[\s\S]*?is_active: true,/);
        expect(client).toContain('data-testid="locations-tour-active"');
        expect(client).toContain('data-testid="locations-tour-inactive"');
        expect(client).toContain('data-testid="tours-schedule-inactive-warning"');
        expect(client).toContain("Bookings require approval");
        expect(client).toContain("It doesn&apos;t hide times or");
        expect(client).not.toContain("Staff approve each booking\n");
        // Status and approval are separate badges on the card.
        expect(client).toContain('data-testid="tours-schedule-status"');
        expect(client).toContain('data-testid="tours-schedule-approval"');
    });

    it("a named schedule can be activated in place: same schedule id, same times, status only", () => {
        const client = web("app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient.tsx");
        expect(client).toContain("onToggle={g.scheduleId ? () => void toggleSchedule(g) : () => void toggleRule(g.rules[0]!)}");
        expect(client).toContain("const draft = { ...tourScheduleGroupToDraft(g), is_active: next };");
        expect(client).toContain('method: "PUT"');
        expect(client).toContain("j.schedule_id !== g.scheduleId");
    });

    it("after a save the shared location cache is invalidated before reloading (first schedule is not hidden)", () => {
        const client = web("app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient.tsx");
        expect(client).toMatch(/const committed = async \(message\?: string\) => \{\s*await onMutationCommitted\?\.\(\);\s*await loadRules\(\);/);
    });
});

// ── 3. Published-link behaviour ──────────────────────────────────────────────────────────────────────

const shareLink = (over: Partial<TourCalendarShareLink> = {}): TourCalendarShareLink => ({
    linkId: "link-1",
    formId: "form-1",
    formTitle: "Inquiry",
    linkLabel: null,
    usable: true,
    unusableReason: null,
    leadCapture: true,
    calendarPublished: true,
    calendarPublishedAt: null,
    calendarPath: "/tours/tok_ABC",
    calendarUrl: null,
    allowedEmbedOrigins: [],
    createdAt: null,
    ...over,
});

function countingSupabase(activeRules: number) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) b[m] = () => b;
    b.then = (res: (v: unknown) => unknown) => res({ count: activeRules, error: null });
    return { from: () => b } as never;
}

describe("3 — published configuration is not booking readiness", () => {
    beforeEach(() => resolverMock.resolvePublicTourCalendar.mockReset());

    it("bookable only when the public page's own resolver serves it, as a direct (standalone) visit", async () => {
        resolverMock.resolvePublicTourCalendar.mockResolvedValue({ ok: true, value: {} });
        const r = await measureTourCalendarReadiness(countingSupabase(1), { orgId: ORG, locationId: LOC, link: shareLink() });
        expect(r).toEqual({ state: "bookable", code: null, restrictedToOrigins: [] });
        expect(resolverMock.resolvePublicTourCalendar).toHaveBeenCalledWith(expect.anything(), "tok_ABC", { embedOrigin: null });
        expect(describeTourCalendarReadiness(r).title).toBe("Tour calendar is live");
    });

    it("published with no active schedule → 'Published — not bookable yet', never 'live'", async () => {
        resolverMock.resolvePublicTourCalendar.mockResolvedValue({ ok: false, code: "LOCATION_UNAVAILABLE" });
        const r = await measureTourCalendarReadiness(countingSupabase(0), { orgId: ORG, locationId: LOC, link: shareLink() });
        expect(r).toMatchObject({ state: "not_bookable", code: "NO_ACTIVE_SCHEDULE" });
        const d = describeTourCalendarReadiness(r);
        expect(d.title).toBe("Published — not bookable yet");
        expect(d.title).not.toMatch(/live/i);
        expect(d.detail).toMatch(/no active tour schedule/);
    });

    it("an inactive/archived location is told apart from a missing schedule", async () => {
        resolverMock.resolvePublicTourCalendar.mockResolvedValue({ ok: false, code: "LOCATION_UNAVAILABLE" });
        const r = await measureTourCalendarReadiness(countingSupabase(3), { orgId: ORG, locationId: LOC, link: shareLink() });
        expect(r.code).toBe("LOCATION_UNAVAILABLE");
    });

    it("a link restricted to websites is 'website only' — a direct visit is refused, and every other check still runs", async () => {
        resolverMock.resolvePublicTourCalendar.mockResolvedValue({ ok: true, value: {} });
        const link = shareLink({ allowedEmbedOrigins: ["https://firefly.example/"] });
        const r = await measureTourCalendarReadiness(countingSupabase(1), { orgId: ORG, locationId: LOC, link });
        expect(r).toEqual({ state: "restricted", code: null, restrictedToOrigins: ["https://firefly.example"] });
        expect(resolverMock.resolvePublicTourCalendar).toHaveBeenCalledWith(expect.anything(), "tok_ABC", { embedOrigin: "https://firefly.example" });
        const d = describeTourCalendarReadiness(r);
        expect(d.title).toBe("Live on your website only");
        expect(d.detail).toContain("Opening the address directly");
    });

    it("each blocking cause has its own explanation; an unmeasured link is not called live", () => {
        for (const code of ["NO_PUBLISHED_VERSION", "NOT_PUBLISHED", "INACTIVE", "EXPIRED", "NOT_FOUND"] as const) {
            const d = describeTourCalendarReadiness({ state: "not_bookable", code, restrictedToOrigins: [] });
            expect(d.tone).toBe("blocked");
            expect(d.detail.length).toBeGreaterThan(10);
        }
        expect(describeTourCalendarReadiness(null).title).not.toMatch(/live/i);
    });

    it("the generated URL is the deployment's public origin + /tours/<token>", () => {
        const [row] = projectTourCalendarShareLinks(
            [
                {
                    id: "link-1",
                    form_definition_id: "form-1",
                    is_active: true,
                    expires_at: null,
                    allowed_embed_origins: null,
                    metadata: { default_location_id: LOC, share_embed_path: "/forms/embed/tok_ABC", tour_calendar_v1: { enabled: true } },
                },
            ],
            { locationId: LOC, baseUrl: "https://vacilandos-mac-mini.tail2aa1af.ts.net:4412/", formTitles: {} }
        );
        expect(row!.calendarUrl).toBe("https://vacilandos-mac-mini.tail2aa1af.ts.net:4412/tours/tok_ABC");
    });

    it("the admin route measures every published link; the Share screen's heading comes from that measure", () => {
        const route = web("app/api/admin/tours/calendar-links/route.ts");
        expect(route).toContain("measureTourCalendarReadiness(supabase, { orgId: ctx.orgId, locationId: scope.locationId!, link })");
        const share = web("app/adminV2/settings/tours/availability/TourShareSection.tsx");
        expect(share).toContain("const ready = describeTourCalendarReadiness(link.readiness);");
        expect(share).toContain("{ready.title}");
        expect(share).not.toMatch(/>\s*Tour calendar is live\s*</);
    });
});
