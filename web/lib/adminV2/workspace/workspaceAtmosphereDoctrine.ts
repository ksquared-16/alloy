/**
 * Platform workspace atmosphere — drawer / BOS focus band behind active workspace.
 * CSS: `web/app/adminV2/adminV2.css` + `docs/system/workspace-atmosphere-doctrine.md`
 */

/** Locked shipping profile — premium pine gradient (~80% pine / ~20% slate at low opacity). */
export const WORKSPACE_ATMOSPHERE_VARIANT = "premium" as const;

export type WorkspaceAtmosphereVariant = typeof WORKSPACE_ATMOSPHERE_VARIANT;

export const WORKSPACE_ATMOSPHERE_SPEC = {
    title: "Premium pine gradient",
    base: "#f4fbf9",
    bandOpacity: "~4–7% wash on pine-white base",
    radialPeak: "~14% pine / ~3% slate at center",
    radialCenter: "56% 42%",
} as const;
