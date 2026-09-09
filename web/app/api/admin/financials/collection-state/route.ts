import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/financials/collection-state?attempt_id=…
 *
 * Where a card collection has got to, and nothing else.
 *
 * ── WHY THIS IS NOT A SECOND READ MODEL ──
 *
 * It reports no balance, no applied amount, no outstanding and no collectible-now. It answers only
 * "has the processor finished, and has Financials recognised it yet" — the interval between asking
 * for money and having it, which canonical Thread 8 truth deliberately knows nothing about because
 * an unrecognised collection is not a payment.
 *
 * The moment `recognized` is true the caller stops asking and reads the canonical Financials card
 * instead. That handover is the point: processor state answers the question only until there is a
 * real receipt, and then it stops being the answer.
 *
 * Org comes from the session, so an attempt belonging to another tenant resolves to nothing.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const attemptId = new URL(request.url).searchParams.get("attempt_id")?.trim();
    if (!attemptId) {
        return NextResponse.json({ error: "attempt_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("payment_collection_attempts")
        .select("id, processor_state, canonical_payment_id, requested_amount_cents, currency")
        .eq("org_id", ctx.orgId)
        .eq("id", attemptId)
        .maybeSingle();

    if (error) return NextResponse.json({ error: "state unavailable" }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

    const row = data as {
        processor_state: string;
        canonical_payment_id: string | null;
        requested_amount_cents: number;
        currency: string;
    };

    return NextResponse.json({
        ok: true,
        // Operator-facing meaning, not the raw column: the surface should not have to know the
        // provider's vocabulary to say something true.
        stage:
            row.canonical_payment_id
                ? "recognized"
                : row.processor_state === "succeeded"
                    ? "finalizing"
                    : row.processor_state === "failed" || row.processor_state === "canceled"
                        ? "failed"
                        : row.processor_state === "requires_action"
                            ? "requires_action"
                            : "processing",
        recognized: Boolean(row.canonical_payment_id),
        amountCents: row.requested_amount_cents,
        currency: row.currency,
    });
}
