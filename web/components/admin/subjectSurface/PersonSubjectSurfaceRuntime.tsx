/**
 * Canonical presentation name for the person/child subject surface runtime.
 *
 * Compatibility shim — the implementation still lives at
 * `@/components/admin/vmDrawer/PersonsDrawerVmRuntime` during the drawer→Focus Panel
 * migration. This module re-exports the identical component under the canonical name.
 *
 * @see docs/platform/operator/focus-panel-architecture-vocabulary.md (Phase C)
 */
export { default } from "@/components/admin/vmDrawer/PersonsDrawerVmRuntime";
