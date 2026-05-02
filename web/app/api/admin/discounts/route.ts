import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    createDiscountProgram,
    listDiscountProgramsAdmin,
    validateDiscountProgramPayload,
} from "@/lib/admin/discountProgramAdmin";
import { NextRequest, NextResponse } from "next/server";

/** GET: list discount programs (discount_programs_admin_v). */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const supabase = createAdminClient();
    const { data, error } = await listDiscountProgramsAdmin(supabase);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
}

/** POST: create discount program (+ primary benefit, optional qualifier, commitment rule). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = validateDiscountProgramPayload(body, "create");
    if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    try {
        const supabase = createAdminClient();
        const row = await createDiscountProgram(supabase, ctx.orgId, parsed.value);
        return NextResponse.json(row, { status: 201 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Create failed";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
