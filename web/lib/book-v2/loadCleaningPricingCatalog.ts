import type { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";

type Supabase = ReturnType<typeof createServiceRoleClient>;

export type SqftTierRow = { sqft_key: string; sqft_label: string | null; sort_order: number };

/** Used when pricing_square_footage_tiers has no rows (must match get_quote_pricing / historical UI). */
export const FALLBACK_SQFT_TIERS: SqftTierRow[] = [
    { sqft_key: "Under 1500 sq ft", sqft_label: "Under 1,500 sq ft", sort_order: 0 },
    { sqft_key: "1501–2,000 sq ft", sqft_label: "1,501 – 2,000 sq ft", sort_order: 1 },
    { sqft_key: "2,001-2,600 sq ft", sqft_label: "2,001 – 2,600 sq ft", sort_order: 2 },
    { sqft_key: "2,601-3,200 sq ft", sqft_label: "2,601 – 3,200 sq ft", sort_order: 3 },
    { sqft_key: "3,201-4,000 sq ft", sqft_label: "3,201 – 4,000 sq ft", sort_order: 4 },
    { sqft_key: "4,001-5,500 sq ft", sqft_label: "4,001 – 5,500 sq ft", sort_order: 5 },
    { sqft_key: "Over 5,500 sq ft", sqft_label: "Over 5,500 sq ft", sort_order: 6 },
];

function legacyNumericSqftToKey(sqft: number): string {
    const thresholds = [1500, 2000, 2600, 3200, 4000, 5500, Infinity];
    const keys = FALLBACK_SQFT_TIERS.map((t) => t.sqft_key);
    for (let i = 0; i < thresholds.length; i++) {
        if (sqft <= thresholds[i]!) return keys[i] ?? keys[0]!;
    }
    return keys[keys.length - 1]!;
}

export type DbAddonRow = { key: string; label: string; price: number; sort_order: number };

/** Bedroom/bath select options — single source until a DB catalog exists. */
export const BOOK_V2_BEDROOM_OPTIONS: { value: string; label: string }[] = [
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
    { value: "5+", label: "5+" },
];

export const BOOK_V2_BATHROOM_OPTIONS: { value: string; label: string }[] = [
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4+", label: "4+" },
];

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

export async function loadSqftTiersForVertical(supabase: Supabase, verticalId: string): Promise<SqftTierRow[]> {
    const { data, error } = await supabase
        .from("pricing_square_footage_tiers")
        .select("sqft_key, sqft_label, sort_order")
        .eq("vertical_id", verticalId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
    if (error) {
        console.error("[BOOKING_CATALOG] pricing_square_footage_tiers", error.message);
        return [];
    }
    return (data ?? []) as SqftTierRow[];
}

/** Normalize quote body / UI value to a pricing sqft_key present in tiers (fallback: first tier). */
export function normalizeSqftKeyInput(
    val: string | number | null | undefined,
    tiers: SqftTierRow[]
): string {
    const tierList = tiers.length ? tiers : FALLBACK_SQFT_TIERS;
    const keys = new Set(tierList.map((t) => t.sqft_key.trim()));
    const labels = new Map<string, string>();
    for (const t of tierList) {
        if (t.sqft_label?.trim()) labels.set(t.sqft_label.trim().toLowerCase(), t.sqft_key);
    }
    if (val == null) return tierList[0]!.sqft_key;
    const s = typeof val === "string" ? val.trim() : String(val);
    if (keys.has(s)) return s;
    const byLabel = labels.get(s.toLowerCase());
    if (byLabel) return byLabel;
    const num = typeof val === "number" ? val : parseInt(s, 10);
    if (!Number.isNaN(num) && num > 0) {
        const legacy = legacyNumericSqftToKey(num);
        if (keys.has(legacy)) return legacy;
    }
    return tierList[0]!.sqft_key;
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

/**
 * Normalize client add-on tokens to keys present in addonPriceMap (DB is source of truth).
 */
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
