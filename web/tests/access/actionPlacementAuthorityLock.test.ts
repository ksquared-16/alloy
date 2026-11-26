/**
 * RL-27 — AN ACTION PLACEMENT IS BUSINESS PROCESS CONFIGURATION, AND IT ALWAYS WAS.
 *
 * `action_placements` decides WHICH actions are available at a process stage: the row carries
 * `surface`, `slot`, `section_key`, `order_index`, `display_style`, `department_id` and
 * `work_unit_id`. It does not decide what an action DOES — that is `action_definitions`, which
 * holds `action_type`, `payload_schema` and `workflow_id`. The distinction is the whole reason this
 * family does not belong to Workflow.
 *
 * ── WHY NO CAPABILITY WAS INVENTED ──
 *
 * `business_process.configure` names "the actions matrix" in its own promoted contract, and
 * `lib/lifecycle/lifecycleActionsMatrix.ts` — the module behind that capability-gated PUT — writes
 * these very rows: it deactivates placements and inserts new ones. So Settings → Actions was a
 * SECOND DOOR to configuration Business Process already owned, decided by a different rule.
 *
 * The rule it used was `ctx.role !== "admin"`, which admitted an admin whose package withholds
 * `business_process.configure` and refused a custom Process Configurer who holds it. The capability
 * was decorative on one door and absent on the other. Converging them narrows nothing and invents
 * nothing; it makes two doors to one configuration agree.
 *
 * ── THE NEIGHBOURS THIS LOCK REFUSES, AND WHY EACH IS PLAUSIBLE ──
 *
 * `layouts.manage` / `sections.manage` — the noun is "placement" and the row carries `slot` and
 *   `section_key`, so it reads like layout. It is not: those keys are record-layout configuration,
 *   and nothing here places a FIELD on a record.
 * `ops.workflows.write` — placements reference actions that may carry a `workflow_id`. But that key
 *   decides what an automation is configured to do; positioning an already-defined action is not
 *   authoring one.
 * `settings.manage` — the surface lives under Settings. Living under Settings is not an owner;
 *   Programs earned that key by being published organization configuration, and this is a process's
 *   action availability.
 * `work.operate` / `work.configure` — a placement can name a `work_unit_id`. Deciding which actions
 *   a queue offers is designing the process, not doing its work or defining the queue.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api", "admin");
const INVENTORY = JSON.parse(
    fs.readFileSync(path.join(WEB, "scripts", "routeCapabilities.declared.json"), "utf8"),
) as { routes: Record<string, Record<string, { status: string; capability?: string; helper?: string }>> };

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

const OWNER = "business_process.configure";
/** Every Action Placement mutation. A fourth appearing unclassified fails the completeness case. */
const PLACEMENT_MUTATIONS: [string, string][] = [
    ["action-placements/route.ts", "POST"],
    ["action-placements/[id]/route.ts", "PATCH"],
    ["action-placements/[id]/route.ts", "DELETE"],
];
const read = (rel: string) => fs.readFileSync(path.join(API, rel), "utf8");

describe("RL-27 — the surface exists, so this lock cannot pass by measuring nothing", () => {
    it("finds all three handlers on disk", () => {
        expect(PLACEMENT_MUTATIONS.length).toBe(3);
        for (const [rel, m] of PLACEMENT_MUTATIONS) {
            expect(fs.existsSync(path.join(API, rel)), `${rel} missing`).toBe(true);
            expect(handlerBody(read(rel), m), `${m} ${rel} not exported`).toBeTruthy();
        }
    });
});

