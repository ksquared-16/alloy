import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { addPersonChildRelationshipRole } from "@/lib/fields/personChildRelationship/personChildRelationshipService";
import {
    requireCrmPeopleCapability,
    CRM_CUSTOMERS_WRITE,
} from "@/lib/access/crmPeopleAuthority";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const capDenied = requireCrmPeopleCapability(ctx, CRM_CUSTOMERS_WRITE);
    if (capDenied) return capDenied;
    const { id } = await params;
    const body = (await request.json()) as { role_key?: string };
    const roleKey = String(body.role_key ?? "").trim();
    if (!roleKey) return NextResponse.json({ error: "role_key is required." }, { status: 400 });
    const supabase = createAdminClient();
    const result = await addPersonChildRelationshipRole(supabase, ctx.orgId, id, roleKey);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
}
