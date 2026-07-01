import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { fetchJobDiscountOptionsForAdmin } from "@/lib/admin/jobDiscountSelection";

/**
 * GET: discount options for job/admin dropdowns.
 * - discount_options: programs (discount_programs_admin_v) + orphan legacy discount_codes
 * - discount_codes: deprecated shape for older clients (id = legacy code uuid only)
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const vertical_slug = searchParams.get("vertical_slug")?.trim() || null;

    try {
        const supabase = createAdminClient();
        const discount_options = await fetchJobDiscountOptionsForAdmin(supabase, ctx.orgId, vertical_slug);

        const discount_codes = discount_options
            .filter((o) => o.value.startsWith("code:"))
            .map((o) => ({
                id: o.legacy_code_id!,
                code: o.code,
                discount_type: o.discount_type,
                discount_value: o.discount_value,
                applies_to_vertical_slug: o.applies_to_vertical_slug,
                first_job_only: o.first_job_only,
            }));

        return NextResponse.json({ discount_options, discount_codes });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load discount options";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
