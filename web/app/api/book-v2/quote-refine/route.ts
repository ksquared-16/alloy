import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import type { CleaningFrequencyOption, SquareFootageOption } from "@/lib/pricing/cleaningPricing";
import { mapServiceTypeToKey, mapFrequencyToKey, mapAddOnsToKeys } from "@/lib/pricing/supabasePricing";
import type { SupabaseQuoteResult } from "@/lib/pricing/supabasePricing";
import type { AddOnId } from "@/lib/pricing/cleaningPricing";
import { ADDON_PRICE_MAP } from "@/lib/pricing/cleaningPricing";

const SERVICE_TYPE = "Standard Cleaning";
const SQUARE_FOOTAGE_KEYS: SquareFootageOption[] = [
  "Under 1500 sq ft",
  "1501–2,000 sq ft",
  "2,001-2,600 sq ft",
  "2,601-3,200 sq ft",
  "3,201-4,000 sq ft",
  "4,001-5,500 sq ft",
  "Over 5,500 sq ft",
];

function normalizeSquareFootageInput(val: string | null | undefined): SquareFootageOption {
  if (val == null) return "Under 1500 sq ft";
  const s = typeof val === "string" ? val.trim() : null;
  if (s && (SQUARE_FOOTAGE_KEYS as string[]).includes(s)) return s as SquareFootageOption;
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

/** Valid AddOnId list for cleaning */
const ADDON_IDS: AddOnId[] = [
  "Fridge",
  "Oven",
  "Cabinets",
  "Windows & Blinds",
  "Pet Hair",
  "Baseboards",
];

function parseAddOns(arr: unknown): AddOnId[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is AddOnId => typeof x === "string" && ADDON_IDS.includes(x as AddOnId));
}

export interface QuoteRefineBody {
  square_footage: string;
  cleaning_frequency?: "one_time" | "weekly" | "biweekly" | "monthly";
  add_ons?: string[] | AddOnId[];
  opportunity_id?: string;
  zip?: string;
  home_type?: string;
}

/** Build addons list with id, label, price and addons_total from ADDON_PRICE_MAP */
function buildAddonsWithPrices(addOns: AddOnId[]): {
  addons: Array<{ id: AddOnId; label: string; price: number }>;
  addons_total: number;
} {
  const addons = addOns.map((id) => ({
    id,
    label: id,
    price: ADDON_PRICE_MAP[id] ?? 0,
  }));
  const addons_total = addons.reduce((sum, a) => sum + a.price, 0);
  return { addons, addons_total };
}

async function computeQuote(
  supabase: ReturnType<typeof createAdminClient>,
  squareFootageOption: SquareFootageOption,
  frequencyOption: CleaningFrequencyOption,
  addOns: AddOnId[]
): Promise<{
  estimated_price: number | null;
  first_clean_price: number | null;
  recurring_price: number | null;
  frequency_label: string;
  addons: Array<{ id: AddOnId; label: string; price: number }>;
  addons_total: number;
}> {
  const serviceKey = mapServiceTypeToKey(SERVICE_TYPE);
  const frequencyKey = mapFrequencyToKey(frequencyOption) ?? "";
  const addonKeys = mapAddOnsToKeys(addOns);
  const { addons: addonsWithPrices, addons_total } = buildAddonsWithPrices(addOns);

  const { data, error } = await supabase.rpc("get_quote_pricing", {
    p_vertical_slug: "cleaning",
    p_service_key: serviceKey,
    p_sqft_key: squareFootageOption,
    p_frequency_key: frequencyKey,
    p_addon_keys: addonKeys ?? [],
  });

  if (error || !data) {
    console.warn("[QUOTE_REFINE] RPC get_quote_pricing failed:", error?.message);
    const firstClean = 180;
    const totalFirst = firstClean + addons_total;
    return {
      estimated_price: totalFirst,
      first_clean_price: firstClean,
      recurring_price: frequencyOption !== "One-time" ? 120 : null,
      frequency_label: frequencyOption === "One-time" ? "One-time" : frequencyOption,
      addons: addonsWithPrices,
      addons_total,
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as SupabaseQuoteResult | undefined;
  if (!row) {
    const firstClean = 180;
    const totalFirst = firstClean + addons_total;
    return {
      estimated_price: totalFirst,
      first_clean_price: firstClean,
      recurring_price: null,
      frequency_label: "One-time",
      addons: addonsWithPrices,
      addons_total,
    };
  }

  const firstCleanPrice = (row.first_clean_cents ?? 0) / 100;
  const addonsTotalFromRpc = (row.addons_total_cents ?? 0) / 100;
  const addons_total_resolved = addOns.length > 0 ? addons_total : addonsTotalFromRpc;
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
    addons: addonsWithPrices,
    addons_total: addons_total_resolved,
  };
}

/**
 * POST /api/book-v2/quote-refine
 * Recalculates quote for given frequency/add-ons; optionally PATCHes opportunity metadata.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as QuoteRefineBody;
    const square_footage = body.square_footage?.trim();
    if (!square_footage) {
      return NextResponse.json(
        { ok: false, message: "square_footage is required" },
        { status: 400 }
      );
    }

    const squareFootageOption = normalizeSquareFootageInput(square_footage);
    const frequencyOption = mapApiFrequencyToOption(body.cleaning_frequency ?? "one_time");
    const addOns = parseAddOns(body.add_ons ?? []);

    const supabase = createAdminClient();
    const quoteOutput = await computeQuote(supabase, squareFootageOption, frequencyOption, addOns);

    const opportunityId = body.opportunity_id?.trim() || null;
    if (opportunityId) {
      const { data: existing } = await supabase
        .from("opportunities")
        .select("id, metadata")
        .eq("id", opportunityId)
        .single();
      if (existing) {
        const meta = (existing.metadata as Record<string, unknown>) ?? {};
        const quote_input = {
          zip: body.zip ?? (meta.quote_input as Record<string, unknown>)?.zip,
          home_type: body.home_type ?? (meta.quote_input as Record<string, unknown>)?.home_type,
          square_footage: square_footage,
          cleaning_frequency: body.cleaning_frequency ?? "one_time",
          add_ons: addOns,
        };
        await supabase
          .from("opportunities")
          .update({
            metadata: {
              ...meta,
              quote_input,
              quote_output: quoteOutput,
              source: "web_quote",
            },
            ...(quoteOutput.estimated_price != null && {
              estimated_price_cents: Math.round(quoteOutput.estimated_price * 100),
              monetary_value_cents: Math.round(quoteOutput.estimated_price * 100),
            }),
          })
          .eq("id", opportunityId);
      }
    }

    return NextResponse.json({
      ok: true,
      quote_output: quoteOutput,
    });
  } catch (err) {
    console.error("[QUOTE_REFINE_ERROR]", err);
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Quote refine failed" },
      { status: 500 }
    );
  }
}
