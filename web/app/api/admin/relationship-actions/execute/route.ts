import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    isRelationshipActionKey,
    isRelationshipActionScope,
    type RelationshipActionExecutionRequest,
} from "@/lib/admin/relationship/relationshipActionContract";
import { executeRelationshipAction } from "@/lib/admin/relationship/executeRelationshipAction";
import { relationshipDefinitionForCommandKey } from "@/lib/fields/relationship/relationshipDefinitions";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST: execute a registered relationship action.
 *
 * GUARDED. The client is NOT authoritative for relationship authority. For any command backed by a
 * canonical Relationship Definition, the server derives the role from the definition and ignores a
 * client-supplied `roleKey`; a conflicting one is rejected outright rather than silently dropped, so
 * a spoof attempt surfaces instead of appearing to succeed under a different role.
 *
 * Previously this route spread the request body straight into the executor, so a caller could send
 * `actionKey: "add_emergency_contact"` with `roleKey: "guardian"` and have the guardian role written.
 * The command adapter has always pinned the role for fixed-role commands; this route did not, and it
 * is the live UI path for the relationship modals.
 *
 * Still server-owned regardless of payload: `orgId` and `actorUserId` (from the session),
 * `executorKind` and `writeTargets` (from the action registry, which derives from the definition),
 * and scope legality (validated against the definition's supported scopes).
 *
 * @see docs/platform/core/data/relationship-model.md
 */
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

    // ── server-derived relationship authority ────────────────────────────────────────────────────
    const definition = relationshipDefinitionForCommandKey(body.actionKey);
    let roleKey = body.roleKey;
    if (definition) {
        const requested = body.roleKey?.trim();
        if (requested && requested !== definition.operational_role_key) {
            return NextResponse.json(
                {
                    error: `Role is determined by the relationship definition for "${body.actionKey}" and cannot be supplied by the client.`,
                    code: "client_role_not_authoritative",
                },
                { status: 400 },
            );
        }
        // Authority comes from the definition, never the payload.
        roleKey = definition.operational_role_key;

        if (!definition.scopes.includes(body.scope)) {
            return NextResponse.json(
                {
                    error: `Scope "${body.scope}" is not supported by the ${definition.label} relationship.`,
                    code: "scope_not_supported",
                },
                { status: 400 },
            );
        }
    }

    const supabase = createAdminClient();
    try {
        const result = await executeRelationshipAction(supabase, {
            ...body,
            roleKey,
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
