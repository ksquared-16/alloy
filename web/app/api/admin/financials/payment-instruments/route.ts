/**
 * PAYER-OWNED PAYMENT INSTRUMENTS — the bounded operator surface.
 *
 * Exists so instrument ownership can be exercised and certified. It does NOT collect payment and is
 * not a checkout: it records a token the provider already holds, reads the instruments ONE payer may
 * reuse, reads the account's instruments for an operator, claims an unowned legacy row, and revokes.
 *
 * The two reads are deliberately different endpoints rather than one with a flag, because a
 * participant and an administrator are different audiences and one function with a parameter is how
 * they end up sharing a query — which is how the other parent's card leaks.
 */
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    claimLegacyInstrument,
    listAccountInstrumentsForOperator,
    listReusableInstrumentsForPayer,
    recordPaymentInstrument,
    revokePaymentInstrument,
    type PaymentInstrumentRail,
} from "@/lib/financials/payments/instruments/paymentInstrumentOwnership";

export const dynamic = "force-dynamic";

const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const url = new URL(request.url);
    const customerId = t(url.searchParams.get("customer_id"));
    const payerPersonId = t(url.searchParams.get("payer_person_id"));
    if (!customerId) return NextResponse.json({ error: "customer_id is required" }, { status: 400 });

    const supabase = createAdminClient();
    try {
        /*
         * A payer id present means the PARTICIPANT read: only what that payer may reuse. Absent means
         * the operator read, which legitimately includes rows nobody owns.
         */
        const instruments = payerPersonId
            ? await listReusableInstrumentsForPayer(supabase, { orgId: ctx.orgId, customerId, payerPersonId })
            : await listAccountInstrumentsForOperator(supabase, { orgId: ctx.orgId, customerId });
        return NextResponse.json({ data: { scope: payerPersonId ? "payer" : "operator", instruments } });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to read instruments" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const action = t(body.action) || "record";
    const supabase = createAdminClient();

    try {
        if (action === "revoke") {
            const res = await revokePaymentInstrument(supabase, {
                orgId: ctx.orgId,
                instrumentId: t(body.instrument_id),
                actorUserId: ctx.userId ?? null,
            });
            return res.ok ? NextResponse.json({ data: { revoked: true } }) : NextResponse.json({ error: res.reason }, { status: 422 });
        }

        if (action === "claim") {
            const res = await claimLegacyInstrument(supabase, {
                orgId: ctx.orgId,
                instrumentId: t(body.instrument_id),
                ownerPersonId: t(body.owner_person_id),
                actorUserId: ctx.userId ?? null,
            });
            return res.ok ? NextResponse.json({ data: { claimed: true } }) : NextResponse.json({ error: res.reason }, { status: 422 });
        }

        if (action !== "record") return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

        const rail = t(body.rail) as PaymentInstrumentRail;
        if (rail !== "card" && rail !== "us_bank_account") {
            return NextResponse.json({ error: 'rail must be "card" or "us_bank_account"' }, { status: 400 });
        }
        const ref = t(body.provider_instrument_ref);
        if (!t(body.customer_id) || !ref) {
            return NextResponse.json({ error: "customer_id and provider_instrument_ref are required" }, { status: 400 });
        }
        /*
         * A CREDENTIAL IS REFUSED AT THE DOOR, not merely unstored. A caller sending a PAN or a bank
         * number has misunderstood the boundary, and accepting it quietly would put it in a log.
         */
        for (const forbiddenKey of ["card_number", "pan", "cvc", "cvv", "account_number", "routing_number"]) {
            if (forbiddenKey in body) {
                return NextResponse.json(
                    { error: `Raw payment credentials are never accepted (${forbiddenKey}). The provider holds them; Alloy holds a token.` },
                    { status: 400 },
                );
            }
        }

        const res = await recordPaymentInstrument(supabase, {
            orgId: ctx.orgId,
            customerId: t(body.customer_id),
            ownerPersonId: t(body.owner_person_id) || null,
            rail,
            providerInstrumentRef: ref,
            providerCustomerRef: t(body.provider_customer_ref) || null,
            reusable: body.reusable === true,
            verificationState: t(body.verification_state) || null,
            mandateReference: t(body.mandate_reference) || null,
            brand: t(body.brand) || null,
            last4: t(body.last4) || null,
            legacyCustomerPaymentMethodId: t(body.legacy_customer_payment_method_id) || null,
            actorUserId: ctx.userId ?? null,
        });
        return res.ok
            ? NextResponse.json({ data: { id: res.id } }, { status: 201 })
            : NextResponse.json({ error: res.reason }, { status: 422 });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}
