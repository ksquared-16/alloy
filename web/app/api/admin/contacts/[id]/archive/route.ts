import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** POST: set archived_at=now(), archived_by=userId. Scoped by org_id. */
export async function POST(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (ctx instanceof NextResponse) return ctx;
    const { orgId, user } = ctx;

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("contacts")
        .update({
            archived_at: new Date().toISOString(),
            archived_by: user.id,
        })
        .eq("id", id)
        .eq("org_id", orgId)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
}
