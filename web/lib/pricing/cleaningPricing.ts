"use client";

export type ServiceType = "Standard Cleaning" | "Move-Out / Heavy Clean";

export type CleaningFrequencyOption =
    | "One-time"
    | "Weekly (15% Off)"
    | "Bi-Weekly (10% Off)"
    | "Monthly (5% Off)";

export type SquareFootageOption =
    | "Under 1500 sq ft"
    | "1501–2,000 sq ft"
    | "2,001-2,600 sq ft"
    | "2,601-3,200 sq ft"
    | "3,201-4,000 sq ft"
    | "4,0001-5,500 sq ft"
    | "Over 5,500 sq ft";

export type AddOnId =
    | "Fridge"
    | "Oven"
    | "Cabinets"
    | "Windows & Blinds"
    | "Pet Hair"
    | "Baseboards";

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
    source: "local_pricing";
    service: string;
    estimated_price: number | null;
    first_clean_price: number | null;
    recurring_price: number | null;
    frequency_label: string | null;
    discount_label: string | null;
    addons: Array<{ name: string; price: number | null }>;
    price_breakdown?: string;
}

// Simple v1 pricing tables – safe to tweak later.
// TODO(Phase 2/3): Keep this in sync with backend / GHL pricing.

const BASE_FIRST_CLEAN_BY_SQFT: Record<SquareFootageOption, number> = {
    "Under 1500 sq ft": 180,
    "1501–2,000 sq ft": 210,
    "2,001-2,600 sq ft": 240,
    "2,601-3,200 sq ft": 280,
    "3,201-4,000 sq ft": 320,
    "4,0001-5,500 sq ft": 380,
    "Over 5,500 sq ft": 450,
};

const FREQUENCY_CONFIG: Record<
    CleaningFrequencyOption,
    { label: string; discountPercent: number | null; discountLabel: string | null }
> = {
    "One-time": { label: "One-time", discountPercent: null, discountLabel: null },
    "Weekly (15% Off)": {
        label: "Weekly",
        discountPercent: 0.15,
        discountLabel: "15% off",
    },
    "Bi-Weekly (10% Off)": {
        label: "Bi-Weekly",
        discountPercent: 0.1,
        discountLabel: "10% off",
    },
    "Monthly (5% Off)": {
        label: "Monthly",
        discountPercent: 0.05,
        discountLabel: "5% off",
    },
};

const ADDON_PRICES: Record<
    AddOnId,
    { id: AddOnId; name: string; price: number }
> = {
    Fridge: { id: "Fridge", name: "Fridge", price: 40 },
    Oven: { id: "Oven", name: "Oven", price: 40 },
    Cabinets: { id: "Cabinets", name: "Cabinets", price: 35 },
    "Windows & Blinds": { id: "Windows & Blinds", name: "Windows & Blinds", price: 60 },
    "Pet Hair": { id: "Pet Hair", name: "Pet Hair", price: 30 },
    Baseboards: { id: "Baseboards", name: "Baseboards", price: 30 },
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

    let recurringPrice: number | null = null;
    let frequencyLabel: string | null = null;
    let discountLabel: string | null = null;

    if (freqConfig && firstCleanPrice != null && freqConfig.discountPercent != null) {
        recurringPrice = roundCurrency(firstCleanPrice * (1 - freqConfig.discountPercent));
        discountLabel = freqConfig.discountLabel;
        frequencyLabel = freqConfig.label;
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


