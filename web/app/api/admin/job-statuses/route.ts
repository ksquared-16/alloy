import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list active job_statuses for current org (org_id = ctx.orgId or org_id is null). Admin/ops. */
export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("job_statuses")
    .select("id, label")
    .eq("is_active", true)
    .or(`org_id.eq.${ctx.orgId},org_id.is.null`)
    .order("position", { ascending: true })
    .order("label", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job_statuses: data ?? [] });
}
