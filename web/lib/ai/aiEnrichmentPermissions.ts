/**
 * Permission keys and helpers for AI enrichment routes (Phase 2.5 — Card 11.5–11.6).
 * No DB writes; keys must exist in `permission_keys` + grants before strict mode can pass for non-legacy users.
 * @see docs/sprints/archive/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import { NextResponse } from "next/server";

import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import type { AdminContextSuccess } from "@/lib/admin/getAdminContext";

/** Canonical capability key — seed via migration before orgs can grant it (FK on `role_permission_grants`). */
export const AI_ENRICHMENT_USE_PERMISSION_KEY = "ai.enrichment.use" as const;

/** Future: separate keys (documented only): `ai.provider.config.manage`, `ai.telemetry.review`, `agent.suggestion.apply` (Phase 3). */

function truthyEnv(name: string): boolean {
    const v = process.env[name]?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

/**
 * FEATURE AVAILABILITY ONLY. **Never** authority.
 *
 * This flag used to decide WHICH AUTHORIZATION MODEL applied: true required
 * {@link AI_ENRICHMENT_USE_PERMISSION_KEY}, and false — the default, and the
 * value in every deployed environment, since the flag is set in tests and
 * nowhere else — fell back to the portal admin-or-ops role title. So the
 * capability was decorative: granting it changed nothing and withholding it
 * changed nothing, while a custom role holding it was refused.
 *
 * That is the defect this module no longer has. Authorization is now the same
 * question in every environment ({@link resolveAiEnrichmentPortalAccess}), and
 * this flag decides only whether LIVE PROVIDER INVOCATION is switched on —
 * feature reachability, which may legitimately differ per deployment.
 *
 * FEATURE ENABLED? and IS THIS PRINCIPAL AUTHORIZED? are separate questions,
 * and no deployment configuration may answer the second.
 */
export function isOpenAiLiveInvocationFeatureEnabled(): boolean {
    return truthyEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED");
}

/**
 * Live OpenAI-compatible calls are allowed only under strict permission mode with an explicit
 * {@link AI_ENRICHMENT_USE_PERMISSION_KEY} grant (routes should still pass {@link resolveAiEnrichmentPortalAccess}).
 */
export function computeOpenAiLiveInvocationPermitted(access: AdminAccessContextSuccess): boolean {
    // Feature AND authority, in that order, and both are required. The flag can
    // only ever WITHHOLD live invocation; it can no longer admit a principal who
    // does not hold the key, and it can no longer substitute a role title for one.
    return isOpenAiLiveInvocationFeatureEnabled() && access.permissionKeys.includes(AI_ENRICHMENT_USE_PERMISSION_KEY);
}

export type AiEnrichmentRouteAccessFailure = {
    ok: false;
    status: 401 | 403;
    error: string;
    message?: string;
};

/**
 * Org-scoped portal access + optional strict permission grant.
 * Does **not** evaluate org `ai_policy` or env stub flags — do those in the route after loading metadata.
 * Legacy (strict off): portal **admin or ops** (`ctx.role` from {@link compatibilityPortalRole}). Strict: {@link AI_ENRICHMENT_USE_PERMISSION_KEY}.
 */
export function resolveAiEnrichmentPortalAccess(input: {
    ctx: AdminContextSuccess;
    access: AdminAccessContextSuccess;
}): { ok: true } | AiEnrichmentRouteAccessFailure {
    if (input.ctx.orgId !== input.access.orgId) {
        return {
            ok: false,
            status: 403,
            error: "ORG_CONTEXT_MISMATCH",
            message: "Admin and access contexts disagree on org_id.",
        };
    }

    /*
     * ONE AUTHORIZATION MODEL, IN EVERY ENVIRONMENT.
     *
     * No role title and no environment flag. The seeded default package is
     * explicit that this is deliberate — "org admin role receives
     * ai.enrichment.use only (conservative)" — so the role-title fallback that
     * used to stand here admitted ops to the AI surface in organizations whose
     * own package had never granted it. Measured on the deployed primary: admin
     * holds the key in 3 of 3 organizations, ops in 1 of 3. The fallback was
     * manufacturing authority for ops in the other two.
     *
     * Removing it narrows exactly those two, and that narrowing is the
     * correction: nobody loses authority they were granted, only reach they
     * were never given. The organization that did grant ops the key keeps it,
     * and a custom role holding the key now genuinely works.
     */
    if (!input.access.permissionKeys.includes(AI_ENRICHMENT_USE_PERMISSION_KEY)) {
        return {
            ok: false,
            status: 403,
            error: "AI_ENRICHMENT_FORBIDDEN",
            message: `Missing permission grant: ${AI_ENRICHMENT_USE_PERMISSION_KEY}.`,
        };
    }

    return { ok: true };
}

/**
 * AI PROPOSAL AUTHORITY — the gate for creating and deciding Task Assist proposals.
 *
 * `ai.enrichment.use` is this program's promoted authority for AI COMPUTATION AND PROPOSAL. AI is not
 * a superuser: this key never authorizes a domain mutation, which is why `task-assist/apply` answers
 * to `communications.send` and not to anything here.
 *
 * WHY THIS EXISTS. `task-assist/propose` reached `createTaskAssistProposal` through the Trust
 * authorization seam, which requires this key. `task-assist/proposals` POST reached the SAME
 * `createTaskAssistProposal` and the same `task_assist_proposals` insert behind `requireAdminOrOps()`
 * alone — portal admission, which is not an authority. Two doors to one durable state, one of them
 * strictly weaker, means the stronger one decided nothing: any portal-admitted operator could write
 * the row the seam reserved. Approve and reject moved the same row's lifecycle on the same terms.
 *
 * So this is not new vocabulary. It is the key the other door already required, applied to the doors
 * that skipped it.
 */
export function requireAiEnrichmentUse(access: AdminAccessContextSuccess): NextResponse | null {
    if (access.permissionKeys.includes(AI_ENRICHMENT_USE_PERMISSION_KEY)) return null;
    return NextResponse.json(
        { ok: false, error: "AI_ENRICHMENT_FORBIDDEN", required_permission: AI_ENRICHMENT_USE_PERMISSION_KEY },
        { status: 403 },
    );
}
