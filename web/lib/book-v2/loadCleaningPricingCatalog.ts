import type { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import type { FieldOption } from "@/lib/fields/fieldDefinitionConfig";
import { resolveOptionSetOptions } from "@/lib/fields/resolveOptionSetOptions";

type Supabase = ReturnType<typeof createServiceRoleClient>;

/** Canonical square footage tiers (stable keys aligned with option_set + pricing_square_footage_tiers.tier_key). */
export const CANONICAL_SQFT_TIER_OPTIONS: FieldOption[] = [
    { value: "0_1499", label: "Under 1,500 sq ft" },
    { value: "1500_1999", label: "1,500 – 1,999 sq ft" },
    { value: "2000_2599", label: "2,000 – 2,599 sq ft" },
    { value: "2600_3199", label: "2,600 – 3,199 sq ft" },
    { value: "3200_3999", label: "3,200 – 3,999 sq ft" },
    { value: "4000_5499", label: "4,000 – 5,499 sq ft" },
    { value: "5500_plus", label: "5,500+ sq ft" },
];

/** Active sqft tiers from pricing_square_footage_tiers (keys + pricing dimension link). */
export type SqftTierDbRow = { tier_key: string; sort_order: number; dimension_value_id: string | null };

/** Tier row with display label resolved from option_sets or pricing_dimension_values. */
export type SqftTierRow = { tier_key: string; tier_label: string | null; sort_order: number };

/** @deprecated Use CANONICAL_SQFT_TIER_OPTIONS / tier_key-based rows */
export const FALLBACK_SQFT_TIERS: { sqft_key: string; sqft_label: string | null; sort_order: number }[] =
    CANONICAL_SQFT_TIER_OPTIONS.map((o, i) => ({
        sqft_key: o.value,
        sqft_label: o.label,
        sort_order: i,
    }));

const LEGACY_LABEL_OR_KEY_TO_TIER: Record<string, string> = (() => {
    const m: Record<string, string> = {};
    for (const o of CANONICAL_SQFT_TIER_OPTIONS) {
        m[o.value.toLowerCase()] = o.value;
        m[o.label.toLowerCase().replace(/\s+/g, " ")] = o.value;
    }
    const legacy: [string, string][] = [
        ["Under 1500 sq ft", "0_1499"],
        ["under 1500 sq ft", "0_1499"],
        ["1501–2,000 sq ft", "1500_1999"],
        ["1501-2,000 sq ft", "1500_1999"],
        ["2,001-2,600 sq ft", "2000_2599"],
        ["2,601-3,200 sq ft", "2600_3199"],
        ["3,201-4,000 sq ft", "3200_3999"],
        ["4,001-5,500 sq ft", "4000_5499"],
        ["Over 5,500 sq ft", "5500_plus"],
    ];
    for (const [k, v] of legacy) {
        m[k.toLowerCase()] = v;
    }
    return m;
})();

function legacyNumericSqftToTierKey(sqft: number): string {
    if (sqft <= 1499) return "0_1499";
    if (sqft <= 1999) return "1500_1999";
    if (sqft <= 2599) return "2000_2599";
    if (sqft <= 3199) return "2600_3199";
    if (sqft <= 3999) return "3200_3999";
    if (sqft <= 5499) return "4000_5499";
    return "5500_plus";
}

export type DbAddonRow = { key: string; label: string; price: number; sort_order: number };

export async function resolveCleaningVerticalId(
    supabase: Supabase,
    verticalSlug: string = "cleaning"
): Promise<string | null> {
    const { data } = await supabase
        .from("verticals")
        .select("id")
        .eq("slug", verticalSlug)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
}

export async function loadSqftTiersForVertical(supabase: Supabase, verticalId: string): Promise<SqftTierDbRow[]> {
    const { data, error } = await supabase
        .from("pricing_square_footage_tiers")
        .select("tier_key, sort_order, dimension_value_id")
        .eq("vertical_id", verticalId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
    if (error) {
        console.error("[BOOKING_CATALOG] pricing_square_footage_tiers", error.message);
        return [];
    }
    return ((data ?? []) as { tier_key: string; sort_order: number; dimension_value_id?: string | null }[]).map((r) => ({
        tier_key: String(r.tier_key).trim(),
        sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
        dimension_value_id: r.dimension_value_id != null && String(r.dimension_value_id).trim() ? String(r.dimension_value_id).trim() : null,
    }));
}

/**
 * Display labels for public booking: prefer org option_set `square_footage_tier` item labels,
 * else pricing_dimension_values.value_label for the tier's dimension_value_id.
 */
export async function resolveSqftTierDisplayLabels(
    supabase: Supabase,
    orgId: string | null,
    rows: SqftTierDbRow[]
): Promise<SqftTierRow[]> {
    const optionLabelByTierKey = new Map<string, string>();
    if (orgId?.trim()) {
        const opts = await resolveOptionSetOptions(supabase, orgId.trim(), "square_footage_tier");
        for (const o of opts) {
            const k = o.value.trim();
            if (!k) continue;
            const lab = (o.label && String(o.label).trim()) || k;
            optionLabelByTierKey.set(k, lab);
        }
    }

    const dimIds = [...new Set(rows.map((r) => r.dimension_value_id).filter((id): id is string => id != null && id !== ""))];
    const dimLabelById = new Map<string, string>();
    if (dimIds.length > 0) {
        const { data: dimRows, error: dimErr } = await supabase
            .from("pricing_dimension_values")
            .select("id, value_label")
            .in("id", dimIds);
        if (dimErr) {
            console.warn("[BOOKING_CATALOG] pricing_dimension_values", dimErr.message);
        } else {
            for (const d of (dimRows ?? []) as { id: string; value_label?: string | null }[]) {
                const id = String(d.id).trim();
                if (!id) continue;
                const lab = (d.value_label != null && String(d.value_label).trim()) || id;
                dimLabelById.set(id, lab);
            }
        }
    }

    return rows.map((r) => {
        const tier_key = r.tier_key.trim();
        const fromOption = optionLabelByTierKey.get(tier_key);
        const fromDim = r.dimension_value_id ? dimLabelById.get(r.dimension_value_id) : undefined;
        const tier_label =
            (fromOption != null && String(fromOption).trim() !== "" ? String(fromOption).trim() : null) ??
            (fromDim != null && String(fromDim).trim() !== "" ? String(fromDim).trim() : null);
        return {
            tier_key,
            sort_order: r.sort_order,
            tier_label,
        };
    });
}

/** Normalize quote/UI value to a tier_key present in tiers (fallback: first canonical tier). */
export function normalizeSqftKeyInput(val: string | number | null | undefined, tiers: SqftTierDbRow[] | SqftTierRow[]): string {
    const tierList = tiers.length
        ? tiers
        : CANONICAL_SQFT_TIER_OPTIONS.map((o, i) => ({
              tier_key: o.value,
              sort_order: i,
          }));
    const keys = new Set(tierList.map((t) => t.tier_key.trim()));
    if (val == null) return tierList[0]!.tier_key;
    const s = typeof val === "string" ? val.trim() : String(val);
    if (keys.has(s)) return s;
    const mapped = LEGACY_LABEL_OR_KEY_TO_TIER[s.toLowerCase().replace(/\u2013/g, "-")];
    if (mapped && keys.has(mapped)) return mapped;
    const loose = LEGACY_LABEL_OR_KEY_TO_TIER[s.toLowerCase().replace(/\s+/g, " ")];
    if (loose && keys.has(loose)) return loose;
    const num = typeof val === "number" ? val : parseInt(s.replace(/,/g, ""), 10);
    if (!Number.isNaN(num) && num > 0) {
        const byNum = legacyNumericSqftToTierKey(num);
        if (keys.has(byNum)) return byNum;
    }
    return tierList[0]!.tier_key;
}

/** Persist canonical tier_key (quote_input, location.square_footage_tier_key). */
export function resolveSquareFootageStorageString(
    _raw: string | number | null | undefined,
    normalizedTierKey: string,
    _tiers: SqftTierDbRow[] | SqftTierRow[]
): string {
    return normalizedTierKey;
}

type AddonTypeRow = { key: string; label: string; position: number };
type PricingAddonRow = { addon_key: string; addon_name: string; amount_cents: number; sort_order: number };

export async function loadCleaningAddonsFromDb(
    supabase: Supabase,
    verticalId: string
): Promise<{ available_addons: DbAddonRow[]; addonPriceMap: Record<string, { label: string; price: number }> }> {
    const addonPriceMap: Record<string, { label: string; price: number }> = {};
    const available_addons: DbAddonRow[] = [];

    const { data: typeRows, error: typesError } = await supabase
        .from("addon_types")
        .select("key, label, position")
        .eq("vertical_id", verticalId)
        .eq("is_active", true)
        .order("position", { ascending: true });
    if (typesError) {
        console.error("[BOOKING_CATALOG] addon_types", typesError.message);
        throw new Error(`addon_types query failed: ${typesError.message}`);
    }
    const types = (typeRows ?? []) as AddonTypeRow[];

    const { data: priceRows, error: pricesError } = await supabase
        .from("pricing_addons")
        .select("addon_key, addon_name, amount_cents, sort_order")
        .eq("vertical_id", verticalId)
        .eq("is_active", true);
    if (pricesError) {
        console.error("[BOOKING_CATALOG] pricing_addons", pricesError.message);
        throw new Error(`pricing_addons query failed: ${pricesError.message}`);
    }
    const priceList = (priceRows ?? []) as PricingAddonRow[];
    const priceByKey = new Map<string, { label: string; price: number }>();
    for (const p of priceList) {
        const key = String(p.addon_key ?? "").trim().toLowerCase();
        if (!key) continue;
        priceByKey.set(key, { label: (p.addon_name ?? key).trim(), price: (p.amount_cents ?? 0) / 100 });
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

export type PricingFrequencyRow = {
    frequency_key: string;
    frequency_label: string;
    discount_label: string | null;
    is_recurring: boolean;
};

export async function loadPricingFrequenciesForVertical(
    supabase: Supabase,
    verticalId: string
): Promise<PricingFrequencyRow[]> {
    const { data, error } = await supabase
        .from("pricing_frequencies")
        .select("frequency_key, frequency_label, discount_label, is_recurring")
        .eq("vertical_id", verticalId);
    if (error) {
        console.warn("[BOOKING_CATALOG] pricing_frequencies", error.message);
        return [];
    }
    return (data ?? []) as PricingFrequencyRow[];
}

export type HomeTypeRow = { key: string; label: string; position: number };

/** @deprecated Prefer option_sets (home_type) per org; kept for transitional admin paths. */
export async function loadActiveHomeTypes(supabase: Supabase): Promise<HomeTypeRow[]> {
    const { data, error } = await supabase
        .from("home_types")
        .select("key, label, position")
        .eq("is_active", true)
        .order("position", { ascending: true });
    if (error) {
        console.error("[BOOKING_CATALOG] home_types", error.message);
        return [];
    }
    return (data ?? []) as HomeTypeRow[];
}

export function normalizeAddonKeysAgainstMap(
    arr: unknown,
    addonPriceMap: Record<string, { label: string; price: number }>
): string[] {
    if (!Array.isArray(arr)) return [];
    const allowed = new Set(Object.keys(addonPriceMap));
    const displayToKey = new Map<string, string>();
    for (const [k, v] of Object.entries(addonPriceMap)) {
        displayToKey.set(v.label.trim().toLowerCase(), k);
    }
    const titleCaseKeys: Record<string, string> = {
        fridge: "fridge",
        oven: "oven",
        cabinets: "cabinets",
        "pet hair": "pet_hair",
        pet_hair: "pet_hair",
    };
    return arr
        .filter((x): x is string => typeof x === "string")
        .map((raw) => {
            const trimmed = raw.trim();
            if (!trimmed) return null;
            const lower = trimmed.toLowerCase().replace(/\s+/g, " ");
            if (allowed.has(lower)) return lower;
            const fromLabel = displayToKey.get(lower);
            if (fromLabel) return fromLabel;
            const slug = lower.replace(/\s+/g, "_");
            if (allowed.has(slug)) return slug;
            const tc = titleCaseKeys[lower];
            if (tc && allowed.has(tc)) return tc;
            const fromDisplay = displayToKey.get(trimmed.toLowerCase());
            return fromDisplay ?? null;
        })
        .filter((x): x is string => x != null);
}
