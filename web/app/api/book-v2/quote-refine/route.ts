import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import type { CleaningFrequencyOption, SquareFootageOption } from "@/lib/pricing/cleaningPricing";
import { mapServiceTypeToKey, mapFrequencyToKey, mapAddOnsToKeys, ADDON_ID_TO_KEY } from "@/lib/pricing/supabasePricing";
import type { SupabaseQuoteResult } from "@/lib/pricing/supabasePricing";
import type { AddOnId } from "@/lib/pricing/cleaningPricing";

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

/** Valid AddOnId list for cleaning (UI keys) */
const ADDON_IDS: AddOnId[] = [
  "Fridge",
  "Oven",
  "Cabinets",
  "Windows & Blinds",
  "Pet Hair",
  "Baseboards",
];

/** Normalize incoming add_ons to AddOnId[] (UI sends AddOnId or addon_key) */
function parseAddOns(arr: unknown): AddOnId[] {
  if (!Array.isArray(arr)) return [];
  const keyToId = Object.fromEntries(
    (Object.entries(ADDON_ID_TO_KEY) as [AddOnId, string][]).map(([id, key]) => [key, id])
  ) as Record<string, AddOnId>;
  return arr
    .filter((x): x is string => typeof x === "string")
    .map((x) => {
      const trimmed = (x as string).trim();
      if ((ADDON_IDS as string[]).includes(trimmed)) return trimmed as AddOnId;
      const normalized = trimmed.toLowerCase().replace(/\s+/g, "_");
      return keyToId[normalized] ?? null;
    })
    .filter((x): x is AddOnId => x != null);
}

export interface QuoteRefineBody {
  square_footage: string;
  cleaning_frequency?: "one_time" | "weekly" | "biweekly" | "monthly";
  add_ons?: string[] | AddOnId[];
  opportunity_id?: string;
  zip?: string;
  home_type?: string;
  vertical_id?: string;
}

/** Row from public.vertical_addons */
interface VerticalAddonRow {
  addon_key: string;
  addon_name: string;
  amount_cents: number;
  sort_order: number;
  is_active: boolean;
  vertical_id: string;
}

/** Load active add-ons for a vertical from DB; sort by sort_order asc */
async function loadVerticalAddons(
  supabase: ReturnType<typeof createAdminClient>,
  verticalId: string
): Promise<VerticalAddonRow[]> {
  const { data, error } = await supabase
    .from("vertical_addons")
    .select("addon_key, addon_name, amount_cents, sort_order, is_active, vertical_id")
    .eq("vertical_id", verticalId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.warn("[QUOTE_REFINE] vertical_addons query failed:", error.message);
    return [];
  }
  return (data ?? []) as VerticalAddonRow[];
}

/** Get cleaning vertical id (from body or lookup by slug) */
async function getCleaningVerticalId(
  supabase: ReturnType<typeof createAdminClient>,
  verticalIdFromBody: string | null | undefined
): Promise<string | null> {
  if (verticalIdFromBody?.trim()) {
    const { data } = await supabase.from("verticals").select("id").eq("id", verticalIdFromBody.trim()).eq("is_active", true).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data } = await supabase
    .from("verticals")
    .select("id")
    .eq("slug", "cleaning")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/** Build addons list and total from DB rows; selected keys = addon_key list from UI selection */
function buildAddonsFromDb(
  selectedAddOns: AddOnId[],
  dbMap: Map<string, { addon_name: string; amount_cents: number }>
): {
  addons: Array<{ id: string; label: string; price: number }>;
  addons_total: number;
  available_addons: Array<{ id: string; label: string; price: number }>;
} {
  const addonKeys = mapAddOnsToKeys(selectedAddOns);
  const addons = addonKeys
    .map((key) => {
      const row = dbMap.get(key);
      if (!row) return null;
      const price = row.amount_cents / 100;
      return { id: key, label: row.addon_name, price };
    })
    .filter((a): a is { id: string; label: string; price: number } => a != null);
  const addons_total = addons.reduce((sum, a) => sum + a.price, 0);
  const available_addons = Array.from(dbMap.entries()).map(([key, row]) => ({
    id: key,
    label: row.addon_name,
    price: row.amount_cents / 100,
  }));
  return { addons, addons_total, available_addons };
}

async function computeQuote(
  supabase: ReturnType<typeof createAdminClient>,
  squareFootageOption: SquareFootageOption,
  frequencyOption: CleaningFrequencyOption,
  addOns: AddOnId[],
  dbAddonMap: Map<string, { addon_name: string; amount_cents: number }>
): Promise<{
  estimated_price: number | null;
  first_clean_price: number | null;
  recurring_price: number | null;
  frequency_label: string;
  addons: Array<{ id: string; label: string; price: number }>;
  addons_total: number;
  available_addons: Array<{ id: string; label: string; price: number }>;
}> {
  const serviceKey = mapServiceTypeToKey(SERVICE_TYPE);
  const frequencyKey = mapFrequencyToKey(frequencyOption) ?? "";
  const addonKeys = mapAddOnsToKeys(addOns);
  const { addons, addons_total, available_addons } = buildAddonsFromDb(addOns, dbAddonMap);

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
      addons,
      addons_total,
      available_addons,
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
      addons,
      addons_total,
      available_addons,
    };
  }

  const firstCleanPrice = (row.first_clean_cents ?? 0) / 100;
  const recurringPrice = row.recurring_cents != null ? row.recurring_cents / 100 : null;
  const estimatedPrice = firstCleanPrice + addons_total;
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
    addons,
    addons_total,
    available_addons,
  };
}

/**
 * POST /api/book-v2/quote-refine
 * Recalculates quote for given frequency/add-ons; add-on pricing from public.vertical_addons.
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

    const supabase = createAdminClient();
    const verticalId = await getCleaningVerticalId(supabase, body.vertical_id);
    if (!verticalId) {
      return NextResponse.json(
        { ok: false, message: "Cleaning vertical not found" },
        { status: 500 }
      );
    }

    const addonRows = await loadVerticalAddons(supabase, verticalId);
    const dbAddonMap = new Map<string, { addon_name: string; amount_cents: number }>();
    for (const row of addonRows) {
      dbAddonMap.set(row.addon_key, { addon_name: row.addon_name, amount_cents: row.amount_cents });
    }

    const squareFootageOption = normalizeSquareFootageInput(square_footage);
    const frequencyOption = mapApiFrequencyToOption(body.cleaning_frequency ?? "one_time");
    const addOns = parseAddOns(body.add_ons ?? []);
    const selectedKeys = mapAddOnsToKeys(addOns);

    const quoteOutput = await computeQuote(
      supabase,
      squareFootageOption,
      frequencyOption,
      addOns,
      dbAddonMap
    );

    console.log(
      "[QUOTE_REFINE] addons_loaded=%s selected=%s addons_total=%s",
      addonRows.length,
      selectedKeys.join(",") || "(none)",
      quoteOutput.addons_total
    );

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
        const { available_addons: _drop, ...quoteOutputForMeta } = quoteOutput;
        await supabase
          .from("opportunities")
          .update({
            metadata: {
              ...meta,
              quote_input,
              quote_output: quoteOutputForMeta,
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
      available_addons: quoteOutput.available_addons,
    });
  } catch (err) {
    console.error("[QUOTE_REFINE_ERROR]", err);
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Quote refine failed" },
      { status: 500 }
    );
  }
}
