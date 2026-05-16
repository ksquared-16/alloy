import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";

const WORKFLOW_CREATE_KEYS = ["name", "description", "event_type", "entity_type", "enabled", "metadata"] as const;

/** GET: list workflows for caller org (admin + ops). */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("workflows")
            .select("id, name, description, event_type, entity_type, enabled, created_at, updated_at")
            .eq("org_id", ctx.orgId)
            .order("updated_at", { ascending: false });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data ?? []);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

/** POST: create workflow (admin only); org_id is always server-set. */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const supabase = createAdminClient();
        const body = (await request.json()) as Record<string, unknown>;
        const row: Record<string, unknown> = {
            org_id: ctx.orgId,
            created_by: ctx.userId,
        };
        for (const key of WORKFLOW_CREATE_KEYS) {
            if (body[key] !== undefined) row[key] = body[key];
        }
        if (typeof row.name !== "string" || !String(row.name).trim()) {
            return NextResponse.json({ error: "name is required" }, { status: 400 });
        }
        if (typeof row.event_type !== "string" || !String(row.event_type).trim()) {
            return NextResponse.json({ error: "event_type is required" }, { status: 400 });
        }
        if (typeof row.entity_type !== "string" || !String(row.entity_type).trim()) {
            return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
        }
        const { data, error } = await supabase.from("workflows").insert([row]).select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
