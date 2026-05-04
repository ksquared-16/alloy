import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";

export type WorkspaceSiteFilterSite = { id: string; label: string };

/** GET — Allowed site locations for header workspace filter (view-only; does not widen permissions). */
export async function GET() {
    const ctx = await getAdminAccessContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("locations")
        .select("id, label, location_type")
        .eq("org_id", ctx.orgId)
        .eq("location_type", "site")
        .or("is_active.is.null,is_active.eq.true")
        .order("label", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const sitesRaw = (rows ?? []) as Array<{ id: string; label: string | null }>;
    let sites: WorkspaceSiteFilterSite[] = sitesRaw.map((r) => ({
        id: r.id,
        label: (r.label ?? "").trim() || "Site",
    }));

    if (ctx.siteScope === "restricted" && ctx.allowedSiteLocationIds?.length) {
        const allow = new Set(ctx.allowedSiteLocationIds);
        sites = sites.filter((s) => allow.has(s.id));
    }

    const showDropdown = sites.length > 1;
    const singleSiteLabel = sites.length === 1 ? sites[0].label : null;

    return NextResponse.json({
        site_scope: ctx.siteScope,
        sites,
        show_dropdown: showDropdown,
        single_site_label: singleSiteLabel,
    });
}
