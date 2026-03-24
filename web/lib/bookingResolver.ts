/**
 * Booking resolver: Guarantees contact/customer creation and linking
 * Ensures data completeness and idempotency
 */

import { SupabaseClient } from "@supabase/supabase-js";

export interface ContactCustomerResult {
  contact_id: string;
  customer_id: string;
  resolution_path: string;
  customer_resolution_path: string;
}

/**
 * Normalize email: trim + lowercase
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalize phone: strip non-digits, preserve leading +, convert to E.164 when possible
 */
function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return trimmed; // Return original if no digits
  }

  // If already starts with +, preserve it
  if (trimmed.startsWith("+")) {
    return "+" + digits;
  }

  // If 10 digits, assume US and prefix +1
  if (digits.length === 10) {
    return "+1" + digits;
  }

  // If 11 digits starting with 1, prefix +
  if (digits.length === 11 && digits.startsWith("1")) {
    return "+" + digits;
  }

  // Otherwise, prefix with +
  return "+" + digits;
}

/**
 * Resolve or create contact and customer with guaranteed linking.
 * 
 * This function ensures:
 * - Contact deduplication by email (case-insensitive) or phone (E.164 exact)
 * - Customer creation if missing
 * - Bidirectional linking: contacts.customer_id and customers.primary_contact_id
 * - Idempotency: safe to retry
 * 
 * @param supabase - Supabase admin client
 * @param params - Contact and customer data
 * @returns Contact and customer IDs with resolution paths
 */
function redactEmailForLog(email: string): string {
  const e = email.trim().toLowerCase();
  if (!e) return "(empty)";
  const at = e.indexOf("@");
  if (at <= 0) return "***";
  return `${e.slice(0, 2)}***@${e.slice(at + 1)}`;
}

