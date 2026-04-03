import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { parseRoomCount, splitBookV2LocationAccess } from "@/lib/book-v2/bookingCanonicalMaps";
import { resolveAccessMethodIdByUiKey, resolveHomeTypeIdByLabel } from "@/lib/book-v2/resolveBookV2CatalogIds";
import {
  getFieldDefinitionMeta,
  serializeSquareFootageForFieldValue,
  upsertTypedFieldValue,
} from "@/lib/bookV2/fieldValueUpsert";
import { loadPublicBookingFieldDefRows } from "@/lib/fields/loadPublicBookingFieldDefs";
import { upsertConfigurableFieldValuesForEntity } from "@/lib/fields/upsertConfigurableFieldValues";

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
    const accessMethodId = await resolveAccessMethodIdByUiKey(supabase, accessMethod);
    const { data: opp, error: oppErr } = await supabase
      .from("opportunities")
      .select("id, org_id, location_id, metadata")
      .eq("id", opportunityId)
      .maybeSingle();

    if (oppErr || !opp) {
      return NextResponse.json({ ok: false, message: "Opportunity not found" }, { status: 404 });
    }

    const orgId = (opp as { org_id?: string | null }).org_id ?? null;
    const locationId = (opp as { location_id?: string | null }).location_id ?? null;
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
      access_method_id: accessMethodId,
      access_notes: locAccessNotes,
      access_code: locAccessCode,
      updated_at: new Date().toISOString(),
    };
    if (hasPets === true || hasPets === false) locUpdate.has_pets = hasPets;

    const { error: locErr } = await supabase.from("locations").update(locUpdate).eq("id", locationId).eq("org_id", orgId);

    if (locErr) {
      console.error("[BOOK_V2_SERVICE_DETAILS] location update failed", locErr.message);
      return NextResponse.json({ ok: false, message: "Failed to update location" }, { status: 500 });
    }

    const cfgBag = (body.configurable_field_values && typeof body.configurable_field_values === "object"
      ? body.configurable_field_values
      : {}) as Record<string, unknown>;
    const mergedByKey: Record<string, unknown> = { ...cfgBag };
    if (body.home_type != null && String(body.home_type).trim()) mergedByKey.home_type = body.home_type;
    if (body.bedrooms != null && String(body.bedrooms).trim()) mergedByKey.bedrooms = body.bedrooms;
    if (body.bathrooms != null && String(body.bathrooms).trim()) mergedByKey.bathrooms = body.bathrooms;
    if (hasPets === true || hasPets === false) mergedByKey.pets = hasPets ? "true" : "false";

    const publicDefs = await loadPublicBookingFieldDefRows(supabase, orgId, "location");
    await upsertConfigurableFieldValuesForEntity(
      supabase,
      orgId,
      "location",
      locationId,
      publicDefs,
      mergedByKey
    );

    const homeTypeLabel =
      body.home_type != null && String(body.home_type).trim()
        ? String(body.home_type).trim()
        : typeof mergedByKey.home_type === "string"
          ? mergedByKey.home_type.trim() || null
          : null;
    const bedRaw =
      body.bedrooms != null && String(body.bedrooms).trim()
        ? body.bedrooms
        : mergedByKey.bedrooms;
    const bathRaw =
      body.bathrooms != null && String(body.bathrooms).trim()
        ? body.bathrooms
        : mergedByKey.bathrooms;
    const homeTypeId = await resolveHomeTypeIdByLabel(supabase, homeTypeLabel);
    const bedroomsNum = parseRoomCount(bedRaw != null ? String(bedRaw) : undefined);
    const bathroomsNum = parseRoomCount(bathRaw != null ? String(bathRaw) : undefined);

    const meta = ((opp as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
    delete meta.service_details_preview;

    const quoteInput = (meta.quote_input as Record<string, unknown> | undefined) ?? {};
    const sqftFromQuote = quoteInput.square_footage;
    if (sqftFromQuote != null && String(sqftFromQuote).trim() !== "") {
      const sqDef = await getFieldDefinitionMeta(supabase, orgId, "location", "square_footage");
      if (sqDef) {
        await upsertTypedFieldValue(
          supabase,
          orgId,
          "location",
          locationId,
          sqDef,
          serializeSquareFootageForFieldValue(sqftFromQuote)
        );
      }
    }

    const book_v2_service_property = {
      home_type_id: homeTypeId,
      home_type_label: homeTypeLabel,
      bedrooms: bedroomsNum,
      bathrooms: bathroomsNum,
      has_pets: hasPets,
      access_method: accessMethod,
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
