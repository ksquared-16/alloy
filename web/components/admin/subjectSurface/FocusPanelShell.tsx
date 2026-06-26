/**
 * Canonical presentation name for the Focus Panel operating shell — the chrome that hosts the
 * subject surface header, modes, and body.
 *
 * Compatibility shim — the implementation still lives at
 * `@/components/admin/drawer/EntityDrawerOperatingShell`. Re-exports the identical shell and its
 * props type under the canonical name. Does not change reveal gates or geometry.
 *
 * @see docs/platform/operator/focus-panel-architecture-vocabulary.md (Phase C)
 */
export { default } from "@/components/admin/drawer/EntityDrawerOperatingShell";
export type { EntityDrawerOperatingShellProps as FocusPanelShellProps } from "@/components/admin/drawer/EntityDrawerOperatingShell";
