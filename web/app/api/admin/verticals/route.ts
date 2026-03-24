import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { NextRequest, NextResponse } from "next/server";

/** GET: list verticals (global catalog; requires admin session). */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase.from("verticals").select("id, name, slug").order("name", { ascending: true });
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

        const safeSettings = body.settings && typeof body.settings === "object" ? body.settings : {};

        const insertPayload = {
            ...body,
            settings: safeSettings,
        };

        const { data, error } = await supabase.from("verticals").insert([insertPayload]).select().single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
