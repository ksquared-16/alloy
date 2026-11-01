/**
 * Location-only NEW availability (Tours feedback 2026-10-29, sprint OPWORK_2CEA84351D90_SPRINT_EB9A9359C92B).
 *
 * A legacy organization-wide rule (`location_id` null) stays stored but no longer offers new times,
 * no longer makes a calendar publishable, no longer appears as an overlap, and no longer supplies a
 * location's timezone or tour length. Reads only: nothing here writes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/operatingCalendar/operatingCalendarServer", () => ({
    loadOperatingCalendarForInstants: async () => ({ isOperating: () => true }),
}));
const locationTz = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/lib/location/timezoneResolution", () => ({
    resolveLocationTimezone: async () =>
        locationTz.value ? { status: "resolved", timezone: locationTz.value, source: "location_metadata" } : { status: "unresolved", timezone: null },
}));

import { computeAvailableTourSlots, tourRulesForLocation } from "@/lib/tours/availability/computeAvailableTourSlots";
import { resolveTourLocationTimezone } from "@/lib/tours/availability/resolveTourLocationTimezone";
import { resolveTourLocationSlotDurationMinutes } from "@/lib/tours/availability/resolveTourLocationSlotDurationMinutes";

const ORG = "org-1";
const LOC = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

type Rule = Record<string, unknown>;
const rule = (id: string, location_id: string | null, over: Rule = {}): Rule => ({
    id,
    org_id: ORG,
    location_id,
    user_id: null,
    day_of_week: 1, // Monday
    start_time: "09:00:00",
    end_time: "10:00:00",
    timezone: "UTC",
    slot_duration_minutes: 30,
    buffer_minutes: 0,
    max_bookings_per_slot: 1,
    approval_required: false,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
});

let tables: Record<string, Rule[]> = {};
const writes: string[] = [];

/** A PostgREST-shaped fake that applies eq / in / or(location_id) filters and records any write. */
function fakeSupabase() {
    return {
        from(table: string) {
            let rows = [...(tables[table] ?? [])];
            const chain: Record<string, unknown> = {};
            chain.select = () => chain;
            chain.eq = (col: string, val: unknown) => {
                rows = rows.filter((r) => r[col] === val);
                return chain;
            };
            chain.in = (col: string, vals: unknown[]) => {
                rows = rows.filter((r) => vals.includes(r[col]));
                return chain;
            };
            chain.or = () => chain;
            chain.lt = () => chain;
            chain.gt = () => chain;
            chain.order = () => chain;
            for (const w of ["insert", "update", "upsert", "delete"]) {
                chain[w] = () => {
                    writes.push(`${table}.${w}`);
                    return chain;
                };
            }
            chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res);
            return chain;
        },
    } as never;
}

const MONDAY = { from: new Date("2026-11-02T00:00:00Z"), to: new Date("2026-11-02T23:59:00Z") };

beforeEach(() => {
    tables = { tour_availability_rules: [], tour_bookings: [] };
    writes.length = 0;
    locationTz.value = null;
});

describe("tourRulesForLocation", () => {
    const rules = [rule("org", null), rule("own", LOC), rule("other", OTHER), rule("blank", "")];
    it("new availability: own rules only — never organization-wide, never another location's", () => {
        expect(tourRulesForLocation(rules, LOC).map((r) => r.id)).toEqual(["own"]);
        expect(tourRulesForLocation([rule("org", null)], LOC)).toEqual([]);
    });
    it("the legacy confirmation authority adds organization-wide rules but still never another location's", () => {
        expect(tourRulesForLocation(rules, LOC, "legacy_pending_confirmation").map((r) => r.id)).toEqual(["org", "own", "blank"]);
    });
});

describe("computeAvailableTourSlots", () => {
    it("a location with only organization-wide rules offers no new slots", async () => {
        tables.tour_availability_rules = [rule("org-a", null), rule("org-b", null, { start_time: "13:00:00", end_time: "15:00:00" })];
        const slots = await computeAvailableTourSlots(fakeSupabase(), { orgId: ORG, locationId: LOC, ...MONDAY });
        expect(slots).toEqual([]);
    });

    it("offers the location's own rule times and excludes other locations' and organization-wide ones", async () => {
        tables.tour_availability_rules = [
            rule("org", null, { start_time: "13:00:00", end_time: "14:00:00" }),
            rule("own", LOC),
            rule("other", OTHER, { start_time: "16:00:00", end_time: "17:00:00" }),
        ];
        const slots = await computeAvailableTourSlots(fakeSupabase(), { orgId: ORG, locationId: LOC, ...MONDAY });
        expect(slots.map((s) => [s.ruleId, s.startAt])).toEqual([
            ["own", "2026-11-02T09:00:00.000Z"],
            ["own", "2026-11-02T09:30:00.000Z"],
        ]);
    });

    it("the legacy authority still sees a legacy rule's time (for confirming an existing booking only)", async () => {
        tables.tour_availability_rules = [rule("org", null)];
        const slots = await computeAvailableTourSlots(fakeSupabase(), { orgId: ORG, locationId: LOC, ...MONDAY }, "legacy_pending_confirmation");
        expect(slots.map((s) => s.startAt)).toEqual(["2026-11-02T09:00:00.000Z", "2026-11-02T09:30:00.000Z"]);
    });

    it("existing bookings keep counting against capacity", async () => {
        tables.tour_availability_rules = [rule("own", LOC)];
        tables.tour_bookings = [
            { id: "b1", org_id: ORG, location_id: LOC, start_at: "2026-11-02T09:00:00.000Z", end_at: "2026-11-02T09:30:00.000Z", status_key: "confirmed" },
        ];
        const slots = await computeAvailableTourSlots(fakeSupabase(), { orgId: ORG, locationId: LOC, ...MONDAY });
        expect(slots.find((s) => s.startAt === "2026-11-02T09:00:00.000Z")?.remainingCapacity ?? 0).toBe(0);
        expect(writes).toEqual([]);
    });
});

