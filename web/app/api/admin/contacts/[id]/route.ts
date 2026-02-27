import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { normalizeEmail, normalizePhone } from "@/lib/contactNormalize";

const PATCH_ALLOWED = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "company_name",
    "notes",
    "status",
    "status_key",
    "customer_id",
    "vendor_id",
    "vendor_contact_role",
    "metadata",
] as const;

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const { orgId, userId } = ctx;

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const body = (await request.json()) as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        for (const key of PATCH_ALLOWED) {
            if (body[key] === undefined) continue;
            if (key === "email") {
                updates[key] = normalizeEmail(body[key] as string);
                continue;
            }
            if (key === "phone") {
                updates[key] = normalizePhone(body[key] as string);
                continue;
            }
            updates[key] = body[key];
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("contacts")
            .update(updates)
            .eq("id", id)
            .eq("org_id", orgId)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

        logAdminAudit({
            entity: "contacts",
            id,
            changed_fields: Object.keys(updates),
            actor_user_id: userId,
            role: ctx.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_CONTACT]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
