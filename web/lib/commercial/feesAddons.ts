/**
 * Commercial Configuration — Fees, Add-ons & Deposits.
 *
 * Three separate primitives:
 *   commercial_fees     — required/triggered charges beyond tuition
 *   commercial_addons   — optional recurring or one-time commercial products
 *   commercial_deposits — separate primitive with refund lifecycle fields
 *
 * Types are free-text operator labels — no hardcoded enums. Seed suggestions
 * are provided in FEE_TYPE_SUGGESTIONS etc. for the UI only.
 *
 * Commercial owns: definitions, prices, frequencies, effective dates, revenue_category.
 * Policies own: waiver rules, auto-apply rules.
 * Billing owns: charge generation, deposit lifecycle, pass usage.
 * Accounting owns: GL mapping (revenue_category → GL code).
 */

export type CommercialFee = {
  id: string;
  org_id: string;
  location_id: string | null;
  program_key: string | null;
  name: string;
  description: string | null;
  fee_type: string;           // free-text operator label
  amount_cents: number;
  is_required: boolean;
  cadence_key: string | null; // null = one-time
  effective_start: string | null;
  effective_end: string | null;
  revenue_category: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
};

export type CommercialAddon = {
  id: string;
  org_id: string;
  location_id: string | null;
  program_key: string | null;
  name: string;
  description: string | null;
  addon_type: string;         // free-text operator label
  amount_cents: number;
  cadence_key: string;
  effective_start: string | null;
  effective_end: string | null;
  revenue_category: string | null;
  // Package fields — null = not a package
  package_unit_count: number | null;
  package_unit_type: string | null;   // 'uses' | 'sessions' | 'days' | 'hours'
  package_expires_days: number | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
};

export type CommercialDeposit = {
  id: string;
  org_id: string;
  location_id: string | null;
  program_key: string | null;
  name: string;
  description: string | null;
  amount_cents: number;
  is_refundable: boolean;
  apply_to_balance: boolean;
  due_timing: string;         // free-text operator label
  effective_start: string | null;
  effective_end: string | null;
  revenue_category: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
};

/** UI-level frequency options — displayed as "Frequency", stored as cadence_key. */
export type FrequencyOption = { key: string; label: string };
export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { key: "",            label: "One-time" },
  { key: "weekly",      label: "Weekly" },
  { key: "biweekly",    label: "Every 2 weeks" },
  { key: "monthly",     label: "Monthly" },
  { key: "annual",      label: "Annual" },
  { key: "per_session", label: "Per session" },
  { key: "per_use",     label: "Per use" },
];

export function frequencyLabel(cadenceKey: string | null): string {
  const opt = FREQUENCY_OPTIONS.find(o => o.key === (cadenceKey ?? ""));
  return opt?.label ?? cadenceKey ?? "One-time";
}

/** Seed suggestions for UI dropdowns — not enforced in DB. */
export const FEE_TYPE_SUGGESTIONS = [
  "Registration fee", "Application fee", "Materials fee",
  "Annual supply fee", "Re-enrollment fee", "Other",
];
export const ADDON_TYPE_SUGGESTIONS = [
  "Extended care", "Enrichment", "Lunch program",
  "Transportation", "Field trips", "Other",
];
export const DEPOSIT_TIMING_SUGGESTIONS = [
  "At enrollment", "At acceptance", "At contract signing", "Other",
];
export const PACKAGE_UNIT_TYPE_OPTIONS = ["uses", "sessions", "days", "hours"];

export function formatScope(
  locationId: string | null,
  programKey: string | null,
  locations: { id: string; name: string }[],
): string {
  const parts: string[] = [];
  if (programKey) parts.push(programKey);
  if (locationId) {
    const loc = locations.find((l) => l.id === locationId);
    if (loc) parts.push(loc.name);
  }
  return parts.length > 0 ? parts.join(" · ") : "All programs";
}

export function isPackageAddon(addon: CommercialAddon): boolean {
  return addon.package_unit_count !== null && addon.package_unit_count > 0;
}

/** The three commercial catalog primitives. */
export type CommercialType = "fee" | "addon" | "deposit";

export const COMMERCIAL_TYPE_OPTIONS: { key: CommercialType; label: string; description: string }[] = [
  { key: "fee",     label: "Fee",     description: "Required or auto-triggered charge — registration, materials, annual fees" },
  { key: "addon",   label: "Add-on",  description: "Optional product families enroll in — extended care, enrichment, passes" },
  { key: "deposit", label: "Deposit", description: "Held amount collected at enrollment with potential refund or credit" },
];

export const COMMERCIAL_TYPE_LABELS: Record<CommercialType, string> = {
  fee: "Fee",
  addon: "Add-on",
  deposit: "Deposit",
};

/** Human-friendly due timing options for deposits. Key = stored value. */
export const DUE_TIMING_OPTIONS: { key: string; label: string }[] = [
  { key: "At enrollment",       label: "At enrollment" },
  { key: "Upon acceptance",     label: "Upon acceptance" },
  { key: "Before first day",    label: "Before first day" },
  { key: "At contract signing", label: "At contract signing" },
  { key: "Before tour",         label: "Before tour" },
];

/** Normalize legacy internal due_timing keys to human labels. */
const DUE_TIMING_NORMALIZE: Record<string, string> = {
  at_enrollment:      "At enrollment",
  before_first_day:   "Before first day",
  at_acceptance:      "Upon acceptance",
  upon_acceptance:    "Upon acceptance",
  at_contract:        "At contract signing",
};

export function normalizeDueTiming(raw: string): string {
  return DUE_TIMING_NORMALIZE[raw] ?? raw;
}

export function describePackage(addon: CommercialAddon): string {
  if (!isPackageAddon(addon)) return "";
  const count = addon.package_unit_count!;
  const unit = addon.package_unit_type ?? "uses";
  const expiry = addon.package_expires_days
    ? ` · valid ${addon.package_expires_days} days`
    : "";
  return `${count} ${unit}${expiry}`;
}
