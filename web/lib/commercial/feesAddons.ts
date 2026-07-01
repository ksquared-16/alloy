/**
 * Commercial Configuration — Fees, Add-ons & Deposits.
 *
 * Three separate primitives:
 *   commercial_fees     — required/triggered charges beyond tuition
 *   commercial_addons   — optional recurring or one-time commercial products
 *   commercial_deposits — separate primitive with refund lifecycle fields
 *
 * Commercial owns definitions + prices. Policies/Billing/Accounting are separate domains.
 */

export type FeeType = 'registration' | 'application' | 'materials' | 'annual' | 'other';
export type AddonType = 'extended_care' | 'enrichment' | 'lunch' | 'transport' | 'other';
export type DepositTiming = 'at_enrollment' | 'at_acceptance' | 'at_contract' | 'other';

export type CommercialFee = {
  id: string;
  org_id: string;
  location_id: string | null;
  program_key: string | null;
  name: string;
  description: string | null;
  fee_type: FeeType;
  amount_cents: number;
  is_required: boolean;
  cadence_key: string | null;
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
  addon_type: AddonType;
  amount_cents: number;
  cadence_key: string;
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
  due_timing: DepositTiming;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
};

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  registration: 'Registration fee',
  application: 'Application fee',
  materials: 'Materials fee',
  annual: 'Annual fee',
  other: 'Other',
};

export const ADDON_TYPE_LABELS: Record<AddonType, string> = {
  extended_care: 'Extended care',
  enrichment: 'Enrichment',
  lunch: 'Lunch program',
  transport: 'Transportation',
  other: 'Other',
};

export const DEPOSIT_TIMING_LABELS: Record<DepositTiming, string> = {
  at_enrollment: 'At enrollment',
  at_acceptance: 'At acceptance',
  at_contract: 'At contract signing',
  other: 'Other',
};

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
  return parts.length > 0 ? parts.join(' · ') : 'All programs';
}
