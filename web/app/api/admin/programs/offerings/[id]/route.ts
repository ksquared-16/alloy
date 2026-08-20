import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import type { OfferingStatus } from "@/lib/programs/programOfferings";
import { operatorFriendlyProgramOfferingError } from "@/lib/programs/operatorFriendlyProgramOfferingError";

const VALID_STATUSES = new Set<OfferingStatus>([
    "active", "draft", "coming_soon", "seasonal", "retired", "archived",
]);

/**
 * PATCH /api/admin/programs/offerings/[id]
 * Update label, status, sort_order, effective_start, effective_end, is_active, metadata.
 * attendance_type changes are blocked if variants with rates exist, and rejected when
 * another offering already owns the same (org, program_key, attendance_type).
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.label !== undefined) {
        const label = String(body.label).trim();
        if (!label) return NextResponse.json({ error: "label cannot be empty" }, { status: 400 });
        patch.label = label;
    }
    if (body.status !== undefined) {
        if (!VALID_STATUSES.has(body.status as OfferingStatus)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        patch.status = body.status;
    }
    if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
    if (body.effective_start !== undefined) patch.effective_start = body.effective_start ?? null;
    if (body.effective_end !== undefined) patch.effective_end = body.effective_end ?? null;
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (body.metadata !== undefined) {
        patch.metadata =
            body.metadata != null && typeof body.metadata === "object" && !Array.isArray(body.metadata)
                ? body.metadata
                : {};
    }

    const supabase = createAdminClient();
    const { data: existingRow } = await supabase
        .from("program_offerings")
        .select("id, program_key, label, attendance_type")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (!existingRow) {
        return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    const existing = existingRow as {
        id: string;
        program_key: string;
        label: string;
        attendance_type: string;
    };

    if (body.attendance_type !== undefined) {
        const nextAttendance = String(body.attendance_type);
        const currentAttendance = String(existing.attendance_type ?? "");
        // Idempotent: same care format is not a change — do not block metadata/location saves.
        if (currentAttendance !== nextAttendance) {
            const { data: conflict } = await supabase
                .from("program_offerings")
                .select("id, label")
                .eq("org_id", ctx.orgId)
                .eq("program_key", existing.program_key)
                .eq("attendance_type", nextAttendance)
                .neq("id", id)
                .maybeSingle();
            if (conflict) {
                return NextResponse.json(
                    {
                        error: operatorFriendlyProgramOfferingError("program_offerings_unique", {
                            programLabel: existing.program_key,
                            careFormat: nextAttendance,
                            planName: String((conflict as { label?: string }).label ?? ""),
                        }),
                    },
                    { status: 409 },
                );
            }

            const { data: variantRows } = await supabase
                .from("program_offering_variants")
                .select("id")
                .eq("offering_id", id)
                .eq("org_id", ctx.orgId);
            const variantIds = (variantRows ?? []).map((v: { id: string }) => v.id);
            let rateCount = 0;
            if (variantIds.length > 0) {
                const { count } = await supabase
                    .from("commercial_tuition_rates")
                    .select("id", { count: "exact", head: true })
                    .in("variant_id", variantIds);
                rateCount = count ?? 0;
            }
            if (rateCount > 0) {
                return NextResponse.json(
                    {
                        error: operatorFriendlyProgramOfferingError(
                            "Cannot change attendance type — variants have rates. Remove rates first.",
                        ),
                    },
                    { status: 409 },
                );
            }
            patch.attendance_type = body.attendance_type;
        }
    }

    if (Object.keys(patch).length <= 1) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("program_offerings")
        .update(patch)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select(
            "id, org_id, program_key, label, attendance_type, status, effective_start, effective_end, sort_order, is_active, metadata, created_at, updated_at",
        )
        .maybeSingle();

    if (error) {
        return NextResponse.json(
            {
                error: operatorFriendlyProgramOfferingError(error.message, {
                    programLabel: existing.program_key,
                    careFormat: String(patch.attendance_type ?? existing.attendance_type),
                    planName: String(patch.label ?? existing.label),
                }),
            },
            { status: error.code === "23505" ? 409 : 400 },
        );
    }
    if (!data) return NextResponse.json({ error: "Offering not found" }, { status: 404 });

    logAdminAudit({
        entity: "program_offerings",
        id,
        changed_fields: Object.keys(patch).filter((k) => k !== "updated_at"),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ offering: data });
}

/**
 * DELETE /api/admin/programs/offerings/[id]
 * Soft-deletes (archives) if variants have rates; hard-deletes otherwise.
 * Cascades to program_offering_variants on hard delete.
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: existing } = await supabase
        .from("program_offerings")
        .select("id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (!existing) return NextResponse.json({ error: "Offering not found" }, { status: 404 });

    // Check for rates via variants
    const { data: variantIds } = await supabase
        .from("program_offering_variants")
        .select("id")
        .eq("offering_id", id)
        .eq("org_id", ctx.orgId);

    const ids = (variantIds ?? []).map((v: { id: string }) => v.id);
    let rateCount = 0;
    if (ids.length > 0) {
        const { count } = await supabase
            .from("commercial_tuition_rates")
            .select("id", { count: "exact", head: true })
            .in("variant_id", ids);
        rateCount = count ?? 0;
    }

    if (rateCount > 0) {
        await supabase
            .from("program_offerings")
            .update({ is_active: false, status: "archived", updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("org_id", ctx.orgId);
        return NextResponse.json({
            deleted: false,
            archived: true,
            reason: `Offering has ${rateCount} attached rate(s) via variants. Archived instead of deleted.`,
        });
    }

    const { error } = await supabase
        .from("program_offerings")
        .delete()
        .eq("id", id)
        .eq("org_id", ctx.orgId);

    if (error) {
        return NextResponse.json(
            { error: operatorFriendlyProgramOfferingError(error.message) },
            { status: 400 },
        );
    }

    logAdminAudit({
        entity: "program_offerings",
        id,
        changed_fields: ["deleted"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ deleted: true });
}
