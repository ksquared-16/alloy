/**
 * Booking resolver: resolve or create contact + customer for public book-v2 (service role).
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { ensureContactLinkedToPerson, ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";
import {
  bookingPhoneLookupVariants,
  normalizeBookingEmail,
  normalizeBookingPhone,
  phoneDigitsTailForLog,
} from "@/lib/bookingIdentityNormalize";

export interface ContactCustomerResult {
  contact_id: string;
  customer_id: string;
  resolution_path: string;
  customer_resolution_path: string;
}

type PgLikeError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

function redactEmailForLog(email: string): string {
  const e = normalizeBookingEmail(email);
  if (!e) return "(empty)";
  const at = e.indexOf("@");
  if (at <= 0) return "***";
  return `${e.slice(0, 2)}***@${e.slice(at + 1)}`;
}

function formatSupabaseError(err: PgLikeError | null | undefined): string {
  if (!err) return "(no error object)";
  const parts = [
    `code=${err.code ?? "?"}`,
    `message=${err.message ?? "?"}`,
    err.details ? `details=${err.details}` : null,
    err.hint ? `hint=${err.hint}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

function isUniqueViolation(err: PgLikeError | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const m = (err.message ?? "").toLowerCase();
  return (
    m.includes("duplicate key") ||
    m.includes("unique constraint") ||
    m.includes("already exists") ||
    (err.details ?? "").toLowerCase().includes("already exists")
  );
}

type ContactRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  customer_id?: string | null;
  timezone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  address_source?: string | null;
  metadata?: Record<string, unknown> | null;
};

async function selectContactByEmail(
  supabase: SupabaseClient,
  orgId: string,
  normalizedEmail: string,
  logPrefix: string
): Promise<ContactRow | null> {
  if (!normalizedEmail) return null;
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, email, phone, customer_id, timezone, address_line1, city, state, postal_code, address_source, metadata"
    )
    .eq("org_id", orgId)
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`${logPrefix} step=contact_lookup_email ${formatSupabaseError(error)}`);
    return null;
  }
  if (data) {
    console.log(`${logPrefix} step=contact_lookup_email hit contact_id=${(data as ContactRow).id}`);
  }
  return (data as ContactRow | null) ?? null;
}

async function selectContactByPhoneVariants(
  supabase: SupabaseClient,
  orgId: string,
  rawPhoneInput: string,
  logPrefix: string
): Promise<ContactRow | null> {
  const variants = bookingPhoneLookupVariants(rawPhoneInput);
  console.log(`${logPrefix} step=contact_lookup_phone variants_count=${variants.length} tail=${phoneDigitsTailForLog(rawPhoneInput)}`);
  for (const v of variants) {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, email, phone, customer_id, timezone, address_line1, city, state, postal_code, address_source, metadata"
      )
      .eq("org_id", orgId)
      .eq("phone", v)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn(`${logPrefix} step=contact_lookup_phone variant_failed variant_tail=${phoneDigitsTailForLog(v)} ${formatSupabaseError(error)}`);
      continue;
    }
    if (data) {
      console.log(
        `${logPrefix} step=contact_lookup_phone hit contact_id=${(data as ContactRow).id} matched_variant_tail=${phoneDigitsTailForLog(v)}`
      );
      return data as ContactRow;
    }
  }
  console.log(`${logPrefix} step=contact_lookup_phone miss`);
  return null;
}

async function selectContactByEmailOrPhoneConflictRecovery(
  supabase: SupabaseClient,
  orgId: string,
  normalizedEmail: string,
  rawPhoneInput: string,
  logPrefix: string
): Promise<ContactRow | null> {
  const byEmail = await selectContactByEmail(supabase, orgId, normalizedEmail, logPrefix + " recovery_email");
  if (byEmail) return byEmail;
  return selectContactByPhoneVariants(supabase, orgId, rawPhoneInput, logPrefix + " recovery_phone");
}

export async function resolve_or_create_contact_and_customer(
  supabase: SupabaseClient,
  params: {
    first_name?: string;
    last_name?: string;
    email: string;
    phone: string;
    postal_code?: string;
    timezone?: string;
    address?: string;
    city?: string;
    state?: string;
    vertical_key?: string;
    vertical_id?: string | null;
    org_id?: string | null;
    booking_attempt_id?: string | null;
    /** When set (e.g. book-v2 quote person), link resolver contact + customer to this person. */
    person_id?: string | null;
  }
): Promise<ContactCustomerResult> {
  const {
    first_name,
    last_name,
    email,
    phone,
    postal_code,
    timezone,
    address,
    city,
    state,
    vertical_key = "cleaning",
    vertical_id: verticalIdParam,
    org_id: orgIdParam,
    booking_attempt_id: bookingAttemptId,
    person_id: personIdParam,
  } = params;

  const orgId = orgIdParam ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;
  const logPrefix = `[BOOKING_RESOLVER] booking_attempt_id=${bookingAttemptId ?? "none"}`;

  const normalizedEmail = normalizeBookingEmail(email);
  const normalizedPhone = normalizeBookingPhone(phone);
  const phoneDigits = normalizedPhone.replace(/\D/g, "");

  console.log(
    `${logPrefix} start vertical_key=${vertical_key} org_id_present=${orgId != null} email_norm=${redactEmailForLog(normalizedEmail)} phone_e164_tail=${phoneDigitsTailForLog(phoneDigits)} raw_phone_len=${String(phone ?? "").trim().length}`
  );

  if (orgId == null) {
    console.error(`${logPrefix} FATAL missing org_id (ALLOY_PUBLIC_ORG_ID or pass org_id)`);
    throw new Error("Missing org_id for contact/customer creation (server configuration)");
  }

  if (!normalizedEmail && !normalizedPhone.replace(/\D/g, "")) {
    console.error(`${logPrefix} FATAL empty email and phone after normalization`);
    throw new Error("Resolver requires a non-empty email or phone after normalization");
  }

  let contactId: string;
  let customerId: string;
  let resolutionPath = "unknown";
  let customerResolutionPath = "unknown";

  let existingContact: ContactRow | null = await selectContactByEmail(supabase, orgId, normalizedEmail, logPrefix);
  if (existingContact) {
    resolutionPath = "found_by_email";
  } else if (normalizedPhone.replace(/\D/g, "")) {
    existingContact = await selectContactByPhoneVariants(supabase, orgId, phone, logPrefix);
    if (existingContact) resolutionPath = "found_by_phone";
  }

  if (existingContact) {
    contactId = existingContact.id;

    const updatePayload: Record<string, unknown> = {};
    const metadataUpdates: Record<string, unknown> = {};
    let metadataChanged = false;

    if (first_name && !existingContact.first_name) {
      updatePayload.first_name = first_name;
    }
    if (last_name && !existingContact.last_name) {
      updatePayload.last_name = last_name;
    }
    if (normalizedEmail && normalizeBookingEmail(existingContact.email ?? "") !== normalizedEmail) {
      updatePayload.email = normalizedEmail;
    }

    if (normalizedPhone) {
      const existingPhone = existingContact.phone;
      if (!existingPhone || String(existingPhone).trim() === "") {
        updatePayload.phone = normalizedPhone;
      } else if (normalizedPhone === existingPhone) {
        // no-op
      } else {
        const existingMetadata = (existingContact.metadata || {}) as Record<string, unknown>;
        metadataUpdates.phone_candidate = normalizedPhone;
        metadataUpdates.phone_candidate_seen_at = new Date().toISOString();
        metadataChanged = true;
        console.warn(
          `${logPrefix} phone_mismatch keep_existing_tail=${phoneDigitsTailForLog(String(existingPhone))} candidate_tail=${phoneDigitsTailForLog(normalizedPhone)} contact_id=${contactId}`
        );
      }
    }

    if (timezone && !existingContact.timezone) {
      updatePayload.timezone = timezone;
    }

    const incomingAddress: Record<string, string> = {};
    if (address) incomingAddress.address_line1 = address;
    if (city) incomingAddress.city = city;
    if (state) incomingAddress.state = state;
    if (postal_code) incomingAddress.postal_code = postal_code;

    let addressSourceChanged = false;
    const addressConflicts: Record<string, { existing: string; incoming: string }> = {};

    if (address && (!existingContact.address_line1 || String(existingContact.address_line1).trim() === "")) {
      updatePayload.address_line1 = address;
      addressSourceChanged = true;
    } else if (address && existingContact.address_line1 && address !== existingContact.address_line1) {
      addressConflicts.address_line1 = { existing: existingContact.address_line1, incoming: address };
    }

    if (city && (!existingContact.city || String(existingContact.city).trim() === "")) {
      updatePayload.city = city;
      addressSourceChanged = true;
    } else if (city && existingContact.city && city !== existingContact.city) {
      addressConflicts.city = { existing: existingContact.city, incoming: city };
    }

    if (state && (!existingContact.state || String(existingContact.state).trim() === "")) {
      updatePayload.state = state;
      addressSourceChanged = true;
    } else if (state && existingContact.state && state !== existingContact.state) {
      addressConflicts.state = { existing: existingContact.state, incoming: state };
    }

    if (postal_code && (!existingContact.postal_code || String(existingContact.postal_code).trim() === "")) {
      updatePayload.postal_code = postal_code;
      addressSourceChanged = true;
    } else if (postal_code && existingContact.postal_code && postal_code !== existingContact.postal_code) {
      addressConflicts.postal_code = { existing: existingContact.postal_code, incoming: postal_code };
    }

    if (Object.keys(addressConflicts).length > 0) {
      metadataUpdates.address_candidate = incomingAddress;
      metadataUpdates.address_candidate_seen_at = new Date().toISOString();
      metadataChanged = true;
      console.warn(`${logPrefix} address_mismatch contact_id=${contactId} keys=${Object.keys(addressConflicts).join(",")}`);
    }

    if (addressSourceChanged) {
      const currentAddressSource = existingContact.address_source;
      if (!currentAddressSource || currentAddressSource === "stripe") {
        updatePayload.address_source = "booking";
      }
    }

    if (metadataChanged) {
      const existingMetadata = (existingContact.metadata || {}) as Record<string, unknown>;
      updatePayload.metadata = { ...existingMetadata, ...metadataUpdates };
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase.from("contacts").update(updatePayload).eq("id", contactId).eq("org_id", orgId);

      if (updateError) {
        console.error(`${logPrefix} step=contact_update FAILED ${formatSupabaseError(updateError)}`);
      } else {
        console.log(`${logPrefix} step=contact_update ok contact_id=${contactId}`);
      }
    }

    if (existingContact.customer_id) {
      customerId = existingContact.customer_id;
      customerResolutionPath = "reused_from_contact";
      console.log(`${logPrefix} step=customer_from_contact customer_id=${customerId}`);
    } else {
      console.log(`${logPrefix} step=create_customer_existing_contact contact_id=${contactId}`);
      customerId = await createAndLinkCustomer(supabase, contactId, orgId, {
        first_name: existingContact.first_name || first_name,
        last_name: existingContact.last_name || last_name,
        email: normalizedEmail,
        phone: normalizedPhone,
        vertical_id: verticalIdParam ?? undefined,
        booking_attempt_id: bookingAttemptId ?? null,
      });
      customerResolutionPath = "created_for_existing_contact";
    }
  } else {
    const contactPayload: Record<string, unknown> = {
      email: normalizedEmail || null,
      phone: normalizedPhone || null,
      first_name: first_name || null,
      last_name: last_name || null,
      contact_type: "lead",
      org_id: orgId,
      status: "active",
    };

    if (timezone) contactPayload.timezone = timezone;
    if (address) contactPayload.address_line1 = address;
    if (city) contactPayload.city = city;
    if (state) contactPayload.state = state;
    if (postal_code) contactPayload.postal_code = postal_code;

    console.log(`${logPrefix} step=contact_insert`);
    const { data: newContact, error: contactError } = await supabase.from("contacts").insert(contactPayload).select("id").single();

    if (contactError) {
      if (isUniqueViolation(contactError)) {
        console.warn(`${logPrefix} step=contact_insert unique_violation recovering ${formatSupabaseError(contactError)}`);
        const conflictContact = await selectContactByEmailOrPhoneConflictRecovery(
          supabase,
          orgId,
          normalizedEmail,
          phone,
          logPrefix
        );
        if (conflictContact) {
          contactId = conflictContact.id;
          resolutionPath = "created_conflict_recovered";
          if (conflictContact.customer_id) {
            customerId = conflictContact.customer_id;
            customerResolutionPath = "reused_from_contact";
            console.log(
              `${logPrefix} conflict_recovered reuse contact+customer contact_id=${contactId} customer_id=${customerId}`
            );
          } else {
            console.log(`${logPrefix} conflict_recovered contact_without_customer contact_id=${contactId}`);
            customerId = await createAndLinkCustomer(supabase, contactId, orgId, {
              first_name,
              last_name,
              email: normalizedEmail,
              phone: normalizedPhone,
              vertical_id: verticalIdParam ?? undefined,
              booking_attempt_id: bookingAttemptId ?? null,
            });
            customerResolutionPath = "created_for_new_contact";
          }
        } else {
          console.error(
            `${logPrefix} FATAL contact_insert unique_violation but recovery found no row ${formatSupabaseError(contactError)}`
          );
          throw new Error(
            `Contact unique conflict; recovery select failed (pg: ${contactError.code ?? "?"}) ${contactError.message ?? ""}`
          );
        }
      } else {
        console.error(`${logPrefix} FATAL contact_insert ${formatSupabaseError(contactError)}`);
        throw new Error(`Failed to create contact (pg: ${contactError.code ?? "?"}) ${contactError.message ?? ""}`);
      }
    } else if (newContact) {
      contactId = (newContact as { id: string }).id;
      resolutionPath = "created_new";
      console.log(`${logPrefix} step=contact_insert ok contact_id=${contactId}`);

      customerId = await createAndLinkCustomer(supabase, contactId, orgId, {
        first_name,
        last_name,
        email: normalizedEmail,
        phone: normalizedPhone,
        vertical_id: verticalIdParam ?? undefined,
        booking_attempt_id: bookingAttemptId ?? null,
      });
      customerResolutionPath = "created_for_new_contact";
    } else {
      console.error(`${logPrefix} FATAL contact_insert returned no data and no error`);
      throw new Error("Contact creation returned no data");
    }
  }

  if (verticalIdParam) {
    const { data: custRow, error: custErr } = await supabase.from("customers").select("vertical_id").eq("id", customerId).single();
    if (!custErr && custRow && custRow.vertical_id == null) {
      const { error: backfillErr } = await supabase.from("customers").update({ vertical_id: verticalIdParam }).eq("id", customerId);
      if (backfillErr) {
        console.error(`${logPrefix} step=vertical_backfill FAILED ${formatSupabaseError(backfillErr)}`);
      } else {
        console.log(`${logPrefix} step=vertical_backfill ok customer_id=${customerId}`);
      }
    }
  }

  const { data: customerCheck, error: customerCheckError } = await supabase
    .from("customers")
    .select("primary_contact_id")
    .eq("id", customerId)
    .single();

  if (!customerCheckError && customerCheck && customerCheck.primary_contact_id !== contactId) {
    const { error: backfillError } = await supabase
      .from("customers")
      .update({ primary_contact_id: contactId })
      .eq("id", customerId);

    if (backfillError) {
      console.error(`${logPrefix} step=primary_contact_backfill FAILED ${formatSupabaseError(backfillError)}`);
    } else {
      console.log(`${logPrefix} step=primary_contact_backfill ok`);
    }
  }

  const { data: verifyContact, error: verifyErr } = await supabase
    .from("contacts")
    .select("customer_id")
    .eq("id", contactId)
    .eq("org_id", orgId)
    .single();
  if (verifyErr) {
    console.error(`${logPrefix} FATAL post_verify contact read ${formatSupabaseError(verifyErr)}`);
    throw new Error(`Post-resolve contact verify failed (pg: ${verifyErr.code ?? "?"}) ${verifyErr.message ?? ""}`);
  }
  if (!verifyContact?.customer_id || verifyContact.customer_id !== customerId) {
    console.warn(
      `${logPrefix} step=post_verify contacts.customer_id mismatch expected=${customerId} actual=${verifyContact?.customer_id ?? "null"} — retrying link`
    );
    const { error: relinkErr } = await supabase.from("contacts").update({ customer_id: customerId }).eq("id", contactId).eq("org_id", orgId);
    if (relinkErr) {
      console.error(`${logPrefix} FATAL relink contacts.customer_id ${formatSupabaseError(relinkErr)}`);
      throw new Error(`Failed to link contact to customer (pg: ${relinkErr.code ?? "?"}) ${relinkErr.message ?? ""}`);
    }
  }

  console.log(
    `${logPrefix} SUCCESS contact_id=${contactId} customer_id=${customerId} resolution_path=${resolutionPath} customer_resolution_path=${customerResolutionPath}`
  );

  const personIdForLink = typeof personIdParam === "string" && personIdParam.trim() ? personIdParam.trim() : null;
  if (personIdForLink) {
    try {
      await ensureContactLinkedToPerson(supabase, { contactId, personId: personIdForLink, orgId });
      await ensureCustomerPersonsPrimaryLink(supabase, { customerId, personId: personIdForLink, orgId });
    } catch (e) {
      console.error(`${logPrefix} person_link_after_resolve FAILED`, e);
      throw e;
    }
  }

  return {
    contact_id: contactId,
    customer_id: customerId,
    resolution_path: resolutionPath,
    customer_resolution_path: customerResolutionPath,
  };
}

