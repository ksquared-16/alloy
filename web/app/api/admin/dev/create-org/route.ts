import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createOrgAndAssignAdmin } from "@/lib/dev/createOrgAndAssignAdmin";
import { createAdminClient } from "@/lib/supabaseAdmin";

type Body = {
    name?: string;
    industry_key?: string;
    admin_user_id?: string;
};

function spinupEnabled(): boolean {
    return process.env.DEV_TENANT_SPINUP_ENABLED === "true";
}

/**
 * POST /api/admin/dev/create-org
 * Dev-only: creates org, sets industry, assigns admin in user_roles (upsert on user_id + org_id + role).
 * Requires DEV_TENANT_SPINUP_ENABLED=true and admin session.
 */
export async function POST(request: NextRequest) {
    if (!spinupEnabled()) {
        return NextResponse.json({ error: "DEV_TENANT_SPINUP_ENABLED is not set to true" }, { status: 403 });
    }

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Body = {};
    try {
        body = (await request.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const industry_key = typeof body.industry_key === "string" ? body.industry_key.trim() : "";
    const admin_user_id = typeof body.admin_user_id === "string" ? body.admin_user_id.trim() : "";

    const supabase = createAdminClient();
    const result = await createOrgAndAssignAdmin(supabase, { name, industry_key, admin_user_id });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
        org_id: result.org_id,
        slug: result.slug,
        industry_id: result.industry_id,
    });
}
