import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import type { CleaningFrequencyOption, SquareFootageOption } from "@/lib/pricing/cleaningPricing";
import { mapServiceTypeToKey, mapFrequencyToKey } from "@/lib/pricing/supabasePricing";
import type { SupabaseQuoteResult } from "@/lib/pricing/supabasePricing";
import {
  getFieldDefinitionMeta,
  upsertTypedFieldValue,
  serializeSquareFootageForFieldValue,
} from "@/lib/bookV2/fieldValueUpsert";
import {
  EXCLUDED_CUSTOMER_SELECTABLE_ADDON_KEYS,
  filterExcludedCustomerAddonKeys,
} from "@/lib/book-v2/customerAddonPolicy";
import {
  loadCleaningAddonsFromDb,
  loadPricingFrequenciesForVertical,
  loadSqftTiersForVertical,
  normalizeAddonKeysAgainstMap,
  normalizeSqftKeyInput,
  type DbAddonRow,
  type PricingFrequencyRow,
} from "@/lib/book-v2/loadCleaningPricingCatalog";

const SERVICE_TYPE = "Standard Cleaning";

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

export interface QuoteRefineBody {
  square_footage: string;
  cleaning_frequency?: "one_time" | "weekly" | "biweekly" | "monthly";
  add_ons?: string[];
  opportunity_id?: string;
  zip?: string;
  vertical_id?: string;
}

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
    let dbAvailableAddons: DbAddonRow[];
    let addonPriceMap: Record<string, { label: string; price: number }>;
    let pricingFrequencies: PricingFrequencyRow[] = [];
    try {
      verticalId = await resolveVerticalId(supabase, body.vertical_id);
      const [loaded, freqs] = await Promise.all([
        loadCleaningAddonsFromDb(supabase, verticalId),
        loadPricingFrequenciesForVertical(supabase, verticalId),
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

    const sqftTiers = await loadSqftTiersForVertical(supabase, verticalId);
    const squareFootageOption = normalizeSqftKeyInput(square_footage, sqftTiers) as SquareFootageOption;
    const frequencyOption = mapApiFrequencyToOption(body.cleaning_frequency ?? "one_time");
    const selectedKeys = filterExcludedCustomerAddonKeys(
      normalizeAddonKeysAgainstMap(body.add_ons ?? [], addonPriceMap)
    );

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
      console.log("[QUOTE_REFINE_OPPORTUNITY] opportunity_id received", { opportunity_id: opportunityId });

      const { data: existing, error: fetchOppErr } = await supabase
        .from("opportunities")
        .select("id, metadata, org_id, location_id")
        .eq("id", opportunityId)
        .maybeSingle();

      if (fetchOppErr) {
        console.error("[QUOTE_REFINE_OPPORTUNITY] opportunity fetch failed", {
          opportunity_id: opportunityId,
          message: fetchOppErr.message,
          code: fetchOppErr.code,
        });
      }

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
        const estRaw = quoteOutput.estimated_price;
        if (estRaw != null && !Number.isFinite(Number(estRaw))) {
          console.error("[QUOTE_REFINE_OPPORTUNITY] non-finite estimated_price", {
            opportunity_id: opportunityId,
            estRaw,
          });
          return NextResponse.json(
            { ok: false, message: "Invalid quote estimate from pricing engine" },
            { status: 500 }
          );
        }
        const est =
          estRaw != null && Number.isFinite(Number(estRaw)) ? Number(estRaw) : null;
        const recurringNum =
          quoteOutput.recurring_price != null && !Number.isNaN(Number(quoteOutput.recurring_price))
            ? Number(quoteOutput.recurring_price)
            : null;
        const recurringCents =
          recurringNum != null && Number.isFinite(recurringNum)
            ? Math.round(recurringNum * 100)
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
          updated_at: new Date().toISOString(),
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

        console.log("[QUOTE_REFINE_OPPORTUNITY] computed pricing snapshot", {
          opportunity_id: opportunityId,
          est_raw: estRaw,
          est_finite: est,
          estimated_price_cents: est != null ? Math.round(est * 100) : null,
          monetary_value_cents: est != null ? Math.round(est * 100) : null,
          quote_subtotal: est,
          quote_total: est,
          recurring_price_cents: recurringCents,
        });
        console.log("[QUOTE_REFINE_OPPORTUNITY] update payload keys", {
          opportunity_id: opportunityId,
          keys: Object.keys(oppUpdate),
          metadata_has_quote_input: !!(oppUpdate.metadata as Record<string, unknown>)?.quote_input,
          metadata_has_quote_output: !!(oppUpdate.metadata as Record<string, unknown>)?.quote_output,
        });

        const { data: updatedRows, error: oppUpdateErr } = await supabase
          .from("opportunities")
          .update(oppUpdate)
          .eq("id", opportunityId)
          .select("id");

        if (oppUpdateErr) {
          console.error("[QUOTE_REFINE_OPPORTUNITY] opportunity update failed", {
            opportunity_id: opportunityId,
            message: oppUpdateErr.message,
            code: oppUpdateErr.code,
            details: oppUpdateErr.details,
            hint: oppUpdateErr.hint,
          });
          return NextResponse.json(
            { ok: false, message: "Failed to persist quote on opportunity" },
            { status: 500 }
          );
        }
        if (!updatedRows?.length) {
          console.error("[QUOTE_REFINE_OPPORTUNITY] opportunity update matched 0 rows", {
            opportunity_id: opportunityId,
          });
          return NextResponse.json(
            { ok: false, message: "Opportunity not found for quote update" },
            { status: 404 }
          );
        }
        console.log("[QUOTE_REFINE_OPPORTUNITY] opportunity update ok", {
          opportunity_id: opportunityId,
          returned_id: updatedRows[0]?.id ?? null,
        });

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
      } else if (!fetchOppErr) {
        console.warn("[QUOTE_REFINE_OPPORTUNITY] no opportunity row for id (skipping persist)", {
          opportunity_id: opportunityId,
        });
      }
    }

    const available_addons = dbAvailableAddons
      .filter((a) => !EXCLUDED_CUSTOMER_SELECTABLE_ADDON_KEYS.has(a.key))
      .map((a) => ({ id: a.key, label: a.label, price: a.price }));
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