describe("RL-27 — every Action Placement mutation requires business_process.configure", () => {
    it.each(PLACEMENT_MUTATIONS)("%s %s gates on the owner at its own call site", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body).toMatch(
            /requireBusinessProcessCapability\s*\(\s*access\s*,\s*BUSINESS_PROCESS_CONFIGURE\s*\)/,
        );
        expect(body).toMatch(/if \(capDenied\) return capDenied;/);
        // ACTIVATE is a different power and must not creep in: designing which actions a stage
        // offers is not switching the tenant onto a configuration.
        expect(body).not.toContain("BUSINESS_PROCESS_ACTIVATE");
    });

    it.each(PLACEMENT_MUTATIONS)("%s %s has no role-title or portal fallback", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        expect(body, "ctx.role !== 'admin' is the rule this slice removed").not.toMatch(
            /ctx\.role\s*[!=]==|auth\.role\s*[!=]==|roleKeys/,
        );
        expect(body).not.toMatch(/requireAdminOrOps\s*\(/);
        expect(body).not.toMatch(/requireAdmin\s*\(/);
        expect(body).not.toMatch(/process\.env\.[A-Z_]+/);
    });

    it.each(PLACEMENT_MUTATIONS)("%s %s borrows no plausible-but-wrong neighbour", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        for (const foreign of [
            "layouts.manage", "LAYOUTS_MANAGE", "sections.manage", "SECTIONS_MANAGE",
            "ops.workflows.write", "OPS_WORKFLOWS_WRITE",
            "settings.manage", "SETTINGS_MANAGE",
            "configuration.vocabulary.manage",
            "work.operate", "WORK_OPERATE", "work.configure", "WORK_CONFIGURE",
        ]) {
            expect(body, `${method} ${rel} must not borrow ${foreign}`).not.toContain(foreign);
        }
    });

    it.each(PLACEMENT_MUTATIONS)("%s %s stays organization-contained", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method)!);
        // Every read and write in these handlers is pinned to the caller's own org.
        expect(body).toMatch(/ctx\.orgId/);
        expect(body, "the org must never be taken from the request body").not.toMatch(
            /body\.org_id|body\.orgId/,
        );
    });

    it.each(PLACEMENT_MUTATIONS)("%s %s is declared with the owner it enforces", (rel, method) => {
        const entry = INVENTORY.routes[`app/api/admin/${rel}`]?.[method];
        expect(entry?.status).toBe("declared");
        expect(entry?.capability).toBe(OWNER);
        expect(entry?.helper).toBe("requireBusinessProcessCapability");
    });
});

describe("RL-27 — placement is not definition", () => {
    it("the actions matrix still writes the same rows, which is why the owner is truthful", () => {
        /*
         * This is the evidence the whole slice rests on. If the matrix stopped writing
         * `action_placements`, the claim that Business Process already owns this configuration
         * would need re-proving rather than inheriting.
         */
        const src = codeOnly(
            fs.readFileSync(path.join(WEB, "lib", "lifecycle", "lifecycleActionsMatrix.ts"), "utf8"),
        );
        expect(src).toMatch(/from\("action_placements"\)/);
        expect(src, "the matrix must still author placements").toMatch(
            /from\("action_placements"\)[\s\S]{0,400}?\.(insert|update)\(/,
        );
    });

    it("no Action Placement capability was invented from the folder name", () => {
        const offenders: string[] = [];
        const walk = (dir: string, exts: string[]) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs, exts);
                else if (exts.some((x) => e.name.endsWith(x))) {
                    const src = e.name.endsWith(".sql")
                        ? fs.readFileSync(abs, "utf8")
                        : codeOnly(fs.readFileSync(abs, "utf8"));
                    for (const k of ["action_placements.manage", "action-placements.manage", "actions.place"]) {
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
        expect(
            offenders,
            `Business Process already owned this; a folder-named key would be a second owner: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});

describe("RL-27 — the classification is complete", () => {
    it("fails when a new action_placements mutation appears unclassified", () => {
        const known = new Set(PLACEMENT_MUTATIONS.map(([r, m]) => `${r}|${m}`));
        const offenders: string[] = [];
        const walk = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs);
                else if (e.name === "route.ts") {
                    const raw = fs.readFileSync(abs, "utf8");
                    const src = codeOnly(raw);
                    if (!/from\("action_placements"\)[\s\S]{0,300}?\.(insert|update|upsert|delete)\(/.test(src)) continue;
                    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
                        if (!new RegExp(`export async function ${m}\\b`).test(raw)) continue;
                        const rel = path.relative(API, abs).split(path.sep).join("/");
                        if (known.has(`${rel}|${m}`)) continue;
                        const decl = INVENTORY.routes[`app/api/admin/${rel}`]?.[m];
                        if (decl?.status === "declared" || decl?.status === "none") continue;
                        offenders.push(`${m} ${rel}`);
                    }
                }
            }
        };
        walk(API);
        expect(
            offenders,
            `these write action_placements and are unowned: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});
