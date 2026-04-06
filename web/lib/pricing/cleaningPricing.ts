"use client";

export type ServiceType = "Standard Cleaning" | "Move-Out / Heavy Clean";

export type CleaningFrequencyOption =
    | "One-time"
    | "Weekly (30% Off)"
    | "Bi-Weekly (20% Off)"
    | "Monthly (10% Off)";

/** Stable tier_key from option_sets / pricing_square_footage_tiers (e.g. 0_1499). */
export type SquareFootageOption = string;

export type AddOnId = "Fridge" | "Oven" | "Cabinets" | "Pet Hair";

export type AddOnFrequencyOption =
    | "First cleaning only"
    | "Every cleaning"
    | "Not sure yet - let’s decide later";

export type ServiceHomeType =
    | "Apartment / Condo"
    | "Single-Family Home"
    | "Townhome"
    | "Other";

export interface CleaningQuoteInput {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    postalCode: string;
    homeType: ServiceHomeType;
    serviceType: ServiceType;
    squareFootage: SquareFootageOption;
    cleaningFrequency: CleaningFrequencyOption;
    preferredServiceDate?: string;
    addOns: AddOnId[];
    addOnFrequency?: AddOnFrequencyOption | "";
}

export interface CleaningQuoteResult {
    status: "ready" | "pending";
    source: "local_pricing" | "supabase";
    service: string;
    estimated_price: number | null;
    first_clean_price: number | null;
    recurring_price: number | null;
    frequency_label: string | null;
    discount_label: string | null;
    addons: Array<{ name: string; price: number | null }>;
    price_breakdown?: string | null;
    is_manual_quote?: boolean;
}

// Simple v1 pricing tables – safe to tweak later.
// TODO(Phase 2/3): Keep this in sync with backend / GHL pricing.

const BASE_FIRST_CLEAN_BY_SQFT: Record<string, number> = {
    "0_1499": 180,
    "1500_1999": 210,
    "2000_2599": 240,
    "2600_3199": 280,
    "3200_3999": 320,
    "4000_5499": 380,
    "5500_plus": 450,
};

const FREQUENCY_CONFIG: Record<
    CleaningFrequencyOption,
    { label: string; discountPercent: number | null; discountLabel: string | null }
> = {
    "One-time": { label: "One-time", discountPercent: null, discountLabel: null },
    "Weekly (30% Off)": {
        label: "Weekly",
        discountPercent: 0.3,
        discountLabel: "30% off",
    },
    "Bi-Weekly (20% Off)": {
        label: "Bi-Weekly",
        discountPercent: 0.2,
        discountLabel: "20% off",
    },
    "Monthly (10% Off)": {
        label: "Monthly",
        discountPercent: 0.1,
        discountLabel: "10% off",
    },
};

// Fixed recurring prices by frequency and square footage (no formula calculation)
const RECURRING_PRICES: Record<CleaningFrequencyOption, Record<string, number | null>> = {
    "One-time": {
        "0_1499": null,
        "1500_1999": null,
        "2000_2599": null,
        "2600_3199": null,
        "3200_3999": null,
        "4000_5499": null,
        "5500_plus": null,
    },
    "Weekly (30% Off)": {
        "0_1499": 120,
        "1500_1999": 130,
        "2000_2599": 145,
        "2600_3199": 160,
        "3200_3999": 170,
        "4000_5499": 185,
        "5500_plus": 210,
    },
    "Bi-Weekly (20% Off)": {
        "0_1499": 140,
        "1500_1999": 150,
        "2000_2599": 170,
        "2600_3199": 185,
        "3200_3999": 200,
        "4000_5499": 215,
        "5500_plus": 245,
    },
    "Monthly (10% Off)": {
        "0_1499": 160,
        "1500_1999": 170,
        "2000_2599": 190,
        "2600_3199": 210,
        "3200_3999": 225,
        "4000_5499": 245,
        "5500_plus": 280,
    },
};

const ADDON_PRICES: Record<
    AddOnId,
    { id: AddOnId; name: string; price: number }
> = {
    Fridge: { id: "Fridge", name: "Fridge", price: 40 },
    Oven: { id: "Oven", name: "Oven", price: 40 },
    Cabinets: { id: "Cabinets", name: "Cabinets", price: 35 },
    "Pet Hair": { id: "Pet Hair", name: "Pet Hair", price: 30 },
};

function roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
}

