/**
 * Organization → Integrations: the collection.
 *
 * Authorizes independently. Hiding the navigation entry is a courtesy; this is
 * the control, and a route that renders nothing without calling
 * `authorizeIntegrationsAdmin` is unprotected.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { authorizeIntegrationsAdmin } from "@/lib/platform/admin/integrationsAdminAuth";
import { listInstallations, presentScopes } from "@/lib/platform/admin/integrationsService";
import { withAdministrativeAudit } from "@/lib/platform/admin/administrativeAudit";
import { allPublicScopes } from "@/lib/platform/external/scopeCatalog";
import { requireIntegrationsAccess } from "../_guard";

export async function GET(_request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: ctx.status });

    const supabase = createAdminClient();
    const verdict = await authorizeIntegrationsAdmin(supabase, {
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        operation: "listInstallations",
    });
    if (!verdict.ok) {
        return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: verdict.status });
    }

    const result = await listInstallations(supabase, ctx.orgId);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });

    return NextResponse.json({
        installations: result.installations.map((i) => ({
            ...i,
            capabilities: presentScopes(i.grantedScopes),
        })),
    });
}

type CreateBody = {
    applicationId?: string;
    grantedScopes?: string[];
    boundaryMode?: "org_wide" | "locations";
    locationIds?: string[];
    producerKey?: string;
};

/**
 * Create an Installation.
 *
 * The whole point of Gate 2: connecting approved software must not require SQL.
 * Everything consequential happens inside the audit envelope, so an installation
 * that exists is an installation whose creation was recorded.
 */
export async function POST(request: NextRequest) {
    let body: CreateBody;
    try { body = (await request.json()) as CreateBody; }
    catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

    const gate = await requireIntegrationsAccess("createInstallation");
    if (!gate.ok) return gate.response;
    const { supabase, orgId, actorUserId } = gate.ctx;

    const applicationId = String(body.applicationId ?? "").trim();
    if (!applicationId) return NextResponse.json({ error: "Choose an application to connect." }, { status: 400 });

    const scopes = Array.isArray(body.grantedScopes) ? body.grantedScopes : [];
    const known = new Set(allPublicScopes().map((d) => d.scope));
    const unknown = scopes.filter((s) => !known.has(s));
    if (unknown.length > 0) {
        return NextResponse.json({ error: `Not offered by this version of Alloy: ${unknown.join(", ")}` }, { status: 400 });
    }

    const boundaryMode = body.boundaryMode === "org_wide" ? "org_wide" : "locations";
    const locationIds = boundaryMode === "org_wide" ? [] : (body.locationIds ?? []);

    const app = await supabase
        .from("developer_applications")
        .select("id, slug, status")
        .eq("id", applicationId)
        .maybeSingle();
    if (app.error || !app.data) return NextResponse.json({ error: "That application is not available." }, { status: 404 });
    if (String((app.data as { status: string }).status) !== "active") {
        return NextResponse.json({ error: "That application is not accepting new installations." }, { status: 409 });
    }

    /*
     * `producer_key` is durable provenance and is what reaches a canonical fact as
     * `source_key`. Derived from the application slug and the organization so it
     * is stable and readable, never random — a provenance identity nobody can
     * recognise is not provenance.
     */
    const producerKey = String(body.producerKey ?? `${(app.data as { slug: string }).slug}:${orgId}`).trim();

    const outcome = await withAdministrativeAudit(
        supabase,
        {
            eventType: "installation.created",
            actorUserId,
            orgId,
            applicationId,
            metadata: { boundary_mode: boundaryMode },
        },
        async () => {
            const { data, error } = await supabase
                .from("app_installations")
                .insert({
                    application_id: applicationId,
                    org_id: orgId,
                    granted_scopes: scopes,
                    boundary_mode: boundaryMode,
                    location_boundary: locationIds,
                    producer_key: producerKey,
                    status: "active",
                    installed_by: actorUserId,
                })
                .select("id")
                .maybeSingle();
            if (error || !data) {
                // One installation per application per organization is a schema
                // rule; an operator should read it as a sentence, not a constraint.
                const duplicate = /uq_app_installations_app_org|duplicate key/i.test(error?.message ?? "");
                return { ok: false as const, reason: duplicate ? "already_installed" : (error?.message ?? "insert_failed") };
            }
            return { ok: true as const, value: (data as { id: string }).id };
        },
    );

    if (!outcome.ok) {
        if (outcome.message.includes("already_installed")) {
            return NextResponse.json({ error: "That application is already connected to this organization." }, { status: 409 });
        }
        const status = outcome.code === "audit_unavailable" ? 503 : 500;
        return NextResponse.json({ error: outcome.message, code: outcome.code }, { status });
    }

    return NextResponse.json({ installationId: outcome.result, auditId: outcome.auditId }, { status: 201 });
}
