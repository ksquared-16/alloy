import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list customers for current org (for dropdowns). Admin/ops. */
export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name")
    .eq("org_id", ctx.orgId)
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: data ?? [] });
}
