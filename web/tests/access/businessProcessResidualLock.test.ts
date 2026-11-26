/**
 * RL-30 — DEFINING AN ACTION IS DESIGN, NOT EXECUTION; AND VALIDATING A DRAFT IS A WRITE.
 *
 * Two handlers were the last Business Process mutations reaching no capability, and each was wrong
 * in its own way.
 *
 * `action-definitions/[id]` PATCH asked `ctx.role !== "admin"`. In the SAME Settings -> Actions
 * editor, the placement control beside it had already been decided on `business_process.configure`
 * — so one surface answered two different questions about who may change it, admitting an
 * administrator whose package withholds the key and refusing a custom Process Configurer who holds
 * it. Defining an Action and deciding which stage offers it are one design authority, and
 * `is_active` here withdraws the Action from every stage at once.
 *
 * `business-process/configuration/validate` POST was reported READ-LIKE by the reconciliation that
 * preceded this slice, and that finding was WRONG. A route-level scan for `.insert/.update/.upsert/
 * .delete` finds nothing in the file because the write is one call away, in `recordDraftValidation`,
 * which sets `business_process_drafts.draft_status` to `validated`. That status is exactly what
 * `publish` requires — and `publish` has been `business_process.configure` since Business Process
 * Family Convergence V2 — so admission alone in front of validate let any portal-admitted principal
 * advance the publication workflow for a draft they could not publish. This lock pins the write, so
 * the same route-level reading cannot talk a later slice back into "it is only a preview".
 *
 * ── THE INVARIANT THIS LOCK EXISTS TO HOLD ──
 *
 * `business_process.configure` may DEFINE what an Action is. It must never become the key that RUNS
 * one. `actions/execute` stays conditional and domain-owned under Model D; RL-28 owns that claim and
 * this file asserts the same boundary from the Business Process side, so neither can drift alone.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api", "admin");
const read = (p: string) => fs.readFileSync(p, "utf8");
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const INVENTORY = JSON.parse(
    read(path.join(WEB, "scripts", "routeCapabilities.declared.json")),
) as { routes: Record<string, Record<string, { status: string; capability?: string }>> };

const DEFINITION_ROUTE = "app/api/admin/action-definitions/[id]/route.ts";
const VALIDATE_ROUTE = "app/api/admin/business-process/configuration/validate/route.ts";
const PUBLISH_ROUTE = "app/api/admin/business-process/configuration/publish/route.ts";
const CONFIGURE = "business_process.configure";

const MUTATIONS = ["POST", "PATCH", "PUT", "DELETE"];

describe("RL-30 — the Action DEFINITION is Business Process design", () => {
    const src = codeOnly(read(path.join(WEB, DEFINITION_ROUTE)));

    it("PATCH requires business_process.configure through the canonical helper", () => {
        expect(src).toMatch(
            /requireBusinessProcessCapability\s*\(\s*ctx\s*,\s*BUSINESS_PROCESS_CONFIGURE\s*\)/,
        );
    });

    it("no role title decides it any more", () => {
        expect(src, "ctx.role !== admin was the rule this slice removed").not.toMatch(
            /ctx\.role\s*!==|roleKeys\.(some|includes)|requireAdmin\s*\(/,
        );
    });

    it("authority settles before the definition row is read or written", () => {
        const raw = read(path.join(WEB, DEFINITION_ROUTE));
        const gate = raw.indexOf("requireBusinessProcessCapability");
        const firstDb = raw.indexOf('.from("action_definitions")');
        expect(gate).toBeGreaterThan(-1);
        expect(firstDb, "a refusal must not reach the database").toBeGreaterThan(gate);
    });

    it("the ACTIVATE key does not substitute for CONFIGURE", () => {
        // A role trusted to switch a configuration live is not thereby trusted to design one.
        expect(src).not.toContain("BUSINESS_PROCESS_ACTIVATE");
        expect(src).not.toContain("business_process.activate");
    });

    it("no domain EXECUTION capability substitutes for the design key", () => {
        for (const foreign of [
            "ENROLLMENT_DECIDE", "enrollment.decide",
            "ENROLLMENT_RECORD_MANAGE", "enrollment.record.manage",
            "work.operate", "WORK_OPERATE",
            "crm.customers.write", "attendance.record", "settings.manage",
        ]) {
            expect(src, `${foreign} runs actions; it does not define them`).not.toContain(foreign);
        }
    });
});

describe("RL-30 — validating a draft is a WRITE, and it is owned", () => {
    it("validate requires business_process.configure", () => {
        const src = codeOnly(read(path.join(WEB, VALIDATE_ROUTE)));
        expect(src).toMatch(
            /requireBusinessProcessCapability\s*\(\s*ctx\s*,\s*BUSINESS_PROCESS_CONFIGURE\s*\)/,
        );
    });

    it("authority settles before the draft is read and before the status write", () => {
        const raw = read(path.join(WEB, VALIDATE_ROUTE));
        const gate = raw.indexOf("requireBusinessProcessCapability");
        const draft = raw.indexOf("readDraft(");
        const write = raw.indexOf("recordDraftValidation(");
        expect(gate).toBeGreaterThan(-1);
        expect(draft).toBeGreaterThan(gate);
        expect(write).toBeGreaterThan(gate);
    });

    it("the write it is gated for still exists, and still sets the status publish requires", () => {
        /*
         * If `recordDraftValidation` stops writing `draft_status`, the reason this handler is gated
         * has evaporated and the decision must be re-made deliberately rather than by drift.
         */
        const service = codeOnly(
            read(path.join(WEB, "lib", "businessProcesses", "configuration", "businessProcessConfigurationService.ts")),
        );
        const fn = service.slice(service.indexOf("export async function recordDraftValidation"));
        expect(fn.slice(0, 1500)).toMatch(/\.from\(\s*["']business_process_drafts["']\s*\)/);
        expect(fn.slice(0, 1500)).toMatch(/\.update\(/);
        expect(fn.slice(0, 1500)).toMatch(/draft_status/);
        expect(fn.slice(0, 1500)).toMatch(/validated/);
    });

    it("validate and publish agree on the owner — one workflow, one key", () => {
        expect(INVENTORY.routes[VALIDATE_ROUTE]?.POST?.capability).toBe(CONFIGURE);
        expect(INVENTORY.routes[PUBLISH_ROUTE]?.POST?.capability).toBe(CONFIGURE);
    });

    it("validate is NOT recorded as read-like — the earlier reading is locked out", () => {
        const entry = INVENTORY.routes[VALIDATE_ROUTE]?.POST;
        expect(entry?.status, "a handler that flips draft_status is not reviewed-none").not.toBe("none");
        expect(entry?.status).toBe("declared");
    });
});

