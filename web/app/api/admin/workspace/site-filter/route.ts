import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { resolveOrgSiteLocationsForAdmin, type OrgSiteLocationOption } from "@/lib/admin/resolveOrgSiteLocations";

export type WorkspaceSiteFilterSite = OrgSiteLocationOption;

/** GET — Allowed site locations for header workspace filter (view-only; does not widen permissions). */
export async function GET() {
    const t0 = Date.now();
    const gate = await loadAdminRouteGate();
    const ctxMs = Date.now() - t0;
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = gate.access;

    const supabase = createAdminClient();
    let sites: WorkspaceSiteFilterSite[];
    try {
        sites = await resolveOrgSiteLocationsForAdmin(supabase, ctx.orgId, {
            allowedSiteLocationIds: ctx.siteScope === "restricted" ? ctx.allowedSiteLocationIds : null,
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Site resolve failed" }, { status: 500 });
    }

    const showDropdown = sites.length > 1;
    const singleSiteLabel = sites.length === 1 ? sites[0].label : null;

    const totalMs = Date.now() - t0;
    if (totalMs > 200) {
        console.warn("[admin-timing] GET /api/admin/workspace/site-filter", {
            total_ms: totalMs,
            get_admin_context_ms: ctxMs,
            site_count: sites.length,
        });
    }

    return NextResponse.json({
        site_scope: ctx.siteScope,
        sites,
        show_dropdown: showDropdown,
        single_site_label: singleSiteLabel,
    });
}
