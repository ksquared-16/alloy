import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { emitEvent } from "@/lib/emitEvent";

/** POST: set archived_at = null. Admin only. Scoped by org_id. */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminContextCached();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ archived_at: null })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await emitEvent({
      org_id: ctx.orgId,
      event_type: "job_unarchived",
      entity_type: "jobs",
      entity_id: id,
      payload: { actor_user_id: ctx.userId },
    });
  } catch (e) {
    console.warn("[jobs/unarchive] emitEvent", e instanceof Error ? e.message : e);
  }
  return NextResponse.json(data);
}