async function createAndLinkCustomer(
  supabase: SupabaseClient,
  contactId: string,
  orgId: string,
  params: {
    first_name?: string | null;
    last_name?: string | null;
    email: string;
    phone: string;
    vertical_id?: string | null;
    booking_attempt_id?: string | null;
  }
): Promise<string> {
  const { first_name, last_name, email, phone, vertical_id, booking_attempt_id: attemptId } = params;
  const logPrefix = `[BOOKING_RESOLVER] booking_attempt_id=${attemptId ?? "none"}`;

  let customerName: string;
  if (first_name && last_name) {
    customerName = `${first_name} ${last_name}`.trim();
  } else if (first_name) {
    customerName = String(first_name);
  } else if (email) {
    customerName = email;
  } else if (phone) {
    customerName = phone;
  } else {
    customerName = "New Customer";
  }

  const customerPayload: Record<string, unknown> = {
    name: customerName,
    primary_contact_id: contactId,
    status: "active",
    org_id: orgId,
    metadata: {
      source: "booking-resolver",
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    },
  };
  if (vertical_id) {
    customerPayload.vertical_id = vertical_id;
  }

  console.log(`${logPrefix} step=customers_insert primary_contact_id=${contactId} org_id_set=true`);

  const { data: newCustomer, error: customerError } = await supabase
    .from("customers")
    .insert(customerPayload)
    .select("id")
    .single();

  if (customerError) {
    if (isUniqueViolation(customerError)) {
      console.warn(`${logPrefix} step=customers_insert unique_violation ${formatSupabaseError(customerError)}`);

      const { data: byPrimary } = await supabase.from("customers").select("id").eq("primary_contact_id", contactId).limit(1).maybeSingle();
      if (byPrimary?.id) {
        const id = (byPrimary as { id: string }).id;
        console.log(`${logPrefix} recovery=customer_by_primary_contact customer_id=${id}`);
        await linkContactToCustomer(supabase, contactId, orgId, id, logPrefix);
        return id;
      }

      const { data: contactRow } = await supabase.from("contacts").select("customer_id").eq("id", contactId).eq("org_id", orgId).single();
      const cid = (contactRow as { customer_id?: string | null } | null)?.customer_id ?? null;
      if (cid) {
        console.log(`${logPrefix} recovery=customer_from_contact_row customer_id=${cid}`);
        return cid;
      }

      console.error(`${logPrefix} FATAL customers_insert 23505 no recovery target ${formatSupabaseError(customerError)}`);
      throw new Error(
        `Customer unique conflict; recovery failed (pg: ${customerError.code ?? "?"}) ${customerError.message ?? ""}`
      );
    }

    console.error(`${logPrefix} FATAL customers_insert ${formatSupabaseError(customerError)}`);
    throw new Error(`Failed to create customer (pg: ${customerError.code ?? "?"}) ${customerError.message ?? ""}`);
  }

  if (!newCustomer) {
    throw new Error("Customer creation returned no data");
  }

  const customerId = (newCustomer as { id: string }).id;
  console.log(`${logPrefix} step=customers_insert ok customer_id=${customerId}`);

  await linkContactToCustomer(supabase, contactId, orgId, customerId, logPrefix);

  return customerId;
}

async function linkContactToCustomer(
  supabase: SupabaseClient,
  contactId: string,
  orgId: string,
  customerId: string,
  logPrefix: string
): Promise<void> {
  const { error: linkError } = await supabase
    .from("contacts")
    .update({ customer_id: customerId })
    .eq("id", contactId)
    .eq("org_id", orgId);

  if (linkError) {
    console.error(`${logPrefix} step=contacts_link_customer FAILED ${formatSupabaseError(linkError)}`);
    throw new Error(`Failed to set contacts.customer_id (pg: ${linkError.code ?? "?"}) ${linkError.message ?? ""}`);
  }
  console.log(`${logPrefix} step=contacts_link_customer ok contact_id=${contactId} customer_id=${customerId}`);
}
