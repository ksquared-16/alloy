import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail, normalizePhone } from "@/lib/contactNormalize";
import { emitEvent } from "@/lib/emitEvent";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import type { CleaningFrequencyOption, SquareFootageOption } from "@/lib/pricing/cleaningPricing";
import { mapServiceTypeToKey, mapFrequencyToKey, mapAddOnsToKeys } from "@/lib/pricing/supabasePricing";
import type { SupabaseQuoteResult } from "@/lib/pricing/supabasePricing";
import type { AddOnId } from "@/lib/pricing/cleaningPricing";
import { payloadFromFieldType } from "@/lib/admin/typedFieldValues";
/** Opportunity Statuses pipeline — Quote Started stage (website quote submission). */
const QUOTE_STARTED_PIPELINE_STAGE_ID = "0cd4bcc7-2dc0-4706-89a7-5cf8307c8b62";

const SERVICE_TYPE = "Standard Cleaning";
const SQUARE_FOOTAGE_OPTIONS: { max: number; key: SquareFootageOption }[] = [
  { max: 1500, key: "Under 1500 sq ft" },
  { max: 2000, key: "1501–2,000 sq ft" },
  { max: 2600, key: "2,001-2,600 sq ft" },
  { max: 3200, key: "2,601-3,200 sq ft" },
  { max: 4000, key: "3,201-4,000 sq ft" },
  { max: 5500, key: "4,001-5,500 sq ft" },
  { max: Infinity, key: "Over 5,500 sq ft" },
];

const SQUARE_FOOTAGE_KEYS: SquareFootageOption[] = [
  "Under 1500 sq ft",
  "1501–2,000 sq ft",
  "2,001-2,600 sq ft",
  "2,601-3,200 sq ft",
  "3,201-4,000 sq ft",
  "4,001-5,500 sq ft",
  "Over 5,500 sq ft",
];

function squareFootageToOption(sqft: number | null | undefined): SquareFootageOption {
  if (sqft == null || sqft <= 0) return "Under 1500 sq ft";
  for (const { max, key } of SQUARE_FOOTAGE_OPTIONS) {
    if (sqft <= max) return key;
  }
  return "Over 5,500 sq ft";
}

/** Normalize body square_footage (bucket string or number) to SquareFootageOption for get_quote_pricing. */
function normalizeSquareFootageInput(
  val: string | number | null | undefined
): SquareFootageOption {
  if (val == null) return "Under 1500 sq ft";
  const s = typeof val === "string" ? val.trim() : null;
  if (s && (SQUARE_FOOTAGE_KEYS as string[]).includes(s)) return s as SquareFootageOption;
  const num = typeof val === "number" ? val : parseInt(String(val), 10);
  if (!Number.isNaN(num)) return squareFootageToOption(num);
  return "Under 1500 sq ft";
}

function mapApiFrequencyToOption(
  freq: "one_time" | "weekly" | "biweekly" | "monthly" | null | undefined
): CleaningFrequencyOption {
  switch (freq) {
    case "weekly":
      return "Weekly (30% Off)";
    case "biweekly":
      return "Bi-Weekly (20% Off)";
    case "monthly":
      return "Monthly (10% Off)";
    default:
      return "One-time";
  }
}

/** Map display option to API key so quote_input.cleaning_frequency matches the quote we computed. */
function optionToApiKey(option: CleaningFrequencyOption): "one_time" | "weekly" | "biweekly" | "monthly" {
  if (option === "Weekly (30% Off)") return "weekly";
  if (option === "Bi-Weekly (20% Off)") return "biweekly";
  if (option === "Monthly (10% Off)") return "monthly";
  return "one_time";
}

/**
 * Compute initial quote using Supabase RPC (admin client).
 */
