/**
 * Own-user, hide-only workspace visibility overrides — the wire contract (Access V3, S5).
 *
 * Client-safe and pure. Shared by the own-user route (`/api/admin/me/workspace-visibility`), the client
 * loader and the controls, so the three cannot disagree about what a valid override is.
 *
 * ── WHAT AN OVERRIDE IS ──
 *
 * A list of workspace keys ONE principal (user + organization) has asked not to see. It is applied by
 * {@link resolveWorkspaceVisibility}, which only ever turns a role-shown workspace into a hidden one: an
 * override cannot show a workspace the principal's roles do not, and it carries no permission key, so
 * it cannot add, remove or feed any grant, route or command decision.
 *
 * ── WHAT IS OVERRIDABLE ──
 *
 * The workspaces whose sidebar entry reads {@link resolveWorkspaceVisibility}. Financials is excluded:
 * its rail item keeps the documented legacy fail-open module (`financialsSurfaceVisibility`), so an
 * override for it would be saved and then silently not honoured. It is refused rather than accepted.
 *
 * ── PRINCIPAL BINDING ──
 *
 * The route takes the principal from the server's own context, never from the request. A request that
 * names a user or organization at all must name exactly that principal, or it is refused — there is no
 * path here that reads or writes another person's override.
 */

import {
    WORKSPACE_SURFACE_KEYS,
    WORKSPACE_VISIBILITY_SURFACES,
    samePrincipal,
    type HideOnlyVisibilityOverride,
    type WorkspaceVisibility,
    type VisibilityPrincipal,
    type WorkspaceSurfaceKey,
} from "@/lib/access/workspaceVisibility";

export const OVERRIDABLE_WORKSPACE_SURFACE_KEYS: readonly WorkspaceSurfaceKey[] = Object.freeze(
    WORKSPACE_SURFACE_KEYS.filter((k) => k !== "financials"),
);

export const WORKSPACE_VISIBILITY_OVERRIDE_PATH = "/api/admin/me/workspace-visibility";

/** Why a save body was refused. Every one is a 400 except `principal_mismatch` (403). */
export type OverrideInputError =
    | "malformed_body"
    | "unexpected_field"
    | "malformed_keys"
    | "unknown_key"
    | "not_overridable"
    | "principal_mismatch";

export type OverrideInputResult =
    | { ok: true; hiddenSurfaceKeys: WorkspaceSurfaceKey[] }
    | { ok: false; error: OverrideInputError; keys?: string[] };

const SAVE_FIELDS = new Set(["hidden_surface_keys", "user_id", "org_id"]);

function trimmed(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

export function principalKey(p: VisibilityPrincipal): string {
    return `${p.orgId}\u0000${p.userId}`;
}

/** Same rule the resolver applies (`samePrincipal`), so the loader and resolver cannot disagree. */
export const sameVisibilityPrincipal = samePrincipal;

/**
 * A request that names a user or organization must name the caller. Absent fields are fine (the
 * principal is the server's); a present field that differs — or is not a string — is a refusal.
 */
export function namesOnlyPrincipal(
    named: { user_id?: unknown; org_id?: unknown },
    principal: VisibilityPrincipal,
): boolean {
    for (const [field, own] of [
        ["user_id", principal.userId],
        ["org_id", principal.orgId],
    ] as const) {
        const v = named[field];
        if (v === undefined || v === null) continue;
        if (typeof v !== "string" || v.trim() !== own) return false;
    }
    return true;
}

/** Canonical order (registry order), duplicates collapsed. */
function canonical(keys: Iterable<WorkspaceSurfaceKey>): WorkspaceSurfaceKey[] {
    const set = new Set(keys);
    return OVERRIDABLE_WORKSPACE_SURFACE_KEYS.filter((k) => set.has(k));
}

/** Strictly validate a list of keys a caller asked to hide. Unknown keys are refused, not dropped. */
export function parseHiddenSurfaceKeys(raw: unknown): OverrideInputResult {
    if (!Array.isArray(raw) || raw.length > WORKSPACE_SURFACE_KEYS.length * 4) return { ok: false, error: "malformed_keys" };
    const keys: string[] = [];
    for (const x of raw) {
        if (typeof x !== "string" || !x.trim()) return { ok: false, error: "malformed_keys" };
        keys.push(x.trim());
    }
    const unknown = keys.filter((k) => !(WORKSPACE_SURFACE_KEYS as readonly string[]).includes(k));
    if (unknown.length) return { ok: false, error: "unknown_key", keys: [...new Set(unknown)] };
    const notOverridable = keys.filter((k) => !(OVERRIDABLE_WORKSPACE_SURFACE_KEYS as readonly string[]).includes(k));
    if (notOverridable.length) return { ok: false, error: "not_overridable", keys: [...new Set(notOverridable)] };
    return { ok: true, hiddenSurfaceKeys: canonical(keys as WorkspaceSurfaceKey[]) };
}

/** Validate a save body for `principal` (the server's own). */
export function parseOverrideSaveInput(body: unknown, principal: VisibilityPrincipal): OverrideInputResult {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "malformed_body" };
    const record = body as Record<string, unknown>;
    const extra = Object.keys(record).filter((k) => !SAVE_FIELDS.has(k));
    if (extra.length) return { ok: false, error: "unexpected_field", keys: extra };
    if (!namesOnlyPrincipal(record, principal)) return { ok: false, error: "principal_mismatch" };
    return parseHiddenSurfaceKeys(record.hidden_surface_keys);
}

/**
 * A stored value read back for `principal`. Storage is trusted less than input: an unknown or no longer
 * overridable key is ignored (reported, never applied), so a key retired from the registry cannot
 * hide or break anything.
 */
