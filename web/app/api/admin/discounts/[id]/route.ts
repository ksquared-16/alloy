import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    deleteDiscountProgram,
    updateDiscountProgram,
    validateDiscountProgramPayload,
} from "@/lib/admin/discountProgramAdmin";
import { evaluateDeletionEligibility } from "@/lib/admin/deletionEligibility";
import { NextRequest, NextResponse } from "next/server";

/** DELETE: remove discount program and related benefit/qualifier/commitment rows (not legacy discount_codes). */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const eligibility = await evaluateDeletionEligibility("discounts", id, {});
    if (!eligibility.allowed) {
        return NextResponse.json(
            { error: eligibility.reason, recommended_action: eligibility.recommended_action },
            { status: 409 }
        );
    }

    try {
        const supabase = createAdminClient();
        await deleteDiscountProgram(supabase, id);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Delete failed";
        return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
}

/** PATCH: update program + upsert primary benefit, vertical qualifier, commitment rule when applicable. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = validateDiscountProgramPayload(body, "update");
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
        const supabase = createAdminClient();
        const row = await updateDiscountProgram(supabase, id, parsed.value);
        return NextResponse.json(row);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Update failed";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
