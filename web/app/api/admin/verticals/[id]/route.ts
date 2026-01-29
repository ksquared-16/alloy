import { createAdminClient } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = createAdminClient();
    const body = await request.json();

    // Build update payload - only include settings if it's valid, never null
    const updatePayload: any = { ...body };
    
    if ('settings' in body) {
      if (body.settings === null || body.settings === undefined) {
        // Don't include settings in update if null/undefined (let DB default handle it)
        delete updatePayload.settings;
      } else if (typeof body.settings !== 'object') {
        return NextResponse.json(
          { error: "settings must be a valid JSON object" },
          { status: 400 }
        );
      }
      // If settings is a valid object, it will be included in updatePayload
    }

    const { data, error } = await supabase
      .from("verticals")
      .update(updatePayload)
      .eq("id", id)
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

