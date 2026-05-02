import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";
import { emitEvent } from "@/lib/emitEvent";

/** DELETE: unlink a contact from this vendor (remove from vendor_contacts). */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; contactId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id: vendorId, contactId } = await context.params;
    if (!vendorId || !contactId) return NextResponse.json({ error: "Missing vendor or contact id" }, { status: 400 });

    try {
        const auth = await getAdminAuthCached();
        if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const supabase = createAdminClient();
        if (!(await assertRowOrg(supabase, "vendors", vendorId, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const { error } = await supabase
            .from("vendor_contacts")
            .delete()
            .eq("vendor_id", vendorId)
            .eq("contact_id", contactId);

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        logAdminAudit({
            entity: "vendor_contacts",
            id: `${vendorId}:${contactId}`,
            changed_fields: ["deleted"],
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        try {
            await emitEvent({
                org_id: ctx.orgId,
                event_type: "vendor_contact_unlinked",
                entity_type: "vendors",
                entity_id: vendorId,
                payload: { contact_id: contactId, actor_user_id: auth.user.id },
            });
        } catch (e) {
            console.warn("[vendor contacts DELETE] emitEvent", e instanceof Error ? e.message : e);
        }
        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        console.error("[ADMIN_VENDOR_REMOVE_CONTACT]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
