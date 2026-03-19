import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import type { CleaningFrequencyOption, SquareFootageOption } from "@/lib/pricing/cleaningPricing";
import { mapServiceTypeToKey, mapFrequencyToKey, ADDON_ID_TO_KEY } from "@/lib/pricing/supabasePricing";
import type { SupabaseQuoteResult } from "@/lib/pricing/supabasePricing";
import type { AddOnId } from "@/lib/pricing/cleaningPricing";
import {
  getFieldDefinitionMeta,
  upsertTypedFieldValue,
  serializeSquareFootageForFieldValue,
} from "@/lib/bookV2/fieldValueUpsert";

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

/** Normalize incoming add_ons to addon keys (client sends ["fridge","oven"] or AddOnId; return lowercase keys) */
function normalizeAddOnKeys(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const keyToKey = (s: string) => {
    const trimmed = s.trim();
    if (!trimmed) return null;
    if ((ADDON_IDS as string[]).includes(trimmed)) return ADDON_ID_TO_KEY[trimmed as AddOnId];
    return trimmed.toLowerCase().replace(/\s+/g, "_");
  };
  return arr
    .filter((x): x is string => typeof x === "string")
    .map(keyToKey)
    .filter((x): x is string => x != null && x.length > 0);
}

export interface QuoteRefineBody {
  square_footage: string;
  cleaning_frequency?: "one_time" | "weekly" | "biweekly" | "monthly";
  add_ons?: string[] | AddOnId[];
  opportunity_id?: string;
  zip?: string;
  vertical_id?: string;
}

/** Canonical add-on from DB (addon_types + pricing_addons) */
export type DbAddon = { key: string; label: string; price: number; sort_order: number };

/** Resolve vertical id: use body.vertical_id if it exists, else lookup by slug "cleaning" */
async function resolveVerticalId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  bodyVerticalId: string | undefined
): Promise<string> {
  const id = bodyVerticalId?.trim();
  if (id) {
    const { data: existing, error } = await supabase.from("verticals").select("id").eq("id", id).maybeSingle();
    if (!error && existing?.id) return existing.id;
  }
  const { data: bySlug, error } = await supabase
    .from("verticals")
    .select("id")
    .eq("slug", "cleaning")
    .maybeSingle();
  if (error || !bySlug?.id) {
    console.error("[QUOTE_REFINE] vertical lookup failed:", error?.message ?? "no cleaning vertical");
    throw new Error("Could not resolve cleaning vertical");
  }
  return bySlug.id;
}

/** Load available add-ons: types/order from addon_types, prices from pricing_addons (both filtered by vertical_id) */
async function loadCleaningAddonsFromDb(
  supabase: ReturnType<typeof createServiceRoleClient>,
  verticalId: string
): Promise<{ available_addons: DbAddon[]; addonPriceMap: Record<string, { label: string; price: number }> }> {
  const addonPriceMap: Record<string, { label: string; price: number }> = {};
  const available_addons: DbAddon[] = [];

  type AddonTypeRow = { key: string; label: string; position: number };
  const { data: typeRows, error: typesError } = await supabase
    .from("addon_types")
    .select("key, label, position")
    .eq("vertical_id", verticalId)
    .eq("is_active", true)
    .order("position", { ascending: true });
  if (typesError) {
    console.error("[QUOTE_REFINE] addon_types query failed:", typesError.message);
    throw new Error(`addon_types query failed: ${typesError.message}`);
  }
  const types = (typeRows ?? []) as AddonTypeRow[];

  type PricingAddonRow = { addon_key: string; addon_name: string; amount_cents: number; sort_order: number };
  const { data: priceRows, error: pricesError } = await supabase
    .from("pricing_addons")
    .select("addon_key, addon_name, amount_cents, sort_order")
    .eq("vertical_id", verticalId)
    .eq("is_active", true);
  if (pricesError) {
    console.error("[QUOTE_REFINE] pricing_addons query failed:", pricesError.message);
    throw new Error(`pricing_addons query failed: ${pricesError.message}`);
  }
  const priceList = (priceRows ?? []) as PricingAddonRow[];
  const priceByKey = new Map<string, { label: string; price: number }>();
  for (const p of priceList) {
    const key = String(p.addon_key ?? "").trim().toLowerCase();
    if (!key) continue;
    const price = (p.amount_cents ?? 0) / 100;
    priceByKey.set(key, { label: (p.addon_name ?? key).trim(), price });
  }

  for (const t of types) {
    const key = String(t.key ?? "").trim().toLowerCase();
    if (!key) continue;
    const pricing = priceByKey.get(key);
    const label = (t.label ?? pricing?.label ?? key).trim();
    const price = pricing?.price ?? 0;
    const position = typeof t.position === "number" ? t.position : 0;
    available_addons.push({ key, label, price, sort_order: position });
    addonPriceMap[key] = { label, price };
  }

  return { available_addons, addonPriceMap };
}

