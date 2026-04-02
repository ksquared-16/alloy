import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { parseRoomCount, splitBookV2LocationAccess } from "@/lib/book-v2/bookingCanonicalMaps";
import { resolveAccessMethodIdByUiKey, resolveHomeTypeIdByLabel } from "@/lib/book-v2/resolveBookV2CatalogIds";
import {
  getFieldDefinitionMeta,
  upsertTypedFieldValue,
} from "@/lib/bookV2/fieldValueUpsert";

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
  additional_notes?: string | null;
  has_pets?: boolean | string | number | null;
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
      additional_notes: body.additional_notes,
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

    const homeTypeLabel = body.home_type != null ? String(body.home_type).trim() || null : null;
    const homeTypeId = await resolveHomeTypeIdByLabel(supabase, homeTypeLabel);
    const bedroomsNum = parseRoomCount(body.bedrooms ?? undefined);
    const bathroomsNum = parseRoomCount(body.bathrooms ?? undefined);

    const optionalLocationWrites: { key: string; value: unknown }[] = [
      { key: "home_type", value: homeTypeLabel },
      { key: "bedrooms", value: bedroomsNum != null ? String(bedroomsNum) : body.bedrooms },
      { key: "bathrooms", value: bathroomsNum != null ? String(bathroomsNum) : body.bathrooms },
      { key: "pets", value: hasPets === true ? "true" : hasPets === false ? "false" : undefined },
    ];
    for (const { key, value } of optionalLocationWrites) {
      if (value === undefined || value === null || value === "") continue;
      const def = await getFieldDefinitionMeta(supabase, orgId, "location", key);
      if (!def) continue;
      await upsertTypedFieldValue(
        supabase,
        orgId,
        "location",
        locationId,
        def,
        typeof value === "boolean" ? (value ? "true" : "false") : String(value).trim()
      );
    }

    const meta = ((opp as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
    delete meta.service_details_preview;

    const book_v2_service_property = {
      home_type_id: homeTypeId,
      home_type_label: homeTypeLabel,
      bedrooms: bedroomsNum,
      bathrooms: bathroomsNum,
      has_pets: hasPets,
      access_method: accessMethod,
      access_note: body.access_note ?? null,
      additional_notes: body.additional_notes ?? null,
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
