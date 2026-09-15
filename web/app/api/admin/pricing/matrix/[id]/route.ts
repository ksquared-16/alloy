import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { FINANCIALS_WRITE_PERMISSION_KEY, requireFinancialsCapability } from "@/lib/financials/financialsPermissions";

/** PATCH: update amount_cents and/or is_active on a pricing_matrix row. */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireFinancialsCapability(ctx, FINANCIALS_WRITE_PERMISSION_KEY);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: { amount?: number; amount_cents?: number; is_active?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.amount_cents !== undefined) {
        const n = Number(body.amount_cents);
        updates.amount_cents = Number.isNaN(n) ? 0 : Math.max(0, Math.round(n));
    }
    if (body.amount !== undefined) {
        const n = Number(body.amount);
        updates.amount_cents = Number.isNaN(n) ? 0 : Math.max(0, Math.round(n * 100));
    }
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

    (updates as { updated_at: string }).updated_at = new Date().toISOString();

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("pricing_matrix")
        .update(updates)
        .eq("id", id)
        /*
         * THE TENANT PREDICATE, not decoration.
         *
         * This runs on `createAdminClient()` — a service-role client, so RLS is not enforcing
         * anything here. Matching on `id` alone let a principal in one organization rewrite another
         * organization's price by knowing its row id. `pricing_matrix.org_id` is NOT NULL and is a
         * foreign key to `orgs`, so the row's tenant is unambiguous and `ctx.orgId` is the
         * authenticated organization rather than caller input.
         */
        .eq("org_id", ctx.orgId)
        .select("id, amount_cents, is_active, updated_at")
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    /*
     * A ROW IN ANOTHER ORGANIZATION IS NOT FOUND, NOT A SERVER ERROR.
     *
     * With the tenant predicate in place, a cross-organization id simply matches nothing, and
     * `.single()` turns "no rows" into a thrown PostgREST error that surfaced as a 500. The write is
     * correctly refused either way, but answering 500 tells the caller the server broke when what
     * happened is that the resource is not theirs — and it would bury a genuine failure in the same
     * status. `maybeSingle()` lets the empty case be what it is.
     */
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data ?? { ok: true });
}