export function overrideFromStored(
    principal: VisibilityPrincipal,
    stored: { hiddenSurfaceKeys?: unknown } | null | undefined,
): { override: HideOnlyVisibilityOverride | null; ignoredKeys: string[] } {
    if (!stored || !Array.isArray(stored.hiddenSurfaceKeys)) return { override: null, ignoredKeys: [] };
    const valid: WorkspaceSurfaceKey[] = [];
    const ignoredKeys: string[] = [];
    for (const x of stored.hiddenSurfaceKeys) {
        const k = trimmed(x);
        if ((OVERRIDABLE_WORKSPACE_SURFACE_KEYS as readonly string[]).includes(k)) valid.push(k as WorkspaceSurfaceKey);
        else ignoredKeys.push(typeof x === "string" ? x : String(x));
    }
    const hiddenSurfaceKeys = canonical(valid);
    return {
        override: hiddenSurfaceKeys.length ? { principal: { ...principal }, hiddenSurfaceKeys } : null,
        ignoredKeys,
    };
}

export type OverrideStoreAvailability = "available" | "unavailable";

/** The route's response body for GET / PUT / DELETE. */
export type WorkspaceVisibilityOverrideResponse = {
    user_id: string;
    org_id: string;
    store: OverrideStoreAvailability;
    /** Why the store is unavailable (`not_provisioned` until the held migration is approved). */
    unavailable_reason?: "not_provisioned" | "read_failed";
    hidden_surface_keys: WorkspaceSurfaceKey[];
    ignored_keys?: string[];
    /** PUT / DELETE only: whether the change was persisted. */
    saved?: boolean;
};

export function overrideResponseBody(input: {
    principal: VisibilityPrincipal;
    store: OverrideStoreAvailability;
    unavailableReason?: WorkspaceVisibilityOverrideResponse["unavailable_reason"];
    override: HideOnlyVisibilityOverride | null;
    ignoredKeys?: string[];
    saved?: boolean;
}): WorkspaceVisibilityOverrideResponse {
    return {
        user_id: input.principal.userId,
        org_id: input.principal.orgId,
        store: input.store,
        ...(input.unavailableReason ? { unavailable_reason: input.unavailableReason } : {}),
        hidden_surface_keys: input.override ? [...(input.override.hiddenSurfaceKeys as WorkspaceSurfaceKey[])] : [],
        ...(input.ignoredKeys?.length ? { ignored_keys: input.ignoredKeys } : {}),
        ...(input.saved !== undefined ? { saved: input.saved } : {}),
    };
}

export type ParsedOverrideResponse = {
    store: OverrideStoreAvailability;
    /** `read_failed`: a store exists but this read failed — not the same as no store. */
    unavailableReason: "not_provisioned" | "read_failed" | null;
    override: HideOnlyVisibilityOverride | null;
};

/**
 * Client side: accept a response only when it is well formed AND belongs to `expected`. A response for
 * another user or organization (a stale request that outlived a sign-in or org switch) is `null`.
 */
export function parseOverrideResponse(json: unknown, expected: VisibilityPrincipal): ParsedOverrideResponse | null {
    if (!json || typeof json !== "object") return null;
    const r = json as Record<string, unknown>;
    if (!sameVisibilityPrincipal({ userId: trimmed(r.user_id), orgId: trimmed(r.org_id) }, expected)) return null;
    if (r.store !== "available" && r.store !== "unavailable") return null;
    if (!Array.isArray(r.hidden_surface_keys)) return null;
    const { override } = overrideFromStored(expected, { hiddenSurfaceKeys: r.hidden_surface_keys });
    const unavailableReason =
        r.store === "available" ? null
        : r.unavailable_reason === "read_failed" ? "read_failed"
        : "not_provisioned";
    return { store: r.store, unavailableReason, override: r.store === "available" ? override : null };
}

export type OwnWorkspaceControlRow = {
    key: WorkspaceSurfaceKey;
    label: string;
    /** Only a workspace the caller's roles show can be hidden; nothing here can show one. */
    hideable: boolean;
    /** The draft hides it (meaningful only when `hideable`). */
    hidden: boolean;
    /** Why there is no control: the roles do not show it, or the grants are not known yet. */
    note: "not_in_roles" | "grants_unknown" | null;
};

/**
 * The own-user control rows: role defaults (computed WITHOUT any override) for the overridable
 * workspaces, with the draft's hidden keys applied to the hideable ones only.
 */
export function ownWorkspaceControlRows(
    roleDefaults: WorkspaceVisibility,
    draftHidden: readonly string[],
): OwnWorkspaceControlRow[] {
    return OVERRIDABLE_WORKSPACE_SURFACE_KEYS.map((key) => {
        const state = roleDefaults.surfaces[key]?.state;
        const hideable = state === "shown";
        return {
            key,
            label: WORKSPACE_VISIBILITY_SURFACES[key].label,
            hideable,
            hidden: hideable && draftHidden.includes(key),
            note: hideable ? null : state === "hidden_by_role_default" ? "not_in_roles" : "grants_unknown",
        };
    });
}

/** Toggle one hideable key in a draft; a non-hideable key leaves the draft unchanged. */
export function toggleDraftHidden(rows: readonly OwnWorkspaceControlRow[], draftHidden: readonly string[], key: WorkspaceSurfaceKey): WorkspaceSurfaceKey[] {
    const row = rows.find((r) => r.key === key);
    const set = new Set(draftHidden.filter((k): k is WorkspaceSurfaceKey => (OVERRIDABLE_WORKSPACE_SURFACE_KEYS as readonly string[]).includes(k)));
    if (row?.hideable) {
        if (set.has(key)) set.delete(key);
        else set.add(key);
    }
    return canonical(set);
}
