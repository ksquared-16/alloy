/**
 * QR / landing campaign: "First Service Free - Complete 4 in 60 Days"
 * Discount program code in DB: FIRSTFREE4X60
 */

export const FIRSTFREE4X60_CAMPAIGN_QUERY = "firstfree4x60" as const;

/** Public discount program code (validate via existing /discounts/validate when API supports it). */
export const FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE = "FIRSTFREE4X60";

/** sessionStorage: terms acceptance + traceability (client-only). */
export const FIRSTFREE4X60_SESSION_KEY = "alloy_campaign_firstfree4x60_v1";

export type FirstFree4x60SessionV1 = {
  version: 1;
  campaign: typeof FIRSTFREE4X60_CAMPAIGN_QUERY;
  discount_program_code: typeof FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE;
  terms_accepted_at: string;
  landing_path: string;
};

export function isFirstFree4x60CampaignQuery(value: string | null | undefined): boolean {
  return value === FIRSTFREE4X60_CAMPAIGN_QUERY;
}
