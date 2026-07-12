import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    getPersonChildRelationshipById,
    updatePersonChildRelationship,
} from "@/lib/fields/personChildRelationship/personChildRelationshipService";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id } = await params;
    const supabase = createAdminClient();
    const relationship = await getPersonChildRelationshipById(supabase, ctx.orgId, id);
    if (!relationship) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ relationship });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = await requireAdminOrOps();
    if (denied) return denied;
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = createAdminClient();
    const result = await updatePersonChildRelationship(supabase, ctx.orgId, id, body);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const relationship = await getPersonChildRelationshipById(supabase, ctx.orgId, id);
    return NextResponse.json({ relationship });
}
