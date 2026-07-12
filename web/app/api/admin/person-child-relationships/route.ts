import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createPersonChildRelationship,
    listPersonChildRelationships,
} from "@/lib/fields/personChildRelationship/personChildRelationshipService";

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const customerMemberId = request.nextUrl.searchParams.get("customer_member_id")?.trim() || undefined;
    const personId = request.nextUrl.searchParams.get("person_id")?.trim() || undefined;
    const customerId = request.nextUrl.searchParams.get("customer_id")?.trim() || undefined;
    const role = request.nextUrl.searchParams.get("operational_role")?.trim() || undefined;
    const supabase = createAdminClient();
    try {
        const items = await listPersonChildRelationships({
            supabase,
            orgId: ctx.orgId,
            customerMemberId,
            personId,
            customerId,
            requiredOperationalRole: role,
        });
        return NextResponse.json({ items });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to list relationships" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = await requireAdminOrOps();
    if (denied) return denied;
    const body = (await request.json()) as Record<string, unknown>;
    const customerId = String(body.customer_id ?? "").trim();
    const customerMemberId = String(body.customer_member_id ?? "").trim();
    const personId = String(body.person_id ?? "").trim();
    if (!customerId || !customerMemberId || !personId) {
        return NextResponse.json({ error: "customer_id, customer_member_id, and person_id are required." }, { status: 400 });
    }
    const supabase = createAdminClient();
    const result = await createPersonChildRelationship(supabase, {
        orgId: ctx.orgId,
        customerId,
        customerMemberId,
        personId,
        relationshipType: body.relationship_type != null ? String(body.relationship_type) : null,
        priority: typeof body.priority === "number" ? body.priority : null,
        operationalRoles: Array.isArray(body.operational_roles)
            ? body.operational_roles.map((r) => String(r))
            : [],
        customFields:
            body.custom_fields && typeof body.custom_fields === "object"
                ? (body.custom_fields as Record<string, unknown>)
                : undefined,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ relationship: result.relationship }, { status: 201 });
}
