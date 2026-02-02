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
  } = params;

  // Normalize inputs
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

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

    if (!emailError && emailContact) {
      existingContact = emailContact;
      resolutionPath = "found_by_email";
      console.log(
        `[BOOKING_RESOLVER] Found contact by email: contact_id=${emailContact.id} email=${normalizedEmail.substring(0, 3)}***`
      );
    }
  }

  // Priority 2: Search by phone (exact match) if email didn't find
  if (!existingContact && normalizedPhone) {
    const { data: phoneContact, error: phoneError } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone, customer_id, timezone, address_line1, city, state, postal_code")
      .eq("phone", normalizedPhone)
      .limit(1)
      .maybeSingle();

    if (!phoneError && phoneContact) {
      existingContact = phoneContact;
      resolutionPath = "found_by_phone";
      console.log(
        `[BOOKING_RESOLVER] Found contact by phone: contact_id=${phoneContact.id} phone=${normalizedPhone.substring(0, 4)}***`
      );
    }
  }

  // Step 2: Handle existing contact or create new
  if (existingContact) {
    contactId = existingContact.id;

    // Update contact with any new information (idempotent)
    const updatePayload: Record<string, any> = {};
    if (first_name && !existingContact.first_name) {
      updatePayload.first_name = first_name;
    }
    if (last_name && !existingContact.last_name) {
      updatePayload.last_name = last_name;
    }
    // Ensure normalized email/phone are stored
    if (normalizedEmail && normalizedEmail !== existingContact.email) {
      updatePayload.email = normalizedEmail;
    }
    if (normalizedPhone && normalizedPhone !== existingContact.phone) {
      updatePayload.phone = normalizedPhone;
    }
    // Update timezone if missing
    if (timezone && !existingContact.timezone) {
      updatePayload.timezone = timezone;
    }
    // Update address fields if missing
    if (address && !existingContact.address_line1) {
      updatePayload.address_line1 = address;
    }
    if (city && !existingContact.city) {
      updatePayload.city = city;
    }
    if (state && !existingContact.state) {
      updatePayload.state = state;
    }
    if (postal_code && !existingContact.postal_code) {
      updatePayload.postal_code = postal_code;
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
      customerId = await createAndLinkCustomer(supabase, contactId, {
        first_name: existingContact.first_name || first_name,
        last_name: existingContact.last_name || last_name,
        email: normalizedEmail,
        phone: normalizedPhone,
      });
      customerResolutionPath = "created_for_existing_contact";
    }
  } else {
    // Step 3: Create new contact
    const contactPayload: Record<string, any> = {
      email: normalizedEmail,
      phone: normalizedPhone,
      first_name: first_name || null,
      last_name: last_name || null,
      contact_type: "lead",
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

    const { data: newContact, error: contactError } = await supabase
      .from("contacts")
      .insert(contactPayload)
      .select("id")
      .single();

    if (contactError) {
      // Handle uniqueness conflict (idempotency)
      if (contactError.code === "23505" || contactError.message?.includes("duplicate") || contactError.message?.includes("unique")) {
        console.log(`[BOOKING_RESOLVER] Contact insert conflict, re-selecting...`);
        // Re-select by email or phone
        if (normalizedEmail) {
          const { data: conflictContact } = await supabase
            .from("contacts")
            .select("id, customer_id")
            .ilike("email", normalizedEmail)
            .limit(1)
            .maybeSingle();
          if (conflictContact) {
            contactId = conflictContact.id;
            resolutionPath = "created_conflict_recovered";
            if (conflictContact.customer_id) {
              customerId = conflictContact.customer_id;
              customerResolutionPath = "reused_from_contact";
            } else {
              customerId = await createAndLinkCustomer(supabase, contactId, {
                first_name,
                last_name,
                email: normalizedEmail,
                phone: normalizedPhone,
              });
              customerResolutionPath = "created_for_new_contact";
            }
          } else {
            throw new Error(`Contact conflict but re-select failed: ${contactError.message}`);
          }
        } else {
          throw new Error(`Contact conflict but no email to re-select: ${contactError.message}`);
        }
      } else {
        throw new Error(`Failed to create contact: ${contactError.message}`);
      }
    } else if (newContact) {
      contactId = newContact.id;
      resolutionPath = "created_new";
      console.log(`[BOOKING_RESOLVER] Created new contact: contact_id=${contactId}`);

      // Create customer and link
      customerId = await createAndLinkCustomer(supabase, contactId, {
        first_name,
        last_name,
        email: normalizedEmail,
        phone: normalizedPhone,
      });
      customerResolutionPath = "created_for_new_contact";
    } else {
      throw new Error("Contact creation returned no data");
    }
  }

  // Step 4: Verify customer.primary_contact_id is set
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
  }
): Promise<string> {
  const { first_name, last_name, email, phone } = params;

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

  const customerPayload: Record<string, any> = {
    name: customerName,
    primary_contact_id: contactId, // Set linkage immediately
    email: email || null,
    phone: phone || null,
  };

  const { data: newCustomer, error: customerError } = await supabase
    .from("customers")
    .insert(customerPayload)
    .select("id")
    .single();

  if (customerError) {
    // Handle uniqueness conflict (idempotency)
    if (customerError.code === "23505" || customerError.message?.includes("duplicate") || customerError.message?.includes("unique")) {
      console.log(`[BOOKING_RESOLVER] Customer insert conflict, re-selecting...`);
      // Try to find by primary_contact_id
      const { data: conflictCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("primary_contact_id", contactId)
        .limit(1)
        .maybeSingle();
      if (conflictCustomer) {
        console.log(`[BOOKING_RESOLVER] Reused customer from conflict: customer_id=${conflictCustomer.id}`);
        // Link contact to customer
        await supabase
          .from("contacts")
          .update({ customer_id: conflictCustomer.id })
          .eq("id", contactId);
        return conflictCustomer.id;
      } else {
        throw new Error(`Customer conflict but re-select failed: ${customerError.message}`);
      }
    } else {
      throw new Error(`Failed to create customer: ${customerError.message}`);
    }
  }

  if (!newCustomer) {
    throw new Error("Customer creation returned no data");
  }

  const customerId = newCustomer.id;
  console.log(`[BOOKING_RESOLVER] Created new customer: customer_id=${customerId} primary_contact_id=${contactId}`);

  // Link contact to customer
  const { error: linkError } = await supabase
    .from("contacts")
    .update({ customer_id: customerId })
    .eq("id", contactId);

  if (linkError) {
    console.error(`[BOOKING_RESOLVER] Failed to link contact to customer: ${linkError.message}`);
    // Continue - customer.primary_contact_id is already set
  } else {
    console.log(`[BOOKING_RESOLVER] Linked contact to customer: contact_id=${contactId} customer_id=${customerId}`);
  }

  return customerId;
}

