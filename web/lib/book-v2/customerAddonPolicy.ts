/**
 * Add-on keys not selectable on customer web quote/booking (book-v2).
 * Server strips these from requests; UI omits checkboxes.
 *
 * Follow-up (not done here): drive the customer add-on list entirely from `addon_types` /
 * `pricing_addons` via a small public API so admin changes ship without code edits; keep a
 * policy layer for keys that must stay hidden from customers if needed.
 */
export const EXCLUDED_CUSTOMER_SELECTABLE_ADDON_KEYS = new Set(["windows_blinds", "baseboards"]);

export function filterExcludedCustomerAddonKeys(keys: string[]): string[] {
  return keys.filter((k) => !EXCLUDED_CUSTOMER_SELECTABLE_ADDON_KEYS.has(k));
}
