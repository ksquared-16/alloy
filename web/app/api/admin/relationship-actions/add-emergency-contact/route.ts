import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { executeAddEmergencyContactAction, type AddEmergencyContactActionRequest } from "@/lib/admin/relationship/executeAddEmergencyContactAction";
import {
    RELATIONSHIP_EMERGENCY_CONTACT_SCOPES,
    type RelationshipEmergencyContactScope,
} from "@/lib/admin/relationship/relationshipActionContract";
import { createAdminClient } from "@/lib/supabaseAdmin";

function parseScope(value: unknown): RelationshipEmergencyContactScope | null {
    const text = typeof value === "string" ? value.trim() : "";
    return (RELATIONSHIP_EMERGENCY_CONTACT_SCOPES as readonly string[]).includes(text) ?
            (text as RelationshipEmergencyContactScope)
        :   null;
}

/** POST: add or link emergency contact to one or more child customer_members (confirmation required client-side). */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: AddEmergencyContactActionRequest = {} as AddEmergencyContactActionRequest;
    try {
        body = (await request.json()) as AddEmergencyContactActionRequest;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const customerId = typeof body.customer_id === "string" ? body.customer_id.trim() : "";
    const anchorMemberId =
        typeof body.anchor_customer_member_id === "string" ? body.anchor_customer_member_id.trim() : "";
    const scope = parseScope(body.scope);
    const personId = typeof body.person_id === "string" ? body.person_id.trim() : "";
    const createPerson = body.create_person;

    if (!customerId || !anchorMemberId || !scope) {
        return NextResponse.json(
            { error: "customer_id, anchor_customer_member_id, and valid scope are required" },
            { status: 400 },
        );
    }
    if (!personId && !createPerson) {
        return NextResponse.json({ error: "person_id or create_person is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        const result = await executeAddEmergencyContactAction(supabase, {
            orgId: ctx.orgId,
            actorUserId: ctx.userId ?? null,
            customer_id: customerId,
            anchor_customer_member_id: anchorMemberId,
            scope,
            selected_customer_member_ids: Array.isArray(body.selected_customer_member_ids) ?
                body.selected_customer_member_ids.map(String)
            :   undefined,
            person_id: personId || undefined,
            create_person: createPerson,
            source_context: body.source_context,
        });
        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not add emergency contact.";
        const status =
            message.includes("not found") ? 404
            : message.includes("configured") || message.includes("required") ? 400
            :   500;
        return NextResponse.json({ error: message }, { status });
    }
}
