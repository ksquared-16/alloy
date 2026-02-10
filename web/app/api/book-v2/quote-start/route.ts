import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { normalizeEmail, normalizePhone } from "@/lib/contactNormalize";
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
 * Creates/updates contact and opportunity at "Quote Started", stores quote in metadata.
 * Requires at least one of email or phone.
 */
export async function POST(request: NextRequest) {
  try {
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

    // 1) Upsert contact: find by email if email, else by phone
    let contactId: string;
    let customerId: string | null = null;
    let created_new_contact = false;

    const emailForLookup = email || "";
    const phoneForLookup = phone || "";

    type ContactRow = { id: string; customer_id: string | null; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; org_id?: string | null };
    let existingContact: ContactRow | null = null;
    const contactSelectCols = "id, customer_id, first_name, last_name, email, phone, org_id";

    if (emailForLookup) {
      let res = await supabase.from("contacts").select(contactSelectCols).ilike("email", emailForLookup).limit(1).maybeSingle();
      if (res.error && res.error.message?.includes("org_id")) {
        res = await supabase.from("contacts").select("id, customer_id, first_name, last_name, email, phone").ilike("email", emailForLookup).limit(1).maybeSingle();
      }
      existingContact = (res.data as ContactRow | null) ?? null;
    }
    if (!existingContact && phoneForLookup) {
      let res = await supabase.from("contacts").select(contactSelectCols).eq("phone", phoneForLookup).limit(1).maybeSingle();
      if (res.error && res.error.message?.includes("org_id")) {
        res = await supabase.from("contacts").select("id, customer_id, first_name, last_name, email, phone").eq("phone", phoneForLookup).limit(1).maybeSingle();
      }
      existingContact = (res.data as ContactRow | null) ?? null;
    }

    let contactOrgId: string | null = null;

    if (existingContact) {
      contactId = existingContact.id;
      contactOrgId = existingContact.org_id ?? null;
      const updates: Record<string, unknown> = {};
      if (first_name && !existingContact.first_name) updates.first_name = first_name;
      if (last_name && !existingContact.last_name) updates.last_name = last_name;
      if (emailForLookup && existingContact.email !== emailForLookup) updates.email = emailForLookup;
      if (phoneForLookup && (!existingContact.phone || existingContact.phone.trim() === "")) updates.phone = phoneForLookup;
      if (zip) updates.postal_code = zip;
      if (Object.keys(updates).length > 0) {
        await supabase.from("contacts").update(updates).eq("id", contactId);
      }
      if (existingContact.customer_id) {
        customerId = existingContact.customer_id;
      }
    } else {
      let defaultOrgId: string | null = null;
      const { data: defaultOrg, error: _orgErr } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
      if (!_orgErr && defaultOrg) defaultOrgId = (defaultOrg as { id?: string }).id ?? null;
      const contactInsert: Record<string, unknown> = {
        email: emailForLookup || null,
        phone: phoneForLookup || null,
        first_name: first_name,
        last_name: last_name,
        postal_code: zip,
        contact_type: "lead",
      };
      if (defaultOrgId) contactInsert.org_id = defaultOrgId;

      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert(contactInsert)
        .select("id, org_id")
        .single();

      if (contactError || !newContact) {
        console.error(
          "[QUOTE_START] Contact insert failed code=%s message=%s",
          (contactError as { code?: string })?.code ?? "unknown",
          contactError?.message ?? "no data"
        );
        return NextResponse.json(
          { ok: false, message: "Failed to create contact" },
          { status: 500 }
        );
      }
      contactId = (newContact as { id: string }).id;
      contactOrgId = (newContact as { org_id?: string | null }).org_id ?? null;
      created_new_contact = true;
    }

    console.log(
      "[QUOTE_START] resolved_contact contact_id=%s org_id=%s customer_id=%s email=%s phone=%s",
      contactId,
      contactOrgId ?? "null",
      customerId ?? "null",
      emailForLookup || "null",
      phoneForLookup ? `${phoneForLookup.slice(0, 4)}***` : "null"
    );

    // Resolve vertical first so we can set it on new customers
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

    let defaultOrgId: string | null = null;
    if (!contactOrgId) {
      const { data: defaultOrg, error: _orgErr2 } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
      if (!_orgErr2 && defaultOrg) defaultOrgId = (defaultOrg as { id?: string }).id ?? null;
    }
    const orgIdForWrites = contactOrgId ?? defaultOrgId;

    // Ensure customer exists and is linked (backfill when contact.customer_id is null)
    let created_customer = false;
    if (!customerId) {
      console.log("[QUOTE_START] ensure_customer path running contact_id=%s customer_id=null (will create customer)", contactId);
      const name =
        [first_name, last_name].filter(Boolean).join(" ") ||
        emailForLookup ||
        phoneForLookup ||
        "Quote Lead";
      const customerInsertPayload: Record<string, unknown> = {
        name,
        vertical_id: verticalId,
        primary_contact_id: contactId,
        email: emailForLookup || null,
        phone: phoneForLookup || null,
      };
      if (orgIdForWrites) customerInsertPayload.org_id = orgIdForWrites;

      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert(customerInsertPayload)
        .select("id")
        .single();

      if (customerError) {
        const err = customerError as { code?: string; message?: string; details?: string; hint?: string };
        console.error(
          "[QUOTE_START] Customer insert failed contact_id=%s code=%s message=%s details=%s hint=%s",
          contactId,
          err.code ?? "unknown",
          err.message ?? "",
          err.details ?? "",
          err.hint ?? ""
        );
        console.error("[QUOTE_START] Customer insert error payload (safe): %s", JSON.stringify({ code: err.code, message: err.message, details: err.details, hint: err.hint }));
      } else if (!newCustomer) {
        console.error("[QUOTE_START] Customer insert returned no data (no error) contact_id=%s", contactId);
      } else if (newCustomer) {
        customerId = newCustomer.id;
        created_customer = true;
        console.log(
          "[QUOTE_START] Customer insert success contact_id=%s new_customer_id=%s org_id=%s vertical_id=%s",
          contactId,
          customerId,
          orgIdForWrites ?? "null",
          verticalId
        );
        const { data: updatedContact, error: linkErr } = await supabase
          .from("contacts")
          .update({ customer_id: customerId })
          .eq("id", contactId)
          .select("customer_id")
          .single();
        if (linkErr) {
          const err = linkErr as { code?: string; message?: string; details?: string; hint?: string };
          console.error(
            "[QUOTE_START] Contact customer_id update failed contact_id=%s customer_id=%s code=%s message=%s details=%s hint=%s",
            contactId,
            customerId,
            err.code ?? "unknown",
            err.message ?? "",
            err.details ?? "",
            err.hint ?? ""
          );
          console.error("[QUOTE_START] Contact update error payload (safe): %s", JSON.stringify({ code: err.code, message: err.message, details: err.details, hint: err.hint }));
        } else {
          const returnedCustomerId = (updatedContact as { customer_id: string | null } | null)?.customer_id ?? null;
          console.log("[QUOTE_START] Contact customer_id update success contact_id=%s returned_customer_id=%s", contactId, returnedCustomerId ?? "null");
          customerId = returnedCustomerId ?? customerId;
        }
      }
    }
    // Re-select contact so we have the actual customer_id from DB (handles backfill or race)
    if (customerId == null) {
      const { data: contactRow, error: selectErr } = await supabase
        .from("contacts")
        .select("customer_id")
        .eq("id", contactId)
        .single();
      if (selectErr) {
        const err = selectErr as { code?: string; message?: string; details?: string; hint?: string };
        console.error(
          "[QUOTE_START] Contact re-select failed contact_id=%s code=%s message=%s",
          contactId,
          err.code ?? "unknown",
          err.message ?? ""
        );
        console.error("[QUOTE_START] Contact re-select error payload (safe): %s", JSON.stringify({ code: err.code, message: err.message, details: err.details, hint: err.hint }));
      }
      customerId = (contactRow as { customer_id?: string | null } | null)?.customer_id ?? null;
      console.log("[QUOTE_START] Contact re-select result contact_id=%s customer_id=%s", contactId, customerId ?? "null");
    }
    console.log(
      "[QUOTE_START] ensured_customer contact_id=%s customer_id=%s created_customer=%s",
      contactId,
      customerId ?? "null",
      created_customer
    );
    if (!customerId) {
      console.error(
        "[QUOTE_START] Cannot create opportunity: customer_id is null for contact_id=%s (customer insert or contact update may have been blocked)",
        contactId
      );
      return NextResponse.json(
        { ok: false, message: "Customer required for opportunity" },
        { status: 500 }
      );
    }

    // 2) Pipeline + stage

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
      cleaning_frequency: body.cleaning_frequency ?? "one_time",
      add_ons: Array.isArray(body.add_ons) ? body.add_ons : [],
      ...body.quote_context,
    };
    const quote_started_at = new Date().toISOString();

    // 4) Dedupe: reuse open "Quote Started" opportunity for this contact within 10 min
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let opportunityId: string;
    let created_new_opportunity = false;

    let existingOppQuery = supabase
      .from("opportunities")
      .select("id, pipeline_stage_id")
      .eq("primary_contact_id", contactId)
      .gte("created_at", tenMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1);
    if (quoteStartedStageId) {
      existingOppQuery = existingOppQuery.eq("pipeline_stage_id", quoteStartedStageId);
    }
    const { data: existingOpp } = await existingOppQuery.maybeSingle();

    const stageMatches =
      quoteStartedStageId &&
      existingOpp?.pipeline_stage_id === quoteStartedStageId;
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
    const shouldReuse =
      existingOpp &&
      stageMatches &&
      (await metaSourceMatches());

    if (shouldReuse && existingOpp) {
      opportunityId = existingOpp.id;
      const { data: oppRow } = await supabase.from("opportunities").select("customer_id").eq("id", opportunityId).single();
      const existingCustomerId = (oppRow as { customer_id: string | null } | null)?.customer_id ?? null;
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
      if (customerId && !existingCustomerId) {
        (updatePayload as Record<string, unknown>).customer_id = customerId;
      }
      await supabase.from("opportunities").update(updatePayload).eq("id", opportunityId);
    } else {
      // customerId is guaranteed non-null by ensure step above
      const estimatedPriceCents = quoteOutput.estimated_price != null ? Math.round(quoteOutput.estimated_price * 100) : null;
      const opportunityName =
        [first_name, last_name].filter(Boolean).join(" ").trim()
          ? `${[first_name, last_name].filter(Boolean).join(" ")} — Quote`
          : (emailForLookup ? `${emailForLookup} — Quote` : "Quote");
      const oppInsertPayload: Record<string, unknown> = {
        vertical_id: verticalId,
        primary_contact_id: contactId,
        customer_id: customerId,
        name: opportunityName,
        status: "open",
        source: "website",
        pipeline_stage_id: quoteStartedStageId,
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
    }

    console.log(
      "[QUOTE_START] created_new_contact=%s created_new_opportunity=%s opportunity_id=%s",
      created_new_contact,
      created_new_opportunity,
      opportunityId
    );

    return NextResponse.json({
      ok: true,
      contact_id: contactId,
      customer_id: customerId,
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
