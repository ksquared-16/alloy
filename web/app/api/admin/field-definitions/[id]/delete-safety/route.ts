import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assessFieldDefinitionDeleteSafety } from "@/lib/fields/fieldDeleteSafety";

/** GET: dependency summary before hard-deleting a custom field_definition. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("field_definitions")
        .select("id, org_id, entity_type, field_key, is_system")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Field definition not found" }, { status: 404 });
    }

    if (Boolean((existing as { is_system: boolean }).is_system)) {
        return NextResponse.json({
            safe: false,
            blockers: [{ kind: "system", label: "System fields cannot be deleted." }],
            uncovered_checks: [],
            recommended_action: "archive",
        });
    }

    const safety = await assessFieldDefinitionDeleteSafety(supabase, {
        id: String((existing as { id: string }).id),
        org_id: ctx.orgId,
        entity_type: String((existing as { entity_type: string }).entity_type),
        field_key: String((existing as { field_key: string }).field_key),
    });

    return NextResponse.json(safety);
}
