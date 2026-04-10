import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import {
    RECORD_OVERVIEW_LAYOUT_V1_SURFACE,
    normalizeRecordOverviewEntityTypeParam,
} from "@/lib/rrs/overview/recordOverviewLayoutScope";

/**
 * GET — org-scoped record overview layout row (admin). v1: `job`/`jobs` + `overview` only.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const entityNorm = normalizeRecordOverviewEntityTypeParam(request.nextUrl.searchParams.get("entity_type"));
    const surface = (request.nextUrl.searchParams.get("surface") ?? "").trim().toLowerCase();

    if (!entityNorm || surface !== RECORD_OVERVIEW_LAYOUT_V1_SURFACE) {
        return NextResponse.json(
            { error: "entity_type must be job (or jobs) and surface must be overview" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("record_overview_layouts")
        .select("id, org_id, entity_type, surface, template_key, config, is_active, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entityNorm)
        .eq("surface", surface)
        .eq("is_active", true)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
        return NextResponse.json(
            { error: "not_found", message: "No active record overview layout for this org and scope" },
            { status: 404 }
        );
    }

    return NextResponse.json({ layout: data });
}
