import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";

/** GET: list workflows (admin + ops can view). */
export async function GET() {
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("workflows")
            .select("id, name, description, event_type, entity_type, enabled, created_at, updated_at")
            .order("updated_at", { ascending: false });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data ?? []);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

/** POST: create workflow (admin only). */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    try {
        const supabase = createAdminClient();
        const body = await request.json();
        const { data, error } = await supabase
            .from("workflows")
            .insert([body])
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
