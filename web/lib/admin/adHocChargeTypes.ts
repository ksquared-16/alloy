/**
 * Admin ad-hoc charge categories (UI + request metadata).
 * Map to ledger / revenue rules in a later pass; backend may ignore until wired.
 */
export const AD_HOC_CHARGE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "service_balance", label: "Service balance" },
  { value: "additional_service", label: "Additional service" },
  { value: "fee_adjustment", label: "Fee / adjustment" },
  { value: "deposit", label: "Deposit" },
  { value: "other", label: "Other" },
];
