/**
 * THE PAYER AUTHORIZES THEIR OWN BANK ACCOUNT — the one act an operator may not perform for them.
 *
 * It adds no payment-method machinery. `beginAddPaymentMethod` and `completeAddPaymentMethod` are
 * the platform's only writers of a stored instrument, and they are reused here exactly as the
 * operator's card surface uses them: same table, same provider integration, same canonical row.
 * What is different is WHO is holding the browser.
 *
 * ── WHAT THE BROWSER MAY DECIDE, AND WHAT IT MAY NOT ──
 *
 * It may start a setup, and it may hand back the setup reference it was given. It may not decide
 * WHO the payer is (named on the link), which organisation this is (named on the link), which
 * account the method belongs to (named on the link), which platform customer it attaches to
 * (re-derived on the server), whether the bank agreed (read from the provider with Alloy's own
 * key), or whether the result is usable (`lifecycleFromSetup`).
 *
 * ── AND WHAT ALLOY NEVER SEES ──
 *
 * The routing number, the account number and the bank login never reach this process. The payer
 * types them into the provider's own fields in their own browser against a client secret; what
 * comes back is a reference and four display facts. Microdeposit amounts are the same — the payer
 * confirms them with the provider directly, `setup_intent.succeeded` reaches the webhook, and the
 * canonical method flips to verified without those numbers ever being posted here. There is no
 * parameter on this route that would accept any of them, which is the only durable form of that
 * promise.
 *
 * ── THE OPERATOR IS NOT IN THIS FILE ──
 *
 * That is the point. `requested_by_user_id` rides along on the link as provenance and is never
 * read as authority; the method that results belongs to the person the link names.
 */

import { NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import {
    consumeBankSetupLink,
    resolveBankSetupLink,
    type ResolvedBankSetupLink,
} from "@/lib/financials/payments/bankSetupRequest";
import {
    buildParticipantBankSetupView,
    participantMethodView,
    type ParticipantBankSetupView,
} from "@/lib/enrollment/financial/participantBankSetup";
import {
    beginAddPaymentMethod,
    completeAddPaymentMethod,
    readPayerOwnMethods,
} from "@/lib/financials/payments/paymentMethodService";
import { resolveCollectionMerchant } from "@/lib/financials/payments/providerMerchant";
import { stripePublishableKey } from "@/lib/financials/payments/stripePublishableKey";

export const dynamic = "force-dynamic";

/**
 * The payer's own name, for the provider's fields and for the page's own heading.
 *
 * The table is `persons`. An earlier draft read `people`, which does not exist — PostgREST answered
 * with an error, the name came back empty, and deployed staging showed a bank-authorization page
 * addressed to nobody. A payer about to authorize a standing debit is entitled to see whose
 * authorization this is, so an empty name is a defect rather than a cosmetic gap.
 *
 * It stays non-fatal: the name is a PREFILL and a courtesy, never the identity. The identity is the
 * link's `entity_id`, and it is resolved without reading this at all.
 */
async function payerName(
    supabase: ReturnType<typeof createServiceRoleClient>,
    orgId: string,
    personId: string,
): Promise<string> {
    const { data } = await supabase
        .from("persons")
        .select("first_name, last_name")
        .eq("org_id", orgId)
        .eq("id", personId)
        .maybeSingle();
    const row = (data ?? {}) as { first_name?: string | null; last_name?: string | null };
    return [row.first_name, row.last_name].map((p) => (p ?? "").trim()).filter(Boolean).join(" ");
}

type Loaded = {
    link: ResolvedBankSetupLink;
    view: ParticipantBankSetupView;
};

/**
 * Everything both verbs need, resolved once and the same way in both.
 *
 * A GET that decided the payer one way and a POST that wrote with another is the whole class of
 * defect this shape exists to make impossible.
 */
async function load(token: string): Promise<
    { ok: true; value: Loaded; supabase: ReturnType<typeof createServiceRoleClient> }
    | { ok: false; status: number; message: string; reason: string }
> {
    const supabase = createServiceRoleClient();
    const resolved = await resolveBankSetupLink(supabase, token);
    if (!resolved.ok) {
        /*
         * `unknown` is a 404 and every other refusal is a 409. A link this server does not
         * recognise is not "forbidden": saying so would confirm to a stranger that some other token
         * exists. Expired, used and revoked are real links in a state that has a next step.
         */
        return {
            ok: false,
            reason: resolved.reason,
            status: resolved.reason === "unknown" ? 404 : 409,
            message: resolved.message,
        };
    }
    const link = resolved.link;

    const [methods, merchantResolution, name] = await Promise.all([
        readPayerOwnMethods(supabase, {
            orgId: link.orgId,
            payerEntityType: "person",
            payerEntityId: link.payerEntityId,
            customerId: link.customerId,
            rail: "ach",
        }),
        resolveCollectionMerchant(supabase, link.orgId),
        payerName(supabase, link.orgId, link.payerEntityId),
    ]);

    return {
        ok: true,
        supabase,
        value: {
            link,
            view: buildParticipantBankSetupView({
                payer: { personId: link.payerEntityId, name },
                methods,
                merchant: merchantResolution.ok ? merchantResolution.merchant : null,
            }),
        },
    };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    try {
        const loaded = await load(token);
        if (!loaded.ok) return publicOk({ bankSetup: null, reason: loaded.reason, message: loaded.message }, loaded.status);
        return publicOk({
            bankSetup: loaded.value.view,
            // Needed to mount the provider's own fields. Publishable by design, never a credential.
            publishableKey: loaded.value.view.canAddBankAccount ? stripePublishableKey() : null,
        });
    } catch (e) {
        return publicErr(e instanceof Error ? e.message : "This page could not be loaded.", 500);
    }
}

type Body = {
    action?: string;
    /** Echoed back from `begin`. Alloy re-reads it from the provider and checks whose it is. */
    setup_ref?: string;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;

    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return publicErr("Invalid request.", 400);
    }
    const action = String(body.action ?? "").trim();

    try {
        const loaded = await load(token);
        if (!loaded.ok) return publicErr(loaded.message, loaded.status);
        const { link, view } = loaded.value;
        const supabase = loaded.supabase;

        if (!view.canAddBankAccount) {
            return publicErr(view.unavailableReason ?? "A bank account cannot be saved from this link.", 409);
        }

        if (action === "begin") {
            const begun = await beginAddPaymentMethod(supabase, {
                orgId: link.orgId,
                customerId: link.customerId,
                payerEntityType: "person",
                payerEntityId: link.payerEntityId,
                rail: "ach",
                payerName: view.payer?.name ?? null,
            });
            if (!begun.ok) {
                return publicErr(
                    begun.reason === "invalid_input"
                        ? begun.message
                        : "Your bank could not be reached just now. Nothing was saved, and you can try again.",
                    begun.reason === "invalid_input" ? 400 : 502,
                );
            }
            /*
             * NOTHING CANONICAL EXISTS YET, and the link is NOT consumed here. The payer has been
             * handed a place to authorize their bank and has authorized nothing; closing the window
             * now leaves no row behind and no burnt link.
             */
            return publicOk({
                setupRef: begun.setupRef,
                clientSecret: begun.clientSecret,
                publishableKey: stripePublishableKey(),
                /* Shown verbatim above the provider's own mandate terms, before the payer agrees. */
                authorizationDisclosure: begun.authorizationDisclosure,
            });
        }

        if (action === "complete") {
            const setupRef = String(body.setup_ref ?? "").trim();
            if (!setupRef) return publicErr("No bank setup was named.", 400);

            const done = await completeAddPaymentMethod(supabase, {
                orgId: link.orgId,
                customerId: link.customerId,
                payerEntityType: "person",
                payerEntityId: link.payerEntityId,
                rail: "ach",
                setupRef,
                /*
                 * Empty on purpose. The platform customer is read back off the setup on the server;
                 * `assertSetupBelongsToPayer` has already refused a setup that is not this payer's
                 * before anything is written, so there is nothing useful a caller could put here.
                 */
                providerCustomerRef: "",
                /* No operator acted. A `created_by` naming one would be a false record of who did. */
                actorUserId: null,
            });

            if (!done.ok) {
                /*
                 * `not_this_payers_setup` answers 404, not 403. A setup belonging to somebody else
                 * is not something this link knows about, and "forbidden" would confirm it exists.
                 */
                const status =
                    done.reason === "not_this_payers_setup"
                        ? 404
                        : done.reason === "no_instrument" || done.reason === "already_claimed"
                          ? 409
                          : done.reason === "invalid_input"
                            ? 400
                            : 502;
                /*
                 * ── THE PROVIDER'S SENTENCE IS NOT THE PAYER'S ──
                 *
                 * Measured on deployed staging: a tampered setup reference came back as
                 * `No such setupintent: 'seti_…'`. Every word of that is the provider's — a noun
                 * this codebase deliberately confines to one adapter file, an identifier that means
                 * nothing to a parent, and a hint about what else might exist. The domain's own
                 * refusals say what happened and what to do; a provider or storage failure gets
                 * Alloy's sentence instead of Stripe's.
                 */
                const message =
                    done.reason === "provider_error" || done.reason === "write_failed"
                        ? "That could not be completed just now. Nothing has been saved, and you can try again."
                        : done.message;
                return publicOk({ saved: false, reason: done.reason, message }, status);
            }

            /*
             * The bank account is on file, so the REQUEST is finished and the link closes — even
             * when the account is still `pending`. A pending account is a success with a next step
             * the payer takes up with their bank, not an unfinished request; and the webhook, not
             * another visit here, is what finishes it.
             */
            await consumeBankSetupLink(supabase, link.linkId);

            /*
             * The row that was just written, said in its owner's words — four safe fields and one
             * sentence. Composed from the canonical record rather than re-read, so the answer
             * cannot disagree with what was saved a line ago.
             */
            return publicOk({ saved: true, method: participantMethodView(done.method) });
        }

        return publicErr("Unsupported action.", 400);
    } catch (e) {
        return publicErr(e instanceof Error ? e.message : "The bank setup could not be completed.", 500);
    }
}
