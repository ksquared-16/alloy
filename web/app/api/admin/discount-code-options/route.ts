import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: active discount codes for dropdown. Auth: getAdminContext (admin/ops).
 * Query: vertical_slug (optional) - filter by applies_to_vertical_slug null or match.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const vertical_slug = searchParams.get("vertical_slug")?.trim() || null;

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    let q = supabase
        .from("discount_codes")
        .select("id, code, discount_type, discount_value, applies_to_vertical_slug, first_job_only")
        .eq("is_active", true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("code", { ascending: true });

    if (vertical_slug) {
        q = q.or(`applies_to_vertical_slug.is.null,applies_to_vertical_slug.eq.${vertical_slug}`);
    }

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const discount_codes = (rows ?? []).map((r) => {
        const row = r as {
            id: string;
            code: string | null;
            discount_type: string | null;
            discount_value: number | string | null;
            applies_to_vertical_slug: string | null;
            first_job_only: boolean | null;
        };
        return {
            id: row.id,
            code: row.code ?? "",
            discount_type: row.discount_type ?? null,
            discount_value: row.discount_value ?? null,
            applies_to_vertical_slug: row.applies_to_vertical_slug ?? null,
            first_job_only: row.first_job_only ?? null,
        };
    });

    return NextResponse.json({ discount_codes });
}
