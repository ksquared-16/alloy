/**
 * One external producer — revoke it.
 *
 * Revocation is a status change on the row, not a delete: the producer id is
 * referenced by every event and mapping it ever touched, and by the attendance
 * facts it authored. Removing it would orphan that provenance.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ producerId: string }> }) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { access } = auth;

    const { producerId } = await context.params;
    const id = typeof producerId === "string" ? producerId.trim() : "";
    if (!id) return NextResponse.json({ error: "producerId required" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: existing } = await supabase
        .from("attendance_integration_producers")
        .select("id")
        .eq("org_id", access.orgId)
        .eq("id", id)
        .maybeSingle();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { error } = await supabase
        .from("attendance_integration_producers")
        .update({
            status: "revoked",
            revoked_at: new Date().toISOString(),
            revoked_by: access.userId,
        })
        .eq("org_id", access.orgId)
        .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
