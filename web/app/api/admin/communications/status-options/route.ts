import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { buildStatusOptions, grainToEntityType, type StatusDefinitionRow } from "@/lib/communications/v2/statusOptions";

/**
 * Communications V2 — status options for the Announcement Audience Builder (B8C).
 * READ-ONLY. Returns the CONFIGURED status options from status_definitions for the grain's
 * authoritative track (family → case-track status_key, child → OCM outcome_status_key).
 * Reads only status_definitions — never a pipeline-stage table or the legacy status column;
 * no buckets, no keyword matching, no send/schedule/provider.
 * Pattern: requireAdminOrOps -> getAdminContextCached -> createAdminClient.
 */

/** GET /api/admin/communications/status-options?grain=family|child */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const grain = (new URL(request.url).searchParams.get("grain") ?? "").trim();
    const entityType = grainToEntityType(grain);
    if (!entityType) {
        return NextResponse.json({ error: "grain must be 'family' or 'child'" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    // Org overrides + system/industry defaults (org_id IS NULL); active rows only.
    const { data, error } = await supabase
        .from("status_definitions")
        .select("org_id, entity_type, status_key, status_label, is_active, sort_order, metadata")
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .order("sort_order", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const options = buildStatusOptions((data ?? []) as StatusDefinitionRow[]);
    return NextResponse.json({ grain, entity_type: entityType, options });
}
