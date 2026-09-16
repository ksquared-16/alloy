/**
 * RL-18 — AUTHORING AUTOMATION IS NOT FIRING IT.
 *
 * Five Workflow configuration mutations were gated on `requireAdmin()`, which is a ROLE TITLE
 * (`auth.role !== "admin"`) and not an authority: it admitted an admin whose package withholds
 * `ops.workflows.write` and refused a custom Workflow Writer who holds it. They now ask for the key
 * the promoted AI + Agent V2 slice activated for the Workflow Assist apply path, which commits into
 * the same tables.
 *
 * THE LINE THIS LOCK EXISTS TO HOLD. `POST /api/admin/workflows/[id]/run` executes rather than
 * configures, and `executeWorkflowRun` is a cross-domain mutation engine — it writes `assignments`,
 * `contacts`, `vendors`, `schedules`, `messages`, `jobs` and the run tables. Handing it
 * `ops.workflows.write` would let whoever may AUTHOR automation reach six product domains through
 * one door that never asks their owners, which is `agent.suggestion.apply`'s shortcut shape wearing
 * a different name. It stays excluded and carries WORK_AUTHORITY_MODEL_DEBT.
 *
 * EFFECTIVE, NOT DECLARED. The Analytics slice proved a capability can sit in front of a stricter
 * role title and be decorative, so every assertion here reads the handler's own body with comments
 * stripped — an import, or a sentence explaining what was removed, must never satisfy a gate.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api", "admin");
const read = (rel: string) => fs.readFileSync(path.join(API, rel), "utf8");
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const INVENTORY = JSON.parse(
    fs.readFileSync(path.join(WEB, "scripts", "routeCapabilities.declared.json"), "utf8"),
) as { routes: Record<string, Record<string, { status: string; capability?: string; note?: string }>> };

/** One exported handler's body. The parameter list may contain `{`, so match parens first. */
function handlerBody(src: string, method: string): string {
    const m = new RegExp(`export async function ${method}\\s*\\(`).exec(src);
    if (!m) return "";
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

const CONFIG: [string, string][] = [
    ["workflows/route.ts", "POST"],
    ["workflows/[id]/route.ts", "PATCH"],
    ["workflows/[id]/route.ts", "DELETE"],
    ["workflows/[id]/actions/route.ts", "PUT"],
    ["workflows/[id]/conditions/route.ts", "PUT"],
];

const EXECUTION = "workflows/[id]/run/route.ts";
const AI_APPLY = "ai/workflow-assist/apply/route.ts";

describe("RL-18 — Workflow configuration is owned by ops.workflows.write", () => {
    it("finds the surface it asserts over, so this lock cannot pass by measuring nothing", () => {
        expect(CONFIG.length).toBe(5);
        for (const [rel] of CONFIG) expect(fs.existsSync(path.join(API, rel))).toBe(true);
        expect(fs.existsSync(path.join(API, EXECUTION))).toBe(true);
    });

    it.each(CONFIG)("%s %s calls the capability gate and returns its refusal", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method));
        expect(body).toMatch(/requireWorkflowConfigurationCapability\s*\(\s*access\s*\)/);
        expect(body).toMatch(/if \(capDenied\) return capDenied;/);
    });

    it.each(CONFIG)("%s %s has no role title, portal fallback or flag in its authority path", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method));
        expect(body).not.toMatch(/requireAdmin\s*\(/);
        expect(body).not.toMatch(/requireAdminOrOps\s*\(/);
        expect(body).not.toMatch(/auth\.role|ctx\.role\s*[!=]==|roleKeys|compatibilityPortalRole/);
        expect(body).not.toMatch(/process\.env\.[A-Z_]+/);
    });

    it("the shared helper decides on the grant alone", () => {
        const src = codeOnly(fs.readFileSync(path.join(WEB, "lib", "access", "workflowAuthority.ts"), "utf8"));
        expect(src).toContain('"ops.workflows.write"');
        expect(src).not.toMatch(/ctx\.role|roleKeys|process\.env/);
    });

    it.each(CONFIG)("%s %s is declared with the owner it enforces", (rel, method) => {
        const entry = INVENTORY.routes[`app/api/admin/${rel}`]?.[method];
        expect(entry?.status).toBe("declared");
        expect(entry?.capability).toBe("ops.workflows.write");
    });
});

describe("RL-18 — execution is excluded, and stays excluded", () => {
    it("the run route is never given Workflow configuration authority", () => {
        const src = codeOnly(read(EXECUTION));
        expect(src).not.toContain("requireWorkflowConfigurationCapability");
        expect(src).not.toContain("ops.workflows.write");
        // Nor an invented runtime key.
        expect(src).not.toContain("workflow.execute");
        expect(src).not.toContain("work.execute");
        expect(src).not.toContain("work.manage");
    });

    it("its debt is recorded where the burndown can see it", () => {
        const entry = INVENTORY.routes[`app/api/admin/${EXECUTION}`]?.POST;
        expect(entry?.status).toBe("pending");
        expect(entry?.note ?? "").toContain("WORK_AUTHORITY_MODEL_DEBT");
    });

    it("the engine really is cross-domain, which is why the exclusion is not pedantry", () => {
        const engine = fs.readFileSync(path.join(WEB, "lib", "workflowRun.ts"), "utf8");
        for (const table of ["assignments", "contacts", "vendors", "schedules", "messages", "jobs"]) {
            expect(engine, `${table} is part of the blast radius this exclusion protects`).toContain(
                `from("${table}")`,
            );
        }
    });
});

describe("RL-18 — promoted boundaries are preserved", () => {
    it("Workflow Assist APPLY keeps Workflow authority and needs no AI key", () => {
        const src = codeOnly(read(AI_APPLY));
        expect(src).toContain("OPS_WORKFLOWS_WRITE");
        expect(src).not.toContain("AI_ENRICHMENT_USE_PERMISSION_KEY");
        expect(src).not.toContain("resolveAiEnrichmentPortalAccess");
    });

    it("no Business Process authority leaks into Workflow configuration", () => {
        for (const [rel, method] of CONFIG) {
            const body = codeOnly(handlerBody(read(rel), method));
            expect(body).not.toContain("BUSINESS_PROCESS_CONFIGURE");
            expect(body).not.toContain("BUSINESS_PROCESS_ACTIVATE");
        }
    });

    it("invents no Workflow vocabulary", () => {
        const src = codeOnly(fs.readFileSync(path.join(WEB, "lib", "access", "workflowAuthority.ts"), "utf8"));
        expect(src).not.toContain("workflows.manage");
        expect(src).not.toContain("workflow.execute");
        const keys = [...src.matchAll(/=\s*"([a-z_]+\.[a-z_.]+)" as const/g)].map((m) => m[1]);
        expect(keys).toEqual(["ops.workflows.write"]);
    });
});

describe("RL-18 — the classification is complete", () => {
    it("fails when a new Workflow mutation appears without classification", () => {
        const roots = [path.join(API, "workflows"), path.join(API, "workflow-runs")];
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
        roots.forEach(walk);
        const known = new Set([...CONFIG.map(([r, m]) => `${r}|${m}`), `${EXECUTION}|POST`]);
        const unclassified = found.filter((f) => !known.has(f));
        expect(
            unclassified,
            `classify these Workflow mutations as ops.workflows.write, execution debt, or another owner: ${unclassified.join(", ")}`,
        ).toEqual([]);
    });
});
