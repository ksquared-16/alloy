/**
 * RL-16 — AI IS NOT A SUPERUSER, AND AGENT APPLY FOLLOWS THE DOMAIN MUTATION.
 *
 * Two separate powers, locked apart. USING AI (compute, propose) is owned by
 * `ai.enrichment.use`. PERFORMING THE BUSINESS ACTION an Agent proposed is owned
 * by whoever owns the table it writes: `fields.manage`, `layouts.manage`,
 * `ops.workflows.write`. Neither implies the other.
 *
 * THE DEFECT THIS EXISTS TO PREVENT RETURNING. Both halves of this surface used
 * to resolve authority through a ROLE TITLE behind an ENVIRONMENT FLAG, and in
 * both the flag was set in tests and in no deployed configuration:
 *
 *   - `AI_ENRICHMENT_USE_PERMISSION_REQUIRED` unset meant `ai.enrichment.use`
 *     was not consulted at all and admin|ops were admitted by title, so the
 *     capability was decorative in every real environment.
 *   - `CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK` DEFAULTED ON, so holding the
 *     `admin` role key satisfied `fields.manage`, `layouts.manage`,
 *     `sections.manage` and `option_sets.manage` whether granted or not.
 *
 * An authorization model that changes with deployment configuration is not an
 * authorization model. Feature availability may vary; authority may not.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf8");

/*
 * THE PROHIBITION IS ON ENFORCEMENT, NOT ON EXPLANATION.
 *
 * These assertions ask what the code DOES. A comment recording which fallback
 * was removed, and why, is exactly what a future reader needs — and naming the
 * removed flag is the only way that comment can be understood. Asserting over
 * raw source would make the lock demand that the repair erase its own account
 * of itself, so comments are stripped before anything is asserted.
 */
const codeOnly = (rel: string) =>
    read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const AI_PERMISSIONS = "lib/ai/aiEnrichmentPermissions.ts";
const CONFIG_ASSIST_ACCESS = "lib/agent/configLayoutAssist/configurationProposalAccess.ts";
const APPLY_AUTHORITY = "lib/access/agentApplyAuthority.ts";

/** Each Agent/AI apply route and the single domain authority it must name. */
const APPLY_OWNERS: Record<string, string> = {
    "app/api/admin/agent/v2/field-visibility/route.ts": "FIELDS_MANAGE",
    "app/api/admin/agent/v1/record-overview-layout/route.ts": "LAYOUTS_MANAGE",
    "app/api/admin/ai/workflow-assist/apply/route.ts": "OPS_WORKFLOWS_WRITE",
};