async function computeQuote(
  supabase: ReturnType<typeof createServiceRoleClient>,
  squareFootageOption: SquareFootageOption,
  frequencyOption: CleaningFrequencyOption,
  addOns: AddOnId[] = []
): Promise<{ estimated_price: number | null; first_clean_price: number | null; recurring_price: number | null; frequency_label: string }> {
  const serviceKey = mapServiceTypeToKey(SERVICE_TYPE);
  const frequencyKey = mapFrequencyToKey(frequencyOption) ?? "";
  const addonKeys = mapAddOnsToKeys(addOns);

  const { data, error } = await supabase.rpc("get_quote_pricing", {
    p_vertical_slug: "cleaning",
    p_service_key: serviceKey,
    p_sqft_key: squareFootageOption,
    p_frequency_key: frequencyKey,
    p_addon_keys: addonKeys ?? [],
  });

  if (error || !data) {
    console.warn("[QUOTE_START] RPC get_quote_pricing failed, using fallback:", error?.message);
    const firstClean = 180; // fallback
    return {
      estimated_price: firstClean,
      first_clean_price: firstClean,
      recurring_price: frequencyOption !== "One-time" ? 120 : null,
      frequency_label: frequencyOption === "One-time" ? "One-time" : frequencyOption,
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as SupabaseQuoteResult | undefined;
  if (!row) {
    return {
      estimated_price: 180,
      first_clean_price: 180,
      recurring_price: null,
      frequency_label: "One-time",
    };
  }

  const firstCleanPrice = (row.first_clean_cents ?? 0) / 100;
  const estimatedPrice =
    (row.total_first_visit_cents ?? (row.first_clean_cents ?? 0) + (row.addons_total_cents ?? 0)) / 100;
  const recurringPrice = row.recurring_cents != null ? row.recurring_cents / 100 : null;
  const frequencyLabel =
    frequencyOption === "One-time"
      ? "One-time"
      : frequencyOption.startsWith("Weekly")
        ? "Weekly"
        : frequencyOption.startsWith("Bi-Weekly")
          ? "Bi-Weekly"
          : "Monthly";

  return {
    estimated_price: estimatedPrice,
    first_clean_price: firstCleanPrice,
    recurring_price: recurringPrice,
    frequency_label: frequencyLabel,
  };
}

/**
 * Find or create a person for quote/inquiry. Match by email first, then phone (within org).
 * Returns person id or null if org_id missing (cannot create) or insert fails.
 */
async function findOrCreatePerson(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    org_id: string | null;
  }
): Promise<string | null> {
  const { email, phone, first_name, last_name, org_id } = params;
  const emailNorm = email?.trim() ? email.trim().toLowerCase() : null;
  const phoneNorm = phone?.trim() || null;

  if (!emailNorm && !phoneNorm) return null;

  // Find: email first, then phone. Scope by org when we have one so we don't cross-org match.
  if (emailNorm) {
    let q = supabase.from("persons").select("id").ilike("email", emailNorm).limit(1);
    if (org_id) q = q.eq("org_id", org_id);
    const { data: byEmail } = await q.maybeSingle();
    if (byEmail?.id) return byEmail.id;
  }
  if (phoneNorm) {
    let q = supabase.from("persons").select("id").eq("phone", phoneNorm).limit(1);
    if (org_id) q = q.eq("org_id", org_id);
    const { data: byPhone } = await q.maybeSingle();
    if (byPhone?.id) return byPhone.id;
  }

  if (!org_id) return null;

  const { data: created, error } = await supabase
    .from("persons")
    .insert({
      org_id,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      email: emailNorm ?? null,
      phone: phoneNorm ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      if (emailNorm) {
        const { data: again } = await supabase.from("persons").select("id").eq("org_id", org_id).ilike("email", emailNorm).limit(1).maybeSingle();
        if (again?.id) return again.id;
      }
      if (phoneNorm) {
        const { data: again } = await supabase.from("persons").select("id").eq("org_id", org_id).eq("phone", phoneNorm).limit(1).maybeSingle();
        if (again?.id) return again.id;
      }
    }
    console.warn("[QUOTE_START] findOrCreatePerson failed", error?.message);
    return null;
  }
  return (created as { id: string }).id;
}

/** Serialize raw square_footage from the request for field_values (source of truth). */
function serializeSquareFootageForFieldValue(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "number" && !Number.isNaN(raw)) return String(raw);
  return String(raw).trim();
}