/** Row from pricing_frequencies (source of truth for frequency display) */
export type PricingFrequencyRow = {
  frequency_key: string;
  frequency_label: string;
  discount_label: string | null;
  is_recurring: boolean;
};

/** Load pricing_frequencies for a vertical (frequency_label + discount_label for UI) */
async function loadPricingFrequencies(
  supabase: ReturnType<typeof createServiceRoleClient>,
  verticalId: string
): Promise<PricingFrequencyRow[]> {
  const { data, error } = await supabase
    .from("pricing_frequencies")
    .select("frequency_key, frequency_label, discount_label, is_recurring")
    .eq("vertical_id", verticalId);
  if (error) {
    console.warn("[QUOTE_REFINE] pricing_frequencies query failed (optional):", error.message);
    return [];
  }
  return (data ?? []) as PricingFrequencyRow[];
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
  supabase: ReturnType<typeof createServiceRoleClient>,
  squareFootageOption: SquareFootageOption,
  frequencyOption: CleaningFrequencyOption,
  selectedAddonKeys: string[],
  addonPriceMap: Record<string, { label: string; price: number }>
): Promise<{
  estimated_price: number | null;
  first_clean_price: number | null;
  recurring_price: number | null;
  frequency_label: string;
  discount_label: string | null;
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
      discount_label: null,
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
      discount_label: null,
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
    discount_label: null,
    addons,
    addons_total,
  };
}

