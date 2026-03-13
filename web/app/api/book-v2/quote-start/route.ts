import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail, normalizePhone } from "@/lib/contactNormalize";
import { emitEvent } from "@/lib/emitEvent";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import type { CleaningFrequencyOption, SquareFootageOption } from "@/lib/pricing/cleaningPricing";
import { mapServiceTypeToKey, mapFrequencyToKey, mapAddOnsToKeys } from "@/lib/pricing/supabasePricing";
import type { SupabaseQuoteResult } from "@/lib/pricing/supabasePricing";
import type { AddOnId } from "@/lib/pricing/cleaningPricing";

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
 * Get or create pipeline stage by name for a pipeline.
 */
async function getOrCreateStage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  pipelineId: string,
  stageName: string,
  position: number
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", pipelineId)
    .ilike("name", stageName)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("pipeline_stages")
    .insert({
      pipeline_id: pipelineId,
      name: stageName,
      position,
      show_in_funnel: true,
      show_in_pie_chart: true,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.warn("[QUOTE_START] Could not create pipeline stage:", stageName, error?.message);
    return null;
  }
  return created.id;
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

  const full_name = [first_name ?? null, last_name ?? null].filter(Boolean).join(" ").trim() || null;
  const { data: created, error } = await supabase
    .from("persons")
    .insert({
      org_id,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      full_name,
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

    // 3) Pipeline + stage

    const { data: pipelines } = await supabase
      .from("pipelines")
      .select("id")
      .order("name", { ascending: true })
      .limit(1);
    const pipelineId = pipelines?.[0]?.id ?? null;
    let quoteStartedStageId: string | null = null;
    if (pipelineId) {
      quoteStartedStageId = await getOrCreateStage(supabase, pipelineId, "Quote Started", 0);
    }

    // 3) Compute quote
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

    if (shouldReuse && existingOpp) {
      opportunityId = existingOpp.id;
      const updatePayload: Record<string, unknown> = {
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
      if (orgIdForWrites) oppInsertPayload.org_id = orgIdForWrites;
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
