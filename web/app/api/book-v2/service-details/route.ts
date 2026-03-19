import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { getFieldDefinitionMeta, upsertTypedFieldValue } from "@/lib/bookV2/fieldValueUpsert";

const ACCESS_METHOD_LABELS: Record<string, string> = {
  home: "I will be home",
  code: "Door/Garage Code",
  key: "Hidden Key",
  building: "Building / Front Desk",
};

function composeAccessNotes(accessMethod: string, accessNote: string | null | undefined): string | null {
  const label = ACCESS_METHOD_LABELS[accessMethod] ?? accessMethod;
  if (accessMethod === "home") return label;
  const n = accessNote?.trim();
  if (!n) return label;
  return `${label}: ${n}`;
}

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
};

/**
 * POST /api/book-v2/service-details
 * Persists property / access details to the opportunity's linked location (system columns + configurable field_values).
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

    const supabase = createServiceRoleClient();
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
    const accessNotes = composeAccessNotes(accessMethod, body.access_note);

    const { error: locErr } = await supabase
      .from("locations")
      .update({
        address1: address,
        city,
        state,
        postal_code: postal,
        access_notes: accessNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", locationId)
      .eq("org_id", orgId);

    if (locErr) {
      console.error("[BOOK_V2_SERVICE_DETAILS] location update failed", locErr.message);
      return NextResponse.json({ ok: false, message: "Failed to update location" }, { status: 500 });
    }

    const optionalWrites: { key: string; value: unknown }[] = [
      { key: "home_type", value: body.home_type },
      { key: "bedrooms", value: body.bedrooms },
      { key: "bathrooms", value: body.bathrooms },
      { key: "access_method", value: accessMethod },
      { key: "additional_notes", value: body.additional_notes },
    ];

    for (const { key, value } of optionalWrites) {
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
    await supabase
      .from("opportunities")
      .update({
        metadata: {
          ...meta,
          service_details_saved_at: new Date().toISOString(),
          service_details_preview: {
            address,
            city,
            state,
            postal_code: postal,
            home_type: body.home_type ?? null,
            bedrooms: body.bedrooms ?? null,
            bathrooms: body.bathrooms ?? null,
            access_method: accessMethod,
            access_note: body.access_note ?? null,
            additional_notes: body.additional_notes ?? null,
          },
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
