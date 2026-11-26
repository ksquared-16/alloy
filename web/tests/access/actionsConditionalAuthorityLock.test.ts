/**
 * RL-28 — ACTION EXECUTION HAS CONDITIONAL DOMAIN OWNERSHIP, AND ONE DOOR WAS OPEN.
 *
 * `actions/execute` dispatches ~97 registered actions across Enrollment, Attendance, Health,
 * Financials, Tours, CRM and Work. Each is authorized by its OWNING DOMAIN SERVICE, not by the
 * route: the route's own gate is portal admission, and the action supplies the authority
 * downstream. That is Model D, and it is deliberate — the action files say so, and say why the
 * check is not duplicated into the definition layer.
 *
 * ── THE DEFECT THIS LOCK CLOSES ──
 *
 * `updateStatusAction` was the ONE registered action reaching no capability. It changes an
 * opportunity's `status_key` — an enrollment outcome whose canonical door,
 * `enrollment-status-transition/execute`, has required `enrollment.decide` since Enrollment Record
 * Authority V1. So the capability was bypassable through the generic executor by anyone who could
 * reach the portal.
 *
 * ── WHY THE CHECK IS IN THE ACTION AND NOT THE WRITE HELPER ──
 *
 * `updateOpportunityStatusWithEvent` has four callers, and two of them —
 * `emitDomainLifecycleStatusChangedEvent` and `stageOutcomeRuleTargetExecutor` — are SYSTEM paths
 * executing configured rules with no operator to authorize. Gating the shared helper would demand
 * an operator capability from automation that has none. The action is the narrowest layer that is
 * always an operator decision. This lock asserts BOTH halves: the action gates, and the helper does
 * not.
 *
 * ── WHAT MUST NOT HAPPEN ──
 *
 * No umbrella key on `actions/execute`. Declaring it `enrollment.decide` would be false for ~96
 * other actions; declaring it `work.operate` would invent a runtime gate the product does not have.
 * The inventory keeps it pending under ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT, and this lock fails
 * if anyone "tidies" that away.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api", "admin");
const DEFS = path.join(WEB, "lib", "adminV2", "actions", "definitions");
const INVENTORY = JSON.parse(
    fs.readFileSync(path.join(WEB, "scripts", "routeCapabilities.declared.json"), "utf8"),
) as {
    routes: Record<string, Record<string, { status: string; capability?: string }>>;
    ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT?: { entries?: { route: string; method: string }[] };
};

const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
const read = (p: string) => fs.readFileSync(p, "utf8");

const STATUS_ACTION = path.join(DEFS, "updateStatusAction.ts");
const WRITE_HELPER = path.join(WEB, "lib", "opportunities", "updateOpportunityStatusWithEvent.ts");

describe("RL-28 — the status Action enforces the enrollment decision", () => {
    it("updateStatusAction resolves grants and requires enrollment.decide", () => {
        const src = codeOnly(read(STATUS_ACTION));
        expect(src).toMatch(/resolveActorPermissionGrants\s*\(\s*supabase\s*,\s*ctx\.orgId\s*,\s*ctx\.userId\s*\)/);
        expect(src).toMatch(/permissionKeys\?\.includes\(\s*ENROLLMENT_DECIDE\s*\)/);
    });

    it("a FAILED grant read denies — the optional chain is the fail-closed shape", () => {
        // `grants.permissionKeys?.includes(...)` is undefined when the read returned null, so the
        // negation refuses. Writing `(grants.permissionKeys ?? []).includes(...)` would read the
        // same but turn an infrastructure failure into an empty-but-valid grant set.
        const src = codeOnly(read(STATUS_ACTION));
        expect(src).not.toMatch(/permissionKeys\s*\?\?\s*\[\]/);
    });

    it("authority settles BEFORE the transition is validated and before the write", () => {
        const src = read(STATUS_ACTION);
        const exec = src.slice(src.indexOf("async execute"));
        const gate = exec.indexOf("resolveActorPermissionGrants");
        const validate = exec.indexOf("validateOpportunityStatusTransitionForAction");
        const write = exec.indexOf("updateOpportunityStatusWithEvent({");
        expect(gate).toBeGreaterThan(-1);
        expect(validate).toBeGreaterThan(gate);
        expect(write).toBeGreaterThan(gate);
    });

    it("no neighbouring authority substitutes inside the action", () => {
        const src = codeOnly(read(STATUS_ACTION));
        for (const foreign of [
            "ENROLLMENT_RECORD_MANAGE", "enrollment.record.manage",
            "work.operate", "WORK_OPERATE",
            "business_process.configure", "BUSINESS_PROCESS_CONFIGURE",
            "settings.manage",
        ]) {
            expect(src, `${foreign} must not substitute for the decision`).not.toContain(foreign);
        }
        expect(src, "no role title may decide this").not.toMatch(/ctx\.role|roleKeys|requireAdmin/);
    });
});

describe("RL-28 — the SYSTEM write path stays ungated", () => {
    it("the shared write helper demands no operator capability", () => {
        /*
         * If this starts requiring a capability, `emitDomainLifecycleStatusChangedEvent` and
         * `stageOutcomeRuleTargetExecutor` — configured automation with no operator — begin failing.
         * The authority belongs one layer up, in the action.
         */
        const src = codeOnly(read(WRITE_HELPER));
        expect(src).not.toMatch(/permissionKeys|resolveActorPermissionGrants|enrollment\.decide/);
    });

    it("the system callers still exist and still use the helper", () => {
        for (const rel of [
            "lib/lifecycle/emitDomainLifecycleStatusChangedEvent.ts",
            "lib/lifecycle/stageOutcomeRuleTargetExecutor.ts",
        ]) {
            const p = path.join(WEB, rel);
            expect(fs.existsSync(p), `${rel} vanished — re-census before assuming the placement still holds`).toBe(true);
            expect(codeOnly(read(p))).toContain("updateOpportunityStatusWithEvent");
        }
    });
});

