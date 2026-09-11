/**
 * What the Organization → Integrations surface reads and changes.
 *
 * ── ONE SHAPE, DERIVED ONCE ──
 *
 * Every route here answers some part of the same operator question: what is
 * connected, what can it access, and is it working? So the shape is built in one
 * place rather than assembled per route — a list row and a detail page that
 * disagree about an installation's state are two truths, and the operator has no
 * way to tell which one to believe.
 *
 * Nothing here decides authorization. `authorizeIntegrationsAdmin` does that, per
 * route, before any of this runs. Nothing here derives health either:
 * `evaluateInstallationHealth` owns that, and this module only feeds it facts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { evaluateInstallationHealth, type HealthVerdict } from "@/lib/platform/admin/installationHealth";
import { presentScopes, type ScopePresentation } from "@/lib/platform/external/scopePresentation";

export type InstallationState = "active" | "suspended" | "revoked";

/** Runtime-backed only. A state the runtime cannot produce is not offered. */
export function installationStateOf(row: {
    status?: string | null;
    revoked_at?: string | null;
    suspended_at?: string | null;
}): InstallationState {
    if (row.revoked_at) return "revoked";
    if (row.suspended_at) return "suspended";
    const s = String(row.status ?? "").toLowerCase();
    if (s === "revoked" || s === "disconnected") return "revoked";
    if (s === "suspended") return "suspended";
    return "active";
}

export type CredentialSummary = {
    id: string;
    /** Never a hash, never a secret. */
    lastFour: string | null;
    createdAt: string | null;
    lastUsedAt: string | null;
    expiresAt: string | null;
    /** Set while a previous secret is still accepted. */
    rotationOverlapUntil: string | null;
    revokedAt: string | null;
    status: "active" | "rotating" | "revoked";
};

export type InstallationSummary = {
    id: string;
    applicationId: string;
    applicationName: string;
    applicationSlug: string;
    publisher: string | null;
    state: InstallationState;
    producerKey: string;
    boundaryMode: "org_wide" | "locations";
    locationCount: number;
    grantedScopes: string[];
    credential: CredentialSummary | null;
    health: HealthVerdict;
    lastActivityAt: string | null;
    recentRequests: number;
    recentFailures: number;
};

/*
 * Capability presentation is NOT defined here. `scopePresentation` already derives
 * it from the canonical catalog and marks an unrecognised scope `recognised:
 * false`, which is the fail-safe Part 7 asks for. A second table here would be a
 * duplicate definition that drifts.
 */
export { presentScopes };
export type { ScopePresentation };

const ACTIVITY_WINDOW_DAYS = 7;

function windowStart(now: Date): string {
    return new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000).toISOString();
}

/**
 * The installations an organization has, with everything the collection row needs.
 *
 * Reads are batched rather than per-row: a list of twenty installations must not
 * become sixty round trips, and an N+1 here is the difference between a page that
 * opens and one an operator stops using.
 */