/**
 * POST /api/book-v2/quote-refine
 * Recalculates quote for given frequency/add-ons; add-on pricing from addon_types + pricing_addons (by vertical_id).
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

    const supabase = createServiceRoleClient();
    let verticalId: string;
    let dbAvailableAddons: DbAddon[];
    let addonPriceMap: Record<string, { label: string; price: number }>;
    let pricingFrequencies: PricingFrequencyRow[] = [];
    try {
      verticalId = await resolveVerticalId(supabase, body.vertical_id);
      const [loaded, freqs] = await Promise.all([
        loadCleaningAddonsFromDb(supabase, verticalId),
        loadPricingFrequencies(supabase, verticalId),
      ]);
      dbAvailableAddons = loaded.available_addons;
      addonPriceMap = loaded.addonPriceMap;
      pricingFrequencies = freqs;
    } catch (loadErr) {
      const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
      console.error("[QUOTE_REFINE] load add-ons failed:", msg);
      return NextResponse.json(
        { ok: false, message: "Failed to load add-on pricing" },
        { status: 500 }
      );
    }

    const squareFootageOption = normalizeSquareFootageInput(square_footage);
    const frequencyOption = mapApiFrequencyToOption(body.cleaning_frequency ?? "one_time");
    const selectedKeys = normalizeAddOnKeys(body.add_ons ?? []);

    let quoteOutput = await computeQuote(
      supabase,
      squareFootageOption,
      frequencyOption,
      selectedKeys,
      addonPriceMap
    );

    const freqByKey = new Map(pricingFrequencies.map((f) => [f.frequency_key, f]));
    const dbFreq = freqByKey.get(frequencyOption);
    if (dbFreq) {
      quoteOutput = {
        ...quoteOutput,
        frequency_label: dbFreq.frequency_label,
        discount_label: dbFreq.discount_label ?? null,
      };
    }

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
        .select("id, metadata, org_id, location_id")
        .eq("id", opportunityId)
        .single();
      if (existing) {
        const row = existing as {
          metadata?: Record<string, unknown> | null;
          org_id?: string | null;
          location_id?: string | null;
        };
        const meta = (row.metadata as Record<string, unknown>) ?? {};
        const apiKeyFromFreq = dbFreq?.frequency_key ?? body.cleaning_frequency ?? "one_time";
        const cleaningFreqApiKey =
          typeof body.cleaning_frequency === "string" ? body.cleaning_frequency : "one_time";
        const quote_input = {
          zip: body.zip ?? (meta.quote_input as Record<string, unknown>)?.zip,
          square_footage: square_footage,
          cleaning_frequency: typeof apiKeyFromFreq === "string" ? apiKeyFromFreq : "one_time",
          add_ons: selectedKeys,
        };
        const est = quoteOutput.estimated_price;
        const recurringCents =
          quoteOutput.recurring_price != null && !Number.isNaN(Number(quoteOutput.recurring_price))
            ? Math.round(Number(quoteOutput.recurring_price) * 100)
            : null;

        const oppUpdate: Record<string, unknown> = {
          metadata: {
            ...meta,
            quote_input,
            quote_output: quoteOutput,
            source: "web_quote",
          },
          // Re-pricing invalidates prior discount selection — user must re-apply code.
          discount_amount: null,
          discount_code_id: null,
          discount_program_id: null,
          discount_code: null,
        };
        if (est != null) {
          const cents = Math.round(est * 100);
          oppUpdate.estimated_price_cents = cents;
          oppUpdate.monetary_value_cents = cents;
          oppUpdate.quote_subtotal = est;
          oppUpdate.quote_total = est;
        }
        if (recurringCents != null) {
          oppUpdate.recurring_price_cents = recurringCents;
        } else {
          oppUpdate.recurring_price_cents = null;
        }

        await supabase.from("opportunities").update(oppUpdate).eq("id", opportunityId);

        const orgId = row.org_id ?? null;
        const locationId = row.location_id ?? null;
        if (orgId) {
          const freqDef = await getFieldDefinitionMeta(supabase, orgId, "opportunity", "cleaning_frequency");
          if (freqDef) {
            await upsertTypedFieldValue(
              supabase,
              orgId,
              "opportunity",
              opportunityId,
              freqDef,
              String(cleaningFreqApiKey)
            );
          }
          const svcDef = await getFieldDefinitionMeta(supabase, orgId, "opportunity", "requested_service_type");
          if (svcDef) {
            await upsertTypedFieldValue(supabase, orgId, "opportunity", opportunityId, svcDef, SERVICE_TYPE);
          }
        }
        if (orgId && locationId) {
          const sqDef = await getFieldDefinitionMeta(supabase, orgId, "location", "square_footage");
          if (sqDef) {
            await upsertTypedFieldValue(
              supabase,
              orgId,
              "location",
              locationId,
              sqDef,
              serializeSquareFootageForFieldValue(square_footage)
            );
          }
        }
      }
    }

    const available_addons = dbAvailableAddons.map((a) => ({ id: a.key, label: a.label, price: a.price }));
    const available_frequencies = pricingFrequencies.map((f) => ({
      frequency_key: f.frequency_key,
      frequency_label: f.frequency_label,
      discount_label: f.discount_label ?? null,
      is_recurring: f.is_recurring,
    }));

    return NextResponse.json({
      ok: true,
      quote_output: quoteOutput,
      available_addons,
      available_frequencies,
    });
  } catch (err) {
    console.error("[QUOTE_REFINE_ERROR]", err);
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Quote refine failed" },
      { status: 500 }
    );
  }
}
