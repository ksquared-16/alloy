import {
  FIRSTFREE4X120_CAMPAIGN_QUERY,
  FIRSTFREE4X120_DISCOUNT_PROGRAM_CODE,
} from "@/lib/campaigns/firstFree4x120";

/** Merge identity + campaign trace fields into alloy_booking_prefill (session + local). */
export function mergeFirstFreeCampaignBookingPrefill(patch: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const raw =
      sessionStorage.getItem("alloy_booking_prefill") || localStorage.getItem("alloy_booking_prefill");
    let base: Record<string, unknown> = {};
    if (raw) {
      try {
        base = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        base = {};
      }
    }
    const next = {
      ...base,
      ...patch,
      campaign: FIRSTFREE4X120_CAMPAIGN_QUERY,
      discount_program_code: FIRSTFREE4X120_DISCOUNT_PROGRAM_CODE,
      campaign_source: "home_campaign_firstfree4x120",
    };
    const json = JSON.stringify(next);
    sessionStorage.setItem("alloy_booking_prefill", json);
    localStorage.setItem("alloy_booking_prefill", json);
  } catch (e) {
    console.warn("[FIRSTFREE4X120] prefill merge failed", e);
  }
}
