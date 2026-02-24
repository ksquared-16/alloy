import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** POST: set canceled_at=now(), canceled_by=user id, cancel_reason from body. Admin only. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // ignore
  }
  const cancel_reason = typeof body.cancel_reason === "string" ? body.cancel_reason.trim() : null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("schedules")
    .update({
      canceled_at: new Date().toISOString(),
      canceled_by: ctx.userId,
      cancel_reason: cancel_reason ?? null,
    })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