export function calculateCleaningQuote(
    input: CleaningQuoteInput,
): CleaningQuoteResult {
    const serviceLabel =
        input.serviceType === "Move-Out / Heavy Clean"
            ? "Move-Out / Heavy Clean"
            : "Standard Cleaning";

    // Build base add-on list with prices (used for display + math)
    const selectedAddOns: Array<{ name: string; price: number | null }> =
        input.addOns.map((id) => {
            const meta = ADDON_PRICES[id];
            if (!meta) {
                return { name: id, price: null };
            }
            return { name: meta.name, price: meta.price };
        });

    // Move-Out / Heavy Clean is always a manual quote in v1
    if (input.serviceType === "Move-Out / Heavy Clean") {
        const lines: string[] = [];
        lines.push(`Service: ${serviceLabel}`);
        if (input.preferredServiceDate) {
            lines.push(`Preferred service date: ${input.preferredServiceDate}`);
        }
        if (selectedAddOns.length > 0) {
            const addonsText = selectedAddOns
                .map((addon) =>
                    addon.price != null ? `${addon.name} ($${addon.price.toFixed(2)})` : addon.name,
                )
                .join(", ");
            lines.push(`Add-ons: ${addonsText}`);
        }

        return {
            status: "pending",
            source: "local_pricing",
            service: serviceLabel,
            estimated_price: null,
            first_clean_price: null,
            recurring_price: null,
            frequency_label: null,
            discount_label: null,
            addons: selectedAddOns,
            price_breakdown: lines.join("\n"),
        };
    }

    // Standard cleaning pricing
    const baseFirstClean = BASE_FIRST_CLEAN_BY_SQFT[input.squareFootage];
    const firstCleanPrice =
        typeof baseFirstClean === "number" ? roundCurrency(baseFirstClean) : null;

    const freqConfig = FREQUENCY_CONFIG[input.cleaningFrequency];

    // Use fixed recurring prices instead of calculating from base price
    let recurringPrice: number | null = null;
    let frequencyLabel: string | null = null;
    let discountLabel: string | null = null;

    if (freqConfig && freqConfig.discountPercent != null) {
        // Look up fixed recurring price for this frequency and square footage
        const fixedRecurringPrice = RECURRING_PRICES[input.cleaningFrequency]?.[input.squareFootage];
        if (fixedRecurringPrice != null) {
            recurringPrice = roundCurrency(fixedRecurringPrice);
            discountLabel = freqConfig.discountLabel;
            frequencyLabel = freqConfig.label;
        }
    }

    // Add-ons: adjust first clean and (optionally) recurring totals
    const addonsFirstTotal = selectedAddOns.reduce(
        (sum, addon) => sum + (addon.price ?? 0),
        0,
    );

    const firstTotal =
        firstCleanPrice != null ? roundCurrency(firstCleanPrice + addonsFirstTotal) : null;

    let recurringTotal: number | null = null;
    if (recurringPrice != null) {
        if (input.addOns.length > 0 && input.addOnFrequency === "Every cleaning") {
            // Add-ons apply to every recurring visit
            recurringTotal = roundCurrency(recurringPrice + addonsFirstTotal);
        } else {
            // First cleaning only or not sure yet – don’t add add-ons to recurring price
            recurringTotal = recurringPrice;
        }
    }

    // Build textual breakdown
    const lines: string[] = [];
    lines.push(`Service: ${serviceLabel}`);
    if (firstTotal != null) {
        lines.push(`First cleaning: $${firstTotal.toFixed(2)}`);
    }
    if (recurringTotal != null && frequencyLabel) {
        const discountSuffix = discountLabel ? ` (${discountLabel})` : "";
        lines.push(
            `Recurring (${frequencyLabel}): $${recurringTotal.toFixed(
                2,
            )} / visit${discountSuffix ? ` ${discountSuffix}` : ""}`,
        );
    }
    if (selectedAddOns.length > 0) {
        const addonsText = selectedAddOns
            .map((addon) =>
                addon.price != null ? `${addon.name} ($${addon.price.toFixed(2)})` : addon.name,
            )
            .join(", ");
        lines.push(`Add-ons: ${addonsText}`);
    }

    const price_breakdown = lines.join("\n");

    const hasFirst = typeof firstTotal === "number";
    const hasRecurring = typeof recurringTotal === "number";
    const hasBreakdown = Boolean(price_breakdown);

    const status: "ready" | "pending" =
        hasFirst && (hasRecurring || hasBreakdown) ? "ready" : "pending";

    return {
        status,
        source: "local_pricing",
        service: serviceLabel,
        estimated_price: firstTotal,
        first_clean_price: firstTotal,
        recurring_price: recurringTotal,
        frequency_label: frequencyLabel,
        discount_label: discountLabel,
        addons: selectedAddOns,
        price_breakdown,
    };
}


