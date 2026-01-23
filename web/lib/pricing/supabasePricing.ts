/**
 * Supabase-based pricing calculation.
 * Calls public.get_quote_pricing RPC function.
 */

import { createClient } from "@/lib/supabaseClient";
import type {
  ServiceType,
  CleaningFrequencyOption,
  SquareFootageOption,
  AddOnId,
  CleaningQuoteResult,
} from "./cleaningPricing";

export interface SupabaseQuoteResult {
  first_clean_cents: number | null;
  recurring_cents: number | null;
  addons_total_cents: number | null;
  total_first_visit_cents: number | null;
  price_breakdown: string | null;
  is_manual_quote: boolean;
  out_frequency_key?: string | null;
}

/**
 * Map UI service type to Supabase service_key
 */
export function mapServiceTypeToKey(serviceType: ServiceType): string {
  switch (serviceType) {
    case "Standard Cleaning":
      return "standard_cleaning";
    case "Move-Out / Heavy Clean":
      return "move_out_heavy";
    default:
      throw new Error(`Unknown service type: ${serviceType}`);
  }
}

/**
 * Map UI frequency to Supabase frequency_key
 * 
 * Returns one of:
 * - "Weekly (30% Off)"
 * - "Bi-Weekly (20% Off)"
 * - "Monthly (10% Off)"
 * - null (for one-time / no recurring)
 * 
 * Legacy values are automatically mapped forward:
 * - "Weekly (40% Off)" -> "Weekly (30% Off)"
 * - "Bi-Weekly (30% Off)" -> "Bi-Weekly (20% Off)"
 * - "Monthly (20% Off)" -> "Monthly (10% Off)"
 */
export function mapFrequencyToKey(frequency: CleaningFrequencyOption): string | null {
  // Handle one-time
  if (frequency === "One-time") {
    return null;
  }

  // Map new values directly
  if (frequency === "Weekly (30% Off)") {
    return "Weekly (30% Off)";
  }
  if (frequency === "Bi-Weekly (20% Off)") {
    return "Bi-Weekly (20% Off)";
  }
  if (frequency === "Monthly (10% Off)") {
    return "Monthly (10% Off)";
  }

  // Map legacy values forward (backward compatibility)
  if (frequency === "Weekly (40% Off)") {
    return "Weekly (30% Off)";
  }
  if (frequency === "Bi-Weekly (30% Off)") {
    return "Bi-Weekly (20% Off)";
  }
  if (frequency === "Monthly (20% Off)") {
    return "Monthly (10% Off)";
  }

  // Unknown frequency - return null
  return null;
}

/**
 * Map UI add-on IDs to Supabase addon_key format
 */
export function mapAddOnsToKeys(addOns: AddOnId[]): string[] {
  const addonKeyMap: Record<AddOnId, string> = {
    Fridge: "fridge",
    Oven: "oven",
    Cabinets: "cabinets",
    "Windows & Blinds": "windows_blinds",
    "Pet Hair": "pet_hair",
    Baseboards: "baseboards",
  };

  return addOns.map((addon) => addonKeyMap[addon] || addon.toLowerCase().replace(/\s+/g, "_"));
}

/**
 * Call Supabase RPC function to get quote pricing
 */
export async function getQuotePricingFromSupabase(
  serviceType: ServiceType,
  squareFootage: SquareFootageOption,
  frequency: CleaningFrequencyOption,
  addOns: AddOnId[]
): Promise<SupabaseQuoteResult> {
  const supabase = createClient();

  const serviceKey = mapServiceTypeToKey(serviceType);
  const frequencyKey = mapFrequencyToKey(frequency);
  const addonKeys = mapAddOnsToKeys(addOns);

  const { data, error } = await supabase.rpc("get_quote_pricing", {
    p_vertical_slug: "cleaning",
    p_service_key: serviceKey,
    p_sqft_key: squareFootage, // Pass exactly as it appears in UI
    p_frequency_key: frequencyKey || "", // Empty string for one-time
    p_addon_keys: addonKeys,
  });

  if (error) {
    console.error("[SUPABASE_PRICING] RPC error:", error);
    throw new Error(`Failed to calculate pricing: ${error.message}`);
  }

  if (!data) {
    throw new Error("No pricing data returned from Supabase");
  }

  // RPC returns an array - use first row
  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error("No pricing data returned from Supabase (empty array)");
    }
    return data[0] as SupabaseQuoteResult;
  }

  // Fallback: if it's not an array, return as-is
  return data as SupabaseQuoteResult;
}

