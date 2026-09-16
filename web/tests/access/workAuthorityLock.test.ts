/**
 * RL-21 — DEFINING THE WORK IS NOT DOING IT.
 *
 * Five mutations ran the organization's operational work with no functional authority: four were
 * reachable through PORTAL ADMISSION ALONE and one asked the `admin` role title. Completing a
 * family's stage work, closing a case, recording a participant decision and firing an automation
 * were all decided by who could reach the portal.
 *
 * `work.configure` defines what work EXISTS; `work.operate` performs work inside a process already
 * running. Neither implies the other, and ops is seeded only the second.
 *
 * ── THE TWO KEYS THAT MUST NEVER EXIST ──
 *
 * `work.assign` and `work.manage`. Assignment stays PER PRODUCT SURFACE under the promoted
 * Assignments ruling, and a single define-and-do key would rebuild the collapse this split exists
 * to prevent. Both are asserted against by name, in source and in the catalog migration.
 *
 * ── AND THE ONE THAT MADE THIS SLICE CONDITIONAL ──
 *
 * `workflows/[id]/run` drives a cross-domain engine. It may hold `work.operate` ONLY because the
 * workflow's actions are authored under `ops.workflows.write` and the operator supplies just the
 * triggering event — pinned to their own organization. Before that pin, the runtime read
 * caller-supplied `payload.org_id` into vendor recipient resolution and hydrated `payload.job.id`
 * with an id-only query. The pin is therefore part of the authority claim, not incidental hardening,
 * and this lock fails if it is removed.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api", "admin");
const INVENTORY = JSON.parse(
    fs.readFileSync(path.join(WEB, "scripts", "routeCapabilities.declared.json"), "utf8"),
) as { routes: Record<string, Record<string, { status: string; capability?: string }>> };

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
    ["agent/v0/queue-definition/route.ts", "POST"],
    // Found by this lock's completeness case, not by the census: a whole work_units CRUD surface
    // the brief's five named candidates did not mention.
    ["work-units/route.ts", "POST"],
    ["work-units/[id]/route.ts", "PATCH"],
    ["work-units/[id]/route.ts", "DELETE"],
];
const OPERATE: [string, string][] = [
    ["lifecycle-builder/complete-stage-work/route.ts", "POST"],
    ["lifecycle-builder/family-close/route.ts", "POST"],
    ["lifecycle-builder/participant-decisions/route.ts", "POST"],
    ["workflows/[id]/run/route.ts", "POST"],
];
const ALL = [...CONFIGURE, ...OPERATE];
const read = (rel: string) => fs.readFileSync(path.join(API, rel), "utf8");
const RUN_ROUTE = "workflows/[id]/run/route.ts";

describe("RL-21 — every bounded Work mutation is owned", () => {
    it("finds the surface it asserts over, so this lock cannot pass by measuring nothing", () => {
        expect(CONFIGURE.length).toBe(4);
        expect(OPERATE.length).toBe(4);
        for (const [rel] of ALL) expect(fs.existsSync(path.join(API, rel))).toBe(true);
    });

    it.each(CONFIGURE)("%s %s requires work.configure at its own call site", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).toMatch(/requireWorkCapability\s*\(\s*access\s*,\s*WORK_CONFIGURE\s*\)/);
        expect(body).toMatch(/if \(capDenied\) return capDenied;/);
        expect(body).not.toContain("WORK_OPERATE");
    });

    it.each(OPERATE)("%s %s requires work.operate at its own call site", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).toMatch(/requireWorkCapability\s*\(\s*access\s*,\s*WORK_OPERATE\s*\)/);
        expect(body).toMatch(/if \(capDenied\) return capDenied;/);
        expect(body).not.toContain("WORK_CONFIGURE");
    });

    it.each(ALL)("%s %s has no portal fallback, role title or flag in its authority path", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).not.toMatch(/requireAdminOrOps\s*\(/);
        expect(body).not.toMatch(/requireAdmin\s*\(/);
        expect(body).not.toMatch(/ctx\.role\s*[!=]==|auth\.role\s*[!=]==|roleKeys/);
        expect(body).not.toMatch(/process\.env\.[A-Z_]+/);
    });

    it.each(ALL)("%s %s substitutes no neighbouring authority", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        for (const foreign of [
            "ops.workflows.write", "OPS_WORKFLOWS_WRITE",
            "business_process.configure", "BUSINESS_PROCESS_CONFIGURE",
            "business_process.activate", "BUSINESS_PROCESS_ACTIVATE",
            "ai.enrichment.use", "AI_ENRICHMENT_USE_PERMISSION_KEY",
        ]) {
            expect(body, `${method} ${rel} must not borrow ${foreign}`).not.toContain(foreign);
        }
    });

    it.each(ALL)("%s %s is declared with the owner it enforces", (rel, method) => {
        const entry = INVENTORY.routes[`app/api/admin/${rel}`]?.[method];
        const expected = CONFIGURE.some(([r, m]) => r === rel && m === method) ? "work.configure" : "work.operate";
        expect(entry?.status).toBe("declared");
        expect(entry?.capability).toBe(expected);
    });
});

describe("RL-21 — the forbidden keys never appear", () => {
    it("neither work.assign nor work.manage exists anywhere in source", () => {
        const offenders: string[] = [];
        const walk = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs);
                else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
                    const src = codeOnly(fs.readFileSync(abs, "utf8"));
                    if (/["']work\.(assign|manage)["']/.test(src)) offenders.push(path.relative(WEB, abs));
                }
            }
        };
        walk(path.join(WEB, "app", "api"));
        walk(path.join(WEB, "lib", "access"));
        expect(
            offenders,
            `assignment stays per product surface and define-and-do stays split: ${offenders.join(", ")}`,
        ).toEqual([]);
    });

    it("the helper defines exactly the two approved keys", () => {
        const src = codeOnly(fs.readFileSync(path.join(WEB, "lib", "access", "workAuthority.ts"), "utf8"));
        const keys = [...src.matchAll(/=\s*"([a-z_]+\.[a-z_.]+)" as const/g)].map((m) => m[1]).sort();
        expect(keys).toEqual(["work.configure", "work.operate"]);
        expect(src).not.toMatch(/ctx\.role|roleKeys|process\.env/);
    });

    it("the migration seeds the asymmetry and forbids the two keys by name", () => {
        const mig = fs.readFileSync(
            path.join(WEB, "..", "supabase", "migrations", "20260916030000_work_authority.sql"),
            "utf8",
        );
        expect(mig).toContain("'work.configure'");
        expect(mig).toContain("'work.operate'");
        // Ops must be seeded operate only; the guard says so out loud.
        expect(mig).toContain("ops must NOT receive work.configure");
        expect(mig).toContain("work.assign / work.manage must not exist");
        expect(mig).toMatch(/role_key = 'ops'/);
    });
});

describe("RL-21 — running an automation is not a cross-domain write key", () => {
    it("the run route pins the event payload to the caller's own organization", () => {
        /*
         * This is a condition of the authority claim. Without the pin the runtime resolves message
         * recipients from a caller-supplied org id, and `work.operate` would reach another tenant's
         * vendors — a super-capability, which the model forbids.
         */
        const body = codeOnly(handlerBody(read(RUN_ROUTE), "POST")!);
        expect(body).toMatch(/org_id:\s*ctx\.orgId/);
        expect(body).toMatch(/assertRowOrg\(\s*supabase\s*,\s*"jobs"/);
        expect(body).toMatch(/assertRowOrg\(\s*supabase\s*,\s*"schedules"/);
        // ...and the raw payload must not be what executes.
        expect(body).not.toMatch(/executeWorkflowRun\(\s*supabase\s*,\s*workflowId\s*,\s*eventPayload\s*\)/);
    });

    it("workflow DEFINITION authority stays separate from running one", () => {
        // The configuration routes keep ops.workflows.write; the run route must not have taken it,
        // and must not have handed its own key back to the definition routes.
        const def = codeOnly(read("workflows/route.ts"));
        // The definition routes gate through the Workflow helper, which names its own key.
        expect(def).toContain("requireWorkflowConfigurationCapability");
        expect(def).not.toContain("WORK_OPERATE");
    });
});