describe("RL-30 — configuration never becomes execution", () => {
    it("actions/execute carries no capability at all, least of all a Business Process one", () => {
        const entry = INVENTORY.routes["app/api/admin/actions/execute/route.ts"]?.POST;
        expect(entry?.status, "execution is conditional by domain — Model D").toBe("pending");
        expect(entry?.capability).toBeUndefined();
    });

    it("no Business Process key is enforced anywhere under actions/{execute,eligibility,preflight}", () => {
        const offenders: string[] = [];
        for (const r of ["execute", "eligibility", "preflight"]) {
            const p = path.join(API, "actions", r, "route.ts");
            if (!fs.existsSync(p)) continue;
            const body = codeOnly(read(p));
            for (const k of ["business_process.configure", "business_process.activate", "requireBusinessProcessCapability"]) {
                if (body.includes(k)) offenders.push(`${r} -> ${k}`);
            }
        }
        expect(
            offenders,
            `defining an Action must never become a licence to run one: ${offenders.join(", ")}`,
        ).toEqual([]);
    });

    it("the registered Action definitions did not borrow the design key", () => {
        const defs = path.join(WEB, "lib", "adminV2", "actions", "definitions");
        const offenders = fs
            .readdirSync(defs)
            .filter((f) => f.endsWith(".ts"))
            .filter((f) => codeOnly(read(path.join(defs, f))).includes("BUSINESS_PROCESS_CONFIGURE"));
        expect(offenders, `these borrowed the design key to execute: ${offenders.join(", ")}`).toEqual([]);
    });
});

describe("RL-30 — the Business Process mutation surface is completely classified", () => {
    /** Every mutation handler on the surface this slice bounds. */
    const surface = Object.keys(INVENTORY.routes).filter(
        (r) =>
            r.startsWith("app/api/admin/business-process/") ||
            r.startsWith("app/api/admin/action-definitions/") ||
            r.startsWith("app/api/admin/action-placements"),
    );

    it("non-vacuity: the detector sees the routes this lock is written about", () => {
        expect(surface, "the bounded surface must be found, or the case below measures nothing").toEqual(
            expect.arrayContaining([DEFINITION_ROUTE, VALIDATE_ROUTE, PUBLISH_ROUTE]),
        );
        expect(surface.length).toBeGreaterThanOrEqual(4);
    });

    it("fails when a new Business Process mutation appears without an owner", () => {
        const unowned: string[] = [];
        for (const r of surface) {
            for (const m of Object.keys(INVENTORY.routes[r])) {
                if (!MUTATIONS.includes(m)) continue;
                const e = INVENTORY.routes[r][m];
                if (e.status !== "declared") unowned.push(`${m} ${r} (${e.status})`);
            }
        }
        expect(
            unowned,
            `a Business Process mutation with no truthful owner: ${unowned.join(", ")}`,
        ).toEqual([]);
    });

    it("every mutation on this surface that Business Process owns names a BP key, not a neighbour", () => {
        const wrong: string[] = [];
        for (const r of [DEFINITION_ROUTE, VALIDATE_ROUTE, PUBLISH_ROUTE, "app/api/admin/action-placements/route.ts"]) {
            for (const m of Object.keys(INVENTORY.routes[r] ?? {})) {
                if (!MUTATIONS.includes(m)) continue;
                const cap = INVENTORY.routes[r][m].capability;
                if (cap !== CONFIGURE) wrong.push(`${m} ${r} -> ${cap}`);
            }
        }
        expect(wrong, `wrong owner: ${wrong.join(", ")}`).toEqual([]);
    });
});
