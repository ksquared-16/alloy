import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { ORG_ID_FINANCIALS } from "@/lib/financials";

export const dynamic = "force-dynamic";

export async function GET() {
    const supabase = createAdminClient();
    const orgId = ORG_ID_FINANCIALS;

    const { data, error } = await supabase
        .from("gl_accounts")
        .select("id, code, name, type, currency, is_active, created_at")
        .eq("org_id", orgId)
        .order("code", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
}
