import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    resolveAdminAccessDimensionsForOrgMember,
    type DepartmentScopeMode,
    type SiteScopeMode,
} from "@/lib/admin/resolveAdminAccessCore";

function normalizeDeptScope(raw: unknown): DepartmentScopeMode | null {
    const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (s === "all" || s === "") return "all";
    if (s === "restricted") return "restricted";
    return null;
}

function normalizeSiteScope(raw: unknown): SiteScopeMode | null {
    const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (s === "all" || s === "") return "all";
    if (s === "restricted") return "restricted";
    return null;
}

function uniqStrings(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    const out: string[] = [];
    for (const x of ids) {
        if (typeof x !== "string") continue;
        const t = x.trim();
        if (t) out.push(t);
    }
    return [...new Set(out)];
}

/** GET: stored scope + effective dimensions for one org member (admin only). */
export async function GET(_request: NextRequest, context: { params: Promise<{ userId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await context.params;
    if (!userId?.trim()) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const effective = await resolveAdminAccessDimensionsForOrgMember(supabase, userId.trim(), ctx.orgId);
    if (!effective) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const department_ids = effective.departmentScope === "restricted" ? effective.allowedDepartmentIds ?? [] : [];
    const site_location_ids = effective.siteScope === "restricted" ? effective.allowedSiteLocationIds ?? [] : [];

    return NextResponse.json({
        user_id: userId.trim(),
        org_id: ctx.orgId,
        effective,
        department_ids,
        site_location_ids,
    });
}

/**
 * PATCH: replace department/site scope + allow lists for `(userId, org)`.
 * Requires full payload; restricted scopes must include non-empty allow lists (deny-by-default safe UX).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await context.params;
    const uid = typeof userId === "string" ? userId.trim() : "";
    if (!uid) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const department_scope = normalizeDeptScope(body.department_scope);
    const site_scope = normalizeSiteScope(body.site_scope);
    if (department_scope == null || site_scope == null) {
        return NextResponse.json({ error: "department_scope and site_scope must be all or restricted" }, { status: 400 });
    }

    const department_ids = uniqStrings(body.department_ids);
    const site_location_ids = uniqStrings(body.site_location_ids);

    if (department_scope === "restricted" && department_ids.length === 0) {
        return NextResponse.json(
            { error: "restricted department_scope requires at least one department_id (empty allow-list denied)" },
            { status: 400 }
        );
    }
    if (site_scope === "restricted" && site_location_ids.length === 0) {
        return NextResponse.json(
            { error: "restricted site_scope requires at least one site location_id (empty allow-list denied)" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();

    const { data: membership, error: memErr } = await supabase.from("user_roles").select("user_id").eq("user_id", uid).eq("org_id", ctx.orgId).limit(1);
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
    if (!membership?.length) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (department_scope === "restricted") {
        const { data: deptRows, error: dErr } = await supabase.from("departments").select("id").eq("org_id", ctx.orgId).in("id", department_ids);
        if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
        if ((deptRows ?? []).length !== department_ids.length) {
            return NextResponse.json({ error: "One or more department_ids are invalid for this org" }, { status: 400 });
        }
    }

    if (site_scope === "restricted") {
        const { data: locRows, error: lErr } = await supabase
            .from("locations")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("location_type", "site")
            .in("id", site_location_ids);
        if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
        if ((locRows ?? []).length !== site_location_ids.length) {
            return NextResponse.json(
                {
                    error:
                        "One or more site_location_ids are invalid — each must be a location in this org with location_type = site",
                },
                { status: 400 }
            );
        }
    }

    const { error: upErr } = await supabase.from("user_access_profiles").upsert(
        {
            user_id: uid,
            org_id: ctx.orgId,
            department_scope,
            site_scope,
        },
        { onConflict: "user_id,org_id" }
    );
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { error: delDeptErr } = await supabase.from("user_department_access").delete().eq("user_id", uid).eq("org_id", ctx.orgId);
    if (delDeptErr) return NextResponse.json({ error: delDeptErr.message }, { status: 500 });

    const { error: delSiteErr } = await supabase.from("user_site_access").delete().eq("user_id", uid).eq("org_id", ctx.orgId);
    if (delSiteErr) return NextResponse.json({ error: delSiteErr.message }, { status: 500 });

    if (department_scope === "restricted") {
        const { error: insDeptErr } = await supabase
            .from("user_department_access")
            .insert(department_ids.map((department_id) => ({ user_id: uid, org_id: ctx.orgId, department_id })));
        if (insDeptErr) return NextResponse.json({ error: insDeptErr.message }, { status: 500 });
    }

    if (site_scope === "restricted") {
        const { error: insSiteErr } = await supabase
            .from("user_site_access")
            .insert(site_location_ids.map((location_id) => ({ user_id: uid, org_id: ctx.orgId, location_id })));
        if (insSiteErr) return NextResponse.json({ error: insSiteErr.message }, { status: 500 });
    }

    const effective = await resolveAdminAccessDimensionsForOrgMember(supabase, uid, ctx.orgId);
    return NextResponse.json({
        ok: true,
        effective,
        department_ids: effective?.departmentScope === "restricted" ? effective.allowedDepartmentIds ?? [] : [],
        site_location_ids: effective?.siteScope === "restricted" ? effective.allowedSiteLocationIds ?? [] : [],
    });
}