describe("RL-28 — Model D is preserved: no umbrella on actions/execute", () => {
    it("actions/execute is not declared with any capability", () => {
        const entry = INVENTORY.routes["app/api/admin/actions/execute/route.ts"]?.POST;
        expect(entry?.status, "one key would be false for ~96 other actions").toBe("pending");
        expect(entry?.capability).toBeUndefined();
    });

    it("the conditional-owner debt is recorded, not quietly dropped", () => {
        const debt = INVENTORY.ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT?.entries ?? [];
        const row = debt.find(
            (e) => e.route === "app/api/admin/actions/execute/route.ts" && e.method === "POST",
        );
        expect(row, "actions/execute must be carried as explicit debt").toBeTruthy();
    });

    it("no actions.execute capability is invented anywhere", () => {
        const offenders: string[] = [];
        const walk = (dir: string, exts: string[]) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs, exts);
                else if (exts.some((x) => e.name.endsWith(x))) {
                    const src = e.name.endsWith(".sql") ? read(abs) : codeOnly(read(abs));
                    for (const k of ["actions.execute", "action.execute", "actions.run"]) {
                        if (src.includes(`'${k}'`) || src.includes(`"${k}"`)) {
                            offenders.push(`${path.relative(WEB, abs)} -> ${k}`);
                        }
                    }
                }
            }
        };
        walk(path.join(WEB, "app"), [".ts", ".tsx"]);
        walk(path.join(WEB, "lib"), [".ts", ".tsx"]);
        walk(path.join(WEB, "..", "supabase", "migrations"), [".sql"]);
        expect(offenders, `Action execution is conditional by domain: ${offenders.join(", ")}`).toEqual([]);
    });

    it("unrelated Action classes did NOT inherit the enrollment decision", () => {
        const offenders: string[] = [];
        for (const f of fs.readdirSync(DEFS)) {
            if (!f.endsWith(".ts") || f === "updateStatusAction.ts") continue;
            if (codeOnly(read(path.join(DEFS, f))).includes("ENROLLMENT_DECIDE")) offenders.push(f);
        }
        expect(
            offenders,
            `only the status action decides enrollment; these borrowed it: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});

describe("RL-28 — eligibility and preflight stay read-like", () => {
    it.each([["eligibility"], ["preflight"]])("%s persists nothing and is not capability-gated", (r) => {
        const body = codeOnly(read(path.join(API, "actions", r, "route.ts")));
        expect(body).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
        expect(body, "a harmless preview must not be gated for inventory symmetry").not.toMatch(
            /requireEnrollmentCapability|requireBusinessProcessCapability|requireWorkCapability/,
        );
        // Still tenant-pinned.
        expect(body).toMatch(/ctx\.orgId/);
    });
});

describe("RL-28 — required_permissions stays inert", () => {
    it("the action runtime still never reads the column", () => {
        /*
         * `action_definitions.required_permissions` exists and decides nothing. If a second
         * permission interpreter appears here, two systems will disagree about who may execute.
         * Recorded as schema debt; not activated.
         */
        const offenders: string[] = [];
        for (const dir of [
            path.join(WEB, "lib", "admin", "actions"),
            path.join(WEB, "lib", "adminV2", "actions"),
            path.join(API, "actions"),
        ]) {
            const walk = (d: string) => {
                if (!fs.existsSync(d)) return;
                for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                    const abs = path.join(d, e.name);
                    if (e.isDirectory()) walk(abs);
                    else if (e.name.endsWith(".ts") && codeOnly(read(abs)).includes("required_permissions")) {
                        offenders.push(path.relative(WEB, abs));
                    }
                }
            };
            walk(dir);
        }
        expect(
            offenders,
            `the column is inert by decision; a second interpreter would fork authority: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});

describe("RL-28 — the classification is complete", () => {
    it("fails when a registered action writes opportunity status without reaching the decision", () => {
        const offenders: string[] = [];
        for (const f of fs.readdirSync(DEFS)) {
            if (!f.endsWith(".ts")) continue;
            const src = codeOnly(read(path.join(DEFS, f)));
            if (!src.includes("updateOpportunityStatusWithEvent")) continue;
            if (!src.includes("ENROLLMENT_DECIDE")) offenders.push(f);
        }
        expect(
            offenders,
            `these change enrollment status through an Action without the decision: ${offenders.join(", ")}`,
        ).toEqual([]);
    });

    it("non-vacuity: the detector sees the action it is written about", () => {
        const writers = fs
            .readdirSync(DEFS)
            .filter((f) => f.endsWith(".ts") && codeOnly(read(path.join(DEFS, f))).includes("updateOpportunityStatusWithEvent"));
        expect(writers, "the status action must be found, or the case above measures nothing").toContain(
            "updateStatusAction.ts",
        );
    });
});