/**
 * Convert Supabase quote result to CleaningQuoteResult format
 */
export function convertSupabaseResultToQuoteResult(
  supabaseResult: SupabaseQuoteResult,
  serviceType: ServiceType,
  frequency: CleaningFrequencyOption,
  addOns: AddOnId[]
): CleaningQuoteResult {
  const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";
  
  if (isStaging) {
    console.log("[STAGING] convertSupabaseResultToQuoteResult - raw row:", supabaseResult);
  }

  const serviceLabel =
    serviceType === "Move-Out / Heavy Clean"
      ? "Move-Out / Heavy Clean"
      : "Standard Cleaning";

  // Handle manual quote
  if (supabaseResult.is_manual_quote) {
    const result = {
      status: "pending" as const,
      source: "supabase" as const,
      service: serviceLabel,
      estimated_price: null,
      first_clean_price: null,
      recurring_price: null,
      frequency_label: null,
      discount_label: null,
      addons: addOns.map((id) => ({ name: id, price: null })),
      price_breakdown: supabaseResult.price_breakdown || "Manual quote required",
      is_manual_quote: true,
    };
    
    if (isStaging) {
      console.log("[STAGING] convertSupabaseResultToQuoteResult - converted (manual):", result);
    }
    
    return result;
  }

  // Map fields from Supabase RPC response
  // first_clean_price = (row.first_clean_cents ?? 0) / 100
  const firstCleanPrice = (supabaseResult.first_clean_cents ?? 0) / 100;
  
  // recurring_price = row.recurring_cents != null ? row.recurring_cents / 100 : null
  const recurringPrice = supabaseResult.recurring_cents != null 
    ? supabaseResult.recurring_cents / 100 
    : null;
  
  // estimated_price = (row.total_first_visit_cents ?? (row.first_clean_cents ?? 0) + (row.addons_total_cents ?? 0)) / 100
  const estimatedPrice = (supabaseResult.total_first_visit_cents ?? 
    ((supabaseResult.first_clean_cents ?? 0) + (supabaseResult.addons_total_cents ?? 0))) / 100;

  // Extract frequency label and discount from out_frequency_key or fallback to input frequency
  let frequencyLabel: string | null = null;
  let discountLabel: string | null = null;
  
  // Use out_frequency_key from RPC if available, otherwise derive from input frequency
  const frequencyKey = supabaseResult.out_frequency_key || mapFrequencyToKey(frequency);
  
  if (frequencyKey) {
    if (frequencyKey === "Weekly (30% Off)" || frequencyKey.includes("Weekly")) {
      frequencyLabel = "Weekly";
      discountLabel = "30% off";
    } else if (frequencyKey === "Bi-Weekly (20% Off)" || frequencyKey.includes("Bi-Weekly")) {
      frequencyLabel = "Bi-Weekly";
      discountLabel = "20% off";
    } else if (frequencyKey === "Monthly (10% Off)" || frequencyKey.includes("Monthly")) {
      frequencyLabel = "Monthly";
      discountLabel = "10% off";
    } else {
      // Fallback: try to extract from the key string
      frequencyLabel = frequencyKey.split(" ")[0] || null;
      // Extract discount from key if present
      const discountMatch = frequencyKey.match(/(\d+)%/);
      if (discountMatch) {
        discountLabel = `${discountMatch[1]}% off`;
      }
    }
  }

  // Build addons list (we don't have individual addon prices from Supabase, so use null)
  const addonsList = addOns.map((id) => ({ name: id, price: null }));

  // status = "ready" if we have pricing data
  const status: "ready" | "pending" =
    (firstCleanPrice > 0 || estimatedPrice > 0) ? "ready" : "pending";

  const result: CleaningQuoteResult = {
    status,
    source: "supabase",
    service: serviceLabel,
    estimated_price: estimatedPrice,
    first_clean_price: firstCleanPrice,
    recurring_price: recurringPrice,
    frequency_label: frequencyLabel,
    discount_label: discountLabel,
    addons: addonsList,
    price_breakdown: supabaseResult.price_breakdown || null,
    is_manual_quote: false,
  };

  if (isStaging) {
    console.log("[STAGING] convertSupabaseResultToQuoteResult - converted:", result);
  }

  return result;
}

