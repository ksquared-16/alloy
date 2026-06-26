/**
 * Canonical presentation name for the enrollment (opportunity) subject surface runtime.
 *
 * Compatibility shim — the implementation still lives at
 * `@/components/admin/vmDrawer/OpportunityDrawerVmRuntime` during the drawer→Focus Panel
 * migration. This module re-exports the identical component under the canonical name so new
 * presentation code can speak Focus Panel / Subject Surface vocabulary without touching
 * payload, reveal, cache, or route infrastructure.
 *
 * @see docs/platform/operator/focus-panel-architecture-vocabulary.md (Phase C)
 */
export { default } from "@/components/admin/vmDrawer/OpportunityDrawerVmRuntime";
