/**
 * RL-22 — AI RESIDUAL AUTHORITY V1.
 *
 * AI + Agent V2 promoted the doctrine this file holds in place:
 *
 *   `ai.enrichment.use`  authorizes AI COMPUTATION AND PROPOSAL, and nothing else.
 *   Applying AI output   answers to the DOMAIN that owns the object being changed.
 *
 * AI is not a superuser. There is deliberately no `agent.suggestion.apply`: a single key spanning
 * "the model suggested it" and "the record now says it" would let AI authority stand in for every
 * domain it can write to.
 *
 * WHAT THIS SLICE FOUND. `task-assist/propose` reached `createTaskAssistProposal` through the Trust
 * seam, which requires the key. `task-assist/proposals` POST reached the SAME function and the same
 * `task_assist_proposals` insert behind `requireAdminOrOps()` — portal ADMISSION, not authority.
 * Approve and reject moved that row's lifecycle on the same weak terms. Two doors to one durable
 * state, one strictly weaker, means the stronger decided nothing. These assertions exist so that
 * hole cannot reopen by anyone adding a fourth door.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api");
const read = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

/** Mutations that CREATE OR DECIDE an AI proposal — compute/propose authority. */
const AI_PROPOSAL_MUTATIONS = [
    "app/api/admin/ai/task-assist/proposals/route.ts",
    "app/api/admin/ai/task-assist/proposals/[id]/approve/route.ts",
    "app/api/admin/ai/task-assist/proposals/[id]/reject/route.ts",
] as const;

/** Mutations that APPLY AI output. Each must answer to the DOMAIN it changes, never to AI. */
const DOMAIN_OWNED_APPLY: ReadonlyArray<readonly [string, string]> = [
    ["app/api/admin/agent/v0/queue-definition/route.ts", "work.configure"],
    ["app/api/admin/agent/v1/record-overview-layout/route.ts", "layouts.manage"],
    ["app/api/admin/agent/v2/field-visibility/route.ts", "fields.manage"],
    ["app/api/admin/ai/workflow-assist/apply/route.ts", "ops.workflows.write"],
    ["app/api/admin/ai/task-assist/apply/route.ts", "communications.send"],
    ["app/api/admin/config-layout-assist/proposals/[id]/apply/route.ts", "config_assist.apply"],
];

/**
 * The ONE role title this program deliberately kept inside the AI surface. It is documented in the
 * handler as that route's own admin-only rule and it NARROWS the capability rather than replacing it
 * — an admin without the key is still refused by the Trust seam beneath it. Listed here so it stays
 * a decision rather than becoming a precedent: anything else growing a role title fails below.
 */
const EXPLAINED_ROLE_TITLE = "app/api/admin/ai/workflow-assist/propose/route.ts";

const declared = JSON.parse(read("scripts/routeCapabilities.declared.json")) as {
    routes: Record<string, Record<string, { status: string; capability?: string }>>;
};

