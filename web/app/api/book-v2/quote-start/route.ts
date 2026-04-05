import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail, normalizePhone } from "@/lib/contactNormalize";
import { emitEvent } from "@/lib/emitEvent";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import type { SquareFootageOption } from "@/lib/pricing/cleaningPricing";
import { mapServiceTypeToKey, mapAddOnsToKeys } from "@/lib/pricing/supabasePricing";
import type { SupabaseQuoteResult } from "@/lib/pricing/supabasePricing";
import type { AddOnId } from "@/lib/pricing/cleaningPricing";
import {
  type FieldDefMeta,
  getFieldDefinitionMeta,
  upsertTypedFieldValue,
} from "@/lib/bookV2/fieldValueUpsert";
import { findOrCreatePersonInOrg } from "@/lib/persons/findOrCreatePersonInOrg";
import { LEGACY_QUOTE_STARTED_PIPELINE_STAGE_ID } from "@/lib/book-v2/bookingConstants";
import { resolvePipelineStageIdByOrgKey, pipelineStageEnvFallback } from "@/lib/book-v2/resolvePipelineStage";
import {
  loadPricingFrequenciesForVertical,
  loadSqftTiersForVertical,
  normalizeSqftKeyInput,
  resolveSquareFootageStorageString,
  type PricingFrequencyRow,
} from "@/lib/book-v2/loadCleaningPricingCatalog";
import {
  frequencyRowForRpcKey,
  inferLegacyCleaningFrequencyApiKey,
  resolveRpcFrequencyKey,
} from "@/lib/book-v2/resolveCleaningFrequencyRpc";
import { standardCleaningFrequencyCatalog } from "@/lib/book-v2/catalogFrequencyChoices";
import {
    createQuoteLocation,
    quoteLocationLabel,
    quoteStartNativeLocationPatch,
    upsertPersonLocationForQuote,
} from "@/lib/book-v2/quoteStartLocationHelpers";

const SERVICE_TYPE = "Standard Cleaning";

/** Normalize request keys: sqft/frequency variants -> square_footage, cleaning_frequency. Leaves other keys as-is. */
function normalizeQuoteStartBody(raw: Record<string, unknown>): QuoteStartBody {
  const square_footage =
    raw.square_footage != null
      ? (raw.square_footage as string | number)
      : raw.sqft != null
        ? (raw.sqft as string | number)
        : raw.sqft_key != null
          ? (raw.sqft_key as string)
          : undefined;
  const cleaning_frequency =
    raw.cleaning_frequency != null && raw.cleaning_frequency !== ""
      ? String(raw.cleaning_frequency).trim()
      : raw.frequency != null && raw.frequency !== ""
        ? String(raw.frequency).trim()
        : raw.cleaning_freq != null && raw.cleaning_freq !== ""
          ? String(raw.cleaning_freq).trim()
          : undefined;
  const cleaning_type =
    typeof raw.cleaning_type === "string" && raw.cleaning_type.trim()
      ? raw.cleaning_type.trim()
      : undefined;
  return {
    ...raw,
    square_footage: square_footage as string | number | undefined,
    cleaning_frequency,
    cleaning_type,
    bedrooms: (raw.bedrooms ?? raw.beds) as number | undefined,
    bathrooms: (raw.bathrooms ?? raw.baths) as number | undefined,
  } as QuoteStartBody;
}

/**
 * Compute initial quote using Supabase RPC (admin client).
 * @param rpcFrequencyKey empty string = one-time; else pricing_frequencies.frequency_key
 */
