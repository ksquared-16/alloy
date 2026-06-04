/**
 * Layout V2 — available fields for the layout editor (read-only).
 *
 *   GET /api/admin/entity-layouts/available-fields?entity_type=opportunities
 *
 * Returns the org's field catalog for an entity so the editor's "add field"
 * control can offer real fields. The layout entity key is the canonical plural
 * key; field_definitions are keyed singular, so we map via fieldEntityKey().
 *
 * Read-only, org-scoped, flag-gated. Does not touch live runtime.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { isLayoutV2PreviewEnabledServer } from "@/lib/layout/featureFlag";
import { fieldEntityKey } from "@/lib/layout/entityKeys";

export async function GET(request: NextRequest) {
    if (!isLayoutV2PreviewEnabledServer()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type")?.trim();
    if (!entityType) {
        return NextResponse.json({ error: "entity_type required" }, { status: 400 });
    }

    const fieldEntity = fieldEntityKey(entityType);
    const supabase = createAdminClient();
    try {
        const { data, error } = await supabase
            .from("field_definitions")
            .select("field_key, label, section_key, sort_order, is_active")
            .eq("org_id", ctx.orgId)
            .eq("entity_type", fieldEntity)
            .eq("is_active", true)
            .order("section_key", { ascending: true })
            .order("sort_order", { ascending: true });
        if (error) {
            // Unknown/unsupported entity (no field catalog) → empty list, not an error.
            return NextResponse.json({ fields: [], fieldEntityType: fieldEntity });
        }
        const fields = (data ?? []).map((r) => ({
            key: String((r as { field_key: string }).field_key),
            label: (r as { label?: string | null }).label?.trim() || String((r as { field_key: string }).field_key),
            sectionKey: (r as { section_key?: string | null }).section_key ?? null,
        }));
        return NextResponse.json({ fields, fieldEntityType: fieldEntity });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