function handlerBody(src: string, method: string): string {
    const m = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`).exec(src);
    if (!m) return "";
    let i = src.indexOf("(", m.index + m[0].length - 1);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")") { depth--; if (depth === 0) { i = j; break; } }
    }
    const b = src.indexOf("{", i);
    depth = 0;
    for (let j = b; j < src.length; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(b, j + 1); }
    }
    return src.slice(b);
}

/** Comments are not code. A gate described in prose is not a gate. */
const executable = (t: string) =>
    t.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");

const ROLE_TITLE = /requireAdmin\s*\(|(?:ctx|auth)\.role\s*[!=]==\s*["'`](?:admin|ops)["'`]/;

describe("RL-22 — AI proposes, domains apply", () => {
    describe("compute and propose answer to ai.enrichment.use", () => {
        for (const route of AI_PROPOSAL_MUTATIONS) {
            it(`${route.replace("app/api/admin/ai/", "")} requires the key AND returns its refusal`, () => {
                const body = executable(handlerBody(read(route), "POST"));
                expect(body, "the handler must be found").not.toBe("");
                // The call itself, not merely the import — an import satisfies a naive substring test.
                expect(body).toMatch(/requireAiEnrichmentUse\s*\(\s*access\s*\)/);
                // ...and the verdict must be RETURNED. A computed-but-ignored gate refuses nobody.
                expect(body).toMatch(/if\s*\(\s*aiDenied\s*\)\s*return\s+aiDenied\s*;/);
            });

            it(`${route.replace("app/api/admin/ai/", "")} is not gated on a role title`, () => {
                expect(ROLE_TITLE.test(executable(handlerBody(read(route), "POST")))).toBe(false);
            });

            it(`${route.replace("app/api/admin/ai/", "")} gates BEFORE it reaches the database`, () => {
                const body = executable(handlerBody(read(route), "POST"));
                const gate = body.indexOf("requireAiEnrichmentUse");
                const db = body.indexOf("createAdminClient");
                expect(gate, "gate present").toBeGreaterThan(-1);
                if (db > -1) expect(gate, "a refused caller must cost no database work").toBeLessThan(db);
            });

            it(`${route.replace("app/api/admin/ai/", "")} is declared as ai.enrichment.use`, () => {
                expect(declared.routes[route]?.POST?.capability).toBe("ai.enrichment.use");
            });
        }
    });

    describe("applying AI output stays with the domain that owns the object", () => {
        for (const [route, capability] of DOMAIN_OWNED_APPLY) {
            it(`${route.replace("app/api/admin/", "")} → ${capability}, not AI`, () => {
                const entry = declared.routes[route];
                const method = entry?.POST ? "POST" : Object.keys(entry ?? {})[0];
                expect(entry?.[method]?.capability, `${route} must answer to its domain`).toBe(capability);
                expect(entry?.[method]?.capability).not.toBe("ai.enrichment.use");
            });
        }

        it("no capability named agent.suggestion.apply exists anywhere in the tree", () => {
            const hits: string[] = [];
            const walk = (dir: string) => {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    const p = path.join(dir, e.name);
                    if (e.isDirectory()) walk(p);
                    else if (/\.(ts|tsx|sql|json)$/.test(e.name) && fs.readFileSync(p, "utf8").includes("agent.suggestion.apply")) {
                        // Prose may explain why it does not exist; executable code may not create it.
                        const body = executable(fs.readFileSync(p, "utf8"));
                        if (body.includes("agent.suggestion.apply")) hits.push(path.relative(WEB, p));
                    }
                }
            };
            walk(path.join(WEB, "lib"));
            walk(API);
            expect(hits).toEqual([]);
        });
    });

    describe("the gate itself decides on authority alone", () => {
        it("requireAiEnrichmentUse consults the grant, never a role or an environment flag", () => {
            const src = read("lib/ai/aiEnrichmentPermissions.ts");
            const fn = src.slice(src.indexOf("export function requireAiEnrichmentUse"));
            const body = executable(fn.slice(0, fn.indexOf("\n}") + 2));
            expect(body).toContain("permissionKeys.includes(AI_ENRICHMENT_USE_PERMISSION_KEY)");
            expect(body).not.toMatch(/process\.env/);
            expect(ROLE_TITLE.test(body)).toBe(false);
            expect(body).not.toMatch(/roleKeys/);
        });

        it("the Trust seam names the key it enforces, pinned to the canonical constant", () => {
            const src = read("lib/ai/resolveTrustAuthorization.ts");
            expect(src).toContain('TRUST_SEAM_ENFORCED_PERMISSION_KEY: typeof AI_ENRICHMENT_USE_PERMISSION_KEY = "ai.enrichment.use"');
        });
    });

    describe("the census stays honest as the tree grows", () => {
        /**
         * NON-VACUITY AND COMPLETENESS IN ONE. Every AI mutation handler must be classified: declared
         * with a capability, or pending for a recorded reason. A NEW ungated AI mutation added later
         * lands in neither list and fails here — which is the only way this lock keeps meaning after
         * the people who wrote it have moved on.
         */
        const KNOWN_PENDING: Record<string, string> = {
            "app/api/admin/config-layout-assist/proposals/[id]/state/route.ts":
                "conditional owner — config_assist.review OR config_assist.apply by target state; the one-key schema cannot express it (ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT)",
        };

        it("every AI mutation handler is declared, or pending for a recorded reason", () => {
            const aiRoutes = Object.keys(declared.routes).filter((r) =>
                /\/(ai|agent)\/|task-assist|workflow-assist|assist|enrich/.test(r),
            );
            expect(aiRoutes.length, "non-vacuity: the AI surface must be found").toBeGreaterThan(15);

            const unclassified: string[] = [];
            for (const route of aiRoutes) {
                for (const [method, info] of Object.entries(declared.routes[route])) {
                    if (["GET", "HEAD", "OPTIONS"].includes(method)) continue;
                    if (info.status === "declared" || info.status === "none") continue;
                    if (KNOWN_PENDING[route]) continue;
                    unclassified.push(`${route}:${method}`);
                }
            }
            expect(unclassified, "a new AI mutation must be classified before it ships").toEqual([]);
        });

        it("the one kept role title is the only one, and it is the documented one", () => {
            const offenders: string[] = [];
            const aiRoutes = Object.keys(declared.routes).filter((r) =>
                /\/(ai|agent)\/|task-assist|workflow-assist/.test(r),
            );
            for (const route of aiRoutes) {
                if (route === EXPLAINED_ROLE_TITLE) continue;
                const src = read(route);
                for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
                    const body = executable(handlerBody(src, method));
                    if (body && ROLE_TITLE.test(body)) offenders.push(`${route}:${method}`);
                }
            }
            expect(offenders).toEqual([]);
        });

        it("the explained role title still carries the capability beneath it", () => {
            const body = executable(handlerBody(read(EXPLAINED_ROLE_TITLE), "POST"));
            expect(ROLE_TITLE.test(body), "it is a role title").toBe(true);
            expect(body, "and the capability seam still runs").toMatch(/resolveTrustAccessAuthorization/);
            expect(declared.routes[EXPLAINED_ROLE_TITLE]?.POST?.capability).toBe("ai.enrichment.use");
        });
    });
});
