/**
 * RL-15 — PROGRAMS ARE PUBLISHED CONFIGURATION, AND CONFIGURATION ALREADY OWNED THEM.
 *
 * No capability was invented here. A Program is a configuration object with a publication lifecycle
 * — draft, validate, publish, distribute to Locations — writing `configuration_publications` and the
 * `configuration_distribution_*` tables, and the operator meets it at Settings → Programs. The
 * canonical publication route was already declared under `settings.manage`, the only enforcement
 * site that key had; this slice extended the same authority to the two surfaces that carried none.
 *
 * The lock exists for the two ways this would silently rot: a Program mutation acquiring FINANCIAL
 * authority because the surface sits next to tuition rates, and the role-title fallback coming back.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf8");

/** Every Program mutation, and the authority it must name. */
const MUTATIONS: Record<string, readonly string[]> = {
    "app/api/admin/programs/offerings/route.ts": ["POST"],
    "app/api/admin/programs/offerings/[id]/route.ts": ["PATCH", "DELETE"],
    "app/api/admin/programs/offerings/[id]/variants/route.ts": ["POST"],
    "app/api/admin/programs/offerings/[id]/variants/[variantId]/route.ts": ["PATCH", "DELETE"],
    "app/api/admin/location-program-categories/route.ts": ["POST", "PATCH"],
};

/** The canonical publication route gates through its own predicate rather than the shared helper. */
const PUBLICATION_ROUTE = "app/api/admin/configuration/programs/route.ts";

/** Surfaces whose Program access is READ-ONLY and deliberately ungated. */
const PROGRAM_READ_CONSUMERS = [
    "lib/financials/tuitionPlans/tuitionPlanClient.ts",
    "lib/programs/publication/programPublicationService.ts",
];

const GATE = /requireProgramsConfigurationCapability\(ctx\)/;

function handlerBody(file: string, method: string): string | null {
    const src = read(file);
    const marks: { at: number; m: string }[] = [];
    const re = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) marks.push({ at: m.index, m: m[1] });
    const i = marks.findIndex((x) => x.m === method);
    if (i < 0) return null;
    return src.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : src.length);
}

describe("RL-15 — the Programs surface names its authority", () => {
    it("finds the surface it claims to be checking", () => {
        const declared = Object.values(MUTATIONS).reduce((n, ms) => n + ms.length, 0);
        expect(declared, "non-vacuity").toBe(8);
        for (const [file, methods] of Object.entries(MUTATIONS)) {
            expect(fs.existsSync(path.join(WEB, file)), `${file} missing`).toBe(true);
            for (const m of methods) expect(handlerBody(file, m), `${file} ${m} missing`).toBeTruthy();
        }
        expect(fs.existsSync(path.join(WEB, PUBLICATION_ROUTE))).toBe(true);
    });

    it("gates every Program mutation on the configuration capability", () => {
        const ungated: string[] = [];
        for (const [file, methods] of Object.entries(MUTATIONS)) {
            for (const m of methods) if (!GATE.test(handlerBody(file, m)!)) ungated.push(`${file} ${m}`);
        }
        expect(ungated, "each of these had no capability at all — portal admission was the whole gate").toEqual([]);
    });

    it("leaves no Program mutation on portal admission alone", () => {
        for (const file of Object.keys(MUTATIONS)) {
            expect(read(file), `${file} still uses the no-op gate`).not.toMatch(/await requireAdminOrOps\(\)/);
        }
    });

    it("admits no role title as Programs authority", () => {
        /*
         * The publication route's predicates each opened with
         * `roleKeys.some(role => ["admin","ops"].includes(role))`. That made the capability
         * decorative: an organization could withhold `settings.manage` from its `admin` role and
         * change nothing, while a custom role holding the same package was refused.
         */
        const files = [...Object.keys(MUTATIONS), PUBLICATION_ROUTE];
        const offenders: string[] = [];
        for (const file of files) {
            for (const [i, line] of read(file).split("\n").entries()) {
                if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
                if (/roleKeys[\s\S]{0,60}("admin"|"ops")|ctx\.role\s*[!=]==\s*"(admin|ops)"/.test(line)) {
                    offenders.push(`${file}:${i + 1}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("keeps the publication route on the capability it already declared", () => {
        const src = read(PUBLICATION_ROUTE);
        expect(src).toMatch(/permissionKeys\.includes\("settings\.manage"\)/);
        expect(src, "reads stay available to settings.read as well").toMatch(/permissionKeys\.includes\("settings\.read"\)/);
    });

    it("captures no FINANCIAL authority, which is the nearest wrong answer", () => {
        /*
         * The Programs surface sits beside tuition rates and reads them — but only to COUNT, as a
         * guard that refuses to retire an offering whose rates are in use. Every commercial access on
         * this surface must stay a read; the moment one becomes a write, `settings.manage` would be
         * authorizing financial truth from a configuration screen.
         */
        const files = [...Object.keys(MUTATIONS), PUBLICATION_ROUTE,
                       "lib/programs/publication/programPublicationService.ts"];
        for (const file of files) {
            const src = read(file);
            for (const m of src.matchAll(/\.from\("(commercial_[a-z_]+)"\)([\s\S]{0,200})/g)) {
                expect(
                    /\.(insert|update|delete|upsert)\(/.test(m[2]),
                    `${file}: ${m[1]} must be read-only from the Programs surface`,
                ).toBe(false);
            }
            expect(src, `${file} must not take a Financials capability`).not.toMatch(/requireFinancialsCapability|"fin\.write"|"fin\.post"/);
        }
    });

    it("captures no BUSINESS PROCESS authority either", () => {
        const files = [...Object.keys(MUTATIONS), PUBLICATION_ROUTE,
                       "lib/programs/publication/programPublicationService.ts"];
        for (const file of files) {
            expect(read(file), `${file} must not write a process definition`)
                .not.toMatch(/\.from\("(business_process[a-z_]*|process_definitions|stage_definitions)"\)/);
        }
    });

    it("leaves Program READS ungated, because the product reads them everywhere", () => {
        /*
         * Program offerings feed Financials tuition plans, the Commercial workspaces, Announcements
         * audience rules and Business Process work-view conditions. Gating the reads would mean a
         * reader assembling a tuition grid needs authority to manage the organization's settings.
         * This slice governs the mutations that had no authority at all.
         */
        for (const [file] of Object.entries(MUTATIONS)) {
            const get = handlerBody(file, "GET");
            if (get) expect(get, `${file} GET must stay ungated`).not.toMatch(GATE);
        }
        for (const consumer of PROGRAM_READ_CONSUMERS) {
            expect(fs.existsSync(path.join(WEB, consumer)), `${consumer} missing`).toBe(true);
            expect(read(consumer), `${consumer} must not need Programs authority to read`).not.toMatch(GATE);
        }
    });

    it("names the key in its refusal, so a denial is debuggable", () => {
        const helper = read("lib/access/programsConfigurationAuthority.ts");
        expect(helper).toMatch(/"settings\.manage"/);
        expect(helper).toMatch(/required_permission/);
    });
});
