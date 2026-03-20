import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type PersistParams = {
  customerId: string;
  stripePaymentMethodId: string;
  setupIntentId?: string | null;
};

/**
 * After SetupIntent succeeds on the client, persist default card metadata on customers and a row in customer_payment_methods.
 * Non-fatal: logs and returns false on Stripe/DB errors so booking can still complete.
 */
export async function persistBookingPaymentMethod(
  supabase: SupabaseClient,
  params: PersistParams
): Promise<boolean> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.warn("[BOOK_V2_PAYMENT_PERSIST] STRIPE_SECRET_KEY not set, skipping");
    return false;
  }

  const { customerId, stripePaymentMethodId, setupIntentId } = params;
  if (!stripePaymentMethodId?.startsWith("pm_")) {
    console.warn("[BOOK_V2_PAYMENT_PERSIST] invalid payment method id");
    return false;
  }

  const { data: row, error: custErr } = await supabase
    .from("customers")
    .select("id, stripe_customer_id")
    .eq("id", customerId)
    .maybeSingle();
  if (custErr || !row) {
    console.warn("[BOOK_V2_PAYMENT_PERSIST] customer fetch failed", custErr?.message);
    return false;
  }

  const stripeCustomerId = (row as { stripe_customer_id?: string | null }).stripe_customer_id;
  if (!stripeCustomerId?.startsWith("cus_")) {
    console.warn("[BOOK_V2_PAYMENT_PERSIST] customer missing stripe_customer_id");
    return false;
  }

  const stripe = new Stripe(secret);

  let brand: string | null = null;
  let last4: string | null = null;
  try {
    const pm = await stripe.paymentMethods.retrieve(stripePaymentMethodId);
    if (pm.type === "card" && pm.card) {
      brand = pm.card.brand ?? null;
      last4 = pm.card.last4 ?? null;
    }
    const attachedCustomer =
      typeof pm.customer === "string" ? pm.customer : pm.customer && "id" in pm.customer ? pm.customer.id : null;
    if (attachedCustomer !== stripeCustomerId) {
      try {
        await stripe.paymentMethods.attach(stripePaymentMethodId, { customer: stripeCustomerId });
      } catch (attachErr: unknown) {
        const msg = attachErr instanceof Error ? attachErr.message : String(attachErr);
        if (!msg.toLowerCase().includes("already been attached")) {
          throw attachErr;
        }
      }
    }
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: stripePaymentMethodId },
    });
  } catch (e) {
    console.warn("[BOOK_V2_PAYMENT_PERSIST] Stripe attach/default failed", e);
    // Still try DB denorm so ops can see intent
  }

  const customerPatch: Record<string, unknown> = {
    default_payment_method_id: stripePaymentMethodId,
    payment_method_brand: brand,
    payment_method_last4: last4,
  };
  if (setupIntentId) customerPatch.setup_intent_id = setupIntentId;

  const { error: upCust } = await supabase.from("customers").update(customerPatch).eq("id", customerId);
  if (upCust) {
    console.warn("[BOOK_V2_PAYMENT_PERSIST] customers update failed", upCust.message);
  }

  await supabase.from("customer_payment_methods").update({ is_default: false }).eq("customer_id", customerId);

  const pmRow: Record<string, unknown> = {
    customer_id: customerId,
    stripe_payment_method_id: stripePaymentMethodId,
    brand,
    last4,
    is_default: true,
  };

  const { error: insPm } = await supabase.from("customer_payment_methods").insert(pmRow);
  if (insPm) {
    console.warn("[BOOK_V2_PAYMENT_PERSIST] customer_payment_methods insert failed", insPm.message);
    return !upCust;
  }

  return true;
}
