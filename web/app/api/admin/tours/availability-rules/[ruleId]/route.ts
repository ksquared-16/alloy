import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { buildTourAvailabilityRulePatch } from "@/lib/tours/admin/tourAvailabilityRuleMutation";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { TOURS_CONFIGURE, requireToursCapability } from "@/lib/access/toursAuthority";
import { readTourScheduleScopeLocation } from "@/lib/tours/schedules/tourScheduleRouteSupport";

/**
 * `?scope=<location id>|org` — the scope the operator is editing from. When present, a rule owned
 * by a different scope is refused: an organization-wide rule seen from a location is inherited and
 * is edited at organization scope, never as though the location owned it.
 */
function scopeMismatch(request: NextRequest, ruleLocationId: string | null): NextResponse | null {
    const raw = new URL(request.url).searchParams.get("scope");
    if (raw == null) return null;
    const scope = readTourScheduleScopeLocation(raw);
    if (!scope.ok) return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    const owner = ruleLocationId && ruleLocationId.trim() ? ruleLocationId : null;
    if (owner === scope.locationId) return null;
    return NextResponse.json(
        {
            error: owner == null
                ? "This window is organization-wide and inherited here. Edit it from the organization's tour settings."
                : "This window belongs to another location.",
            code: "TOUR_RULE_SCOPE_MISMATCH",
        },
        { status: 409 }
    );
}

/** PATCH /api/admin/tours/availability-rules/[ruleId] */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
    /*
     * TOURS CONFIGURATION — edits a tour availability rule.
     *
     * `requireAdminOrOps()` stood here, and despite its name it resolves PORTAL
     * ADMISSION and no role: every principal who could enter the portal could do this.
     * `tours.configure` is the authority now, held by grant and by nothing else.
     */
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const capDenied = requireToursCapability(access, TOURS_CONFIGURE);
    if (capDenied) return capDenied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { ruleId } = await params;
    const id = String(ruleId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing ruleId" }, { status: 400 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const patchResult = buildTourAvailabilityRulePatch(body);
    if (!patchResult.ok) return NextResponse.json({ error: patchResult.error }, { status: 400 });

    const supabase = createAdminClient();
    const { data: existing, error: e0 } = await supabase
        .from("tour_availability_rules")
        .select("id, location_id")
        .eq("org_id", ctx.orgId)
        .eq("id", id)
        .maybeSingle();
    if (e0 || !existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const patchScope = scopeMismatch(request, (existing as { location_id: string | null }).location_id);
    if (patchScope) return patchScope;

    if (
        patchResult.patch.location_id !== undefined &&
        patchResult.patch.location_id != null &&
        patchResult.patch.location_id !== ""
    ) {
        const lid = patchResult.patch.location_id;
        const { data: loc } = await supabase.from("locations").select("id").eq("id", lid).eq("org_id", ctx.orgId).maybeSingle();
        if (!loc) return NextResponse.json({ error: "location_id not found for org" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("tour_availability_rules")
        .update(patchResult.patch)
        .eq("org_id", ctx.orgId)
        .eq("id", id)
        .select("*")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rule: data });
}

/** DELETE /api/admin/tours/availability-rules/[ruleId] */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
    /*
     * TOURS CONFIGURATION — removes a tour availability rule.
     *
     * `requireAdminOrOps()` stood here, and despite its name it resolves PORTAL
     * ADMISSION and no role: every principal who could enter the portal could do this.
     * `tours.configure` is the authority now, held by grant and by nothing else.
     */
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const capDenied = requireToursCapability(access, TOURS_CONFIGURE);
    if (capDenied) return capDenied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { ruleId } = await params;
    const id = String(ruleId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing ruleId" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: owned } = await supabase
        .from("tour_availability_rules")
        .select("id, location_id")
        .eq("org_id", ctx.orgId)
        .eq("id", id)
        .maybeSingle();
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const deleteScope = scopeMismatch(request, (owned as { location_id: string | null }).location_id);
    if (deleteScope) return deleteScope;
    const { error } = await supabase.from("tour_availability_rules").delete().eq("org_id", ctx.orgId).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
}