describe("RL-16 — AI authority is the grant, in every environment", () => {
    it("admits an AI principal by capability alone, with no role title in the gate", () => {
        const src = codeOnly(AI_PERMISSIONS);
        const gate = src.slice(src.indexOf("export function resolveAiEnrichmentPortalAccess"));
        expect(gate).toContain("AI_ENRICHMENT_USE_PERMISSION_KEY");
        /*
         * THE FALLBACK, NOT ONE SPELLING OF IT.
         *
         * This first asserted `ctx.role !== "admin"` was absent, and a planted
         * defect restoring the fallback as `ctx.role === "admin"` passed —
         * a false green that would have shipped the lock believing it bound.
         * Any comparison of the role against a privileged title is refused, in
         * either direction, however written.
         */
        expect(gate).not.toMatch(/ctx\.role\s*[!=]==\s*["'`](admin|ops)["'`]/);
        expect(gate).not.toMatch(/["'`](admin|ops)["'`]\s*[!=]==\s*\w*ctx\.role/);
        expect(gate).not.toMatch(/\[\s*["'`]admin["'`]\s*,\s*["'`]ops["'`]\s*\]/);
        expect(gate).not.toMatch(/roleKeys/);
    });

    it("never consults an environment flag to decide AI authority", () => {
        const src = codeOnly(AI_PERMISSIONS);
        const gate = src.slice(src.indexOf("export function resolveAiEnrichmentPortalAccess"));
        // The flag survives as FEATURE availability for live provider invocation.
        // It must not appear inside the authorization decision.
        expect(gate).not.toContain("isOpenAiLiveInvocationFeatureEnabled");
        expect(gate).not.toContain("AI_ENRICHMENT_USE_PERMISSION_REQUIRED");
        expect(gate).not.toContain("truthyEnv");
    });

    it("keeps the live-provider feature flag as a narrowing term, never an admitting one", () => {
        const src = codeOnly(AI_PERMISSIONS);
        const live = src.slice(src.indexOf("export function computeOpenAiLiveInvocationPermitted"));
        const body = live.slice(0, live.indexOf("\n}"));
        // Feature AND capability. An `||` here would let the flag admit an
        // unauthorized principal, which is the fail-open being locked out.
        expect(body).toContain("&&");
        expect(body).not.toContain("||");
        expect(body).toContain("AI_ENRICHMENT_USE_PERMISSION_KEY");
    });
});

describe("RL-16 — Configuration/Layout Assist has no role-title fallback", () => {
    it("answers only from the granted permission keys", () => {
        const src = codeOnly(CONFIG_ASSIST_ACCESS);
        const fn = src.slice(src.indexOf("export function hasConfigLayoutAssistPermission"));
        const body = fn.slice(0, fn.indexOf("\n}"));
        expect(body).toContain("permissionKeys.includes");
        expect(body).not.toContain("roleKeys.includes");
    });

    it("no longer lets a deployment flag switch the authorization model", () => {
        const src = codeOnly(CONFIG_ASSIST_ACCESS);
        expect(src).not.toContain("CONFIG_LAYOUT_ASSIST_LEGACY_ROLE_FALLBACK");
        expect(src).not.toContain("legacyRoleFallbackEnabled");
    });
});

describe("RL-16 — Agent apply follows the domain mutation", () => {
    it.each(Object.entries(APPLY_OWNERS))(
        "%s is gated on its own domain authority",
        (route, owner) => {
            const src = codeOnly(route);
            expect(src).toContain("requireAgentApplyDomainAuthority");
            expect(src).toContain(owner);
            // The role title must be gone from the admission decision.
            expect(src).not.toMatch(/if \(ctx\.role !== "admin"\)/);
            expect(src).not.toMatch(/await requireAdmin\(\)/);
            expect(src).not.toMatch(/await requireAdminOrOps\(\)/);
        },
    );

    it("requires no AI authority to commit an already-generated proposal", () => {
        // Compound authority only where the route actually invokes a model.
        // These three do not: two refuse without a caller-supplied override, and
        // the third commits a proposal from the request body.
        for (const route of Object.keys(APPLY_OWNERS)) {
            const src = codeOnly(route);
            expect(src).not.toContain("AI_ENRICHMENT_USE_PERMISSION_KEY");
            expect(src).not.toContain("resolveAiEnrichmentPortalAccess");
        }
    });

    it("keeps the domain authority set closed — no generic agent apply key", () => {
        const src = codeOnly(APPLY_AUTHORITY);
        expect(src).not.toContain("agent.suggestion.apply");
        expect(src).not.toMatch(/"agent\.[a-z_.]*"/);
        expect(src).not.toMatch(/"work\.[a-z_.]*"/);
        const keys = [...src.matchAll(/=\s*"([a-z_]+\.[a-z_.]+)" as const/g)].map((m) => m[1]).sort();
        expect(keys).toEqual(["fields.manage", "layouts.manage", "ops.workflows.write"]);
    });

    it("does not invent a generic agent apply capability anywhere in the tree", () => {
        // A future key documented in `lib/ai/aiEnrichmentPermissions.ts` prose is
        // allowed; an ENFORCED one is not. Nothing may gate on it.
        const roots = ["app/api/admin", "lib/access", "lib/agent"];
        const offenders: string[] = [];
        const walk = (rel: string) => {
            const abs = path.join(WEB, rel);
            if (!fs.existsSync(abs)) return;
            for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
                const child = path.join(rel, e.name);
                if (e.isDirectory()) walk(child);
                else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
                    const src = codeOnly(child);
                    if (/permissionKeys[\s\S]{0,40}agent\.suggestion\.apply/.test(src)) offenders.push(child);
                }
            }
        };
        roots.forEach(walk);
        expect(offenders).toEqual([]);
    });
});

describe("RL-16 — the bounded surface is non-vacuous", () => {
    it("names apply routes that all exist", () => {
        expect(Object.keys(APPLY_OWNERS).length).toBe(3);
        for (const route of Object.keys(APPLY_OWNERS)) {
            expect(fs.existsSync(path.join(WEB, route))).toBe(true);
        }
    });

    it("keeps queue-definition as named Work debt rather than a false migration", () => {
        const route = "app/api/admin/agent/v0/queue-definition/route.ts";
        const src = codeOnly(route);
        // It writes `work_units`, and no truthful Work capability exists. It must
        // NOT have been quietly given one of the three domain authorities.
        expect(src).not.toContain("requireAgentApplyDomainAuthority");
        expect(src).not.toContain("fields.manage");
        expect(src).not.toContain("layouts.manage");
        expect(src).not.toContain("ops.workflows.write");
        expect(src).not.toContain("work.manage");
        expect(src).not.toContain("work.write");
    });
});
