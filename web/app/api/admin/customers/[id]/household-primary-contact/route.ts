import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { setHouseholdPrimaryContactForCustomer } from "@/lib/admin/person/setHouseholdPrimaryContact";

/** PATCH: set household primary contact on customer_persons; sync opportunities.primary_person_id. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: customerId } = await context.params;
    if (!customerId?.trim()) {
        return NextResponse.json({ error: "Missing customer id" }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const personId =
        typeof body.person_id === "string" && body.person_id.trim() ? body.person_id.trim() : null;
    if (!personId) {
        return NextResponse.json({ error: "person_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        const result = await setHouseholdPrimaryContactForCustomer(supabase, {
            orgId: ctx.orgId,
            customerId: customerId.trim(),
            personId,
        });
        return NextResponse.json({ ok: true, ...result });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Update failed";
        const status = message.includes("not found") ? 404 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}
