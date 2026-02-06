import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from "next/server";

/** GET: list verticals for admin dropdown (id, name, slug). */
export async function GET() {
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("verticals")
            .select("id, name, slug")
            .order("name", { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data ?? []);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    // Ensure settings is never null - use empty object if missing/invalid
    const safeSettings = (body.settings && typeof body.settings === 'object') 
      ? body.settings 
      : {};
    
    const insertPayload = {
      ...body,
      settings: safeSettings,
    };

    const { data, error } = await supabase
      .from("verticals")
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

