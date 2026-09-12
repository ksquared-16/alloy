import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { invalidateAdminShellContextCache } from "@/lib/adminV2/adminShellContextCache";
import { accessMutationAudit } from "@/lib/access/accessMutationAudit";
import { isSelfAuthorityMutation, selfAuthorityMutationResponse } from "@/lib/admin/selfAuthorityMutation";
import {
    resolveAdminAccessDimensionsForOrgMember,
    type AttendanceCaptureScopeMode,
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

/**
 * Attendance capture scope. Absent means "unchanged" rather than "site": this
 * field was writable by nothing for its whole life, so a caller that predates it
 * must not silently narrow a teacher who was set to `assigned` out of band.
 */
function normalizeCaptureScope(raw: unknown): AttendanceCaptureScopeMode | null | "unchanged" {
    if (raw === undefined || raw === null) return "unchanged";
    const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (s === "site") return "site";
    if (s === "assigned") return "assigned";
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

/** GET: stored scope + effective dimensions for one org member (settings users/roles managers only). */
export async function GET(_request: NextRequest, context: { params: Promise<{ userId: string }> }) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { userId } = await context.params;
    if (!userId?.trim()) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const effective = await resolveAdminAccessDimensionsForOrgMember(supabase, userId.trim(), access.orgId);
    if (!effective) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const department_ids = effective.departmentScope === "restricted" ? effective.allowedDepartmentIds ?? [] : [];
    const site_location_ids = effective.siteScope === "restricted" ? effective.allowedSiteLocationIds ?? [] : [];

    return NextResponse.json({
        user_id: userId.trim(),
        org_id: access.orgId,
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
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { userId } = await context.params;
    const uid = typeof userId === "string" ? userId.trim() : "";
    if (!uid) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // Self-elevation ban — widening your own department/site scope is an authority change.
    if (isSelfAuthorityMutation({ callerUserId: access.userId, targetUserId: uid })) {
        return selfAuthorityMutationResponse();
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

    const attendance_capture_scope = normalizeCaptureScope(body.attendance_capture_scope);
    if (attendance_capture_scope == null) {
        return NextResponse.json(
            { error: "attendance_capture_scope must be site or assigned" },
            { status: 400 }
        );
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

    const { data: membership, error: memErr } = await supabase.from("user_roles").select("user_id").eq("user_id", uid).eq("org_id", access.orgId).limit(1);
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
    if (!membership?.length) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (department_scope === "restricted") {
        const { data: deptRows, error: dErr } = await supabase.from("departments").select("id").eq("org_id", access.orgId).in("id", department_ids);
        if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
        if ((deptRows ?? []).length !== department_ids.length) {
            return NextResponse.json({ error: "One or more department_ids are invalid for this org" }, { status: 400 });
        }
    }

    if (site_scope === "restricted") {
        const { data: locRows, error: lErr } = await supabase
            .from("locations")
            .select("id")
            .eq("org_id", access.orgId)
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

    /*
     * D2 — ONE TRANSACTION WHERE THERE WERE FIVE ROUND TRIPS.
     *
     * This route used to upsert the profile, delete both allow-lists and insert both allow-lists as
     * separate statements. A failure between them could leave `site_scope = restricted` with no rows
     * to restrict to, which the resolver reads as deny-all — so an operator WIDENING access could
     * silently narrow it to nothing. Auditing the path required a transaction owner, and the
     * transaction owner repairs that hazard as well.
     *
     * Validation stays here: the org checks and the empty-allow-list refusal above are this route's,
     * and duplicating them in SQL would be a second answer.
     */
    const audit = accessMutationAudit(access);
    const { error: scopeErr } = await supabase.rpc("replace_member_access_scope_audited", {
        p_org_id: access.orgId,
        p_user_id: uid,
        p_department_scope: department_scope,
        p_department_ids: department_scope === "restricted" ? department_ids : [],
        p_site_scope: site_scope,
        p_site_location_ids: site_scope === "restricted" ? site_location_ids : [],
        p_actor_user_id: audit.actorUserId,
        p_origin: audit.origin,
        p_correlation_id: audit.correlationId,
    });
    if (scopeErr) return NextResponse.json({ error: scopeErr.message }, { status: 500 });

    /*
     * Attendance capture scope is written SEPARATELY, and deliberately after.
     *
     * `replace_member_access_scope_audited` owns department/site scope and both
     * allow-lists in one transaction, and it takes no capture-scope parameter.
     * Extending its signature would mean a forward migration to a promoted
     * function for one column; writing the column here does not.
     *
     * The ordering makes the failure mode safe. The RPC upserts the profile row,
     * so this always finds one. If the RPC succeeds and this does not, department
     * and site scope are correct and capture scope is simply UNCHANGED — never
     * widened, and never left pointing at an allow-list that does not exist.
     * Absent in the request means unchanged, so a caller written before this
     * field existed cannot narrow a teacher out of band.
     */
    if (attendance_capture_scope !== "unchanged") {
        const { error: captureErr } = await supabase
            .from("user_access_profiles")
            .update({ attendance_capture_scope })
            .eq("user_id", uid)
            .eq("org_id", access.orgId);
        if (captureErr) return NextResponse.json({ error: captureErr.message }, { status: 500 });
    }

    /*
     * W-13 wired four access routes to invalidate the shell cache and MISSED THIS ONE. The cached
     * bundle carries `departmentScope`, `siteScope` and both allow-lists, so until now a scope change
     * could take up to 120 seconds to be observed — the exact defect W-13's fix existed to close, on
     * a path it did not cover. D2's coverage lock is what surfaced it.
     *
     * Per-user, because a scope change has exactly one subject.
     */
    invalidateAdminShellContextCache(uid);

    const effective = await resolveAdminAccessDimensionsForOrgMember(supabase, uid, access.orgId);
    return NextResponse.json({
        ok: true,
        effective,
        department_ids: effective?.departmentScope === "restricted" ? effective.allowedDepartmentIds ?? [] : [],
        site_location_ids: effective?.siteScope === "restricted" ? effective.allowedSiteLocationIds ?? [] : [],
    });
}
