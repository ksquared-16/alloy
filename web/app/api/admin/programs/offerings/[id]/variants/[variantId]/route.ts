import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import type { QuantityType, VariantStatus } from "@/lib/programs/programOfferingVariants";

const VALID_QUANTITY_TYPES = new Set<QuantityType>([
    "days", "hours", "sessions", "weeks", "months",
]);

const VALID_STATUSES = new Set<VariantStatus>([
    "active", "draft", "coming_soon", "seasonal", "retired", "archived",
]);

const SELECT_COLS =
    "id, org_id, offering_id, label, quantity_type, quantity_value, sort_order, is_active, status, metadata, created_at, updated_at";

/**
 * PATCH /api/admin/programs/offerings/[id]/variants/[variantId]
 * Update label, sort_order, status, is_active.
 * Quantity fields (quantity_type, quantity_value) are blocked when rates exist.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; variantId: string }> },
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }
    if (!["admin", "ops"].includes(ctx.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: offeringId, variantId } = await params;

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.label !== undefined) {
        patch.label = body.label != null ? String(body.label).trim() || null : null;
    }
    if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (body.status !== undefined) {
        if (!VALID_STATUSES.has(body.status as VariantStatus)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        patch.status = body.status;
    }
    if (body.metadata !== undefined) {
        patch.metadata =
            body.metadata != null && typeof body.metadata === "object" && !Array.isArray(body.metadata)
                ? body.metadata
                : {};
    }

    // Quantity fields — blocked when rates exist
    const quantityFields = (["quantity_type", "quantity_value"] as const).filter(
        (f) => body[f] !== undefined,
    );
    if (quantityFields.length > 0) {
        if (body.quantity_type !== null && !VALID_QUANTITY_TYPES.has(body.quantity_type as QuantityType)) {
            return NextResponse.json({ error: "Invalid quantity_type" }, { status: 400 });
        }
        const supabase = createAdminClient();
        const { count } = await supabase
            .from("commercial_tuition_rates")
            .select("id", { count: "exact", head: true })
            .eq("variant_id", variantId);
        if (count && count > 0) {
            return NextResponse.json(
                { error: "Cannot change quantity — rates exist for this variant. Remove rates first." },
                { status: 409 },
            );
        }
        for (const f of quantityFields) {
            patch[f] = body[f] ?? null;
        }
    }

    if (Object.keys(patch).length <= 1) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("program_offering_variants")
        .update(patch)
        .eq("id", variantId)
        .eq("offering_id", offeringId)
        .eq("org_id", ctx.orgId)
        .select(SELECT_COLS)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

    logAdminAudit({
        entity: "program_offering_variants",
        id: variantId,
        changed_fields: Object.keys(patch).filter((k) => k !== "updated_at"),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ variant: data });
}

/**
 * DELETE /api/admin/programs/offerings/[id]/variants/[variantId]
 * Soft-deletes (archives) if rates exist; hard-deletes otherwise.
 * The last active variant of an offering cannot be deleted (would leave offering unrateable).
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; variantId: string }> },
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }
    if (!["admin"].includes(ctx.role)) {
        return NextResponse.json({ error: "Forbidden — admin required" }, { status: 403 });
    }

    const { id: offeringId, variantId } = await params;
    const supabase = createAdminClient();

    const { data: existing } = await supabase
        .from("program_offering_variants")
        .select("id, is_active")
        .eq("id", variantId)
        .eq("offering_id", offeringId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (!existing) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

    // Guard: cannot delete the last active variant
    const { count: activeCount } = await supabase
        .from("program_offering_variants")
        .select("id", { count: "exact", head: true })
        .eq("offering_id", offeringId)
        .eq("org_id", ctx.orgId)
        .eq("is_active", true);

    if ((activeCount ?? 0) <= 1 && (existing as { is_active: boolean }).is_active) {
        return NextResponse.json(
            { error: "Cannot delete the last active variant. Archive the offering instead." },
            { status: 409 },
        );
    }

    // Check for rates
    const { count: rateCount } = await supabase
        .from("commercial_tuition_rates")
        .select("id", { count: "exact", head: true })
        .eq("variant_id", variantId);

    if (rateCount && rateCount > 0) {
        await supabase
            .from("program_offering_variants")
            .update({ is_active: false, status: "archived", updated_at: new Date().toISOString() })
            .eq("id", variantId)
            .eq("org_id", ctx.orgId);
        return NextResponse.json({
            deleted: false,
            archived: true,
            reason: `Variant has ${rateCount} attached rate(s). Archived instead of deleted.`,
        });
    }

    const { error } = await supabase
        .from("program_offering_variants")
        .delete()
        .eq("id", variantId)
        .eq("org_id", ctx.orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    logAdminAudit({
        entity: "program_offering_variants",
        id: variantId,
        changed_fields: ["deleted"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ deleted: true });
}
