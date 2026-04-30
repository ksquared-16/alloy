import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";

/** Match /api/admin/activity entity_type normalization. */
function normalizeEntityTypeParam(raw: string): string | null {
    const s = raw.trim().toLowerCase();
    if (!s) return null;
    if (s === "opportunity") return "opportunities";
    if (s === "customer") return "customers";
    if (s === "job") return "jobs";
    if (s === "schedule") return "schedules";
    if (s === "contact") return "contacts";
    return s;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** GET /api/admin/communications/threads — threads for entity. */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const entityTypeRaw = (searchParams.get("entity_type") ?? "").trim();
    const entityId = (searchParams.get("entity_id") ?? "").trim();
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 40, 1), 100);

    const entityType = normalizeEntityTypeParam(entityTypeRaw);
    if (!entityType || !entityId || !UUID_RE.test(entityId)) {
        return NextResponse.json({ error: "entity_type and valid entity_id (uuid) are required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: threads, error } = await supabase
        .from("communication_threads")
        .select("id, org_id, channel, recipient_key, created_at, updated_at, metadata")
        .eq("org_id", ctx.orgId)
        .eq("primary_entity_type", entityType)
        .eq("primary_entity_id", entityId)
        .order("updated_at", { ascending: false })
        .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ threads: threads ?? [] });
}
