/**
 * THE HANDLER KEYS, alone in a leaf module.
 *
 * A key is a NAME shared by two parties that must not otherwise depend on each other: the domain
 * that schedules work, and the registration point that binds the name to code. Keeping them in
 * `scheduledWorkConsumers` meant Payments had to import the module that imports Payments —
 * `autopayArrangement → scheduledWorkConsumers → autopayHandler → autopayArrangement` — a cycle
 * that typechecks and then depends on module evaluation order at runtime.
 *
 * Nothing here imports anything, so nothing can cycle through it.
 */
export const BILLING_PERIODIC_HANDLER_KEY = "financials.periodic_billing.evaluate";
export const CHARGE_AGING_HANDLER_KEY = "financials.charge_aging.evaluate";
export const AUTOPAY_HANDLER_KEY = "payments.autopay.evaluate";
