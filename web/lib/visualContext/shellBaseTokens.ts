import type { CSSProperties } from "react";
import { neutral, derived, brand, palette } from "@/styles/tokens/colors";

/**
 * Context-agnostic controls: primary actions use Midnight Forge (“Midnight Blue” in brand docs).
 * Exception / attention-only actions use Juniper Ember (Amber). Do not bind these to `--d-brand`.
 */
export const adminWorkspaceActionStyle: CSSProperties = {
    ["--admin-action-primary-bg" as string]: palette.midnightForge,
    ["--admin-action-primary-fg" as string]: "#ffffff",
    ["--admin-action-secondary-border" as string]: derived.border,
    ["--admin-action-secondary-bg" as string]: neutral.surface,
    ["--admin-action-secondary-fg" as string]: neutral.textPrimary,
    ["--admin-action-tertiary-fg" as string]: derived.textSecondary,
    ["--admin-action-exception-bg" as string]: brand.accent,
    ["--admin-action-exception-fg" as string]: "#ffffff",
};

/**
 * Single source for the Admin V2 workspace shell CSS variable contract (`--d-*`).
 * Department bridge, company grid, department shell, and work unit shell all merge contextual
 * overrides on top of this base (see `contextStyle.mergeOperationalVisualTokens`).
 */
export const departmentWorkspaceShellBaseStyle: CSSProperties = {
    ...adminWorkspaceActionStyle,
    backgroundColor: "transparent",
    color: neutral.textPrimary,
    ["--d-text-primary" as string]: neutral.textPrimary,
    ["--d-page-bg" as string]: neutral.background,
    ["--d-border" as string]: derived.border,
    ["--d-muted" as string]: derived.textSecondary,
    ["--d-surface" as string]: neutral.surface,
    ["--d-brand" as string]: brand.primary,
    ["--d-pine" as string]: brand.secondary,
    ["--d-top-wash" as string]: derived.kpiRailWash,
    ["--d-panel" as string]: derived.chromeDeckBg,
    ["--d-panel-quiet" as string]: derived.inspectorCommandRailWash,
    ["--d-rail" as string]: derived.inspectorCommandRail,
    ["--d-field-veil" as string]: derived.canvasFieldWash,
    ["--d-ambient-core" as string]: derived.ambientLifeBloomMid,
    ["--d-kpi-tint" as string]: derived.kpiBandBusinessLight,
    ["--d-kpi-ai-tint" as string]: derived.kpiBandAiLight,
    ["--d-summary-wash" as string]: derived.maskOverlay,
    ["--d-boundary-inset" as string]: derived.adminV2BoundaryAmberInset,
    ["--d-kpi-band-shadow" as string]: derived.kpiBandShadow,
    ["--d-admin-amber" as string]: derived.adminV2BoundaryAmber,
    ["--d-rail-hairline" as string]: derived.inspectorCommandHairline,
    ["--d-rail-sep" as string]: derived.inspectorChamberSeparation,
    ["--d-ambient-edge" as string]: derived.ambientLifeBloomEdge,
    ["--d-field-depth" as string]: derived.canvasFieldDepth,
    ["--d-card-shadow" as string]: derived.cardShadow,
};
