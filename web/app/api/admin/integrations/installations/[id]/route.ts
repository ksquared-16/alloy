/**
 * One Installation: read it, change its access, change its state.
 *
 * Every mutation runs inside `withAdministrativeAudit`, which persists the intent
 * BEFORE the effect and finalizes it afterwards. If the attempted audit cannot be
 * written the action does not happen — that invariant is not traded for UX.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireIntegrationsAccess } from "../../_guard";
import { withAdministrativeAudit } from "@/lib/platform/admin/administrativeAudit";
import { getInstallation, presentScopes } from "@/lib/platform/admin/integrationsService";
import { allPublicScopes } from "@/lib/platform/external/scopeCatalog";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireIntegrationsAccess("viewInstallation");
    if (!gate.ok) return gate.response;
    const { id } = await params;

    const found = await getInstallation(gate.ctx.supabase, gate.ctx.orgId, id);
    if (!found.ok) return NextResponse.json({ error: found.message }, { status: found.status });

    return NextResponse.json({
        installation: { ...found.installation, capabilities: presentScopes(found.installation.grantedScopes) },
    });
}

type PatchBody = {
    boundaryMode?: "org_wide" | "locations";
    locationIds?: string[];
    grantedScopes?: string[];
    state?: "active" | "suspended" | "revoked";
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let body: PatchBody;
    try { body = (await request.json()) as PatchBody; }
    catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

    // Which permission this needs depends on WHAT is being changed, so the
    // operation is chosen from the body rather than from the method.
    const changesState = typeof body.state === "string";
    const operation = changesState
        ? (body.state === "revoked" ? "disconnectInstallation" as const : "suspendInstallation" as const)
        : "editAccess" as const;

    const gate = await requireIntegrationsAccess(operation);
    if (!gate.ok) return gate.response;
    const { supabase, orgId, actorUserId } = gate.ctx;

    const owned = await getInstallation(supabase, orgId, id);
    if (!owned.ok) return NextResponse.json({ error: owned.message }, { status: owned.status });

    const update: Record<string, unknown> = {};
    if (body.boundaryMode) {
        update.boundary_mode = body.boundaryMode;
        // An org-wide grant carries no list. Leaving a stale one behind would make
        // a later narrowing silently reuse it.
        update.location_boundary = body.boundaryMode === "org_wide" ? [] : (body.locationIds ?? []);
    } else if (Array.isArray(body.locationIds)) {
        update.location_boundary = body.locationIds;
    }

    if (Array.isArray(body.grantedScopes)) {
        // Unknown scopes fail safe: a scope the catalog does not define is refused
        // rather than stored, because stored is the thing a future reader trusts.
        const known = new Set(allPublicScopes().map((d) => d.scope));
        const unknown = body.grantedScopes.filter((s) => !known.has(s));
        if (unknown.length > 0) {
            return NextResponse.json(
                { error: `Not offered by this version of Alloy: ${unknown.join(", ")}` },
                { status: 400 },
            );
        }
        update.granted_scopes = body.grantedScopes;
    }

    if (changesState) {
        const now = new Date().toISOString();
        if (body.state === "suspended") { update.status = "suspended"; update.suspended_at = now; update.revoked_at = null; }
        if (body.state === "revoked") { update.status = "revoked"; update.revoked_at = now; }
        // Reactivation clears the suspension rather than inventing a new state.
        if (body.state === "active") { update.status = "active"; update.suspended_at = null; }
    }

    if (Object.keys(update).length === 0) {
        return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const eventType = changesState
        ? (body.state === "revoked" ? "installation.revoked" as const : "installation.suspended" as const)
        : "installation.scopes_changed" as const;

    const outcome = await withAdministrativeAudit(
        supabase,
        {
            eventType,
            actorUserId,
            orgId,
            installationId: id,
            applicationId: owned.installation.applicationId,
            metadata: {
                ...(body.boundaryMode ? { boundary_mode: body.boundaryMode } : {}),
                ...(changesState ? { status: String(body.state) } : {}),
            },
        },
        async () => {
            const { error } = await supabase
                .from("app_installations")
                .update({ ...update, updated_at: new Date().toISOString() })
                .eq("id", id)
                .eq("org_id", orgId);
            return error ? { ok: false as const, reason: error.message } : { ok: true as const, value: true };
        },
    );

    if (!outcome.ok) {
        const status = outcome.code === "audit_unavailable" ? 503 : 500;
        return NextResponse.json({ error: outcome.message, code: outcome.code }, { status });
    }

    const refreshed = await getInstallation(supabase, orgId, id);
    return NextResponse.json({
        installation: refreshed.ok ? refreshed.installation : null,
        auditId: outcome.auditId,
    });
}
