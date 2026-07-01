import { NextRequest, NextResponse } from "next/server";
import {
  findContactByEmail,
  findContactByPhone,
  createContact,
  updateContact,
  getVerticalIdBySlug,
  createOpportunity,
  fetchContactIdentityById,
} from "@/lib/supabase";
import { emitEvent } from "@/lib/emitEvent";

/**
 * POST /api/leads/gutters
 *
 * LEGACY_COMPAT: inbound gutter leads still upsert `contacts` and set `primary_contact_id` on the
 * opportunity for workflow/messaging compatibility. When `contacts.person_id` is populated,
 * we also set `primary_person_id` (canonical). Do not introduce new contact-only CRM flows—prefer
 * quote-start / person-first paths for new surfaces.
 *
 * Steps:
 * 1. Upsert contact (match by email, fallback phone)
 * 2. Resolve vertical_id for slug "gutters"
 * 3. Create opportunity with vertical_id, primary_contact_id, and primary_person_id when available
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      first_name,
      last_name,
      email,
      phone,
      address_line1,
      city,
      notes,
    } = body;

    // Validation: require at least phone OR email
    if (!phone && !email) {
      return NextResponse.json(
        { ok: false, error: "Phone or email is required" },
        { status: 400 }
      );
    }

    if (!first_name || !last_name) {
      return NextResponse.json(
        { ok: false, error: "First name and last name are required" },
        { status: 400 }
      );
    }

    // Normalize: email lowercase + trim, phone trim only
    const emailNormalized = email ? email.trim().toLowerCase() : undefined;
    const phoneNormalized = phone ? phone.trim() : undefined;

    // Step 1: Find existing contact
    let existingContact: { id: string; first_name?: string; last_name?: string; phone?: string; email?: string } | null = null;
    let matchMethod = "";

    if (emailNormalized) {
      existingContact = await findContactByEmail(emailNormalized);
      if (existingContact) {
        matchMethod = "email";
        console.log(`[GUTTERS_LEAD] Found existing contact by email: ${existingContact.id}`);
      }
    }

    if (!existingContact && phoneNormalized) {
      existingContact = await findContactByPhone(phoneNormalized);
      if (existingContact) {
        matchMethod = "phone";
        console.log(`[GUTTERS_LEAD] Found existing contact by phone: ${existingContact.id}`);
      }
    }

    // Step 2: Upsert contact (update if found, create if not)
    let contactId: string;
    const contactMetadata: Record<string, any> = {};
    if (address_line1) contactMetadata.address_line1 = address_line1;
    if (city) contactMetadata.city = city;

    if (existingContact) {
      // Update existing contact - fill in missing fields
      const updateData: any = {
        contact_type: "lead",
      };

      // Only update fields that are missing or empty in existing contact
      if (!existingContact.first_name && first_name) {
        updateData.first_name = first_name.trim();
      }
      if (!existingContact.last_name && last_name) {
        updateData.last_name = last_name.trim();
      }
      if (!existingContact.email && emailNormalized) {
        updateData.email = emailNormalized;
      }
      if (!existingContact.phone && phoneNormalized) {
        updateData.phone = phoneNormalized;
      }

      // Merge metadata
      if (Object.keys(contactMetadata).length > 0) {
        updateData.metadata = contactMetadata;
      }

      const updated = await updateContact(existingContact.id, updateData);
      contactId = updated.id;
      console.log(`[GUTTERS_LEAD] Updated existing contact: ${contactId} (matched by ${matchMethod})`);
    } else {
      // Create new contact
      const newContact = await createContact({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: emailNormalized,
        phone: phoneNormalized,
        contact_type: "lead",
        metadata: Object.keys(contactMetadata).length > 0 ? contactMetadata : undefined,
      });
      contactId = newContact.id;
      console.log(`[GUTTERS_LEAD] Created new contact: ${contactId}`);
    }

    // Step 3: Get vertical_id from verticals table
    const verticalId = await getVerticalIdBySlug("gutters");
    console.log(`[GUTTERS_LEAD] Found vertical_id for gutters: ${verticalId}`);

    // Step 4: Create opportunity
    const appEnv = process.env.NEXT_PUBLIC_APP_ENV || "production";
    const opportunityMetadata: Record<string, any> = {
      vertical: "gutters",
      early_access: true,
      app_env: appEnv,
      intake: {
        address: address_line1,
        notes,
      },
      timestamp: new Date().toISOString(),
    };

    // Add UTM params if present in request
    const utmParams = request.nextUrl.searchParams;
    if (utmParams.toString()) {
      opportunityMetadata.utm = Object.fromEntries(utmParams.entries());
    }

    const contactIdentity = await fetchContactIdentityById(contactId);
    const primaryPersonId =
      typeof contactIdentity?.person_id === "string" && contactIdentity.person_id.trim()
        ? contactIdentity.person_id.trim()
        : undefined;

    const opportunity = await createOpportunity({
      vertical_id: verticalId,
      primary_contact_id: contactId,
      ...(primaryPersonId ? { primary_person_id: primaryPersonId } : {}),
      name: `${first_name} ${last_name} — Gutter Cleaning`,
      status: "open",
      source: "website",
      metadata: opportunityMetadata,
    });

    console.log(
      `[GUTTERS_LEAD_SUCCESS] contact_id=${contactId} opportunity_id=${opportunity.id} vertical_id=${verticalId} app_env=${appEnv}`
    );

    const orgId = process.env.ALLOY_PUBLIC_ORG_ID?.trim() || null;
    if (orgId) {
      try {
        await emitEvent({
          org_id: orgId,
          event_type: "gutter_lead_submitted",
          entity_type: "opportunity",
          entity_id: opportunity.id,
          payload: {
            event_type: "gutter_lead_submitted",
            opportunity_id: opportunity.id,
            primary_person_id: opportunity.primary_person_id,
            fallback_contact_id: contactId,
            vertical_id: verticalId,
            source: "website",
          },
        });
      } catch (e) {
        console.warn("[GUTTERS_LEAD] emitEvent failed (non-fatal)", e);
      }
    }

    return NextResponse.json({
      ok: true,
      contactId: contactId,
      opportunityId: opportunity.id,
    });
  } catch (error: any) {
    console.error("[GUTTERS_LEAD_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Failed to create gutter lead",
      },
      { status: 500 }
    );
  }
}

