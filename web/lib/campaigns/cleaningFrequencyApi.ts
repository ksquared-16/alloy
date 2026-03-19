import type { CleaningFrequencyOption } from "@/lib/pricing/cleaningPricing";

/** Maps quote-form frequency labels to book-v2 / quote-start API keys. */
export function cleaningFrequencyOptionToApi(
  f: CleaningFrequencyOption
): "one_time" | "weekly" | "biweekly" | "monthly" {
  if (f === "One-time") return "one_time";
  if (f.startsWith("Weekly")) return "weekly";
  if (f.startsWith("Bi-Weekly")) return "biweekly";
  return "monthly";
}
