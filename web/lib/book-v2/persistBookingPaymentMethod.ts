import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type PersistParams = {
  customerId: string;
  stripePaymentMethodId: string;
  setupIntentId?: string | null;
};

const LOG = "[BOOKING_PAYMENT_METHOD]";

function isStripeNoSuchCustomerError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { code?: string; message?: string; param?: string };
  const m = typeof o.message === "string" ? o.message.toLowerCase() : "";
  if (m.includes("no such customer")) return true;
  if (o.code === "resource_missing" && o.param === "customer") return true;
  return false;
}

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
    .select("id, stripe_customer_id, primary_contact_id, name")
    .eq("id", customerId)
    .maybeSingle();
  if (custErr || !row) {
    console.error(`${LOG} customers select failed`, custErr?.message ?? "no row");
    return false;
  }

  const r = row as {
    stripe_customer_id?: string | null;
    primary_contact_id?: string | null;
    name?: string | null;
  };

  const stripe = new Stripe(secret);

  async function loadContactForStripe(): Promise<{
    email: string | null;
    phone: string | null;
    displayName: string | null;
  }> {
    const pcid = r.primary_contact_id;
    if (!pcid) return { email: null, phone: null, displayName: r.name ?? null };
    const { data: c } = await supabase
      .from("contacts")
      .select("email, phone, first_name, last_name")
      .eq("id", pcid)
      .maybeSingle();
    if (!c) return { email: null, phone: null, displayName: r.name ?? null };
    const ct = c as { email?: string | null; phone?: string | null; first_name?: string | null; last_name?: string | null };
    const fn = ct.first_name ?? "";
    const ln = ct.last_name ?? "";
    const fromContact = `${fn} ${ln}`.trim() || null;
    return {
      email: ct.email?.trim() ? String(ct.email).trim().toLowerCase() : null,
      phone: ct.phone?.trim() ? String(ct.phone).trim() : null,
      displayName: r.name ?? fromContact,
    };
  }

  async function createStripeCustomerAndPersist(): Promise<string | null> {
    const { email, phone, displayName } = await loadContactForStripe();
    try {
      const created = await stripe.customers.create({
        email: email ?? undefined,
        phone: phone ?? undefined,
        name: displayName ?? undefined,
        metadata: { supabase_customer_id: customerId },
      });
      const { error: up } = await supabase.from("customers").update({ stripe_customer_id: created.id }).eq("id", customerId);
      if (up) {
        console.error(`${LOG} failed to save new stripe_customer_id after env heal`, up.message);
        return created.id;
      }
      console.log(`${LOG} created Stripe customer after missing/invalid cus_ id=${created.id.slice(0, 12)}…`);
      return created.id;
    } catch (e) {
      console.error(`${LOG} createStripeCustomerAndPersist failed`, e);
      return null;
    }
  }

  let stripeCustomerId = r.stripe_customer_id?.startsWith("cus_") ? r.stripe_customer_id : null;
  if (!stripeCustomerId) {
    stripeCustomerId = await createStripeCustomerAndPersist();
    if (!stripeCustomerId) {
      console.warn(`${LOG} abort: could not resolve or create stripe_customer_id`);
      return false;
    }
  }

  let brand: string | null = null;
  let last4: string | null = null;
  let stripeOk = false;
  for (let healAttempt = 0; healAttempt < 2; healAttempt++) {
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
      break;
    } catch (e) {
      if (healAttempt === 0 && isStripeNoSuchCustomerError(e)) {
        console.warn(`${LOG} Stripe customer invalid for this env; clearing and recreating`, e);
        await supabase.from("customers").update({ stripe_customer_id: null }).eq("id", customerId);
        const fresh = await createStripeCustomerAndPersist();
        if (fresh) {
          stripeCustomerId = fresh;
          continue;
        }
      }
      console.error(`${LOG} stripe retrieve/attach/default failed (continuing with DB denorm)`, e);
      break;
    }
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
