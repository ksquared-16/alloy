import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import {
  coalesceBookV2BedBathRaw,
  homeTypeInputToStableKey,
  parseBathroomsForCjd,
  parseBedsFromBody,
  parseRoomCount,
  splitBookV2LocationAccess,
  uiAccessMethodToStableKey,
} from "@/lib/book-v2/bookingCanonicalMaps";
import { loadPublicBookingFieldDefRows } from "@/lib/fields/loadPublicBookingFieldDefs";
import { upsertConfigurableFieldValuesForEntity } from "@/lib/fields/upsertConfigurableFieldValues";
import {
  loadSqftTiersForVertical,
  normalizeSqftKeyInput,
} from "@/lib/book-v2/loadCleaningPricingCatalog";

export type ServiceDetailsBody = {
  opportunity_id: string;
  address: string;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  home_type?: string | null;
  bedrooms?: string | null;
  bathrooms?: string | null;
  access_method: string;
  access_note?: string | null;
  /** @deprecated Ignored; access text uses access_note + native columns only. */
  additional_notes?: string | null;
  /**
   * Native `locations.has_pets` (boolean column) when this flag is sent.
   * The same snapshot is mirrored into configurable `pets` field_values ("true"/"false") when that
   * public field exists, so admin/registry can stay consistent. There is no separate “pets-only” custom path:
   * checkbox + column stay in sync on this route.
   */
  has_pets?: boolean | string | number | null;
  /** Public-booking field keys → raw values (aligned with field_definitions). */
  configurable_field_values?: Record<string, unknown> | null;
};