function phoneTailForLog(phoneDigits: string): string {
  if (!phoneDigits) return "(none)";
  const t = phoneDigits.slice(-4);
  return t.length === 4 ? `…${t}` : "(short)";
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
    /** When set, customers.vertical_id is set on create and backfilled if null */
    vertical_id?: string | null;
    /** Org for inserts; when omitted, uses process.env.ALLOY_PUBLIC_ORG_ID (public flows) */
    org_id?: string | null;
    /** Correlates resolver logs with book-v2 confirm attempts */
    booking_attempt_id?: string | null;
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
  } = params;
  const orgId = orgIdParam ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;

  // Normalize inputs
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

  const logPrefix = `[BOOKING_RESOLVER] booking_attempt_id=${bookingAttemptId ?? "none"}`;
  console.log(
    `${logPrefix} start email_norm=${redactEmailForLog(normalizedEmail)} phone_e164_tail=${phoneTailForLog(normalizedPhone.replace(/\D/g, ""))} org_id_set=${orgId != null} first_last_set=${!!(first_name?.trim() && last_name?.trim())}`
  );

  if (orgId == null) {
    console.error(
      `${logPrefix} abort missing org_id (set ALLOY_PUBLIC_ORG_ID or pass org_id); cannot insert contacts.customers (org_id NOT NULL)`
    );
    throw new Error("Missing org_id for contact/customer creation (server configuration)");
  }

  let contactId: string;
  let customerId: string;
  let resolutionPath = "unknown";
  let customerResolutionPath = "unknown";

  // Step 1: Try to find existing contact
  let existingContact: any = null;

  // Priority 1: Search by email (case-insensitive)
  if (normalizedEmail) {
    const { data: emailContact, error: emailError } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone, customer_id, timezone, address_line1, city, state, postal_code")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (emailError) {
      console.warn(`${logPrefix} email lookup error code=${emailError.code ?? "?"} message=${emailError.message}`);
    }
    if (!emailError && emailContact) {
      existingContact = emailContact;
      resolutionPath = "found_by_email";
      console.log(`${logPrefix} matched existing contact by email contact_id=${emailContact.id}`);
    } else if (normalizedEmail) {
      console.log(`${logPrefix} no contact match by email`);
    }
  }

  // Priority 2: Search by phone (exact match on E.164) if email didn't find
  if (!existingContact && normalizedPhone) {
    const { data: phoneContact, error: phoneError } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone, customer_id, timezone, address_line1, city, state, postal_code, address_source, metadata")
      .eq("phone", normalizedPhone)
      .limit(1)
      .maybeSingle();

    if (phoneError) {
      console.warn(`${logPrefix} phone lookup error code=${phoneError.code ?? "?"} message=${phoneError.message}`);
    }
    if (!phoneError && phoneContact) {
      existingContact = phoneContact;
      resolutionPath = "found_by_phone";
      console.log(`${logPrefix} matched existing contact by phone contact_id=${phoneContact.id}`);
    } else {
      console.log(`${logPrefix} no contact match by phone (searched ${phoneTailForLog(normalizedPhone.replace(/\D/g, ""))})`);
    }
  }

  // Step 2: Handle existing contact or create new
  if (existingContact) {
    contactId = existingContact.id;

    // Update contact with any new information (idempotent)
    const updatePayload: Record<string, any> = {};
    const metadataUpdates: Record<string, any> = {};
    let metadataChanged = false;
    
    if (first_name && !existingContact.first_name) {
      updatePayload.first_name = first_name;
    }
    if (last_name && !existingContact.last_name) {
      updatePayload.last_name = last_name;
    }
    // Ensure normalized email is stored
    if (normalizedEmail && normalizedEmail !== existingContact.email) {
      updatePayload.email = normalizedEmail;
    }
    
    // Phone overwrite rule: only set if NULL/empty, or if matches existing
    // If incoming differs from existing, store candidate in metadata
    if (normalizedPhone) {
      const existingPhone = existingContact.phone;
      if (!existingPhone || existingPhone.trim() === "") {
        // Contact has no phone - set it
        updatePayload.phone = normalizedPhone;
      } else if (normalizedPhone === existingPhone) {
        // Phones match - no change needed
      } else {
        // Phones differ - keep existing, store candidate in metadata
        const existingMetadata = existingContact.metadata || {};
        metadataUpdates.phone_candidate = normalizedPhone;
        metadataUpdates.phone_candidate_seen_at = new Date().toISOString();
        metadataChanged = true;
        console.warn(
          `[BOOKING_RESOLVER] Phone mismatch: keeping_existing_phone=${existingPhone.substring(0, 4)}*** candidate_phone=${normalizedPhone.substring(0, 4)}*** contact_id=${contactId}`
        );
      }
    }
    
    // Update timezone if missing
    if (timezone && !existingContact.timezone) {
      updatePayload.timezone = timezone;
    }
    
    // Address backfill rule: only fill missing fields, don't overwrite
    // Build incoming address object
    const incomingAddress: Record<string, string> = {};
    if (address) incomingAddress.address_line1 = address;
    if (city) incomingAddress.city = city;
    if (state) incomingAddress.state = state;
    if (postal_code) incomingAddress.postal_code = postal_code;
    
    let addressSourceChanged = false;
    const addressConflicts: Record<string, { existing: string; incoming: string }> = {};
    
    // Only set each field if currently NULL/empty
    if (address && (!existingContact.address_line1 || existingContact.address_line1.trim() === "")) {
      updatePayload.address_line1 = address;
      addressSourceChanged = true;
    } else if (address && existingContact.address_line1 && address !== existingContact.address_line1) {
      addressConflicts.address_line1 = { existing: existingContact.address_line1, incoming: address };
    }
    
    if (city && (!existingContact.city || existingContact.city.trim() === "")) {
      updatePayload.city = city;
      addressSourceChanged = true;
    } else if (city && existingContact.city && city !== existingContact.city) {
      addressConflicts.city = { existing: existingContact.city, incoming: city };
    }
    
    if (state && (!existingContact.state || existingContact.state.trim() === "")) {
      updatePayload.state = state;
      addressSourceChanged = true;
    } else if (state && existingContact.state && state !== existingContact.state) {
      addressConflicts.state = { existing: existingContact.state, incoming: state };
    }
    
    if (postal_code && (!existingContact.postal_code || existingContact.postal_code.trim() === "")) {
      updatePayload.postal_code = postal_code;
      addressSourceChanged = true;
    } else if (postal_code && existingContact.postal_code && postal_code !== existingContact.postal_code) {
      addressConflicts.postal_code = { existing: existingContact.postal_code, incoming: postal_code };
    }
    
    // If there are address conflicts, store candidate in metadata
    if (Object.keys(addressConflicts).length > 0) {
      const existingMetadata = existingContact.metadata || {};
      metadataUpdates.address_candidate = incomingAddress;
      metadataUpdates.address_candidate_seen_at = new Date().toISOString();
      metadataChanged = true;
      console.warn(
        `[BOOKING_RESOLVER] Address mismatch: keeping_existing=${JSON.stringify(Object.fromEntries(Object.entries(addressConflicts).map(([k, v]) => [k, v.existing])))} candidate=${JSON.stringify(incomingAddress)} contact_id=${contactId}`
      );
    }
    
    // Set address_source if we filled any missing fields
    // Only update if address_source is NULL or currently 'stripe' and we changed something
    if (addressSourceChanged) {
      const currentAddressSource = existingContact.address_source;
      if (!currentAddressSource || currentAddressSource === "stripe") {
        updatePayload.address_source = "booking";
      }
    }
    
    // Update metadata if there are changes
    if (metadataChanged) {
      const existingMetadata = existingContact.metadata || {};
      updatePayload.metadata = { ...existingMetadata, ...metadataUpdates };
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from("contacts")
        .update(updatePayload)
        .eq("id", contactId);

      if (updateError) {
        console.error(`[BOOKING_RESOLVER] Failed to update contact: ${updateError.message}`);
        // Continue anyway - contact exists
      } else {
        console.log(`[BOOKING_RESOLVER] Updated contact: contact_id=${contactId}`);
      }
    }

    // Check if contact has customer_id
    if (existingContact.customer_id) {
      customerId = existingContact.customer_id;
      customerResolutionPath = "reused_from_contact";
      console.log(
        `[BOOKING_RESOLVER] Reused customer from contact: customer_id=${customerId} contact_id=${contactId}`
      );
    } else {
      // Contact exists but no customer - create and link
      console.log(`${logPrefix} existing contact has no customer; createAndLinkCustomer contact_id=${contactId}`);
      customerId = await createAndLinkCustomer(supabase, contactId, {
        first_name: existingContact.first_name || first_name,
        last_name: existingContact.last_name || last_name,
        email: normalizedEmail,
        phone: normalizedPhone,
        vertical_id: verticalIdParam ?? undefined,
        org_id: orgId,
        booking_attempt_id: bookingAttemptId ?? null,
      });
      customerResolutionPath = "created_for_existing_contact";
    }
  } else {
    // Step 3: Create new contact
    const contactPayload: Record<string, any> = {
      email: normalizedEmail || null,
      phone: normalizedPhone || null,
      first_name: first_name || null,
      last_name: last_name || null,
      contact_type: "lead",
      org_id: orgId,
    };

    if (timezone) {
      contactPayload.timezone = timezone;
    }
    if (address) {
      contactPayload.address_line1 = address;
    }
    if (city) {
      contactPayload.city = city;
    }
    if (state) {
      contactPayload.state = state;
    }
    if (postal_code) {
      contactPayload.postal_code = postal_code;
    }

    console.log(`${logPrefix} inserting new contact (no existing match)`);
    const { data: newContact, error: contactError } = await supabase
      .from("contacts")
      .insert(contactPayload)
      .select("id")
      .single();

    if (contactError) {
      // Handle uniqueness conflict (idempotency)
      if (contactError.code === "23505" || contactError.message?.includes("duplicate") || contactError.message?.includes("unique")) {
        console.log(`${logPrefix} contact insert conflict (23505/unique); re-selecting by email then phone`);
        let conflictContact: { id: string; customer_id?: string | null } | null = null;
        if (normalizedEmail) {
          const { data: byEmail } = await supabase
            .from("contacts")
            .select("id, customer_id")
            .ilike("email", normalizedEmail)
            .limit(1)
            .maybeSingle();
          conflictContact = byEmail ?? null;
        }
        if (!conflictContact && normalizedPhone) {
          const { data: byPhone } = await supabase
            .from("contacts")
            .select("id, customer_id")
            .eq("phone", normalizedPhone)
            .limit(1)
            .maybeSingle();
          conflictContact = byPhone ?? null;
        }
        if (conflictContact) {
          contactId = conflictContact.id;
          resolutionPath = "created_conflict_recovered";
          if (conflictContact.customer_id) {
            customerId = conflictContact.customer_id;
            customerResolutionPath = "reused_from_contact";
            console.log(`${logPrefix} conflict recovered: reuse contact+customer contact_id=${contactId} customer_id=${customerId}`);
          } else {
            console.log(`${logPrefix} conflict recovered: contact exists without customer; creating customer contact_id=${contactId}`);
            customerId = await createAndLinkCustomer(supabase, contactId, {
              first_name,
              last_name,
              email: normalizedEmail,
              phone: normalizedPhone,
              vertical_id: verticalIdParam ?? undefined,
              org_id: orgId,
              booking_attempt_id: bookingAttemptId ?? null,
            });
            customerResolutionPath = "created_for_new_contact";
          }
        } else {
          console.error(`${logPrefix} contact insert conflict but re-select by email/phone found nothing`, contactError);
          throw new Error(`Contact conflict but re-select failed: ${contactError.message}`);
        }
      } else {
        console.error(`${logPrefix} contact insert failed code=${contactError.code} message=${contactError.message}`, contactError);
        throw new Error(`Failed to create contact: ${contactError.message}`);
      }
    } else if (newContact) {
      contactId = newContact.id;
      resolutionPath = "created_new";
      console.log(`${logPrefix} created new contact contact_id=${contactId}; creating customer`);

      customerId = await createAndLinkCustomer(supabase, contactId, {
        first_name,
        last_name,
        email: normalizedEmail,
        phone: normalizedPhone,
        vertical_id: verticalIdParam ?? undefined,
        org_id: orgId,
        booking_attempt_id: bookingAttemptId ?? null,
      });
      customerResolutionPath = "created_for_new_contact";
    } else {
      throw new Error("Contact creation returned no data");
    }
  }

  // Step 4: Set or backfill customers.vertical_id from opportunity vertical
  if (verticalIdParam) {
    const { data: custRow, error: custErr } = await supabase
      .from("customers")
      .select("vertical_id")
      .eq("id", customerId)
      .single();
    if (!custErr && custRow && custRow.vertical_id == null) {
      const { error: backfillErr } = await supabase
        .from("customers")
        .update({ vertical_id: verticalIdParam })
        .eq("id", customerId);
      if (backfillErr) {
        console.error(`[BOOKING_RESOLVER] Failed to backfill customers.vertical_id: ${backfillErr.message}`);
      } else {
        console.log(`[BOOKING_RESOLVER] Backfilled customers.vertical_id: customer_id=${customerId}`);
      }
    }
  }

  // Step 5: Verify customer.primary_contact_id is set
  const { data: customerCheck, error: customerCheckError } = await supabase
    .from("customers")
    .select("primary_contact_id")
    .eq("id", customerId)
    .single();

  if (!customerCheckError && customerCheck) {
    if (customerCheck.primary_contact_id !== contactId) {
      // Backfill primary_contact_id
      const { error: backfillError } = await supabase
        .from("customers")
        .update({ primary_contact_id: contactId })
        .eq("id", customerId);

      if (backfillError) {
        console.error(`[BOOKING_RESOLVER] Failed to backfill customers.primary_contact_id: ${backfillError.message}`);
      } else {
        console.log(`[BOOKING_RESOLVER] Backfilled customers.primary_contact_id: customer_id=${customerId} contact_id=${contactId}`);
      }
    }
  }

  console.log(
    `[BOOKING_RESOLVER_SUCCESS] contact_id=${contactId} customer_id=${customerId} resolution_path=${resolutionPath} customer_resolution_path=${customerResolutionPath}`
  );

  return {
    contact_id: contactId,
    customer_id: customerId,
    resolution_path: resolutionPath,
    customer_resolution_path: customerResolutionPath,
  };
}

