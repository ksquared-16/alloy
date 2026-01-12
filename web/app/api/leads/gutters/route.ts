import { NextRequest, NextResponse } from "next/server";
import {
  findContactByEmailOrPhone,
  upsertContact,
  findVerticalIdByKey,
  createOpportunity,
} from "@/lib/supabase";

/**
 * POST /api/leads/gutters
 * 
 * Creates a gutter lead in Supabase:
 * 1. Upserts contact (match by email, fallback phone)
 * 2. Looks up existing vertical_id for "gutters" (if any)
 * 3. Creates opportunity representing the lead
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

    // Normalize phone (basic normalization - remove non-digits except +)
    const phoneNormalized = phone
      ? phone.replace(/[^\d+]/g, "").replace(/^\+?1/, "").replace(/^/, "+1")
      : undefined;

    // Step 1: Find or create contact
    const existingContact = await findContactByEmailOrPhone(email, phoneNormalized);
    
    const contactMetadata: Record<string, any> = {};
    if (address_line1) contactMetadata.address_line1 = address_line1;
    if (city) contactMetadata.city = city;

    const contact = await upsertContact(
      {
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email?.trim() || undefined,
        phone: phoneNormalized,
        contact_type: "lead",
        metadata: Object.keys(contactMetadata).length > 0 ? contactMetadata : undefined,
      },
      existingContact?.id
    );

    const contactId = contact.id;

    // Step 2: Look up existing vertical_id for "gutters" (if any opportunities exist)
    // If none found, vertical_id will be null (which is fine - vertical stored in metadata)
    const verticalId = await findVerticalIdByKey("gutters");

    // Step 3: Create opportunity
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
      vertical_id: verticalId ?? undefined,
      primary_contact_id: contactId,
      name: `${first_name} ${last_name} — Gutters Early Access`,
      status: "open",
      source: "website",
      metadata: opportunityMetadata,
    });

    // Log for debugging (server-side only)
    console.log(
      `[GUTTERS_LEAD] contact_id=${contactId} opportunity_id=${opportunity.id} vertical_id=${verticalId || "null"} app_env=${appEnv}`
    );

    return NextResponse.json({
      ok: true,
      contact_id: contactId,
      opportunity_id: opportunity.id,
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