type FieldDefMeta = { id: string; field_type: string };

async function getFieldDefinitionMeta(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  entityType: string,
  fieldKey: string
): Promise<FieldDefMeta | null> {
  const { data, error } = await supabase
    .from("field_definitions")
    .select("id, field_type")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("field_key", fieldKey)
    .eq("is_active", true)
    .limit(1);
  if (error) {
    console.error("[QUOTE_START] field_definitions lookup failed:", fieldKey, entityType, error.message);
    return null;
  }
  const row = (data as FieldDefMeta[] | null)?.[0];
  return row ?? null;
}

async function upsertTypedFieldValue(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  entityType: string,
  entityId: string,
  def: FieldDefMeta,
  rawDisplay: string
): Promise<void> {
  const typed = payloadFromFieldType(def.field_type, rawDisplay);
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("field_values")
    .select("id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("field_definition_id", def.id)
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("field_values")
      .update({ ...typed, updated_at: now })
      .eq("id", (existing as { id: string }).id);
  } else {
    await supabase.from("field_values").insert({
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      field_definition_id: def.id,
      ...typed,
    });
  }
}

async function upsertPersonLocationForQuote(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  personId: string,
  locationId: string
): Promise<void> {
  await supabase
    .from("person_locations")
    .update({ is_primary: false, updated_at: new Date().toISOString() })
    .eq("person_id", personId)
    .eq("org_id", orgId);
  const { data: existing } = await supabase
    .from("person_locations")
    .select("id")
    .eq("person_id", personId)
    .eq("location_id", locationId)
    .maybeSingle();
  const now = new Date().toISOString();
  if (existing?.id) {
    await supabase
      .from("person_locations")
      .update({
        is_primary: true,
        relationship_type: "associated",
        updated_at: now,
      })
      .eq("id", (existing as { id: string }).id);
  } else {
    const { error } = await supabase.from("person_locations").insert({
      org_id: orgId,
      person_id: personId,
      location_id: locationId,
      relationship_type: "associated",
      is_primary: true,
      metadata: {},
    });
    if (error) {
      console.error("[QUOTE_START] person_locations insert failed:", error.message);
    }
  }
}

/** Lightweight quote-stage location (customer_id null until booking). */
async function createQuoteLocation(
  supabase: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  postalCode: string | null
): Promise<string | null> {
  const label = postalCode?.trim() ? `Quote — ${postalCode.trim()}` : "Quote location";
  const { data: created, error } = await supabase
    .from("locations")
    .insert({
      org_id: orgId,
      customer_id: null,
      vendor_id: null,
      label,
      location_type: "address",
      is_primary: false,
      is_active: true,
      postal_code: postalCode?.trim() || null,
      metadata: {},
    })
    .select("id")
    .single();
  if (error || !created) {
    console.warn("[QUOTE_START] Location insert failed:", error?.message);
    return null;
  }
  return (created as { id: string }).id;
}

export interface QuoteStartBody {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  zip?: string;
  square_footage?: number;
  beds?: number;
  baths?: number;
  cleaning_frequency?: "one_time" | "weekly" | "biweekly" | "monthly";
  vertical_id?: string;
  add_ons?: string[];
  quote_context?: Record<string, unknown>;
  /** Optional campaign id/slug for opportunity field_values.promo_campaign */
  promo_campaign?: string;
  home_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  pets?: string | boolean;
  gate_code?: string;
  parking_notes?: string;
  alarm_notes?: string;
}

