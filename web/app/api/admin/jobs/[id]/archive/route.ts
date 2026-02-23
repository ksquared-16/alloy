import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** POST: set archived_at = now(). Admin only. Scoped by org_id. */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
