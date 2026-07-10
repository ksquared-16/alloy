import { NextResponse } from "next/server";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { buildIdentityPlatformOverview } from "@/lib/communications/identity/admin/identityAdminService";

export async function GET() {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const supabase = createAdminClient();
    const overview = await buildIdentityPlatformOverview(supabase, ctx.orgId);
    return NextResponse.json(overview);
}
