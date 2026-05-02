import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";

type RuleRow = {
    id: string;
    org_id: string;
    entity_type: string;
    department_id: string | null;
    work_unit_id: string | null;
    action_key: string | null;
    from_status_key: string | null;
    to_status_key: string;
    required_metadata_fields: unknown;
    required_payload_fields: unknown;
    blocked: boolean;
    is_active: boolean;
    message: string | null;
    created_at: string;
    updated_at: string;
};

/** GET /api/admin/status-transition-rules — list transition rules for current org. */
export async function GET(_request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("status_transition_rules")
        .select(
            "id, org_id, entity_type, department_id, work_unit_id, action_key, from_status_key, to_status_key, required_metadata_fields, required_payload_fields, blocked, is_active, message, created_at, updated_at"
        )
        .eq("org_id", ctx.orgId)
        .order("entity_type", { ascending: true })
        .order("to_status_key", { ascending: true })
        .order("from_status_key", { ascending: true });

    if (error) {
        return NextResponse.json({ items: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: (data ?? []) as unknown as RuleRow[] });
}

