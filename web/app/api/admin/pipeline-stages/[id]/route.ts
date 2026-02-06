import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const supabase = createAdminClient();
        const body = await request.json();
        const { data, error } = await supabase
            .from("pipeline_stages")
            .update(body)
            .eq("id", id)
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
        const supabase = createAdminClient();
        const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
