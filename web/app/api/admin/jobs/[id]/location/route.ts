import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";

/** PATCH: set job location. Admin only. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    let body: { location_id?: string | null } = {};
    try {
        body = (await request.json()) as { location_id?: string | null };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const locationIdRaw = body.location_id;
    const location_id: string | null =
        typeof locationIdRaw === "string" && locationIdRaw.trim()
            ? locationIdRaw.trim()
            : null;

    const supabase = createAdminClient();

    const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("id, org_id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (jobErr || !job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (location_id) {
        const { data: loc, error: locErr } = await supabase
            .from("locations")
            .select("id, org_id")
            .eq("id", location_id)
            .maybeSingle();
        if (locErr || !loc) {
            return NextResponse.json({ error: "Location not found" }, { status: 400 });
        }
        if ((loc as { org_id?: string }).org_id !== ctx.orgId) {
            return NextResponse.json({ error: "Location does not belong to your org" }, { status: 400 });
        }
    }

    const { data: updated, error: updateErr } = await supabase
        .from("jobs")
        .update({ location_id })
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select("id, location_id")
        .single();

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }
    if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    logAdminAudit({
        entity: "jobs",
        id,
        changed_fields: ["location_id"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({
        id: (updated as { id: string }).id,
        location_id: (updated as { location_id?: string | null }).location_id ?? null,
    });
}