async function computeQuote(
  supabase: ReturnType<typeof createServiceRoleClient>,
  squareFootageOption: SquareFootageOption,
  rpcFrequencyKey: string,
  addOns: AddOnId[] = [],
  freqRow: PricingFrequencyRow | null
): Promise<{
  estimated_price: number | null;
  first_clean_price: number | null;
  recurring_price: number | null;
  frequency_label: string;
  discount_label: string | null;
}> {
  const serviceKey = mapServiceTypeToKey(SERVICE_TYPE);
  const addonKeys = mapAddOnsToKeys(addOns);

  const { data, error } = await supabase.rpc("get_quote_pricing", {
    p_vertical_slug: "cleaning",
    p_service_key: serviceKey,
    p_sqft_key: squareFootageOption,
    p_frequency_key: rpcFrequencyKey,
    p_addon_keys: addonKeys ?? [],
  });

  const shortLabelFromRow = (): string => {
    if (freqRow?.frequency_label) return freqRow.frequency_label;
    if (!rpcFrequencyKey) return "One-time";
    return "Recurring";
  };

  if (error || !data) {
    console.warn("[QUOTE_START] RPC get_quote_pricing failed, using fallback:", error?.message);
    const firstClean = 180; // fallback
    return {
      estimated_price: firstClean,
      first_clean_price: firstClean,
      recurring_price: rpcFrequencyKey ? 120 : null,
      frequency_label: shortLabelFromRow(),
      discount_label: freqRow?.discount_label ?? null,
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as SupabaseQuoteResult | undefined;
  if (!row) {
    return {
      estimated_price: 180,
      first_clean_price: 180,
      recurring_price: null,
      frequency_label: "One-time",
      discount_label: null,
    };
  }

  const firstCleanPrice = (row.first_clean_cents ?? 0) / 100;
  const estimatedPrice =
    (row.total_first_visit_cents ?? (row.first_clean_cents ?? 0) + (row.addons_total_cents ?? 0)) / 100;
  const recurringPrice = row.recurring_cents != null ? row.recurring_cents / 100 : null;

  return {
    estimated_price: estimatedPrice,
    first_clean_price: firstCleanPrice,
    recurring_price: recurringPrice,
    frequency_label: freqRow?.frequency_label ?? shortLabelFromRow(),
    discount_label: freqRow?.discount_label ?? null,
  };
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
  /** Legacy API keys (one_time, weekly, …) or pricing_frequencies.frequency_key from booking-config */
  cleaning_frequency?: string;
  /** standard | move_out | heavy_clean — stored on quote_input; book-v2 routes specialty types client-side */
  cleaning_type?: string;
  vertical_id?: string;
  add_ons?: string[];
  quote_context?: Record<string, unknown>;
  /** Optional campaign id/slug for opportunity field_values.promo_campaign */
  promo_campaign?: string;
  /** If true, persist to person custom field person.sms_consent when definition exists */
  sms_consent?: boolean;
  /** If true, persist to person custom field person.email_consent when definition exists */
  email_consent?: boolean;
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

    const rawBody = (await request.json()) as Record<string, unknown>;
    // Normalize request keys so backend always sees square_footage + cleaning_frequency
    const body = normalizeQuoteStartBody(rawBody);
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

    const supabase = createServiceRoleClient();
    const publicOrgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;

    // 1) Find or create Person only (no Contact, no Customer).
    const personId = await findOrCreatePersonInOrg(supabase, {
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

    const [sqftTierRows, pricingFrequencyRowsRaw] = await Promise.all([
      loadSqftTiersForVertical(supabase, verticalId),
      loadPricingFrequenciesForVertical(supabase, verticalId),
    ]);
    const pricingFrequencyRows = standardCleaningFrequencyCatalog(pricingFrequencyRowsRaw);
    const rawCleaningFreq =
      body.cleaning_frequency != null && String(body.cleaning_frequency).trim() !== ""
        ? String(body.cleaning_frequency).trim()
        : "one_time";
    const rpcFreqKey = resolveRpcFrequencyKey(rawCleaningFreq, pricingFrequencyRows);
    const freqRowForQuote = frequencyRowForRpcKey(rpcFreqKey, pricingFrequencyRows);
    const legacyCleaningApiKey = inferLegacyCleaningFrequencyApiKey(rpcFreqKey, pricingFrequencyRows);

    const squareFootageOption = normalizeSqftKeyInput(square_footage_raw, sqftTierRows) as SquareFootageOption;
    const squareFootageStored = resolveSquareFootageStorageString(
      square_footage_raw,
      squareFootageOption,
      sqftTierRows
    );

    if (!orgIdForWrites) {
      return NextResponse.json(
        { ok: false, message: "Server configuration error (org)" },
        { status: 500 }
      );
    }

    const quoteStartedStageId =
      (await resolvePipelineStageIdByOrgKey(supabase, orgIdForWrites, "quote_started")) ??
      pipelineStageEnvFallback("quote_started") ??
      LEGACY_QUOTE_STARTED_PIPELINE_STAGE_ID;

    const promoRaw =
      typeof body.promo_campaign === "string" ? body.promo_campaign.trim() : "";

    const [opportunityFreqDef, opportunityPromoDef, personSmsConsentDef, personEmailConsentDef] = await Promise.all([
      getFieldDefinitionMeta(supabase, orgIdForWrites, "opportunity", "cleaning_frequency"),
      promoRaw
        ? getFieldDefinitionMeta(supabase, orgIdForWrites, "opportunity", "promo_campaign")
        : Promise.resolve(null as FieldDefMeta | null),
      body.sms_consent
        ? getFieldDefinitionMeta(supabase, orgIdForWrites, "person", "sms_consent")
        : Promise.resolve(null as FieldDefMeta | null),
      body.email_consent
        ? getFieldDefinitionMeta(supabase, orgIdForWrites, "person", "email_consent")
        : Promise.resolve(null as FieldDefMeta | null),
    ]);

    if (!opportunityFreqDef) {
      console.error(
        "[QUOTE_START_FIELD_VALUES] field definition not found: org_id=%s entity_type=opportunity field_key=cleaning_frequency",
        orgIdForWrites
      );
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

    if (promoRaw && !opportunityPromoDef) {
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

    // 3) Compute quote (before location/dedupe so inputs are stable)
    const quoteOutput = await computeQuote(supabase, squareFootageOption, rpcFreqKey, [], freqRowForQuote);
    const cleaningTypeStored =
      body.cleaning_type === "move_out" || body.cleaning_type === "heavy_clean" ? body.cleaning_type : "standard";
    const quote_input = {
      zip,
      beds: body.beds,
      baths: body.baths,
      cleaning_frequency: legacyCleaningApiKey,
      cleaning_frequency_key: rpcFreqKey || null,
      cleaning_type: cleaningTypeStored,
      add_ons: Array.isArray(body.add_ons) ? body.add_ons : [],
      ...body.quote_context,
      square_footage: squareFootageStored,
    };
    const quote_started_at = new Date().toISOString();

    // 4) Dedupe: reuse open "Quote Started" opportunity for this person within 10 min
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let opportunityId: string;
    let created_new_opportunity = false;

    const existingOppQuery = supabase
      .from("opportunities")
      .select("id, pipeline_stage_id, metadata, location_id")
      .eq("primary_person_id", personId)
      .gte("created_at", tenMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1);
    const { data: existingOpp } = await existingOppQuery.maybeSingle();

    const existingOppRow = existingOpp as
      | { id: string; metadata?: Record<string, unknown> | null; location_id?: string | null }
      | null
      | undefined;
    const shouldReuse =
      !!existingOppRow && (existingOppRow.metadata as Record<string, unknown> | undefined)?.source === "web_quote";

    /** Create or refresh lightweight Location; reuse existing row when deduping same opportunity. */
    let locationId: string;
    if (shouldReuse && existingOppRow) {
      const existingLocId = existingOppRow.location_id ?? null;
      if (existingLocId) {
        const personName = [first_name, last_name].filter(Boolean).join(" ").trim() || null;
        const label = quoteLocationLabel(personName, zip);
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
        const personName = [first_name, last_name].filter(Boolean).join(" ").trim() || null;
        const created = await createQuoteLocation(supabase, orgIdForWrites, zip, personName);
        if (!created) {
          return NextResponse.json({ ok: false, message: "Failed to create quote location" }, { status: 500 });
        }
        locationId = created;
      }
    } else {
      const personName = [first_name, last_name].filter(Boolean).join(" ").trim() || null;
      const created = await createQuoteLocation(supabase, orgIdForWrites, zip, personName);
      if (!created) {
        return NextResponse.json({ ok: false, message: "Failed to create quote location" }, { status: 500 });
      }
      locationId = created;
    }

    await supabase
      .from("locations")
      .update(quoteStartNativeLocationPatch(body as Record<string, unknown>, squareFootageOption))
      .eq("id", locationId)
      .eq("org_id", orgIdForWrites);

    if (shouldReuse && existingOppRow) {
      opportunityId = existingOppRow.id;
      const updatePayload: Record<string, unknown> = {
        location_id: locationId,
        pipeline_stage_id: quoteStartedStageId,
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
        pipeline_stage_id: quoteStartedStageId,
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
        quote_started_stage_id: quoteStartedStageId,
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

    const cleaningFrequencyValue = rawCleaningFreq;

    console.log("[QUOTE_START_FIELD_VALUES] normalized quote input", {
      square_footage: squareFootageStored,
      cleaning_frequency: body.cleaning_frequency,
      cleaning_frequency_key: rpcFreqKey,
      cleaningFrequencyValue,
      promo_campaign: body.promo_campaign ?? null,
      locationId,
      opportunityId,
    });
    console.log("[QUOTE_START_FIELD_VALUES] resolved field definition ids", {
      opportunity_cleaning_frequency: opportunityFreqDef?.id ?? null,
      opportunity_promo_campaign: opportunityPromoDef?.id ?? null,
    });

    const optionalLocationWrites: { key: keyof QuoteStartBody; value: unknown }[] = [
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

    if (personSmsConsentDef && body.sms_consent) {
      await upsertTypedFieldValue(
        supabase,
        orgIdForWrites,
        "person",
        personId,
        personSmsConsentDef,
        "true"
      );
    }
    if (personEmailConsentDef && body.email_consent) {
      await upsertTypedFieldValue(
        supabase,
        orgIdForWrites,
        "person",
        personId,
        personEmailConsentDef,
        "true"
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
