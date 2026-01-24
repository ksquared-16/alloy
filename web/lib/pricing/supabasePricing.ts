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
  const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";

  const serviceKey = mapServiceTypeToKey(serviceType);
  const frequencyKey = mapFrequencyToKey(frequency);
  // Ensure addonKeys is always an array, never undefined/null
  const addonKeys = mapAddOnsToKeys(addOns) ?? [];

  // Ensure p_frequency_key is always a string ("" for one-time, never undefined/null)
  const frequencyKeyParam = frequencyKey ?? "";

  const rpcParams = {
    p_vertical_slug: "cleaning",
    p_service_key: serviceKey,
    p_sqft_key: squareFootage, // Pass exactly as it appears in UI
    p_frequency_key: frequencyKeyParam,
    p_addon_keys: addonKeys,
  };

  if (isStaging) {
    console.log("[STAGING] Supabase RPC params:", rpcParams);
  }

  const { data, error } = await supabase.rpc("get_quote_pricing", rpcParams);

  if (isStaging) {
    console.log("[STAGING] Supabase RPC response:", { data, error });
  }

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

  // Extract frequency_label and discount_label from price_breakdown (source of truth)
  // Do NOT use input frequency parameter - parse from breakdown instead
  // Wrap in try/catch to never throw even if price_breakdown is null or malformed
  let frequencyLabel: string | null = null;
  let discountLabel: string | null = null;
  
  try {
    if (recurringPrice != null && recurringPrice > 0 && supabaseResult.price_breakdown) {
      // Parse frequency from "Recurring (Bi-Weekly):" or similar pattern
      const frequencyMatch = supabaseResult.price_breakdown.match(/Recurring\s*\(([^)]+)\)/i);
      if (frequencyMatch && frequencyMatch[1]) {
        const parsedFrequency = frequencyMatch[1].trim();
        // Normalize common variations
        if (parsedFrequency.toLowerCase().includes("bi-weekly") || parsedFrequency.toLowerCase().includes("biweekly")) {
          frequencyLabel = "Bi-Weekly";
        } else if (parsedFrequency.toLowerCase().includes("weekly")) {
          frequencyLabel = "Weekly";
        } else if (parsedFrequency.toLowerCase().includes("monthly")) {
          frequencyLabel = "Monthly";
        } else {
          // Use as-is if it doesn't match known patterns
          frequencyLabel = parsedFrequency;
        }
      }
      
      // Parse discount from "(XX% off)" pattern in price_breakdown
      const discountMatch = supabaseResult.price_breakdown.match(/\((\d+)%\s*off\)/i);
      if (discountMatch && discountMatch[1]) {
        discountLabel = `${discountMatch[1]}% off`;
      }
    }
  } catch (parseError) {
    // If parsing fails, default to null (don't throw - let quote proceed)
    console.warn("[SUPABASE_PRICING] Failed to parse frequency/discount from price_breakdown:", parseError);
    frequencyLabel = null;
    discountLabel = null;
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

