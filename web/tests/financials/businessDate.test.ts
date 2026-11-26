/**
 * THE ORGANISATION'S BUSINESS DATE, AND THE BOUNDARY THAT MAKES IT DIFFERENT FROM UTC.
 *
 * `new Date().toISOString().slice(0, 10)` and "today for this organisation" agree for most of the
 * day, which is exactly why the difference survived so long: a surface defaulting to the UTC date
 * looks right whenever you happen to test it during the working morning.
 *
 * These pin the window where they disagree. If the Financials business date ever silently becomes
 * the UTC date again, the first assertion below fails.
 */
import { describe, expect, it } from "vitest";

import { businessDateInZone } from "@/lib/financials/businessDate";

/** The UTC day, spelled exactly as the idiom this slice removed. */
const utcDay = (at: Date) => at.toISOString().slice(0, 10);

describe("the business date is not the UTC date", () => {
    /**
     * 2026-10-05T23:30:00Z is 16:30 on 5 October in Los Angeles — still firmly the working
     * afternoon, and still the 5th for the organisation. UTC agrees here.
     */
    it("agrees with UTC during the organisation's morning and afternoon", () => {
        const at = new Date("2026-10-05T23:30:00Z");
        expect(businessDateInZone("America/Los_Angeles", at)).toBe("2026-10-05");
        expect(utcDay(at)).toBe("2026-10-05");
    });

    /**
     * ── THE BOUNDARY ────────────────────────────────────────────────────────────────────────
     *
     * 2026-10-06T01:00:00Z is 18:00 on 5 October in Los Angeles. The organisation's day is still
     * the 5th; UTC has already rolled to the 6th. An effective date defaulted from UTC here would
     * date a correction TOMORROW — and near a period boundary that is the difference between
     * landing in this commercial period and the next one.
     */
    it("stays on the organisation's day after UTC has rolled over", () => {
        const at = new Date("2026-10-06T01:00:00Z");
        expect(businessDateInZone("America/Los_Angeles", at)).toBe("2026-10-05");
        expect(utcDay(at)).toBe("2026-10-06");
        expect(businessDateInZone("America/Los_Angeles", at)).not.toBe(utcDay(at));
    });

    /** The same boundary at the end of a month, which is where a billing period actually ends. */
    it("does not roll an organisation into the next month early", () => {
        const at = new Date("2026-11-01T02:00:00Z");
        /* 19:00 on 31 October in Los Angeles — October's final evening. */
        expect(businessDateInZone("America/Los_Angeles", at)).toBe("2026-10-31");
        expect(utcDay(at)).toBe("2026-11-01");
    });

    /** East of UTC the error runs the other way, and the helper is just as correct there. */
    it("is ahead of UTC for an organisation east of it", () => {
        const at = new Date("2026-10-05T22:00:00Z");
        expect(businessDateInZone("Pacific/Auckland", at)).toBe("2026-10-06");
        expect(utcDay(at)).toBe("2026-10-05");
    });

    it("is the identity for an organisation on UTC", () => {
        const at = new Date("2026-10-06T01:00:00Z");
        expect(businessDateInZone("UTC", at)).toBe(utcDay(at));
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const code = (rel: string) =>
    readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Financials reads the organisation's day rather than computing one", () => {
    /**
     * The browser's zone is the OPERATOR's; the economic date is the ORGANISATION's, and an
     * operator may sit in a different zone from the site whose money they are recording. So the
     * surface must receive the resolved day, never derive one — and §3 forbids duplicating timezone
     * arithmetic in React outright.
     */
    it("the card takes the day from the VM and does no timezone arithmetic", () => {
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toMatch(/const businessToday = vm\?\.businessDateYmd/);
        /* No zone conversion in the component. */
        expect(card).not.toMatch(/toZonedTime|formatInTimeZone|fromZonedTime/);
    });

    it("both Adjustment openers set the effective date, and neither inherits the source's", () => {
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect((card.match(/setAdjustEffectiveDate\(businessToday\)/g) ?? []).length).toBe(2);
        /* The state is seeded empty; a UTC seed here is the default this slice removed. */
        expect(card).toMatch(/useState\(""\)/);
    });

    it("the VM resolves the operating day through the organisation, not through UTC", () => {
        const vm = code("lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts");
        expect(vm).toMatch(/await resolveOperatingDay\(supabase, args\.orgId\)/);
        expect(vm).toMatch(/fetchOrgBusinessDate/);
        /* `args.today` still wins — certification pins it. */
        expect(vm).toMatch(/t\(args\.today\) \|\| \(await resolveOperatingDay/);
    });

    it("the reversal is dated by the organisation's day", () => {
        const reduction = code("lib/financials/reductions/manualReductionService.ts");
        expect(reduction).toMatch(/const today = await fetchOrgBusinessDate\(supabase, input\.orgId\)/);
        expect(reduction).not.toMatch(/const today = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
    });

    /** The one place UTC is still correct: arithmetic on an already-chosen day. */
    it("leaves date arithmetic UTC-anchored, because a chosen day plus N is zone-independent", () => {
        expect(code("lib/financials/policies/resolveDueDate.ts")).toMatch(/T00:00:00Z/);
    });
});
