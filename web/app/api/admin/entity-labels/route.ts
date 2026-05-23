import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getOrgConfigLocked } from "@/lib/admin/getOrgConfigLocked";
import { invalidateEntityLabelsOrgCache } from "@/lib/admin/entityLabelsOrgCache";
import { entityLabelsOrgCacheTag, resolveEntityLabelsForOrgCached } from "@/lib/admin/entityLabelsResolve";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";

/** GET: effective labels for org (industry defaults + overrides). Admin + ops can read. */
export async function GET() {
    const t0 = Date.now();
    const gate = await loadAdminRouteGate();
    const ctxMs = Date.now() - t0;
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const t1 = Date.now();
    const supabase = createAdminClient();
    const payload = await resolveEntityLabelsForOrgCached(supabase, gate.orgId);
    const resolveMs = Date.now() - t1;
    const totalMs = Date.now() - t0;
    if (totalMs > 200) {
        console.warn("[entity-labels-perf] GET /api/admin/entity-labels", {
            total_ms: totalMs,
            get_admin_context_ms: ctxMs,
            resolve_entity_labels_ms: resolveMs,
            org_id: gate.orgId,
            effective_count: payload.effective?.length ?? 0,
        });
    }

    return NextResponse.json(payload);
}

/** PUT: upsert or clear override for one entity_type. Admin only. Blocked when config is locked. */
export async function PUT(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const locked = await getOrgConfigLocked(ctx.orgId);
    if (locked) {
        return NextResponse.json(
            { error: "Configuration is locked. Unlock in Entity Labels / Industry settings to change labels." },
            { status: 403 }
        );
    }

    let body: { entity_type?: string; singular?: string; plural?: string } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const entity_type = typeof body.entity_type === "string" ? body.entity_type.trim() : "";
    if (!entity_type) {
        return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }

    const singular = typeof body.singular === "string" ? body.singular.trim() : "";
    const plural = typeof body.plural === "string" ? body.plural.trim() : "";
    const blank = !singular && !plural;

    const supabase = createAdminClient();

    if (blank) {
        const { error: delErr } = await supabase
            .from("entity_labels")
            .delete()
            .eq("org_id", ctx.orgId)
            .eq("entity_type", entity_type);
        if (delErr) {
            return NextResponse.json({ error: delErr.message }, { status: 500 });
        }
        invalidateEntityLabelsOrgCache(ctx.orgId);
        revalidateTag(entityLabelsOrgCacheTag(ctx.orgId), "max");
        return NextResponse.json({ ok: true });
    }

    const { error: upsertErr } = await supabase.from("entity_labels").upsert(
        {
            org_id: ctx.orgId,
            entity_type,
            singular: singular || null,
            plural: plural || null,
        },
        { onConflict: "org_id,entity_type" }
    );

    if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }
    invalidateEntityLabelsOrgCache(ctx.orgId);
    revalidateTag(entityLabelsOrgCacheTag(ctx.orgId), "max");
    return NextResponse.json({ ok: true });
}

/** DELETE: remove override for entity_type. Admin only. Blocked when config is locked. */
export async function DELETE(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const locked = await getOrgConfigLocked(ctx.orgId);
    if (locked) {
        return NextResponse.json(
            { error: "Configuration is locked. Unlock in Entity Labels / Industry settings to change labels." },
            { status: 403 }
        );
    }

    const entity_type = request.nextUrl.searchParams.get("entity_type")?.trim();
    if (!entity_type) {
        return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
        .from("entity_labels")
        .delete()
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entity_type);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    invalidateEntityLabelsOrgCache(ctx.orgId);
    revalidateTag(entityLabelsOrgCacheTag(ctx.orgId), "max");
    return NextResponse.json({ ok: true });
}
