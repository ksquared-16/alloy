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

/** Canonical add-on from DB (addon_types + pricing_addons) */
export type DbAddon = { key: string; label: string; price: number; sort_order: number };

/** Load cleaning add-ons from addon_types + pricing_addons; returns list and price map keyed by addon_key */
async function loadCleaningAddonsFromDb(
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ available_addons: DbAddon[]; addonPriceMap: Record<string, { label: string; price: number }> }> {
  const addonPriceMap: Record<string, { label: string; price: number }> = {};
  const available_addons: DbAddon[] = [];

  type AddonTypeRow = { id: string; addon_key: string; addon_name?: string; name?: string; sort_order?: number; is_active?: boolean; vertical_id?: string };
  const { data: typeRows, error: typesError } = await supabase
    .from("addon_types")
    .select("id, addon_key, addon_name, name, sort_order, is_active, vertical_id")
    .order("sort_order", { ascending: true });
  if (typesError) {
    console.warn("[QUOTE_REFINE] addon_types query failed:", typesError.message);
    return { available_addons, addonPriceMap };
  }
  const types = (typeRows ?? []) as AddonTypeRow[];

  type PricingRow = { addon_type_id?: string; addon_key?: string; amount_cents?: number; price_cents?: number; vertical_id?: string };
  const { data: priceRows, error: pricesError } = await supabase
    .from("pricing_addons")
    .select("addon_type_id, addon_key, amount_cents, price_cents, vertical_id");
  if (pricesError) {
    console.warn("[QUOTE_REFINE] pricing_addons query failed:", pricesError.message);
  }
  const prices = (priceRows ?? []) as PricingRow[];

  const priceByTypeId = new Map<string, number>();
  const priceByKey = new Map<string, number>();
  for (const p of prices) {
    const cents = p.amount_cents ?? p.price_cents ?? 0;
    if (p.addon_type_id) priceByTypeId.set(p.addon_type_id, cents);
    if (p.addon_key) priceByKey.set(String(p.addon_key).trim().toLowerCase(), cents);
  }

  for (const t of types) {
    const key = (t.addon_key ?? "").trim().toLowerCase();
    if (!key) continue;
    const active = t.is_active;
    if (active === false) continue;
    const label = (t.addon_name ?? t.name ?? t.addon_key ?? key).trim();
    const sortOrder = typeof t.sort_order === "number" ? t.sort_order : 0;
    const cents = priceByTypeId.get(t.id) ?? priceByKey.get(key) ?? 0;
    const price = cents / 100;
    available_addons.push({ key, label, price, sort_order: sortOrder });
    addonPriceMap[key] = { label, price };
  }

  return { available_addons, addonPriceMap };
}

/** Build addons list and total from selected addon_key list and DB price map */
function buildAddonsFromDb(
  selectedKeys: string[],
  addonPriceMap: Record<string, { label: string; price: number }>
): {
  addons: Array<{ id: string; label: string; price: number }>;
  addons_total: number;
} {
  const addons = selectedKeys
    .map((key) => {
      const norm = key.trim().toLowerCase();
      const row = addonPriceMap[norm];
      if (!row) return null;
      return { id: norm, label: row.label, price: row.price };
    })
    .filter((a): a is { id: string; label: string; price: number } => a != null);
  const addons_total = addons.reduce((sum, a) => sum + a.price, 0);
  return { addons, addons_total };
}

async function computeQuote(
  supabase: ReturnType<typeof createAdminClient>,
  squareFootageOption: SquareFootageOption,
  frequencyOption: CleaningFrequencyOption,
  selectedAddonKeys: string[],
  addonPriceMap: Record<string, { label: string; price: number }>
): Promise<{
  estimated_price: number | null;
  first_clean_price: number | null;
  recurring_price: number | null;
  frequency_label: string;
  addons: Array<{ id: string; label: string; price: number }>;
  addons_total: number;
}> {
  const serviceKey = mapServiceTypeToKey(SERVICE_TYPE);
  const frequencyKey = mapFrequencyToKey(frequencyOption) ?? "";
  const { addons, addons_total } = buildAddonsFromDb(selectedAddonKeys, addonPriceMap);

  const { data, error } = await supabase.rpc("get_quote_pricing", {
    p_vertical_slug: "cleaning",
    p_service_key: serviceKey,
    p_sqft_key: squareFootageOption,
    p_frequency_key: frequencyKey,
    p_addon_keys: selectedAddonKeys,
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
  };
}

/**
 * POST /api/book-v2/quote-refine
 * Recalculates quote for given frequency/add-ons; add-on pricing from addon_types + pricing_addons.
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
    const { available_addons: dbAvailableAddons, addonPriceMap } = await loadCleaningAddonsFromDb(supabase);

    const squareFootageOption = normalizeSquareFootageInput(square_footage);
    const frequencyOption = mapApiFrequencyToOption(body.cleaning_frequency ?? "one_time");
    const addOns = parseAddOns(body.add_ons ?? []);
    const selectedKeys = mapAddOnsToKeys(addOns);

    const quoteOutput = await computeQuote(
      supabase,
      squareFootageOption,
      frequencyOption,
      selectedKeys,
      addonPriceMap
    );

    console.log(
      "[QUOTE_REFINE] addons_loaded=%s selected=%s addons_total=%s",
      dbAvailableAddons.length,
      selectedKeys.join(",") || "(none)",
      quoteOutput.addons_total.toFixed(2)
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

    const available_addons = dbAvailableAddons.map((a) => ({ id: a.key, label: a.label, price: a.price }));

    return NextResponse.json({
      ok: true,
      quote_output: quoteOutput,
      available_addons,
    });
  } catch (err) {
    console.error("[QUOTE_REFINE_ERROR]", err);
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Quote refine failed" },
      { status: 500 }
    );
  }
}
