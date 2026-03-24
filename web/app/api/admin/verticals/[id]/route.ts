import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { NextRequest, NextResponse } from "next/server";

/**
 * Verticals are a global product catalog (no org_id on `verticals`).
 * We still require membership context so only authenticated admin users can mutate;
 * updates affect all orgs that reference these rows.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const { id } = await context.params;
        const supabase = createAdminClient();
        const body = await request.json();

        const updatePayload: Record<string, unknown> = { ...body };

        if ("settings" in body) {
            if (body.settings === null || body.settings === undefined) {
                delete updatePayload.settings;
            } else if (typeof body.settings !== "object") {
                return NextResponse.json({ error: "settings must be a valid JSON object" }, { status: 400 });
            }
        }

        const { data, error } = await supabase.from("verticals").update(updatePayload).eq("id", id).select().single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json(data);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