/**
 * POST /api/book-v2/service-details
 * Persists address + access on the linked location, optional location field_values, and
 * `metadata.book_v2_service_property` as the authoritative service/property snapshot (not a shadow copy in service_details_preview).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ServiceDetailsBody;
    const opportunityId = body.opportunity_id?.trim();
    if (!opportunityId) {
      return NextResponse.json({ ok: false, message: "opportunity_id is required" }, { status: 400 });
    }
    const address = (body.address ?? "").trim();
    const city = (body.city ?? "").trim();
    if (!address || !city) {
      return NextResponse.json({ ok: false, message: "address and city are required" }, { status: 400 });
    }
    const accessMethod = (body.access_method ?? "home").trim() || "home";
    const hasPets =
      body.has_pets === true || body.has_pets === "true" || body.has_pets === 1
        ? true
        : body.has_pets === false || body.has_pets === "false" || body.has_pets === 0
          ? false
          : null;
    const { access_code: locAccessCode, access_notes: locAccessNotes } = splitBookV2LocationAccess({
      access_method: accessMethod,
      access_note: body.access_note,
      additional_notes: null,
    });

    const supabase = createServiceRoleClient();
    const accessMethodKey = uiAccessMethodToStableKey(accessMethod);
    const { data: opp, error: oppErr } = await supabase
      .from("opportunities")
      .select("id, org_id, location_id, metadata, vertical_id")
      .eq("id", opportunityId)
      .maybeSingle();

    if (oppErr || !opp) {
      return NextResponse.json({ ok: false, message: "Opportunity not found" }, { status: 404 });
    }

    const orgId = (opp as { org_id?: string | null }).org_id ?? null;
    const locationId = (opp as { location_id?: string | null }).location_id ?? null;
    const verticalId = (opp as { vertical_id?: string | null }).vertical_id ?? null;
    if (!locationId) {
      return NextResponse.json({ ok: false, message: "Opportunity has no location" }, { status: 400 });
    }
    if (!orgId) {
      return NextResponse.json({ ok: false, message: "Opportunity has no org" }, { status: 400 });
    }

    const state = body.state != null ? String(body.state).trim() || null : null;
    const postal = body.postal_code != null ? String(body.postal_code).trim() || null : null;
    const locUpdate: Record<string, unknown> = {
      address1: address,
      city,
      state,
      postal_code: postal,
      access_method_key: accessMethodKey,
      access_method_id: null,
      access_notes: locAccessNotes,
      access_code: locAccessCode,
      updated_at: new Date().toISOString(),
    };
    if (hasPets === true || hasPets === false) locUpdate.has_pets = hasPets;

    const cfgBag = (body.configurable_field_values && typeof body.configurable_field_values === "object"
      ? body.configurable_field_values
      : {}) as Record<string, unknown>;
    const mergedByKey: Record<string, unknown> = { ...cfgBag };
    if (body.home_type != null && String(body.home_type).trim()) mergedByKey.home_type = body.home_type;
    if (body.bedrooms != null && String(body.bedrooms).trim()) mergedByKey.bedrooms = body.bedrooms;
    if (body.bathrooms != null && String(body.bathrooms).trim()) mergedByKey.bathrooms = body.bathrooms;
    if (hasPets === true || hasPets === false) mergedByKey.pets = hasPets ? "true" : "false";

    const homeTypeLabel =
      body.home_type != null && String(body.home_type).trim()
        ? String(body.home_type).trim()
        : typeof mergedByKey.home_type === "string"
          ? mergedByKey.home_type.trim() || null
          : null;
    const bedRaw = coalesceBookV2BedBathRaw(body.bedrooms, mergedByKey, "bedrooms", "beds");
    const bathRaw = coalesceBookV2BedBathRaw(body.bathrooms, mergedByKey, "bathrooms", "baths");
    const homeTypeKey = homeTypeInputToStableKey(homeTypeLabel);
    const bedsNum = parseBedsFromBody(bedRaw);
    const bathParsed = parseBathroomsForCjd(bathRaw);
    const bathsNum = bathParsed.baths;

    if (homeTypeKey) locUpdate.home_type_key = homeTypeKey;
    if (bedsNum != null) locUpdate.beds = bedsNum;
    if (bathsNum != null) locUpdate.baths = bathsNum;

    const meta = ((opp as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
    const quoteInput = (meta.quote_input as Record<string, unknown> | undefined) ?? {};
    const sqftRaw = quoteInput.square_footage;
    if (verticalId && sqftRaw != null && String(sqftRaw).trim() !== "") {
      const tiers = await loadSqftTiersForVertical(supabase, verticalId);
      locUpdate.square_footage_tier_key = normalizeSqftKeyInput(sqftRaw as string | number, tiers);
    }

    const { error: locErr } = await supabase.from("locations").update(locUpdate).eq("id", locationId).eq("org_id", orgId);

    if (locErr) {
      console.error("[BOOK_V2_SERVICE_DETAILS] location update failed", locErr.message);
      return NextResponse.json({ ok: false, message: "Failed to update location" }, { status: 500 });
    }

    const publicDefs = await loadPublicBookingFieldDefRows(supabase, orgId, "location");
    await upsertConfigurableFieldValuesForEntity(supabase, orgId, "location", locationId, publicDefs, mergedByKey);

    delete meta.service_details_preview;

    const book_v2_service_property = {
      home_type_key: homeTypeKey,
      home_type_label: homeTypeLabel,
      bedrooms: bedsNum ?? parseRoomCount(bedRaw != null ? String(bedRaw) : undefined),
      bathrooms: bathsNum,
      bathrooms_booking_key: bathParsed.bookingKey,
      has_pets: hasPets,
      access_method: accessMethod,
      access_method_key: accessMethodKey,
      access_note: body.access_note ?? null,
      address_line1: address,
      city,
      state,
      postal_code: postal,
      saved_at: new Date().toISOString(),
    };

    await supabase
      .from("opportunities")
      .update({
        metadata: {
          ...meta,
          service_details_saved_at: book_v2_service_property.saved_at,
          book_v2_service_property,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunityId);

    return NextResponse.json({ ok: true, location_id: locationId });
  } catch (e) {
    console.error("[BOOK_V2_SERVICE_DETAILS]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "service-details failed" },
      { status: 500 }
    );
  }
}
