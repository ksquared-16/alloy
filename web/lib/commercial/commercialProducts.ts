/**
 * Commercial Product — the canonical commercial primitive.
 *
 * Fee / Add-on / Deposit are not separate entities. They are `commercial_type`
 * values of one Commercial Product, differentiated by typed `behavior`, not
 * structure. Categories are operator-managed configuration (commercial_categories),
 * not free text.
 *
 * Commercial owns: definition, type, category, price, frequency, scope,
 *   effective dates, revenue_category, behavior config.
 * Policies own: conditional application (waivers, auto-apply conditions).
 * Billing owns: charge generation, deposit refund lifecycle, package consumption.
 * Accounting owns: revenue_category -> GL mapping.
 *
 * The legacy tables (commercial_fees/addons/deposits) are transitional storage.
 * commercial_products is the single source of truth for the Commercial Catalog.
 */

export type CommercialType = "fee" | "addon" | "deposit";

export const COMMERCIAL_TYPE_OPTIONS: { key: CommercialType; label: string; description: string }[] = [
  { key: "fee",     label: "Fee",     description: "Required or triggered charges like registration, materials, or late pickup" },
  { key: "addon",   label: "Add-on",  description: "Optional products or services like lunch, extended care, enrichment, or passes" },
  { key: "deposit", label: "Deposit", description: "A held amount collected to reserve a spot or secure enrollment" },
];

export const COMMERCIAL_TYPE_LABELS: Record<CommercialType, string> = {
  fee: "Fee",
  addon: "Add-on",
  deposit: "Deposit",
};

/** Human-readable due timing options for deposit behavior. Key = stored value. */
export const DUE_TIMING_OPTIONS: { key: string; label: string }[] = [
  { key: "At enrollment",       label: "At enrollment" },
  { key: "Upon acceptance",     label: "Upon acceptance" },
  { key: "Before first day",    label: "Before first day" },
  { key: "At contract signing", label: "At contract signing" },
  { key: "Before tour",         label: "Before tour" },
];

/** Normalize legacy internal due_timing keys to human labels. */
const DUE_TIMING_NORMALIZE: Record<string, string> = {
  at_enrollment:    "At enrollment",
  before_first_day: "Before first day",
  at_acceptance:    "Upon acceptance",
  upon_acceptance:  "Upon acceptance",
  at_contract:      "At contract signing",
};

export function normalizeDueTiming(raw: string): string {
  return DUE_TIMING_NORMALIZE[raw] ?? raw;
}

/** Frequency options — displayed as "Frequency", stored as cadence_key. */
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

export const PACKAGE_UNIT_TYPE_OPTIONS = ["uses", "sessions", "days", "hours"];

// ─── Behavior (typed jsonb) ──────────────────────────────────────────────────

export type FeeBehavior = { required: boolean };
export type PackageBehavior = { unit_count: number; unit_type: string | null; expires_days: number | null };
export type AddonBehavior = { package?: PackageBehavior };
export type DepositBehavior = { refundable: boolean; apply_to_balance: boolean; due_timing: string };
export type CommercialBehavior = FeeBehavior | AddonBehavior | DepositBehavior | Record<string, unknown>;

// ─── Category ────────────────────────────────────────────────────────────────

export type CommercialCategory = {
  id: string;
  org_id: string;
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
};

export function sortCategories(cats: CommercialCategory[]): CommercialCategory[] {
  return [...cats].sort((a, b) => {
    const d = (a.sort_order ?? 100) - (b.sort_order ?? 100);
    return d !== 0 ? d : a.label.localeCompare(b.label);
  });
}

export function activeCategories(cats: CommercialCategory[]): CommercialCategory[] {
  return sortCategories(cats.filter(c => c.is_active !== false));
}

// ─── Product ─────────────────────────────────────────────────────────────────

export type CommercialProduct = {
  id: string;
  org_id: string;
  location_id: string | null;
  program_key: string | null;
  name: string;
  description: string | null;
  commercial_type: CommercialType;
  category_id: string | null;
  amount_cents: number;
  cadence_key: string | null;   // null = one-time
  revenue_category: string | null;
  effective_start: string | null;  // null = active from day one
  effective_end: string | null;
  behavior: CommercialBehavior;
  is_active: boolean;
  metadata: Record<string, unknown>;
  source_table: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string | null;
};

// ─── Behavior accessors (type-safe reads over the jsonb) ─────────────────────

export function feeIsRequired(p: CommercialProduct): boolean {
  return p.commercial_type === "fee" && (p.behavior as FeeBehavior)?.required === true;
}

export function getPackage(p: CommercialProduct): PackageBehavior | null {
  if (p.commercial_type !== "addon") return null;
  const pkg = (p.behavior as AddonBehavior)?.package;
  return pkg && typeof pkg.unit_count === "number" && pkg.unit_count > 0 ? pkg : null;
}

export function isPackageProduct(p: CommercialProduct): boolean {
  return getPackage(p) !== null;
}

export function describePackage(p: CommercialProduct): string {
  const pkg = getPackage(p);
  if (!pkg) return "";
  const unit = pkg.unit_type ?? "uses";
  const expiry = pkg.expires_days ? ` · valid ${pkg.expires_days} days` : "";
  return `${pkg.unit_count} ${unit}${expiry}`;
}

export function depositBehavior(p: CommercialProduct): DepositBehavior | null {
  if (p.commercial_type !== "deposit") return null;
  const b = p.behavior as DepositBehavior;
  return {
    refundable: b?.refundable !== false,
    apply_to_balance: b?.apply_to_balance === true,
    due_timing: normalizeDueTiming(b?.due_timing ?? "At enrollment"),
  };
}

// ─── Scope ───────────────────────────────────────────────────────────────────

export function formatScope(
  locationId: string | null,
  programKey: string | null,
  locations: { id: string; name: string }[],
  programs?: { key: string; label: string }[],
): string {
  const parts: string[] = [];
  if (programKey) {
    const prog = programs?.find((p) => p.key === programKey);
    parts.push(prog?.label ?? programKey);
  }
  if (locationId) {
    const loc = locations.find((l) => l.id === locationId);
    if (loc) parts.push(loc.name);
  }
  return parts.length > 0 ? parts.join(" · ") : "All programs";
}

export function categoryLabel(categoryId: string | null, cats: CommercialCategory[]): string {
  if (!categoryId) return "";
  return cats.find(c => c.id === categoryId)?.label ?? "";
}

/** Sort products for the catalog: by name, stable. */
export function sortProducts(products: CommercialProduct[]): CommercialProduct[] {
  return [...products].sort((a, b) => a.name.localeCompare(b.name));
}

/** Build the behavior jsonb for a product from form inputs. */
export function buildBehavior(
  type: CommercialType,
  inputs: {
    required?: boolean;
    isPackage?: boolean;
    packageCount?: number | null;
    packageUnit?: string | null;
    packageExpiresDays?: number | null;
    refundable?: boolean;
    applyToBalance?: boolean;
    dueTiming?: string;
  },
): CommercialBehavior {
  if (type === "fee") {
    return { required: inputs.required === true };
  }
  if (type === "addon") {
    if (inputs.isPackage && inputs.packageCount && inputs.packageCount > 0) {
      return {
        package: {
          unit_count: inputs.packageCount,
          unit_type: inputs.packageUnit ?? "uses",
          expires_days: inputs.packageExpiresDays ?? null,
        },
      };
    }
    return {};
  }
  return {
    refundable: inputs.refundable !== false,
    apply_to_balance: inputs.applyToBalance === true,
    due_timing: inputs.dueTiming || "At enrollment",
  };
}
