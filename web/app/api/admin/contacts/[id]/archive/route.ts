import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { emitEvent } from "@/lib/emitEvent";

/** POST: set archived_at=now(), archived_by=userId. Scoped by org_id. */
export async function POST(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const { orgId, userId } = ctx;

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("contacts")
        .update({
            archived_at: new Date().toISOString(),
            archived_by: userId,
        })
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    try {
        await emitEvent({
            org_id: orgId,
            event_type: "contact_archived",
            entity_type: "contacts",
            entity_id: id,
            payload: { actor_user_id: userId, archived_at: (data as { archived_at?: string }).archived_at ?? null },
        });
    } catch (e) {
        console.warn("[contacts/archive] emitEvent", e instanceof Error ? e.message : e);
    }
    return NextResponse.json(data);
}
