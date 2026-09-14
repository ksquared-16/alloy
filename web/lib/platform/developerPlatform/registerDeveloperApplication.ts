/**
 * Registering a developer application — the typed caller, not a second writer.
 *
 * The invariants live in `public.register_developer_application`, the SECURITY
 * DEFINER function added by `20260913173000_developer_application_registration`.
 * This module exists so that callers get a name and a type instead of an
 * untyped `rpc()` with nine positional strings, and so there is exactly one
 * spelling of the parameter names in TypeScript. It deliberately does NOT
 * re-check what the function checks: a second copy of "ownership_mode must be
 * alloy_managed" in JavaScript is a copy that can drift, and the copy that is
 * wrong is always the one the reviewer trusts.
 *
 * WHY THERE IS NO ROUTE BEHIND THIS. An application is a global platform
 * identity, not tenant configuration — `listApprovedApplications` calls itself
 * "a chooser, not tenant CRUD", and the table carries no `org_id` and no RLS
 * policy. A tenant-facing create route would have to answer "whose application
 * is this?", and V1 has no model that can. Registration is therefore platform
 * administration, reached through the governed action
 * `platform.register_developer_application`, which executes on the trusted host
 * against a named database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** V1 registers global, platform-managed identities only. */
export const V1_OWNERSHIP_MODE = "alloy_managed" as const;

/**
 * Reserved, not supported. Both are valid schema vocabulary and neither can be
 * registered until Alloy has an explicit publisher/application ownership model:
 * the table has no owner column, and an installation — the only thing that binds
 * an application to an organization — cannot exist before the application does.
 */
export const RESERVED_OWNERSHIP_MODES = Object.freeze(["tenant_private", "partner_managed"] as const);

export type ApplicationEnvironment = "sandbox" | "production";
export type ApplicationDistribution = "private" | "listed";
export type ApplicationStatus = "active" | "disabled";

export type RegisterDeveloperApplicationInput = {
    /** Stable identity. Globally unique, and the duplicate key the retry contract turns on. */
    slug: string;
    name: string;
    publisher: string;
    environment?: ApplicationEnvironment;
    distributionMode?: ApplicationDistribution;
    status?: ApplicationStatus;
    /** Who asked — a governed action id, recorded in the audit row. */
    registeredBy?: string | null;
    metadata?: Record<string, unknown>;
};

export type RegisteredApplication = {
    id: string;
    slug: string;
    name: string;
    publisher: string;
    ownership_mode: string;
    distribution_mode: string;
    environment: string;
    status: string;
    created_at: string;
};

export type RegisterDeveloperApplicationResult =
    | { ok: true; duplicate: boolean; application: RegisteredApplication; auditId: string | null }
    | { ok: false; code: string; detail: string | null; existing?: RegisteredApplication };

/**
 * One call, one row, one audit record — or a named refusal.
 *
 * The Supabase client must hold the service role: the function is revoked from
 * `anon` and `authenticated` precisely so that a signed-in user cannot reach the
 * catalog the table's own RLS denies them.
 */
export async function registerDeveloperApplication(
    supabase: SupabaseClient,
    input: RegisterDeveloperApplicationInput,
): Promise<RegisterDeveloperApplicationResult> {
    const { data, error } = await supabase.rpc("register_developer_application", {
        p_slug: input.slug,
        p_name: input.name,
        p_publisher: input.publisher,
        p_ownership_mode: V1_OWNERSHIP_MODE,
        p_environment: input.environment ?? "sandbox",
        p_distribution_mode: input.distributionMode ?? "private",
        p_status: input.status ?? "active",
        p_registered_by: input.registeredBy ?? null,
        p_metadata: input.metadata ?? {},
    });

    // A transport failure is not a refusal. Collapsing them would let "the
    // database was unreachable" be read as "the platform declined", which is the
    // difference between retrying and reopening a product decision.
    if (error) return { ok: false, code: "registration_call_failed", detail: error.message };

    const result = (data ?? null) as Record<string, unknown> | null;
    if (!result || typeof result !== "object") {
        return { ok: false, code: "registration_result_missing", detail: "The registration function returned nothing." };
    }

    if (result.ok === true) {
        return {
            ok: true,
            duplicate: Boolean(result.duplicate),
            application: result.application as RegisteredApplication,
            auditId: (result.audit_id as string | null) ?? null,
        };
    }
    return {
        ok: false,
        code: String(result.code ?? "registration_refused"),
        detail: (result.detail as string | null) ?? null,
        ...(result.existing ? { existing: result.existing as RegisteredApplication } : {}),
    };
}