export async function listInstallations(
    supabase: SupabaseClient,
    orgId: string,
    now: Date = new Date(),
): Promise<{ ok: true; installations: InstallationSummary[] } | { ok: false; message: string }> {
    const { data: rows, error } = await supabase
        .from("app_installations")
        .select("id, application_id, org_id, producer_key, granted_scopes, boundary_mode, location_boundary, status, suspended_at, revoked_at, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
    if (error) return { ok: false, message: error.message };

    const installs = (rows ?? []) as Array<Record<string, unknown>>;
    if (installs.length === 0) return { ok: true, installations: [] };

    const appIds = [...new Set(installs.map((r) => String(r.application_id)))];
    const instIds = installs.map((r) => String(r.id));

    const [apps, creds, activity] = await Promise.all([
        supabase.from("developer_applications").select("id, name, slug, publisher, status").in("id", appIds),
        // secret_hash and secret_hash_secondary are deliberately NOT selected.
        // A hash is not a secret, but it is also not something an operator surface
        // has any use for, and the cheapest way never to leak one is never to read it.
        supabase.from("app_credentials")
            .select("id, installation_id, secret_last_four, status, created_at, last_used_at, expires_at, secondary_expires_at, rotated_at, revoked_at")
            .in("installation_id", instIds),
        supabase.from("app_api_activity")
            .select("installation_id, occurred_at, status_code")
            .in("installation_id", instIds)
            .gte("occurred_at", windowStart(now)),
    ]);

    const appById = new Map((apps.data ?? []).map((a) => [String((a as { id: string }).id), a as Record<string, unknown>]));
    const credsByInstall = new Map<string, Array<Record<string, unknown>>>();
    for (const c of (creds.data ?? []) as Array<Record<string, unknown>>) {
        const k = String(c.installation_id);
        credsByInstall.set(k, [...(credsByInstall.get(k) ?? []), c]);
    }
    const actByInstall = new Map<string, Array<Record<string, unknown>>>();
    for (const a of (activity.data ?? []) as Array<Record<string, unknown>>) {
        const k = String(a.installation_id);
        actByInstall.set(k, [...(actByInstall.get(k) ?? []), a]);
    }

    const installations = installs.map((row) => {
        const id = String(row.id);
        const app = appById.get(String(row.application_id)) ?? {};
        const acts = actByInstall.get(id) ?? [];
        const failures = acts.filter((a) => Number(a.status_code ?? 0) >= 400).length;
        const lastActivityAt = acts.map((a) => String(a.occurred_at)).sort().at(-1) ?? null;
        // Health asks for the last SUCCESS, not the last request: an integration
        // failing every call is not healthy for having been busy.
        const lastSuccessAt = acts
            .filter((a) => Number(a.status_code ?? 0) < 400)
            .map((a) => String(a.occurred_at)).sort().at(-1) ?? null;

        const state = installationStateOf(row as never);
        const credential = pickCredential(credsByInstall.get(id) ?? []);

        return {
            id,
            applicationId: String(row.application_id),
            applicationName: String(app.name ?? app.slug ?? "Unknown application"),
            applicationSlug: String(app.slug ?? ""),
            publisher: (app.publisher as string | null) ?? null,
            state,
            producerKey: String(row.producer_key ?? ""),
            boundaryMode: String(row.boundary_mode) === "org_wide" ? "org_wide" as const : "locations" as const,
            locationCount: Array.isArray(row.location_boundary) ? (row.location_boundary as string[]).length : 0,
            grantedScopes: Array.isArray(row.granted_scopes) ? (row.granted_scopes as string[]) : [],
            credential,
            health: evaluateInstallationHealth({
                installationStatus: state,
                activeCredentialCount: (credsByInstall.get(id) ?? []).filter((c) => !c.revoked_at && String(c.status ?? "active") !== "revoked").length,
                nextCredentialExpiry: credential?.expiresAt ?? null,
                rotationOverlapUntil: credential?.rotationOverlapUntil ?? null,
                lastSuccessAt: lastSuccessAt,
                recentFailureCount: failures,
                recentSuccessCount: acts.length - failures,
                recentRateLimitCount: acts.filter((a) => Number(a.status_code ?? 0) === 429).length,
            }, now),
            lastActivityAt,
            recentRequests: acts.length,
            recentFailures: failures,
        } satisfies InstallationSummary;
    });

    return { ok: true, installations };
}

/**
 * The credential an operator means when they say "the credential".
 *
 * An installation can hold more than one during a rotation overlap, so this
 * prefers the live one and falls back to the most recent — never a revoked one
 * while an active one exists, which would report a working integration as broken.
 */
function pickCredential(rows: Array<Record<string, unknown>>): CredentialSummary | null {
    if (rows.length === 0) return null;
    const shaped = rows.map((c) => ({
        id: String(c.id),
        lastFour: (c.secret_last_four as string | null) ?? null,
        createdAt: (c.created_at as string | null) ?? null,
        lastUsedAt: (c.last_used_at as string | null) ?? null,
        expiresAt: (c.expires_at as string | null) ?? null,
        // A rotation is running while the PREVIOUS secret is still accepted, which
        // the runtime records as a secondary expiry — not as an expiry on this row.
        rotationOverlapUntil: (c.secondary_expires_at as string | null) ?? null,
        revokedAt: (c.revoked_at as string | null) ?? null,
        status: c.revoked_at
            ? "revoked" as const
            : (c.secondary_expires_at ? "rotating" as const : "active" as const),
    }));
    const live = shaped.filter((c) => c.status !== "revoked");
    const pool = live.length > 0 ? live : shaped;
    return pool.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0] ?? null;
}

/** One installation, in full. Same derivation as the row, so the two agree. */
export async function getInstallation(
    supabase: SupabaseClient,
    orgId: string,
    installationId: string,
    now: Date = new Date(),
): Promise<{ ok: true; installation: InstallationSummary } | { ok: false; status: 404 | 500; message: string }> {
    // Tenancy is part of the lookup, not a check afterwards: an installation in
    // another organization must be indistinguishable from one that does not exist.
    const listed = await listInstallations(supabase, orgId, now);
    if (!listed.ok) return { ok: false, status: 500, message: listed.message };
    const found = listed.installations.find((i) => i.id === installationId);
    return found
        ? { ok: true, installation: found }
        : { ok: false, status: 404, message: "That integration does not exist." };
}

export type ActivityEntry = {
    occurredAt: string;
    operation: string | null;
    method: string | null;
    route: string | null;
    statusCode: number | null;
    outcome: string | null;
    errorCode: string | null;
    latencyMs: number | null;
    requestId: string | null;
};

