import { NextRequest, NextResponse } from "next/server";
import {
  findContactByEmail,
  findContactByPhone,
  createContact,
  updateContact,
  getVerticalIdBySlug,
  createOpportunity,
} from "@/lib/supabase";

/**
 * POST /api/leads/gutters
 * 
 * Creates a gutter lead in Supabase:
 * 1. Upserts contact (match by email, fallback phone)
 * 2. Gets vertical_id from verticals table by slug="gutters"
 * 3. Creates opportunity with correct vertical_id and primary_contact_id
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

    const opportunity = await createOpportunity({
      vertical_id: verticalId,
      primary_contact_id: contactId,
      name: `${first_name} ${last_name} — Gutter Cleaning`,
      status: "open",
      source: "website",
      metadata: opportunityMetadata,
    });

    console.log(
      `[GUTTERS_LEAD_SUCCESS] contact_id=${contactId} opportunity_id=${opportunity.id} vertical_id=${verticalId} app_env=${appEnv}`
    );

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