describe("RL-21 — the classification is complete", () => {
    it("fails when a new work_units or operational_tasks mutation appears unclassified", () => {
        const known = new Set(ALL.map(([r, m]) => `${r}|${m}`));
        const offenders: string[] = [];
        const walk = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs);
                else if (e.name === "route.ts") {
                    const raw = fs.readFileSync(abs, "utf8");
                    const src = codeOnly(raw);
                    const touchesWork = /from\("(work_units|operational_tasks)"\)/.test(src);
                    if (!touchesWork) continue;
                    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
                        if (!new RegExp(`export async function ${m}\\b`).test(raw)) continue;
                        const rel = path.relative(API, abs).split(path.sep).join("/");
                        if (known.has(`${rel}|${m}`)) continue;
                        const decl = INVENTORY.routes[`app/api/admin/${rel}`]?.[m];
                        // Declared under another product owner, or explicitly reviewed, is fine.
                        // Declared under any owner, reviewed as `none`, or carrying a recorded
                        // debt note all count as classified. Only silence is a failure.
                        if (decl?.status === "declared" || decl?.status === "none") continue;
                        if ((decl as { note?: string } | undefined)?.note) continue;
                        offenders.push(`${m} ${rel}`);
                    }
                }
            }
        };
        walk(API);
        expect(
            offenders,
            `these mutate work_units or operational_tasks and are unowned: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});
