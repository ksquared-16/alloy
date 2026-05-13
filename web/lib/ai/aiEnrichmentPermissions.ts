/**
 * Permission keys and helpers for AI enrichment routes (Phase 2.5 — Card 11.5–11.6).
 * No DB writes; keys must exist in `permission_keys` + grants before strict mode can pass for non-legacy users.
 * @see docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

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
 * When **true**, callers must have {@link AI_ENRICHMENT_USE_PERMISSION_KEY} in `permissionKeys`.
 * When **false** (default), legacy gate: compatibility portal **admin** role only (matches pre–2.5 stub route).
 * Set to **true** in production before live provider pilot once grants exist.
 */
export function isAiEnrichmentUsePermissionRequired(): boolean {
    return truthyEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED");
}

/**
 * Live OpenAI-compatible calls are allowed only under strict permission mode with an explicit
 * {@link AI_ENRICHMENT_USE_PERMISSION_KEY} grant (routes should still pass {@link resolveAiEnrichmentPortalAccess}).
 */
export function computeOpenAiLiveInvocationPermitted(access: AdminAccessContextSuccess): boolean {
    return isAiEnrichmentUsePermissionRequired() && access.permissionKeys.includes(AI_ENRICHMENT_USE_PERMISSION_KEY);
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

    if (isAiEnrichmentUsePermissionRequired()) {
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

    if (input.ctx.role !== "admin") {
        return {
            ok: false,
            status: 403,
            error: "FORBIDDEN",
            message:
                "AI stub enrichment requires portal admin role, or set AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true and grant ai.enrichment.use.",
        };
    }

    return { ok: true };
}
