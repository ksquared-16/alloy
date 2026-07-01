import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    isRelationshipActionKey,
    isRelationshipActionScope,
    type RelationshipActionExecutionRequest,
} from "@/lib/admin/relationship/relationshipActionContract";
import { executeRelationshipAction } from "@/lib/admin/relationship/executeRelationshipAction";
import { createAdminClient } from "@/lib/supabaseAdmin";

/** POST: execute a registered relationship action (confirmation required client-side). */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: RelationshipActionExecutionRequest = {} as RelationshipActionExecutionRequest;
    try {
        body = (await request.json()) as RelationshipActionExecutionRequest;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!isRelationshipActionKey(body.actionKey)) {
        return NextResponse.json({ error: "Invalid actionKey" }, { status: 400 });
    }
    if (!isRelationshipActionScope(body.scope)) {
        return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }
    if (!body.sourceCustomerId?.trim()) {
        return NextResponse.json({ error: "sourceCustomerId is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        const result = await executeRelationshipAction(supabase, {
            ...body,
            orgId: ctx.orgId,
            actorUserId: ctx.userId ?? null,
        });
        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Relationship action failed.";
        const status =
            message.includes("not found") ? 404
            : message.includes("configured") || message.includes("required") || message.includes("not allowed") ?
                400
            :   500;
        return NextResponse.json({ error: message }, { status });
    }
}
