import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";

/** GET: public list of active verticals (id, name, slug) for join form and other public use. */
export async function GET() {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("verticals")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
