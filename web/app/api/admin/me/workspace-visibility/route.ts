/**
 * Own-user, hide-only workspace visibility overrides (Access V3, S5).
 *
 * GET    → this principal's override, and whether a store exists.
 * PUT    → replace this principal's hidden workspace keys.
 * DELETE → reset to role defaults.
 *
 * Admission is the existing portal gate (`requireAdminOrgContextLight`) and nothing more: the value is
 * the caller's own presentation preference, it is addressed only by the principal the server resolved,
 * and it can only hide a workspace the caller's roles already show. It grants nothing, removes nothing
 * a route enforces, and there is no way to address another user or organization — a request that names
 * any principal other than the caller is refused (403).
 *
 * The override store is `workspace_visibility_overrides` (migration 20261222110000). Where that migration
 * is not applied, the store reports itself not provisioned: GET answers `store: "unavailable"` (role
 * defaults apply) and PUT / DELETE answer 503 with `saved: false` — the same as when no store existed.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import type { VisibilityPrincipal } from "@/lib/access/workspaceVisibility";
import {
    getWorkspaceVisibilityOverrideStore,
    WorkspaceVisibilityOverrideStoreNotProvisioned,
} from "@/lib/access/workspaceVisibilityOverrideStore";
import {
    namesOnlyPrincipal,
    overrideFromStored,
    overrideResponseBody,
    parseOverrideSaveInput,
} from "@/lib/access/workspaceVisibilityOverrides";

const NO_STORE = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200): NextResponse {
    return NextResponse.json(body, { status, headers: NO_STORE });
}

function principalMismatch(): NextResponse {
    return json({ error: "principal_mismatch", saved: false }, 403);
}

function unavailable(principal: VisibilityPrincipal, status: number, reason: "not_provisioned" | "read_failed"): NextResponse {
    return json(
        overrideResponseBody({
            principal,
            store: "unavailable",
            unavailableReason: reason,
            override: null,
            ...(status === 200 ? {} : { saved: false }),
        }),
        status,
    );
}

function queryNamesOnlyPrincipal(request: NextRequest, principal: VisibilityPrincipal): boolean {
    const q = request.nextUrl.searchParams;
    return namesOnlyPrincipal({ user_id: q.get("user_id"), org_id: q.get("org_id") }, principal);
}

export async function GET(request: NextRequest) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const principal = { userId: ctx.userId, orgId: ctx.orgId };
    if (!queryNamesOnlyPrincipal(request, principal)) return principalMismatch();

    const store = getWorkspaceVisibilityOverrideStore();
    if (store.kind === "absent") return unavailable(principal, 200, store.reason);
    try {
        const { override, ignoredKeys } = overrideFromStored(principal, await store.store.read(principal));
        return json(overrideResponseBody({ principal, store: "available", override, ignoredKeys }));
    } catch (e) {
        if (e instanceof WorkspaceVisibilityOverrideStoreNotProvisioned) return unavailable(principal, 200, "not_provisioned");
        console.error("[workspace-visibility] override read failed:", e);
        // Role defaults still apply; the caller is told the override is not known, not that it is empty.
        return unavailable(principal, 200, "read_failed");
    }
}

export async function PUT(request: NextRequest) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const principal = { userId: ctx.userId, orgId: ctx.orgId };
    if (!queryNamesOnlyPrincipal(request, principal)) return principalMismatch();

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({ error: "malformed_body", saved: false }, 400);
    }
    const input = parseOverrideSaveInput(body, principal);
    if (!input.ok) {
        if (input.error === "principal_mismatch") return principalMismatch();
        return json({ error: input.error, ...(input.keys ? { keys: input.keys } : {}), saved: false }, 400);
    }

    const store = getWorkspaceVisibilityOverrideStore();
    if (store.kind === "absent") return unavailable(principal, 503, store.reason);
    try {
        if (input.hiddenSurfaceKeys.length) await store.store.write(principal, input.hiddenSurfaceKeys);
        else await store.store.clear(principal);
    } catch (e) {
        if (e instanceof WorkspaceVisibilityOverrideStoreNotProvisioned) return unavailable(principal, 503, "not_provisioned");
        console.error("[workspace-visibility] override write failed:", e);
        return json({ error: "save_failed", saved: false }, 500);
    }
    const { override } = overrideFromStored(principal, { hiddenSurfaceKeys: input.hiddenSurfaceKeys });
    return json(overrideResponseBody({ principal, store: "available", override, saved: true }));
}

export async function DELETE(request: NextRequest) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const principal = { userId: ctx.userId, orgId: ctx.orgId };
    if (!queryNamesOnlyPrincipal(request, principal)) return principalMismatch();

    const store = getWorkspaceVisibilityOverrideStore();
    if (store.kind === "absent") return unavailable(principal, 503, store.reason);
    try {
        await store.store.clear(principal);
    } catch (e) {
        if (e instanceof WorkspaceVisibilityOverrideStoreNotProvisioned) return unavailable(principal, 503, "not_provisioned");
        console.error("[workspace-visibility] override reset failed:", e);
        return json({ error: "save_failed", saved: false }, 500);
    }
    return json(overrideResponseBody({ principal, store: "available", override: null, saved: true }));
}
