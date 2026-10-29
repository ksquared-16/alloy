/**
 * Tours feedback batch (2026-10-29, sprint OPWORK_2CEA84351D90_SPRINT_EB9A9359C92B):
 * location-only Tours, /organization tokens, compact schedule editor, booking-button text colour,
 * and "Attach a form" on Preview & Share.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    BRAND_TEXT_CONTRAST_MIN,
    brandButtonColors,
    brandCtaButtonColors,
    contrastRatio,
    readPublicBrandValues,
    resolveEffectivePublicBrand,
    validatePublicBrandInput,
} from "@/lib/branding/publicBrand";
import { groupTourRulesIntoSchedules, isLocationOwnRule } from "@/lib/tours/schedules/tourWeeklySchedule";
import { tourCalendarAttachOptions, type TourCalendarShareLink } from "@/lib/tours/publicCalendar/tourCalendarShare";

const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const TOURS = "app/adminV2/settings/tours/availability/";
const client = strip(read(`${TOURS}TourAvailabilitySettingsClient.tsx`));
const share = strip(read(`${TOURS}TourShareSection.tsx`));
const brandPanel = strip(read(`${TOURS}TourPublicBrandPanel.tsx`));

describe("location-only Tours", () => {
    const LOC = "11111111-1111-4111-8111-111111111111";
    const rule = (id: string, location_id: string | null) =>
        ({
            id,
            location_id,
            user_id: null,
            day_of_week: 1,
            start_time: "09:00:00",
            end_time: "10:00:00",
            timezone: "America/Los_Angeles",
            slot_duration_minutes: 30,
            buffer_minutes: 0,
            max_bookings_per_slot: 1,
            approval_required: false,
            is_active: true,
            metadata: {},
        }) as never;

    it("keeps a location's own rules and never an organization-wide (null) one", () => {
        expect(isLocationOwnRule({ location_id: LOC }, LOC)).toBe(true);
        expect(isLocationOwnRule({ location_id: null }, LOC)).toBe(false);
        expect(isLocationOwnRule({ location_id: "other" }, LOC)).toBe(false);
        expect(isLocationOwnRule({ location_id: LOC }, "")).toBe(false);
        expect(isLocationOwnRule({ location_id: null }, null)).toBe(false);
    });

    it("the 0-local + 4-org-wide location shows no schedules (and none are marked inherited)", () => {
        const rules = [rule("a", null), rule("b", null), rule("c", null), rule("d", null)];
        const own = rules.filter((r) => isLocationOwnRule(r, LOC));
        expect(own).toEqual([]);
        const mixed = [...rules, rule("e", LOC)].filter((r) => isLocationOwnRule(r, LOC));
        const groups = groupTourRulesIntoSchedules(mixed, LOC);
        expect(groups).toHaveLength(1);
        expect(groups.every((g) => !g.inherited)).toBe(true);
    });

    it("has no organization-wide scope, section, badge, notice or copy control", () => {
        expect(client).not.toMatch(/Organization-wide \(all locations\)|tours-inherited-schedules|AvailabilityOwnership|Copy to this location/);
        expect(client).not.toMatch(/inheritedSource|fromInherited|inheritedGroups/);
        expect(client).toContain('data-testid="tours-choose-location"');
    });

    it("hides nothing by deleting it: no write path was added and the filter is presentation-only", () => {
        expect(client).not.toMatch(/location_id:\s*null/);
        expect(client).toContain("isLocationOwnRule(rule, target)");
    });
});

describe("/organization design tokens replace legacy Tours sky / navy", () => {
    it("Tours settings files use no sky-* utilities and no slate alloy-pine badge", () => {
        for (const src of [client, share, brandPanel]) {
            expect(src).not.toMatch(/\bsky-\d/);
            expect(src).not.toMatch(/alloy-pine\//);
        }
        expect(client).not.toContain("bg-alloy-midnight text-white");
        expect(client).toContain("bg-alloy-bend-pine text-white");
    });

    it("the Tours tab bar uses the secondary (Bend Pine) tone; other settings keep the primary default", () => {
        expect(client).toContain('tone="secondary"');
        const bar = read("components/adminV2/settings/SettingsEntityTabBar.tsx");
        expect(bar).toContain('tone = "primary"');
        expect(bar).toContain('tone === "secondary" ? brand.secondary : brand.primary');
    });
});

describe("compact schedule editor", () => {
    it("is bounded; start and end are fixed readable boxes that sit side by side and wrap rather than clip", () => {
        expect(client).toMatch(/max-w-2xl rounded-lg[^"]*" data-testid="tours-schedule-editor"/);
        const start = client.indexOf('<div className="flex min-w-0 flex-wrap items-center gap-2" data-testid={`tours-schedule-window-times-${i}`}>');
        expect(start).toBeGreaterThan(-1);
        const row = client.slice(start, client.indexOf("formatTourWallTimeRange(w.start_time, w.end_time)", start));
        // Both inputs live in a non-shrinking 8rem box; no fixed grid track that overflows a phone-width panel.
        expect(row.match(/<span className="block w-32 shrink-0">\s*<input\s+type="time"/g) ?? []).toHaveLength(2);
        expect(row).toContain("tours-schedule-window-start-${i}");
        expect(row).toContain("tours-schedule-window-end-${i}");
        expect(client).not.toContain("grid-cols-[8rem_auto_8rem]");
    });
});

describe("booking button text colour (public_brand_v1)", () => {
    it("is read, validated and resolved location → organization like the other fields", () => {
        expect(readPublicBrandValues({ public_brand_v1: { tour_cta_text_color: "#fff" } }).tour_cta_text_color).toBe("#FFFFFF");
        expect(readPublicBrandValues({ public_brand_v1: { tour_cta_text_color: "red" } }).tour_cta_text_color).toBeNull();
        expect(validatePublicBrandInput({ tour_cta_text_color: "#123456" })).toMatchObject({ ok: true, values: { tour_cta_text_color: "#123456" } });
        expect(validatePublicBrandInput({ tour_cta_text_color: "" })).toMatchObject({ ok: true, values: { tour_cta_text_color: null } });
        expect(validatePublicBrandInput({ tour_cta_text_color: "url(x)" })).toMatchObject({ ok: false });
        const eff = resolveEffectivePublicBrand({
            organization: { display_name: null, accent_color: null, logo_url: null, tour_cta_text_color: "#18273A" },
            location: { display_name: null, accent_color: null, logo_url: null },
        });
        expect(eff).toMatchObject({ tourCtaTextColor: "#18273A", sources: { tourCtaTextColor: "organization" } });
        expect(resolveEffectivePublicBrand({}).tourCtaTextColor).toBeNull();
    });

    it("unset keeps the derived pair exactly (no visual change for existing schools)", () => {
        for (const accent of ["#00A283", "#1F6FEB", "#FFD400"]) {
            expect(brandCtaButtonColors(accent, null)).toEqual(brandButtonColors(accent));
        }
    });

    it("a readable chosen colour is used; an unreadable one is set aside, never shipped under 4.5:1", () => {
        expect(brandCtaButtonColors("#1F6FEB", "#FFFFFF")).toMatchObject({ fill: "#1F6FEB", ink: "#FFFFFF", treatment: "chosen_text" });
        expect(brandCtaButtonColors("#FFD400", "#000000")).toMatchObject({ fill: "#FFD400", ink: "#000000", treatment: "chosen_text" });
        const refused = brandCtaButtonColors("#FFD400", "#FFFFFF");
        expect(refused.treatment).toBe("chosen_text_below_contrast");
        expect(refused.ink).toBe(brandButtonColors("#FFD400").ink);
        for (let i = 0; i < 4096; i += 7) {
            const accent = `#${i.toString(16).padStart(3, "0")}`;
            for (const ink of ["#FFFFFF", "#000000", "#888888", "#FF0000"]) {
                const p = brandCtaButtonColors(accent, ink);
                expect(contrastRatio(p.fill, p.ink), `${accent}/${ink}`).toBeGreaterThanOrEqual(BRAND_TEXT_CONTRAST_MIN);
            }
        }
    });

    it("the website button snippet and Booking preview use the CTA pair", () => {
        expect(share).toContain("brandCtaButtonColors(brand?.accentColor ?? PUBLIC_BRAND_PLATFORM_ACCENT, brand?.tourCtaTextColor)");
        expect(brandPanel).toContain('field("tour_cta_text_color"');
        expect(brandPanel).toContain("style={{ background: ctaPair.fill, color: ctaPair.ink }}");
    });
});

describe("Attach a form (Preview & Share)", () => {
    const link = (over: Partial<TourCalendarShareLink>): TourCalendarShareLink => ({
        linkId: "l",
        formId: "f1",
        formTitle: "Admissions Packet",
        linkLabel: null,
        usable: true,
        unusableReason: null,
        leadCapture: true,
        calendarPublished: false,
        calendarPublishedAt: null,
        calendarPath: "/tours/t",
        calendarUrl: null,
        allowedEmbedOrigins: [],
        createdAt: "2026-10-01T00:00:00Z",
        ...over,
    });

    it("offers each form once, on its newest eligible link, instead of indistinguishable rows", () => {
        const { attachable, blocked } = tourCalendarAttachOptions([
            link({ linkId: "old", createdAt: "2026-09-01T00:00:00Z" }),
            link({ linkId: "new", createdAt: "2026-10-20T00:00:00Z" }),
            link({ linkId: "mid", createdAt: "2026-10-05T00:00:00Z" }),
            link({ linkId: "other", formId: "f2", formTitle: "Tour inquiry" }),
            link({ linkId: "off", usable: false, unusableReason: "inactive" }),
            link({ linkId: "notlead", formId: "f3", formTitle: "Medical", leadCapture: false }),
            link({ linkId: "live", formId: "f4", formTitle: "Live", calendarPublished: true }),
        ]);
        expect(attachable.map((f) => [f.formTitle, f.link.linkId, f.otherLinks.length])).toEqual([
            ["Admissions Packet", "new", 2],
            ["Tour inquiry", "other", 0],
        ]);
        expect(blocked.map((l) => l.linkId).sort()).toEqual(["notlead", "off"]);
    });

    it("attaching is still the guarded link PATCH, and Forms Studio opens through the Processing modal", () => {
        expect(share).toContain("JSON.stringify({ tour_calendar: enabled })");
        expect(share).toContain("setPublished(chosen.link, true)");
        expect(share).toContain('dispatchAdminV2OpenProcessingModal({ mode: "studio", studioTab: "forms" })');
        expect(share).toContain("Processing → Studios → Forms");
        expect(share).not.toContain("Publish tour calendar here");
    });

    it("keeps the two-step order: tour first, then the attached form", () => {
        expect(share).toMatch(/Step 1 is the tour calendar; step 2 is the inquiry form you choose here/);
        expect(read("app/api/admin/tours/calendar-links/route.ts")).toContain("metadata, created_at");
    });
});