/**
 * Create customer and link bidirectionally
 */
async function createAndLinkCustomer(
  supabase: SupabaseClient,
  contactId: string,
  params: {
    first_name?: string;
    last_name?: string;
    email: string;
    phone: string;
    vertical_id?: string | null;
    org_id?: string | null;
    booking_attempt_id?: string | null;
  }
): Promise<string> {
  const { first_name, last_name, email, phone, vertical_id, org_id, booking_attempt_id: attemptId } = params;
  const logPrefix = `[BOOKING_RESOLVER] booking_attempt_id=${attemptId ?? "none"}`;

  // Determine customer name with safe fallback
  let customerName: string;
  if (first_name && last_name) {
    customerName = `${first_name} ${last_name}`.trim();
  } else if (first_name) {
    customerName = first_name;
  } else if (email) {
    customerName = email;
  } else if (phone) {
    customerName = phone;
  } else {
    customerName = "New Customer";
  }

  // Schema note: `customers` has no top-level email/phone columns in Alloy; mirror book-v2 confirm (metadata only).
  const customerPayload: Record<string, unknown> = {
    name: customerName,
    primary_contact_id: contactId,
    status: "active",
    metadata: {
      source: "booking-resolver",
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    },
  };
  if (vertical_id) {
    customerPayload.vertical_id = vertical_id;
  }
  if (org_id != null) {
    customerPayload.org_id = org_id;
  }

  console.log(`${logPrefix} customers.insert primary_contact_id=${contactId} name_set=${!!customerName}`);
  const { data: newCustomer, error: customerError } = await supabase
    .from("customers")
    .insert(customerPayload)
    .select("id")
    .single();

  if (customerError) {
    // Handle uniqueness conflict (idempotency)
    if (customerError.code === "23505" || customerError.message?.includes("duplicate") || customerError.message?.includes("unique")) {
      console.log(`${logPrefix} customer insert conflict; re-select by primary_contact_id=${contactId}`);
      const { data: conflictCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("primary_contact_id", contactId)
        .limit(1)
        .maybeSingle();
      if (conflictCustomer) {
        console.log(`${logPrefix} reused customer after conflict customer_id=${conflictCustomer.id}`);
        await supabase.from("contacts").update({ customer_id: conflictCustomer.id }).eq("id", contactId);
        return conflictCustomer.id;
      } else {
        console.error(`${logPrefix} customer 23505 but no row for primary_contact_id`, customerError);
        throw new Error(`Customer conflict but re-select failed: ${customerError.message}`);
      }
    } else {
      console.error(`${logPrefix} customers.insert failed code=${customerError.code} message=${customerError.message}`, customerError);
      throw new Error(`Failed to create customer: ${customerError.message}`);
    }
  }

  if (!newCustomer) {
    throw new Error("Customer creation returned no data");
  }

  const customerId = newCustomer.id;
  console.log(`${logPrefix} created new customer customer_id=${customerId} primary_contact_id=${contactId}`);

  const { error: linkError } = await supabase.from("contacts").update({ customer_id: customerId }).eq("id", contactId);

  if (linkError) {
    console.error(`${logPrefix} failed to set contacts.customer_id code=${linkError.code} message=${linkError.message}`);
  } else {
    console.log(`${logPrefix} linked contact to customer contact_id=${contactId} customer_id=${customerId}`);
  }

  return customerId;
}

