import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { normalizeStatusDefinitionMetadata } from "@/lib/admin/normalizeStatusMetadata";
import { revalidateEffectiveStatusDefinitionsCache } from "@/lib/admin/statusDefinitionsCache";
import {
    planStatusDefinitionDelete,
    statusDefinitionDeleteMessage,
    type StatusDefinitionDeleteAction,
} from "@/lib/admin/statusDefinitionDeletePlan";
import { logDbTiming } from "@/lib/admin/dbQueryTiming";

const ALLOWED_PATCH_KEYS = ["status_label", "sort_order", "is_active", "metadata"] as const;

/** PATCH: update status_definition (label, sort_order, is_active only). Admin only. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("status_definitions")
        .select("id, org_id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Status definition not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_PATCH_KEYS) {
        if (body[key] === undefined) continue;
        if (key === "status_label") {
            updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() || null : null;
            continue;
        }
        if (key === "sort_order") {
            const v = body[key];
            updates[key] = typeof v === "number" && !Number.isNaN(v) ? v : Number(v);
            continue;
        }
        if (key === "is_active") {
            updates[key] = !!body[key];
            continue;
        }
        if (key === "metadata") {
            updates[key] = normalizeStatusDefinitionMetadata(body[key]);
            continue;
        }
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
        .from("status_definitions")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }
    if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    revalidateEffectiveStatusDefinitionsCache(ctx.orgId);

    logAdminAudit({
        entity: "status_definitions",
        id,
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(updated);
}

export type StatusDefinitionDeleteResponse = {
    action: StatusDefinitionDeleteAction;
    message: string;
    warnings: string[];
    status?: Record<string, unknown>;
};

/**
 * DELETE: hard delete when unused and not referenced in BP config;
 * inactivate when used or system; block hard delete when referenced in BP config only.
 */
export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const t0 = Date.now();
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("status_definitions")
        .select("id, org_id, entity_type, status_key, is_system, is_active")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Status definition not found" }, { status: 404 });
    }

    const row = existing as {
        id: string;
        org_id: string;
        entity_type: string;
        status_key: string;
        is_system: boolean;
        is_active: boolean;
    };

    const tPlan0 = Date.now();
    const plan = await planStatusDefinitionDelete({
        supabase,
        orgId: ctx.orgId,
        row,
    });
    logDbTiming("status_definitions.delete_plan", Date.now() - tPlan0, {
        orgId: ctx.orgId,
        statusKey: row.status_key,
        action: plan.action,
        inUse: plan.inUse,
        configRefs: plan.configReferences.length,
    });

    if (plan.blockHardDelete && plan.action === "deleted") {
        logDbTiming("status_definitions.delete_blocked", Date.now() - t0, { orgId: ctx.orgId, id });
        return NextResponse.json(
            {
                error: plan.blockReason,
                warnings: plan.warnings,
            },
            { status: 409 },
        );
    }

    if (plan.action === "inactivated") {
        const { data: updated, error: updateErr } = await supabase
            .from("status_definitions")
            .update({ is_active: false })
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (updateErr) {
            return NextResponse.json({ error: updateErr.message }, { status: 400 });
        }

        revalidateEffectiveStatusDefinitionsCache(ctx.orgId);

        logAdminAudit({
            entity: "status_definitions",
            id,
            changed_fields: ["is_active"],
            actor_user_id: ctx.userId,
            role: ctx.role,
        });

        logDbTiming("status_definitions.delete_inactivated", Date.now() - t0, { orgId: ctx.orgId, id });

        const response: StatusDefinitionDeleteResponse = {
            action: "inactivated",
            message: statusDefinitionDeleteMessage("inactivated", plan.inUse),
            warnings: plan.warnings,
            status: updated as Record<string, unknown>,
        };
        return NextResponse.json(response);
    }

    const { error: deleteErr } = await supabase
        .from("status_definitions")
        .delete()
        .eq("id", id)
        .eq("org_id", ctx.orgId);

    if (deleteErr) {
        return NextResponse.json({ error: deleteErr.message }, { status: 400 });
    }

    revalidateEffectiveStatusDefinitionsCache(ctx.orgId);

    logAdminAudit({
        entity: "status_definitions",
        id,
        changed_fields: ["delete"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    logDbTiming("status_definitions.delete_hard", Date.now() - t0, { orgId: ctx.orgId, id });

    const response: StatusDefinitionDeleteResponse = {
        action: "deleted",
        message: statusDefinitionDeleteMessage("deleted", false),
        warnings: plan.warnings,
    };
    return NextResponse.json(response);
}
