import "server-only";

/**
 * Persistence adapter for own-user, hide-only workspace visibility overrides (Access V3, S5).
 *
 * ── THE STORE ──
 *
 * `public.workspace_visibility_overrides` (migration 20261222110000): one row per principal, service-role
 * only. Reads select that principal's row; writes go through `set_/clear_workspace_visibility_override`,
 * which change the row and write its `mutation_events` audit row (domain `workspace_visibility`) in one
 * transaction, and write no history for a change that changes nothing. The service role cannot write
 * the table directly, so no save here can skip its audit.
 *
 * Until that migration is applied to the database this deployment talks to, the table and functions do
 * not exist. That is reported as {@link WorkspaceVisibilityOverrideStoreNotProvisioned}, which the route
 * answers exactly as before (`store: "unavailable"`, `not_provisioned`, `saved: false`) — never as a
 * failed read of a store that exists. There is no fallback store (no localStorage, no profile JSON).
 *
 * ── THE CONTRACT ──
 *
 * Every call is addressed by ONE principal (user + organization) that the route took from the server's
 * own auth context. This module is never handed a principal from the request, reads and writes only that
 * principal's row, and records that principal as the actor — the change is their own. It stores workspace
 * keys only — never a permission key.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import type { VisibilityPrincipal } from "@/lib/access/workspaceVisibility";

export type WorkspaceVisibilityOverrideStore = {
    /** This principal's stored keys, or `null` when none are stored. */
    read(principal: VisibilityPrincipal): Promise<{ hiddenSurfaceKeys: readonly string[] } | null>;
    /** Replace this principal's stored keys (already validated, canonical and non-empty). */
    write(principal: VisibilityPrincipal, hiddenSurfaceKeys: readonly string[]): Promise<void>;
    /** Remove this principal's override (back to role defaults). */
    clear(principal: VisibilityPrincipal): Promise<void>;
};

export type WorkspaceVisibilityOverrideStoreAvailability =
    | { kind: "absent"; reason: "not_provisioned" }
    | { kind: "available"; store: WorkspaceVisibilityOverrideStore };

export const WORKSPACE_VISIBILITY_OVERRIDE_TABLE = "workspace_visibility_overrides";
export const SET_WORKSPACE_VISIBILITY_OVERRIDE_RPC = "set_workspace_visibility_override";
export const CLEAR_WORKSPACE_VISIBILITY_OVERRIDE_RPC = "clear_workspace_visibility_override";

/** The store's table or functions do not exist in this database (migration not applied). */
export class WorkspaceVisibilityOverrideStoreNotProvisioned extends Error {
    constructor(detail: string) {
        super(`workspace visibility override store not provisioned: ${detail}`);
        this.name = "WorkspaceVisibilityOverrideStoreNotProvisioned";
    }
}

/** Postgres undefined_table / undefined_function, and PostgREST's schema-cache misses for each. */
const NOT_PROVISIONED_CODES = new Set(["42P01", "42883", "PGRST205", "PGRST202"]);

type DbError = { code?: string | null; message?: string | null } | null | undefined;

function raise(op: string, error: DbError): never {
    const code = error?.code ?? "";
    if (NOT_PROVISIONED_CODES.has(code)) throw new WorkspaceVisibilityOverrideStoreNotProvisioned(`${op} (${code})`);
    throw new Error(`workspace visibility override ${op} failed${code ? ` (${code})` : ""}: ${error?.message ?? "unknown error"}`);
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** The Supabase-backed store. `client` is injectable for tests; the route uses the service client. */
export function createSupabaseWorkspaceVisibilityOverrideStore(
    client: () => Pick<AdminClient, "from" | "rpc"> = createAdminClient,
): WorkspaceVisibilityOverrideStore {
    return {
        async read(principal) {
            const { data, error } = await client()
                .from(WORKSPACE_VISIBILITY_OVERRIDE_TABLE)
                .select("hidden_surface_keys")
                .eq("org_id", principal.orgId)
                .eq("user_id", principal.userId)
                .maybeSingle();
            if (error) raise("read", error);
            const keys = (data as { hidden_surface_keys?: unknown } | null)?.hidden_surface_keys;
            // Shape is checked again by the contract (`overrideFromStored`); an unusable value is "none".
            return Array.isArray(keys) ? { hiddenSurfaceKeys: keys as string[] } : null;
        },
        async write(principal, hiddenSurfaceKeys) {
            const { error } = await client().rpc(SET_WORKSPACE_VISIBILITY_OVERRIDE_RPC, {
                p_org_id: principal.orgId,
                p_user_id: principal.userId,
                p_hidden_surface_keys: [...hiddenSurfaceKeys],
                p_actor_user_id: principal.userId,
                p_origin: "operator",
            });
            if (error) raise("write", error);
        },
        async clear(principal) {
            const { error } = await client().rpc(CLEAR_WORKSPACE_VISIBILITY_OVERRIDE_RPC, {
                p_org_id: principal.orgId,
                p_user_id: principal.userId,
                p_actor_user_id: principal.userId,
                p_origin: "operator",
            });
            if (error) raise("clear", error);
        },
    };
}

/** The store the route uses. Whether it is provisioned in this database is learned on first call. */
export function getWorkspaceVisibilityOverrideStore(): WorkspaceVisibilityOverrideStoreAvailability {
    return { kind: "available", store: createSupabaseWorkspaceVisibilityOverrideStore() };
}