/**
 * POST /api/book-v2/quote-start
 * Person-first (Pass A): create/find Person and Opportunity only. No Contact, no Customer.
 * Returns person_id and opportunity_id for confirm handoff.
 * Requires at least one of email or phone.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
    }
    console.log("[QUOTE_START] using_service_role=true");

    const body = (await request.json()) as QuoteStartBody;
    const email = body.email != null ? normalizeEmail(body.email) : null;
    const phone = body.phone != null ? normalizePhone(body.phone) : null;

    if (!email && !phone) {
      return NextResponse.json(
        { ok: false, message: "At least one of email or phone is required" },
        { status: 400 }
      );
    }

    const first_name = body.first_name?.trim() || null;
    const last_name = body.last_name?.trim() || null;
    const zip = body.zip?.trim() || null;
    const square_footage_raw = body.square_footage ?? (body.beds != null ? (body.beds as number) * 400 : null);
    const cleaning_frequency = mapApiFrequencyToOption(body.cleaning_frequency);
    const squareFootageOption = normalizeSquareFootageInput(square_footage_raw);

    const supabase = createServiceRoleClient();
    const publicOrgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;

    // 1) Find or create Person only (no Contact, no Customer).
    const personId = await findOrCreatePerson(supabase, {
      email: email || null,
      phone: phone || null,
      first_name,
      last_name,
      org_id: publicOrgId,
    });

    if (!personId) {
      return NextResponse.json(
        { ok: false, message: "Unable to create or find lead record. Please try again." },
        { status: 400 }
      );
    }

    const emailForDisplay = email || "";
    const orgIdForWrites = publicOrgId;

    // 2) Resolve vertical
    let verticalId = body.vertical_id ?? null;
    if (!verticalId) {
      const { data: vert } = await supabase
        .from("verticals")
        .select("id")
        .eq("slug", "cleaning")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      verticalId = vert?.id ?? null;
    }
    if (!verticalId) {
      return NextResponse.json(
        { ok: false, message: "Cleaning vertical not found" },
        { status: 500 }
      );
    }

    if (!orgIdForWrites) {
      return NextResponse.json(
        { ok: false, message: "Server configuration error (org)" },
        { status: 500 }
      );
    }

    const locationSqftDef = await getFieldDefinitionMeta(supabase, orgIdForWrites, "location", "square_footage");
    if (!locationSqftDef) {
      console.error(
        "[QUOTE_START] CRITICAL: No active field_definition for org_id + entity_type=location + field_key=square_footage. Cannot persist square_footage to field_values."
      );
      return NextResponse.json(
        {
          ok: false,
          message: "Server misconfiguration: location field square_footage is not defined for this org",
        },
        { status: 500 }
      );
    }

    const opportunityFreqDef = await getFieldDefinitionMeta(
      supabase,
      orgIdForWrites,
      "opportunity",
      "cleaning_frequency"
    );
    if (!opportunityFreqDef) {
      console.error(
        "[QUOTE_START] CRITICAL: No active field_definition for org_id + entity_type=opportunity + field_key=cleaning_frequency."
      );
      return NextResponse.json(
        {
          ok: false,
          message: "Server misconfiguration: opportunity field cleaning_frequency is not defined for this org",
        },
        { status: 500 }
      );
    }

    const promoRaw =
      typeof body.promo_campaign === "string" ? body.promo_campaign.trim() : "";
    let opportunityPromoDef: FieldDefMeta | null = null;
    if (promoRaw) {
      opportunityPromoDef = await getFieldDefinitionMeta(
        supabase,
        orgIdForWrites,
        "opportunity",
        "promo_campaign"
      );
      if (!opportunityPromoDef) {
        console.error(
          "[QUOTE_START] CRITICAL: Request included promo_campaign but no active field_definition for entity_type=opportunity + field_key=promo_campaign."
        );
        return NextResponse.json(
          {
            ok: false,
            message: "Server misconfiguration: opportunity field promo_campaign is not defined for this org",
          },
          { status: 500 }
        );
      }
    }

    // 3) Compute quote (before location/dedupe so inputs are stable)
    const quoteOutput = await computeQuote(supabase, squareFootageOption, cleaning_frequency, []);
    const quote_input = {
      zip,
      square_footage: body.square_footage ?? square_footage_raw,
      beds: body.beds,
      baths: body.baths,
      cleaning_frequency: optionToApiKey(cleaning_frequency),
      add_ons: Array.isArray(body.add_ons) ? body.add_ons : [],
      ...body.quote_context,
    };
    const quote_started_at = new Date().toISOString();

    // 4) Dedupe: reuse open "Quote Started" opportunity for this person within 10 min
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let opportunityId: string;
    let created_new_opportunity = false;

    const existingOppQuery = supabase
      .from("opportunities")
      .select("id, pipeline_stage_id")
      .eq("primary_person_id", personId)
      .gte("created_at", tenMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1);
    const { data: existingOpp } = await existingOppQuery.maybeSingle();

    const metaSourceMatches = async () => {
      if (!existingOpp) return false;
      const { data: opp } = await supabase
        .from("opportunities")
        .select("metadata")
        .eq("id", existingOpp.id)
        .single();
      const meta = (opp?.metadata as Record<string, unknown>) ?? {};
      return meta.source === "web_quote";
    };
    const shouldReuse = existingOpp && (await metaSourceMatches());

    /** Create or refresh lightweight Location; reuse existing row when deduping same opportunity. */
    let locationId: string;
    if (shouldReuse && existingOpp) {
      const { data: oppLoc } = await supabase
        .from("opportunities")
        .select("location_id")
        .eq("id", existingOpp.id)
        .single();
      const existingLocId = (oppLoc as { location_id?: string | null } | null)?.location_id ?? null;
      if (existingLocId) {
        const label = zip?.trim() ? `Quote — ${zip.trim()}` : "Quote location";
        await supabase
          .from("locations")
          .update({
            postal_code: zip?.trim() || null,
            label,
          })
          .eq("id", existingLocId)
          .eq("org_id", orgIdForWrites);
        locationId = existingLocId;
      } else {
        const created = await createQuoteLocation(supabase, orgIdForWrites, zip);
        if (!created) {
          return NextResponse.json({ ok: false, message: "Failed to create quote location" }, { status: 500 });
        }
        locationId = created;
      }
    } else {
      const created = await createQuoteLocation(supabase, orgIdForWrites, zip);
      if (!created) {
        return NextResponse.json({ ok: false, message: "Failed to create quote location" }, { status: 500 });
      }
      locationId = created;
    }

    if (shouldReuse && existingOpp) {
      opportunityId = existingOpp.id;
      const updatePayload: Record<string, unknown> = {
        location_id: locationId,
        pipeline_stage_id: QUOTE_STARTED_PIPELINE_STAGE_ID,
        status_key: "quote_started",
        status: "open",
        vertical_id: verticalId,
        metadata: {
          quote_input,
          quote_output: quoteOutput,
          source: "web_quote",
          quote_started_at,
        },
        ...(quote_output_estimated_cents(quoteOutput) != null && {
          estimated_price_cents: quote_output_estimated_cents(quoteOutput),
          monetary_value_cents: quote_output_estimated_cents(quoteOutput),
        }),
      };
      await supabase.from("opportunities").update(updatePayload).eq("id", opportunityId);
    } else {
      const estimatedPriceCents = quoteOutput.estimated_price != null ? Math.round(quoteOutput.estimated_price * 100) : null;
      const opportunityName =
        [first_name, last_name].filter(Boolean).join(" ").trim()
          ? `${[first_name, last_name].filter(Boolean).join(" ")} — Quote`
          : (emailForDisplay ? `${emailForDisplay} — Quote` : "Quote");
      const oppInsertPayload: Record<string, unknown> = {
        vertical_id: verticalId,
        primary_person_id: personId,
        primary_contact_id: null,
        customer_id: null,
        location_id: locationId,
        pipeline_stage_id: QUOTE_STARTED_PIPELINE_STAGE_ID,
        status_key: "quote_started",
        name: opportunityName,
        status: "open",
        source: "website",
        estimated_price_cents: estimatedPriceCents,
        monetary_value_cents: estimatedPriceCents,
        metadata: {
          quote_input,
          quote_output: quoteOutput,
          source: "web_quote",
          quote_started_at,
        },
      };
      oppInsertPayload.org_id = orgIdForWrites;
      const { data: newOpp, error: oppError } = await supabase
        .from("opportunities")
        .insert(oppInsertPayload)
        .select("id")
        .single();

      if (oppError || !newOpp) {
        console.error("[QUOTE_START] Opportunity insert failed:", oppError);
        return NextResponse.json(
          { ok: false, message: "Failed to create opportunity" },
          { status: 500 }
        );
      }
      opportunityId = newOpp.id;
      created_new_opportunity = true;

      const { executeWorkflowRun } = await import("@/lib/workflowRun");
      let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "quote_started").eq("entity_type", "opportunity");
      if (orgIdForWrites) wq = wq.or(`org_id.eq.${orgIdForWrites},org_id.is.null`);
      const { data: quoteWfs } = await wq;
      const { data: oppRow } = await supabase.from("opportunities").select("*").eq("id", opportunityId).single();
      const eventPayload: Record<string, unknown> = {
        event_type: "quote_started",
        occurred_at: new Date().toISOString(),
        org_id: orgIdForWrites ?? null,
        quote_started_stage_id: QUOTE_STARTED_PIPELINE_STAGE_ID,
        opportunity: oppRow ?? null,
      };
      let eventId: string | null = null;
      try {
        eventId = await emitEvent({
          org_id: orgIdForWrites ?? null,
          event_type: "quote_started",
          entity_type: "opportunity",
          entity_id: opportunityId ?? null,
          action_type: null,
          occurred_at: (eventPayload.occurred_at as string) ?? new Date().toISOString(),
          payload: eventPayload,
        });
      } catch (emitErr: unknown) {
        console.error("[QUOTE_START_EMIT_EVENT]", emitErr);
      }
      for (const wf of quoteWfs ?? []) {
        try {
          await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
            event_id: eventId ?? null,
            org_id: orgIdForWrites ?? null,
          });
        } catch (_) {}
      }
    }

    const cleaningFrequencyValue = body.cleaning_frequency ?? optionToApiKey(cleaning_frequency);
    const squareFootageFieldValue = serializeSquareFootageForFieldValue(
      body.square_footage ?? square_footage_raw
    );

    await upsertTypedFieldValue(
      supabase,
      orgIdForWrites,
      "location",
      locationId,
      locationSqftDef,
      squareFootageFieldValue
    );

    const optionalLocationWrites: { key: keyof QuoteStartBody; value: unknown }[] = [
      { key: "home_type", value: body.home_type },
      { key: "bedrooms", value: body.bedrooms ?? body.beds },
      { key: "bathrooms", value: body.bathrooms ?? body.baths },
      { key: "pets", value: body.pets },
      { key: "gate_code", value: body.gate_code },
      { key: "parking_notes", value: body.parking_notes },
      { key: "alarm_notes", value: body.alarm_notes },
    ];
    for (const { key, value } of optionalLocationWrites) {
      if (value === undefined || value === null || value === "") continue;
      const def = await getFieldDefinitionMeta(supabase, orgIdForWrites, "location", key as string);
      if (!def) continue;
      await upsertTypedFieldValue(
        supabase,
        orgIdForWrites,
        "location",
        locationId,
        def,
        typeof value === "boolean" ? (value ? "true" : "false") : String(value).trim()
      );
    }

    await upsertTypedFieldValue(
      supabase,
      orgIdForWrites,
      "opportunity",
      opportunityId,
      opportunityFreqDef,
      String(cleaningFrequencyValue)
    );
    if (opportunityPromoDef && promoRaw) {
      await upsertTypedFieldValue(
        supabase,
        orgIdForWrites,
        "opportunity",
        opportunityId,
        opportunityPromoDef,
        promoRaw
      );
    }

    await upsertPersonLocationForQuote(supabase, orgIdForWrites, personId, locationId);

    console.log(
      "[QUOTE_START] person_id=%s created_new_opportunity=%s opportunity_id=%s",
      personId,
      created_new_opportunity,
      opportunityId
    );

    return NextResponse.json({
      ok: true,
      person_id: personId,
      opportunity_id: opportunityId,
      quote_output: quoteOutput,
    });
  } catch (err) {
    console.error("[QUOTE_START_ERROR]", err);
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Quote start failed" },
      { status: 500 }
    );
  }
}

function quote_output_estimated_cents(q: { estimated_price: number | null }): number | null {
  if (q.estimated_price == null) return null;
  return Math.round(q.estimated_price * 100);
}
