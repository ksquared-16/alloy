/**
 * QR / landing campaign: "First Service Free — Complete 4 Visits in 120 Days"
 * Discount program code in DB: FIRSTFREE4X120 (validate-promo → discount_programs).
 */

export const FIRSTFREE4X120_CAMPAIGN_QUERY = "firstfree4x120" as const;

/** Printed / legacy links still using the old slug */
export const FIRSTFREE4X120_LEGACY_CAMPAIGN_QUERY = "firstfree4x60" as const;

export const FIRSTFREE4X120_DISCOUNT_PROGRAM_CODE = "FIRSTFREE4X120";

/** @deprecated Use FIRSTFREE4X120; kept for reading legacy prefill / redemptions */
export const FIRSTFREE4X120_LEGACY_DISCOUNT_PROGRAM_CODE = "FIRSTFREE4X60";

export const FIRSTFREE4X120_SESSION_KEY = "alloy_campaign_firstfree4x120_v1";

export type FirstFree4x120SessionV1 = {
    version: 1;
    campaign: typeof FIRSTFREE4X120_CAMPAIGN_QUERY | typeof FIRSTFREE4X120_LEGACY_CAMPAIGN_QUERY;
    discount_program_code: string;
    terms_accepted_at: string;
    landing_path: string;
};

export function isFirstFree4x120CampaignQuery(value: string | null | undefined): boolean {
    return value === FIRSTFREE4X120_CAMPAIGN_QUERY || value === FIRSTFREE4X120_LEGACY_CAMPAIGN_QUERY;
}

/** `alloy_booking_prefill.campaign` slug (new or legacy sessions) */
export function isFirstFree4x120CampaignPrefillSlug(value: string | null | undefined): boolean {
    return value === FIRSTFREE4X120_CAMPAIGN_QUERY || value === FIRSTFREE4X120_LEGACY_CAMPAIGN_QUERY;
}

export function isFirstFree4x120DiscountProgramCode(value: string | null | undefined): boolean {
    const u = String(value ?? "").trim().toUpperCase();
    return u === FIRSTFREE4X120_DISCOUNT_PROGRAM_CODE || u === FIRSTFREE4X120_LEGACY_DISCOUNT_PROGRAM_CODE;
}
