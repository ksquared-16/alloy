import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";

/** GET /api/admin/forms/packet-sessions — recent packet runs for org (AdminV2 review). */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("form_packet_sessions")
        .select(
            `
      id,
      status,
      created_at,
      completed_at,
      packet_definition_id,
      started_via_public_link_id,
      current_sequence_index,
      crm_snapshot,
      form_packet_definitions ( name )
    `
        )
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return jsonData(data ?? []);
}
