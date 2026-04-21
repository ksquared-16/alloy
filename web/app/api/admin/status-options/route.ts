import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import {
    fetchEffectiveStatusDefinitions,
    parseLifecycleStageFromMetadata,
} from "@/lib/admin/statusDefinitionsResolve";

/**
 * GET: dropdown options for admin status controls — effective status_definitions (org or industry defaults).
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const entityType = request.nextUrl.searchParams.get("entity_type")?.trim() ?? "";
    if (!entityType) {
        return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        const defs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, entityType, { activeOnly: true });
        const options = defs.map((r) => ({
            value: r.status_key,
            label: (r.status_label && String(r.status_label).trim()) || r.status_key,
            sort_order: r.sort_order ?? 0,
            lifecycle_stage: parseLifecycleStageFromMetadata(r.metadata),
        }));
        return NextResponse.json({ options });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
