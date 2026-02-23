import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list job_statuses for dropdowns. Admin/ops. */
export async function GET() {
  const ctx = await getAdminContext();
  if (ctx instanceof NextResponse) return ctx;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("job_statuses")
    .select("id, label")
    .order("label", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job_statuses: data ?? [] });
}
