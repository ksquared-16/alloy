import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { removePersonChildRelationshipRole } from "@/lib/fields/personChildRelationship/personChildRelationshipService";

type RouteParams = { params: Promise<{ id: string; roleKey: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = await requireAdminOrOps();
    if (denied) return denied;
    const { id, roleKey } = await params;
    const supabase = createAdminClient();
    const result = await removePersonChildRelationshipRole(supabase, ctx.orgId, id, decodeURIComponent(roleKey));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
}