export type ActivityFilter = "all" | "success" | "failure";

/**
 * Recent API activity for one installation.
 *
 * The column list IS the safety boundary. `app_api_activity` was built in B.2 to
 * hold no header, no token, no body and no child identity, and this selects a
 * narrow set from it rather than `*` — so a column added later cannot silently
 * become an operator-visible field.
 */
export async function listActivity(
    supabase: SupabaseClient,
    orgId: string,
    installationId: string,
    opts: { filter?: ActivityFilter; limit?: number } = {},
): Promise<{ ok: true; entries: ActivityEntry[] } | { ok: false; message: string }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    let q = supabase
        .from("app_api_activity")
        .select("occurred_at, operation_id, method, route, status_code, outcome, error_code, latency_ms, request_id")
        .eq("org_id", orgId)
        .eq("installation_id", installationId)
        .order("occurred_at", { ascending: false })
        .limit(limit);

    if (opts.filter === "success") q = q.lt("status_code", 400);
    if (opts.filter === "failure") q = q.gte("status_code", 400);

    const { data, error } = await q;
    if (error) return { ok: false, message: error.message };

    return {
        ok: true,
        entries: (data ?? []).map((r) => {
            const row = r as Record<string, unknown>;
            return {
                occurredAt: String(row.occurred_at),
                operation: (row.operation_id as string | null) ?? null,
                method: (row.method as string | null) ?? null,
                route: (row.route as string | null) ?? null,
                statusCode: row.status_code == null ? null : Number(row.status_code),
                outcome: (row.outcome as string | null) ?? null,
                errorCode: (row.error_code as string | null) ?? null,
                latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
                requestId: (row.request_id as string | null) ?? null,
            } satisfies ActivityEntry;
        }),
    };
}

export type ApprovedApplication = {
    id: string;
    name: string;
    slug: string;
    publisher: string | null;
    status: string;
    alreadyInstalled: boolean;
};

/**
 * The applications an operator may connect.
 *
 * Applications are platform identities, not tenant configuration objects, so this
 * is a read for a chooser and nothing more — there is deliberately no tenant CRUD
 * behind it. `alreadyInstalled` exists because the schema allows one installation
 * per application per organization, and an operator should learn that from the
 * chooser rather than from a constraint violation.
 */
export async function listApprovedApplications(
    supabase: SupabaseClient,
    orgId: string,
): Promise<{ ok: true; applications: ApprovedApplication[] } | { ok: false; message: string }> {
    const [apps, installed] = await Promise.all([
        supabase.from("developer_applications")
            .select("id, name, slug, publisher, status")
            .eq("status", "active")
            .order("name", { ascending: true }),
        supabase.from("app_installations").select("application_id").eq("org_id", orgId),
    ]);
    if (apps.error) return { ok: false, message: apps.error.message };

    const have = new Set((installed.data ?? []).map((r) => String((r as { application_id: string }).application_id)));
    return {
        ok: true,
        applications: (apps.data ?? []).map((a) => {
            const row = a as Record<string, unknown>;
            return {
                id: String(row.id),
                name: String(row.name ?? row.slug),
                slug: String(row.slug ?? ""),
                publisher: (row.publisher as string | null) ?? null,
                status: String(row.status ?? "active"),
                alreadyInstalled: have.has(String(row.id)),
            } satisfies ApprovedApplication;
        }),
    };
}

/**
 * The sites an operator may grant, and nothing else.
 *
 * Deliberately reuses `list_external_locations` — the same function the public
 * API and the attendance authority adapter use — so the chooser cannot offer
 * something the boundary would not honour. It also means `location_type =
 * address` and customer or vendor premises are excluded in SQL rather than by the
 * client remembering to filter them, which is the only way that guarantee holds.
 */
export async function listGrantableLocations(
    supabase: SupabaseClient,
    orgId: string,
): Promise<{ ok: true; locations: Array<{ id: string; name: string | null; type: string; siteId: string | null; parentId: string | null }> } | { ok: false; message: string }> {
    const { data, error } = await supabase.rpc("list_external_locations", {
        p_org_id: orgId,
        p_boundary_mode: "org_wide",
        p_boundary: [],
        p_limit: 500,
        p_cursor_sort: null,
        p_cursor_id: null,
        p_types: null,
        p_parent_id: null,
        p_location_ids: null,
        p_updated_since: null,
    });
    if (error) return { ok: false, message: error.message };
    return {
        ok: true,
        locations: ((data ?? []) as unknown[]).map((r) => {
            const row = r as Record<string, unknown>;
            return {
                id: String(row.id),
                name: (row.label as string | null) ?? null,
                type: String(row.location_type),
                siteId: (row.site_id as string | null) ?? null,
                parentId: (row.parent_location_id as string | null) ?? null,
            };
        }),
    };
}
