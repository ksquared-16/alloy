import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAuth, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";

const ALLOWED_KEYS = ["job_date", "job_time_window", "status", "vertical_id", "quote_total", "notes", "pipeline_stage_id"] as const;

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const body = await request.json();
        const auth = await getAdminAuth();
        if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const updates: Record<string, unknown> = {};
        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            if (key === "notes") continue; // handled below
            let val = body[key];
            if (key === "vertical_id" && val === "") val = null;
            if (key === "quote_total" && (val === "" || val === null)) val = null;
            if (key === "pipeline_stage_id" && (val === "" || val === null)) val = null;
            updates[key] = val;
        }
        if (body.notes !== undefined) {
            const supabase = createAdminClient();
            const { data: existing } = await supabase.from("opportunities").select("metadata").eq("id", id).single();
            const meta = (existing?.metadata as Record<string, unknown>) || {};
            updates.metadata = { ...meta, notes: body.notes === "" ? null : body.notes };
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("opportunities")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        logAdminAudit({
            entity: "opportunities",
            id,
            changed_fields: Object.keys(updates).filter((k) => k !== "metadata").concat(updates.metadata ? ["notes"] : []),
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_OPPORTUNITY]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
