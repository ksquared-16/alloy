import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { collectionLifecycle, retryAvailable } from "@/lib/financials/payments/collectionLifecycle";

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

    const allowedRead = await assertFinancialsReadAllowed({
        supabase: createAdminClient(),
        orgId: ctx.orgId,
        userId: ctx.userId,
    });
    if (!allowedRead.ok) {
        return NextResponse.json(
            { error: allowedRead.message, required_permission: allowedRead.requiredPermission },
            { status: 403 },
        );
    }

    const attemptId = new URL(request.url).searchParams.get("attempt_id")?.trim();
    if (!attemptId) {
        return NextResponse.json({ error: "attempt_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("payment_collection_attempts")
        .select("id, processor_state, canonical_payment_id, requested_amount_cents, currency, rail, provider_action_type, last_provider_detail")
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
        rail: string | null;
        provider_action_type: string | null;
        last_provider_detail: { failure_code?: unknown; decline_code?: unknown } | null;
    };

    /*
     * ONE VOCABULARY. This used to map every state it did not name — `initiated`,
     * `requires_payment_method` — to "processing", so a saved card declined at confirmation (left
     * `initiated` with no provider id) read as money on its way, indefinitely. The shared lifecycle
     * module decides instead, and a decline now arrives here as `failed` with its reason.
     */
    const lifecycle = collectionLifecycle({
        rail: row.rail === "ach" ? "ach" : "card",
        processorState: row.processor_state,
        providerActionType: row.provider_action_type,
        canonicallyRecognized: Boolean(row.canonical_payment_id),
        providerFailureCode: typeof row.last_provider_detail?.failure_code === "string"
            ? row.last_provider_detail.failure_code
            : null,
        providerDeclineCode: typeof row.last_provider_detail?.decline_code === "string"
            ? row.last_provider_detail.decline_code
            : null,
    });

    return NextResponse.json({
        ok: true,
        // Operator-facing meaning, not the raw column: the surface should not have to know the
        // provider's vocabulary to say something true.
        stage:
            lifecycle === "received"
                ? "recognized"
                : lifecycle === "finalizing"
                    ? "finalizing"
                    : lifecycle === "declined"
                        ? "declined"
                        : lifecycle === "failed" || lifecycle === "canceled"
                            ? "failed"
                            : lifecycle === "action_required" || lifecycle === "verification_required"
                                ? "requires_action"
                                : lifecycle === "selected"
                                    ? "awaiting_payment"
                                    : "processing",
        /** Nothing was collected and a new attempt may be started. The balance is unchanged. */
        retryAvailable: retryAvailable(lifecycle),
        recognized: Boolean(row.canonical_payment_id),
        amountCents: row.requested_amount_cents,
        currency: row.currency,
    });
}