describe("timezone and tour-length defaults ignore organization-wide rules", () => {
    it("timezone: own rule, else the location's configured zone, never an organization-wide rule's", async () => {
        tables.tour_availability_rules = [rule("org", null, { timezone: "America/New_York" })];
        expect(await resolveTourLocationTimezone(fakeSupabase(), ORG, LOC)).toBe("UTC");
        locationTz.value = "America/Chicago";
        expect(await resolveTourLocationTimezone(fakeSupabase(), ORG, LOC)).toBe("America/Chicago");
        tables.tour_availability_rules.push(rule("own", LOC, { timezone: "America/Denver" }));
        expect(await resolveTourLocationTimezone(fakeSupabase(), ORG, LOC)).toBe("America/Denver");
    });

    it("tour length: own rule, else the platform default", async () => {
        tables.tour_availability_rules = [rule("org", null, { slot_duration_minutes: 45 })];
        expect(await resolveTourLocationSlotDurationMinutes(fakeSupabase(), ORG, LOC)).toBe(60);
        tables.tour_availability_rules.push(rule("own", LOC, { slot_duration_minutes: 20 }));
        expect(await resolveTourLocationSlotDurationMinutes(fakeSupabase(), ORG, LOC)).toBe(20);
        expect(writes).toEqual([]);
    });
});

describe("eligibility, overlaps and the legacy path's reach (source guards)", () => {
    const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");
    const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

    it("a calendar is publishable only with an active rule of the location's own", () => {
        const server = code("lib/tours/publicCalendar/publicTourCalendarServer.ts");
        expect(server).not.toContain("location_id.is.null");
        expect(server).toMatch(/from\("tour_availability_rules"\)[\s\S]{0,200}\.eq\("location_id", locationId\)/);
    });

    it("schedule overlap warnings at a location compare only its own rules", () => {
        const writesSrc = code("lib/tours/schedules/tourScheduleWrites.ts");
        expect(writesSrc).not.toContain("location_id.is.null");
        expect(writesSrc).toMatch(/async function loadContributingRules[\s\S]{0,300}q = inScope\(q, scope\);/);
    });

    it("the location rule list (UI + API) no longer returns organization-wide rules", () => {
        expect(code("app/api/admin/tours/availability-rules/route.ts")).not.toContain("location_id.is.null");
        expect(code("lib/locations/locationConcernCache.ts")).not.toMatch(/rule\.location_id == null/);
    });

    it("the public invite book route refuses an organization-wide rule id", () => {
        expect(code("app/api/public/tour-booking/[token]/book/route.ts")).toContain(
            'if (ru.location_id == null || String(ru.location_id).trim() !== link.location_id) {'
        );
    });

    it("legacy_pending_confirmation is passed by confirmTourBooking alone — no route, input or reschedule reaches it", () => {
        const service = code("lib/tours/bookings/tourBookingService.ts");
        const uses = service.match(/"legacy_pending_confirmation"/g) ?? [];
        expect(uses).toHaveLength(1);
        const confirm = service.slice(service.indexOf("export async function confirmTourBooking"), service.indexOf("export async function rescheduleTourBooking"));
        expect(confirm).toContain('"legacy_pending_confirmation"');
        expect(confirm).toContain("startAt: new Date(existing.start_at)");
        expect(confirm).toContain("patch: { status_key: \"confirmed\" }");
        const hits = execSync('grep -rl "legacy_pending_confirmation" app lib components || true', { cwd: resolve(__dirname, "../..") })
            .toString()
            .trim()
            .split("\n")
            .filter(Boolean)
            .sort();
        expect(hits).toEqual(["lib/tours/availability/computeAvailableTourSlots.ts", "lib/tours/bookings/tourBookingService.ts"]);
    });
});
