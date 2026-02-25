import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** PATCH: set org's industry_id. Admin only. */
export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { industry_id?: string | null } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const industry_id = body.industry_id === null || body.industry_id === undefined
        ? null
        : typeof body.industry_id === "string" ? body.industry_id.trim() || null : null;

    const supabase = createAdminClient();

    if (industry_id) {
        const { data: ind, error: indError } = await supabase
            .from("industries")
            .select("id")
            .eq("id", industry_id)
            .eq("is_active", true)
            .maybeSingle();

        if (indError) {
            return NextResponse.json({ error: indError.message }, { status: 500 });
        }
        if (!ind) {
            return NextResponse.json({ error: "Industry not found or inactive" }, { status: 400 });
        }
    }

    const { error: updateErr } = await supabase
        .from("orgs")
        .update({ industry_id })
        .eq("id", ctx.orgId);

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ industry_id });
}
