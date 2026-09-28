/**
 * THE PARENT'S WAY TO ACTUALLY PAY — the one thing the fee requirement was missing.
 *
 * A family could be shown "$150.00 due" and had no way to settle it: there was no public route
 * anywhere that recorded a payment against a childcare charge. Everything else already existed and
 * is reused unchanged — the obligation, the amount, the collectible ceiling, the payer invariant,
 * the PaymentIntent, the provider-confirmed recognition, the canonical payment and its application.
 * This route is the reach, not a second payment system.
 *
 * ── WHAT THE BROWSER MAY DECIDE, AND WHAT IT MAY NOT ──
 *
 * It may decide which obligation to pay, how much, which rail, and which of the payer's OWN saved
 * methods to use. It may not decide who the payer is (resolved from the link's canonical recipient),
 * what is collectible (Financials'), what the currency is (the obligation's), whether a method is
 * usable (`payment_methods`), or whether money arrived (the provider, read server-side).
 *
 * The obligation set is recomputed from the token's own projection on every request, and a named
 * charge must be a member of it. So a manipulated `charge_id` never reaches the engine — the
 * engine's own org and account scoping is the second line rather than the only one.
 *
 * ── WHY A SUCCESSFUL BROWSER CONFIRMATION IS NOT A PAYMENT ──
 *
 * `POST action=recognize` does not accept the browser's word that the card succeeded. It calls
 * `recognizeCollectionAttempt`, which reads the PaymentIntent from Stripe on the server and posts
 * canonically only if the provider says it settled. That call is idempotent and safe concurrently,
 * so the webhook arriving first, second, or twice changes nothing — whoever gets there first writes
 * the one payment, and everyone else is told it already exists.
 */

import { NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import {
    householdIdFromSession,
    resolveFamilyEnrollmentExperience,
} from "@/lib/enrollment/family/resolveFamilyEnrollmentExperience";
import {
    buildParticipantPaymentView,
    payableChargeIds,
    resolveParticipantPayer,
} from "@/lib/enrollment/financial/participantEnrollmentPayment";
import { readPayerUsableMethods } from "@/lib/financials/payments/paymentMethodService";
import { resolveCollectionMerchant } from "@/lib/financials/payments/providerMerchant";
import { createCardCollection } from "@/lib/financials/payments/collectionAttempt";
import { recognizeCollectionAttempt } from "@/lib/financials/payments/collectionRecognition";
import { stripePublishableKey } from "@/lib/financials/payments/stripePublishableKey";

export const dynamic = "force-dynamic";

type Loaded = {
    orgId: string;
    linkId: string;
    customerId: string;
    view: ReturnType<typeof buildParticipantPaymentView>;
    payable: ReadonlySet<string>;
    payerPersonId: string | null;
};

/**
 * Everything both verbs need, resolved the same way in both.
 *
 * A GET that composed the view one way and a POST that authorised against another would be the
 * classic hole: shown one set of obligations, allowed to pay a different one.
 */
async function load(token: string, rail: "card" | "ach"): Promise<
    { ok: true; value: Loaded; supabase: ReturnType<typeof createServiceRoleClient> }
    | { ok: false; status: number; message: string }
> {
    const supabase = createServiceRoleClient();
    const access = await resolveParticipantEnrollmentFromToken(supabase, token);
    if (!access.ok) {
        return {
            ok: false,
            status: access.error.code === "INVALID_LINK" ? 404 : 409,
            message: access.error.message,
        };
    }

    const session = access.value.session as unknown as Record<string, unknown>;
    const customerId = householdIdFromSession(session as never);
    if (!customerId) return { ok: false, status: 409, message: "This session names no household." };

    const family = await resolveFamilyEnrollmentExperience(supabase, {
        orgId: access.value.orgId,
        session: session as never,
        focusedCustomerMemberId:
            typeof (session.crm_snapshot as Record<string, unknown> | null)?.customer_member_id === "string"
                ? ((session.crm_snapshot as Record<string, unknown>).customer_member_id as string)
                : null,
    });
    if (!family.ok) return { ok: false, status: 409, message: "This family has no live enrolment journey." };
    const projection = family.projection;
    if (!projection) return { ok: false, status: 500, message: "The fee projection could not be read." };

    const payer = await resolveParticipantPayer(supabase, {
        orgId: access.value.orgId,
        linkId: access.value.linkId,
        customerId,
    });

    /*
     * Methods are read for the PAYER, not the household, and only usable ones. `readAccountMethods`
     * would have returned the co-parent's card and every revoked one with it.
     */
    const methods = payer
        ? await readPayerUsableMethods(supabase, {
              orgId: access.value.orgId,
              payerEntityType: "person",
              payerEntityId: payer.personId,
              customerId,
              rail,
          })
        : [];

    const merchantResolution = await resolveCollectionMerchant(supabase, access.value.orgId);
    const merchant = merchantResolution.ok ? merchantResolution.merchant : null;

    const childNames = new Map<string, string>(
        family.value.children.map((c) => [c.customerMemberId, c.displayName]),
    );

    return {
        ok: true,
        supabase,
        value: {
            orgId: access.value.orgId,
            linkId: access.value.linkId,
            customerId,
            view: buildParticipantPaymentView({ projection, payer, methods, merchant, childNames }),
            payable: payableChargeIds(projection),
            payerPersonId: payer?.personId ?? null,
        },
    };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const rail = request.nextUrl.searchParams.get("rail") === "ach" ? "ach" : "card";
    try {
        const loaded = await load(token, rail);
        if (!loaded.ok) return publicErr(loaded.message, loaded.status);
        return publicOk({
            payment: loaded.value.view,
            // The browser needs this to mount Stripe's own fields. It is a publishable key: public
            // by design, and never a credential Alloy owns.
            publishableKey: loaded.value.view.rails.length ? stripePublishableKey() : null,
        });
    } catch (e) {
        return publicErr(e instanceof Error ? e.message : "The payment view could not be read.", 500);
    }
}

type Body = {
    action?: string;
    charge_id?: string;
    amount_cents?: number;
    rail?: string;
    /** One of the PAYER's own saved methods, by canonical Alloy id. Never a provider reference. */
    payment_method_id?: string | null;
    attempt_id?: string;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return publicErr("Invalid request.", 400);
    }

    const action = String(body.action ?? "collect").trim();
    const rail = String(body.rail ?? "card").trim() === "ach" ? "ach" : "card";

    try {
        const loaded = await load(token, rail);
        if (!loaded.ok) return publicErr(loaded.message, loaded.status);
        const { orgId, customerId, view, payable, payerPersonId } = loaded.value;
        const supabase = loaded.supabase;

        if (action === "recognize") {
            /*
             * The browser reporting success is a PROMPT to look, never the finding. This reads the
             * intent from Stripe on the server and posts only what the provider confirms.
             */
            const attemptId = String(body.attempt_id ?? "").trim();
            if (!attemptId) return publicErr("No payment was named.", 400);
            const recognized = await recognizeCollectionAttempt(supabase, { orgId, attemptId });
            if (!recognized.ok) {
                // `not_settled` is an ordinary answer for ACH and for a card still processing: the
                // attempt is real and the money has not arrived. It is not an error the parent caused.
                const status = recognized.reason === "not_settled" ? 202 : 409;
                return publicOk(
                    { recognized: false, reason: recognized.reason, message: recognized.message },
                    status,
                );
            }
            return publicOk({ recognized: recognized.recognized, paymentId: recognized.paymentId });
        }

        if (action !== "collect") return publicErr("Unsupported action.", 400);

        if (!view.payable || !payerPersonId) {
            return publicErr(view.unpayableReason ?? "Nothing is payable on this fee right now.", 409);
        }

        const chargeId = String(body.charge_id ?? "").trim();
        if (!chargeId || !payable.has(chargeId)) {
            // Not "forbidden": an obligation outside this family's own journey is simply not
            // something this link knows about.
            return publicErr("That fee is not payable from this link.", 404);
        }

        const requested = Number(body.amount_cents);
        if (!Number.isInteger(requested) || requested <= 0) {
            return publicErr("Enter an amount to pay.", 400);
        }

        const collection = await createCardCollection(supabase, {
            orgId,
            chargeId,
            requestedAmountCents: requested,
            // Always sent. This is what arms the engine's payer invariant: with a payer named, a
            // stored method owned by anybody else is refused rather than quietly charged.
            payerPersonId,
            rail,
            paymentMethodId:
                typeof body.payment_method_id === "string" && body.payment_method_id.trim()
                    ? body.payment_method_id.trim()
                    : null,
        });

        if (!collection.ok) {
            const status =
                collection.reason === "amount_exceeds_collectible" || collection.reason === "charge_not_collectible"
                    ? 409
                    : collection.reason === "method_not_found" || collection.reason === "charge_not_found"
                      ? 404
                      : 400;
            return publicErr(collection.message, status);
        }

        return publicOk({
            attemptId: collection.attemptId,
            clientSecret: collection.clientSecret,
            connectedAccountRef: collection.connectedAccountRef,
            publishableKey: stripePublishableKey(),
            amountCents: collection.amountCents,
            currency: collection.currency,
            /** True when this intent already existed — a retry, never a second charge. */
            reused: collection.reused,
            // Echoed so the caller can prove which account it is settling, without being able to
            // choose one.
            customerId,
        });
    } catch (e) {
        return publicErr(e instanceof Error ? e.message : "The payment could not be started.", 500);
    }
}
