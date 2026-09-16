/**
 * RL-20 — SETTING THE HOURS IS NOT BOOKING THE FAMILY.
 *
 * All nine Tour mutations answered to `requireAdminOrOps()`, which resolves PORTAL ADMISSION and no
 * role. Anyone who could enter the portal could rewrite when tours may be booked, and could confirm,
 * cancel or no-show any family's tour — the largest portal-only cluster left in the estate, on the
 * one surface a prospective customer actually experiences.
 *
 * Two keys, because operators do two different jobs in two different places: `tours.configure` is
 * edited at Settings → Tours → Availability; `tours.book` is operated from the Lead drawer. Neither
 * implies the other.
 *
 * WHAT THIS LOCK REFUSES TO LET HAPPEN LATER. The cheap ways to erode this are all borrowings:
 * gating availability on `scheduling.write` because both concern time, or gating the booking
 * lifecycle on `crm.opportunities.write` because it touches a Lead, or collapsing the two Tours keys
 * into one because a single gate is less code. Each is asserted against by name.
 *
 * EFFECTIVE, NOT DECLARED. Analytics and Financials both shipped a declared capability sitting in
 * front of a stricter role title, so every assertion reads the handler's own body with comments
 * stripped — an import, or prose describing what was removed, must never satisfy a gate.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api", "admin");
const PUBLIC_API = path.join(WEB, "app", "api", "public", "tour-booking");
const INVENTORY = JSON.parse(
    fs.readFileSync(path.join(WEB, "scripts", "routeCapabilities.declared.json"), "utf8"),
) as { routes: Record<string, Record<string, { status: string; capability?: string; reason?: string }>> };

const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

function handlerBody(src: string, method: string): string | null {
    const m = new RegExp(`export async function ${method}\\s*\\(`).exec(src);
    if (!m) return null;
    let i = m.index + m[0].length - 1;
    let depth = 0;
    for (; i < src.length; i += 1) {
        if (src[i] === "(") depth += 1;
        else if (src[i] === ")") {
            depth -= 1;
            if (depth === 0) break;
        }
    }
    const b = src.indexOf("{", i);
    depth = 0;
    for (let j = b; j < src.length; j += 1) {
        if (src[j] === "{") depth += 1;
        else if (src[j] === "}") {
            depth -= 1;
            if (depth === 0) return src.slice(b, j + 1);
        }
    }
    return src.slice(b);
}

const CONFIGURE: [string, string][] = [
    ["tours/availability-rules/route.ts", "POST"],
    ["tours/availability-rules/[ruleId]/route.ts", "PATCH"],
    ["tours/availability-rules/[ruleId]/route.ts", "DELETE"],
];

const BOOK: [string, string][] = [
    ["tours/bookings/route.ts", "POST"],
    ["tours/bookings/[bookingId]/confirm/route.ts", "POST"],
    ["tours/bookings/[bookingId]/cancel/route.ts", "POST"],
    ["tours/bookings/[bookingId]/complete/route.ts", "POST"],
    ["tours/bookings/[bookingId]/no-show/route.ts", "POST"],
    ["tours/bookings/[bookingId]/reschedule/route.ts", "POST"],
];

const ALL = [...CONFIGURE, ...BOOK];
const read = (rel: string) => fs.readFileSync(path.join(API, rel), "utf8");

describe("RL-20 — every Tour mutation is owned", () => {
    it("finds the surface it asserts over, so this lock cannot pass by measuring nothing", () => {
        expect(CONFIGURE.length).toBe(3);
        expect(BOOK.length).toBe(6);
        for (const [rel] of ALL) expect(fs.existsSync(path.join(API, rel))).toBe(true);
    });

    it.each(CONFIGURE)("%s %s requires tours.configure at its own call site", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).toMatch(/requireToursCapability\s*\(\s*access\s*,\s*TOURS_CONFIGURE\s*\)/);
        expect(body).toMatch(/if \(capDenied\) return capDenied;/);
        // Configuration must never accept the booking key.
        expect(body).not.toContain("TOURS_BOOK");
    });

    it.each(BOOK)("%s %s requires tours.book at its own call site", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).toMatch(/requireToursCapability\s*\(\s*access\s*,\s*TOURS_BOOK\s*\)/);
        expect(body).toMatch(/if \(capDenied\) return capDenied;/);
        // Booking must never accept the configuration key.
        expect(body).not.toContain("TOURS_CONFIGURE");
    });

    it.each(ALL)("%s %s has no portal fallback, role title or flag in its authority path", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).not.toMatch(/requireAdminOrOps\s*\(/);
        expect(body).not.toMatch(/requireAdmin\s*\(/);
        expect(body).not.toMatch(/ctx\.role\s*[!=]==|auth\.role\s*[!=]==|roleKeys/);
        expect(body).not.toMatch(/process\.env\.[A-Z_]+/);
    });

    it.each(ALL)("%s %s borrows neither Scheduling nor CRM authority", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).not.toContain("scheduling.write");
        expect(body).not.toContain("crm.opportunities");
        expect(body).not.toContain("crm.customers");
    });

    it.each(ALL)("%s %s is declared with the owner it enforces", (rel, method) => {
        const entry = INVENTORY.routes[`app/api/admin/${rel}`]?.[method];
        const expected = CONFIGURE.some(([r, m]) => r === rel && m === method)
            ? "tours.configure"
            : "tours.book";
        expect(entry?.status).toBe("declared");
        expect(entry?.capability).toBe(expected);
    });
});

describe("RL-20 — the two families stay apart", () => {
    it("the helper defines exactly these two keys and no third", () => {
        const src = codeOnly(fs.readFileSync(path.join(WEB, "lib", "access", "toursAuthority.ts"), "utf8"));
        const keys = [...src.matchAll(/=\s*"([a-z_]+\.[a-z_.]+)" as const/g)].map((m) => m[1]).sort();
        expect(keys).toEqual(["tours.book", "tours.configure"]);
        expect(src).not.toMatch(/ctx\.role|roleKeys|process\.env/);
    });

    it("no handler holds both keys, so one gate can never satisfy both families", () => {
        for (const [rel, method] of ALL) {
            const body = codeOnly(handlerBody(read(rel), method)!);
            const both = body.includes("TOURS_CONFIGURE") && body.includes("TOURS_BOOK");
            expect(both, `${method} ${rel} must name exactly one Tours authority`).toBe(false);
        }
    });

    it("the seed migration grants both keys to admin AND ops, and to nobody else", () => {
        const mig = fs.readFileSync(
            path.join(WEB, "..", "supabase", "migrations", "20260916020000_tours_booking_authority.sql"),
            "utf8",
        );
        expect(mig).toContain("'tours.configure'");
        expect(mig).toContain("'tours.book'");
        // The backfill is structural — role_key, never a display label.
        expect(mig).toMatch(/role_key IN \('admin', 'ops'\)/);
        expect(mig).not.toMatch(/role_label/);
        // And it proves custom roles received nothing.
        expect(mig).toContain("a role outside admin/ops received a Tours capability");
    });
});

describe("RL-20 — the public booking surface stays a customer door", () => {
    it("no public tour-booking handler carries an operator Tours capability", () => {
        const offenders: string[] = [];
        const walk = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs);
                else if (e.name === "route.ts") {
                    const src = codeOnly(fs.readFileSync(abs, "utf8"));
                    if (src.includes("requireToursCapability") || src.includes("tours.book")) {
                        offenders.push(path.relative(PUBLIC_API, abs));
                    }
                }
            }
        };
        walk(PUBLIC_API);
        expect(
            offenders,
            `these are token-authenticated customer routes; an operator capability must not appear on them: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});

describe("RL-20 — the classification is complete", () => {
    it("fails when a new Tour mutation appears without classification", () => {
        const found: string[] = [];
        const walk = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs);
                else if (e.name === "route.ts") {
                    const src = fs.readFileSync(abs, "utf8");
                    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
                        if (new RegExp(`export async function ${m}\\b`).test(src)) {
                            found.push(`${path.relative(API, abs).split(path.sep).join("/")}|${m}`);
                        }
                    }
                }
            }
        };
        walk(path.join(API, "tours"));
        const known = new Set(ALL.map(([r, m]) => `${r}|${m}`));
        const unclassified = found.filter((f) => !known.has(f));
        expect(
            unclassified,
            `classify these Tour mutations as tours.configure, tours.book, or recorded debt: ${unclassified.join(", ")}`,
        ).toEqual([]);
    });
});
