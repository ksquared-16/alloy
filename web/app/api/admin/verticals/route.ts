import { createAdminClient } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
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

