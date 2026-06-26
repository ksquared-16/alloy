/**
 * Canonical presentation name for the subject surface runtime router — resolves the operational
 * subject (enrollment / person / child / legacy) and renders the matching Focus Panel runtime.
 *
 * Compatibility shim — the implementation still lives at `@/components/admin/AdminEntityDrawer`.
 * Re-exports the identical router under the canonical name. Does not change route behavior.
 *
 * @see docs/platform/operator/focus-panel-architecture-vocabulary.md (Phase C)
 */
export { default } from "@/components/admin/AdminEntityDrawer";
