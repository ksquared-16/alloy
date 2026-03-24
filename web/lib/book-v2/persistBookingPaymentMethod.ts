import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type PersistParams = {
  customerId: string;
  stripePaymentMethodId: string;
  setupIntentId?: string | null;
};

const LOG = "[BOOKING_PAYMENT_METHOD]";

/**
 * Resolve pm_… from body or by retrieving the SetupIntent server-side (client sometimes omits expanded payment_method).
 */
export async function resolveStripePaymentMethodId(params: {
  paymentMethodFromBody: string | null;
  setupIntentIdFromBody: string | null;
}): Promise<string | null> {
  const { paymentMethodFromBody, setupIntentIdFromBody } = params;
  if (paymentMethodFromBody?.startsWith("pm_")) {
    console.log(`${LOG} resolve using body pm_id prefix=pm_`);
    return paymentMethodFromBody;
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.warn(`${LOG} resolve skipped: STRIPE_SECRET_KEY not set`);
    return null;
  }
  if (!setupIntentIdFromBody?.startsWith("seti_")) {
    console.warn(`${LOG} resolve cannot run: no pm_ in body and no seti_ for retrieve`);
    return null;
  }
  try {
    const stripe = new Stripe(secret);
    const si = await stripe.setupIntents.retrieve(setupIntentIdFromBody, { expand: ["payment_method"] });
    const pm = si.payment_method;
    let id: string | null = null;
    if (typeof pm === "string" && pm.startsWith("pm_")) id = pm;
    else if (pm && typeof pm === "object" && "id" in pm && typeof (pm as { id: unknown }).id === "string") {
      id = (pm as { id: string }).id;
    }
    if (id?.startsWith("pm_")) {
      console.log(`${LOG} resolve from SetupIntent retrieve si=${setupIntentIdFromBody.slice(0, 12)}… pm=${id.slice(0, 12)}…`);
      return id;
    }
    console.warn(`${LOG} resolve SetupIntent missing payment_method si_status=${si.status}`);
    return null;
  } catch (e) {
    console.error(`${LOG} resolve SetupIntent retrieve failed`, e);
    return null;
  }
}

async function tryInsertPaymentMethodRow(
  supabase: SupabaseClient,
  variants: Record<string, unknown>[]
): Promise<{ ok: boolean; lastError: { message?: string; code?: string; details?: string; hint?: string } | null }> {
  let lastError: { message?: string; code?: string; details?: string; hint?: string } | null = null;
  for (let i = 0; i < variants.length; i++) {
    const { error } = await supabase.from("customer_payment_methods").insert(variants[i]);
    if (!error) {
      console.log(`${LOG} customer_payment_methods insert ok variant_index=${i}`);
      return { ok: true, lastError: null };
    }
    lastError = error;
    if (error.code === "23505") {
      console.log(`${LOG} customer_payment_methods insert duplicate (unique) — treating as ok variant_index=${i}`);
      return { ok: true, lastError: null };
    }
    console.error(
      `${LOG} customer_payment_methods insert failed variant_index=${i} code=${error.code ?? "?"} message=${error.message ?? "?"} details=${error.details ?? ""} hint=${error.hint ?? ""}`
    );
  }
  return { ok: false, lastError };
}

/**
 * After SetupIntent succeeds on the client, persist default card metadata on customers and a row in customer_payment_methods.
 * Logs with [BOOKING_PAYMENT_METHOD]; timing with [BOOK_V2_PERF].
 */
export async function persistBookingPaymentMethod(
  supabase: SupabaseClient,
  params: PersistParams
): Promise<boolean> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.warn(`${LOG} abort: STRIPE_SECRET_KEY not set (cannot call Stripe or verify PM)`);
    return false;
  }

  const { customerId, stripePaymentMethodId, setupIntentId } = params;
  console.log(
    `${LOG} start customer_id=${customerId} pm=${stripePaymentMethodId.slice(0, 12)}… setup_intent=${setupIntentId ? `${setupIntentId.slice(0, 12)}…` : "none"}`
  );

  if (!stripePaymentMethodId?.startsWith("pm_")) {
    console.warn(`${LOG} abort: invalid payment method id`);
    return false;
  }

  const { data: row, error: custErr } = await supabase
    .from("customers")
    .select("id, stripe_customer_id")
    .eq("id", customerId)
    .maybeSingle();
  if (custErr || !row) {
    console.error(`${LOG} customers select failed`, custErr?.message ?? "no row");
    return false;
  }

  const stripeCustomerId = (row as { stripe_customer_id?: string | null }).stripe_customer_id;
  if (!stripeCustomerId?.startsWith("cus_")) {
    console.warn(`${LOG} abort: customer.stripe_customer_id missing or not cus_`);
    return false;
  }

  const stripe = new Stripe(secret);

  let brand: string | null = null;
  let last4: string | null = null;
  let stripeOk = false;
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
        console.log(`${LOG} stripe attach ok`);
      } catch (attachErr: unknown) {
        const msg = attachErr instanceof Error ? attachErr.message : String(attachErr);
        if (!msg.toLowerCase().includes("already been attached")) {
          throw attachErr;
        }
        console.log(`${LOG} stripe attach skipped (already attached)`);
      }
    } else {
      console.log(`${LOG} stripe PM already on customer`);
    }
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: stripePaymentMethodId },
    });
    console.log(`${LOG} stripe customer default_payment_method set ok`);
    stripeOk = true;
  } catch (e) {
    console.error(`${LOG} stripe retrieve/attach/default failed (continuing with DB denorm)`, e);
  }

  const customerPatch: Record<string, unknown> = {
    default_payment_method_id: stripePaymentMethodId,
    payment_method_brand: brand,
    payment_method_last4: last4,
  };
  if (setupIntentId) customerPatch.setup_intent_id = setupIntentId;

  const { error: upCust } = await supabase.from("customers").update(customerPatch).eq("id", customerId);
  if (upCust) {
    console.error(
      `${LOG} customers update failed code=${upCust.code ?? "?"} message=${upCust.message} details=${upCust.details ?? ""} hint=${upCust.hint ?? ""}`
    );
  } else {
    console.log(`${LOG} customers denormalized fields updated`);
  }

  const { error: clearErr } = await supabase
    .from("customer_payment_methods")
    .update({ is_default: false })
    .eq("customer_id", customerId);
  if (clearErr) {
    console.warn(`${LOG} clear is_default on siblings failed (non-fatal) code=${clearErr.code} message=${clearErr.message}`);
  }

  const base = {
    customer_id: customerId,
    stripe_payment_method_id: stripePaymentMethodId,
    is_default: true,
  };
  /** DB columns are `brand` and `last4` only — avoid a failing insert on legacy `payment_method_*` names (extra round-trip + PostgREST schema noise). */
  const { ok: insertOk } = await tryInsertPaymentMethodRow(supabase, [{ ...base, brand, last4 }]);

  const elapsed = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
  console.log(
    `[BOOK_V2_PERF] persist_payment_method total_ms=${elapsed} stripe_ok=${stripeOk} customers_update_ok=${!upCust} child_insert_ok=${insertOk}`
  );

  return !upCust && insertOk;
}
