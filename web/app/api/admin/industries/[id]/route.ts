import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: single industry by id with default entity labels. Admin + ops can read. */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: industryRow, error: indError } = await supabase
        .from("industries")
        .select("id, key, label, description, is_active, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();

    if (indError) {
        return NextResponse.json({ error: indError.message }, { status: 500 });
    }
    if (!industryRow) {
        return NextResponse.json({ error: "Industry not found" }, { status: 404 });
    }

    const { data: labelRows } = await supabase
        .from("industry_default_entity_labels")
        .select("entity_type, singular, plural")
        .eq("industry_id", id)
        .order("entity_type", { ascending: true });

    const industry = {
        id: (industryRow as { id: string }).id,
        key: (industryRow as { key: string }).key,
        label: (industryRow as { label: string }).label,
        description: (industryRow as { description: string | null }).description ?? null,
        is_active: (industryRow as { is_active: boolean }).is_active,
        created_at: (industryRow as { created_at: string }).created_at,
        updated_at: (industryRow as { updated_at: string | null }).updated_at ?? null,
    };

    const default_entity_labels = (labelRows ?? []).map((r) => ({
        entity_type: (r as { entity_type: string }).entity_type,
        singular: (r as { singular: string | null }).singular ?? null,
        plural: (r as { plural: string | null }).plural ?? null,
    }));

    return NextResponse.json({ industry, default_entity_labels });
}
