/**
 * Alloy design tokens — confirmed brand palette only.
 * Use these tokens everywhere in adminV2; no hardcoded hex in components.
 *
 * Confirmed brand colors only:
 * - River Stone, Alloy Blue, Bend Pine, Juniper Ember, Midnight Forge
 * Derived tints use only these five (opacity or blend).
 */

/** Confirmed Alloy brand palette — no invented colors */
export const palette = {
  riverStone: "#F4F6F9",
  alloyBlue: "#00458C",
  bendPine: "#00A283",
  juniperEmber: "#BC4300",
  midnightForge: "#273F52",
} as const;

/**
 * Derived tints from the five brand colors only.
 * Used for borders, secondary text, and subtle UI.
 */
export const derived = {
  /** Border: Midnight Forge at low opacity */
  border: "rgba(39, 63, 82, 0.18)",
  /** Secondary text: Midnight Forge at medium opacity */
  textSecondary: "rgba(39, 63, 82, 0.65)",
  /** Top bar divider / subtle edge on primary */
  topBarDivider: "rgba(255, 255, 255, 0.15)",
  /** Search field background on primary (top bar) */
  searchBgOnPrimary: "rgba(255, 255, 255, 0.12)",
  /** Active tab background on primary */
  tabActiveOnPrimary: "rgba(255, 255, 255, 0.2)",
  /** Mask / overlay (e.g. minimap) */
  maskOverlay: "rgba(39, 63, 82, 0.06)",
  /** Subtle panel shadow (e.g. bottom command bar) */
  panelShadow: "0 -1px 4px rgba(39, 63, 82, 0.08)",
  /** Card / node shadow */
  cardShadow: "0 2px 8px rgba(39, 63, 82, 0.08)",
  /** Node elevation (slightly stronger for focus) */
  nodeElevation: "0 4px 12px rgba(39, 63, 82, 0.1)",
  /** KPI band — subtle AI-side wash (Alloy Blue) */
  kpiBandAiWash: "rgba(0, 69, 140, 0.04)",
  /** KPI band — subtle Business-side wash (Bend Pine) */
  kpiBandBusinessWash: "rgba(0, 162, 131, 0.05)",
  /** System node subtle tint (department card) */
  nodeSurfaceTint: "rgba(0, 69, 140, 0.04)",
  /** Canvas field — slightly cooler than page bg (depth) */
  canvasFieldWash: "rgba(39, 63, 82, 0.035)",
  /** Canvas subtle vertical depth */
  canvasFieldDepth: "rgba(39, 63, 82, 0.055)",
  /** Inspector column wash */
  inspectorColumnWash: "rgba(0, 69, 140, 0.018)",
  /** Inspector left edge depth */
  inspectorEdgeShadow: "-6px 0 18px rgba(39, 63, 82, 0.06)",
  /** Inspector vs dark org-chart field (light touch) */
  inspectorChamberSeparation: "-4px 0 28px rgba(39, 63, 82, 0.07)",
  /** Inspector rail — airy surfaces */
  inspectorRailWash: "rgba(244, 246, 249, 0.35)",
  inspectorListHairline: "rgba(39, 63, 82, 0.07)",
  inspectorCardQuiet: "rgba(255, 255, 255, 0.98)",
  inspectorSectionMuted: "rgba(39, 63, 82, 0.5)",
  /** Command rail — lighter than chamber, soft premium (not harsh white) */
  inspectorCommandRail: "rgba(252, 253, 255, 0.97)",
  inspectorCommandRailWash: "rgba(248, 250, 252, 0.92)",
  inspectorCommandHairline: "rgba(39, 63, 82, 0.055)",
  /** Node resting shadow — sits above canvas */
  nodeOnCanvasShadow: "0 6px 16px rgba(39, 63, 82, 0.12)",
  /** Node active / elevated */
  nodeOnCanvasShadowActive: "0 8px 22px rgba(39, 63, 82, 0.14)",
  /** Ripple pulse (Alloy Blue, very low) */
  rippleGlow: "rgba(0, 69, 140, 0.14)",
  /** KPI band elevation */
  kpiBandShadow: "0 2px 10px rgba(39, 63, 82, 0.06)",
  /** Stronger AI / Business contrast in KPI band */
  kpiBandAiWashStrong: "rgba(0, 69, 140, 0.065)",
  kpiBandBusinessWashStrong: "rgba(0, 162, 131, 0.075)",
  /** Active canvas field — noticeably warmer than page chrome */
  canvasFieldActive: "rgba(0, 69, 140, 0.045)",
  /** Radial wash core (command field) */
  canvasRadialCore: "rgba(0, 69, 140, 0.07)",
  canvasRadialMid: "rgba(0, 162, 131, 0.04)",
  canvasRadialEdge: "rgba(39, 63, 82, 0.03)",
  /** Ambient focus halo (multi-stop radial, low) */
  ambientBloomInner: "rgba(0, 69, 140, 0.09)",
  ambientBloomOuter: "rgba(0, 162, 131, 0.05)",
  /** Orbiting spec dots */
  ambientSpec: "rgba(0, 69, 140, 0.28)",
  ambientSpecAlt: "rgba(0, 162, 131, 0.22)",
  /** KPI / chrome deck */
  chromeDeckBg: "rgba(255, 255, 255, 0.98)",
  /**
   * PROOF PASS — exaggerate for screenshots; tone down for production.
   * Canvas “chamber”: darker, higher contrast vs chrome.
   */
  canvasProofBase: "rgba(39, 63, 82, 0.11)",
  canvasProofRadialStrong: "rgba(0, 69, 140, 0.24)",
  canvasProofRadialMid: "rgba(0, 162, 131, 0.14)",
  canvasProofFloor: "rgba(39, 63, 82, 0.08)",
  canvasProofVignette: "rgba(39, 63, 82, 0.18)",
  /** Ambient field — proof visibility */
  ambientProofBloomCore: "rgba(0, 69, 140, 0.42)",
  ambientProofBloomMid: "rgba(0, 162, 131, 0.28)",
  ambientProofBloomEdge: "rgba(0, 69, 140, 0.14)",
  ambientProofSpec: "rgba(0, 69, 140, 0.92)",
  ambientProofSpecAlt: "rgba(0, 162, 131, 0.88)",
  /** Canvas dot grid — proof contrast */
  canvasProofGridDot: "rgba(39, 63, 82, 0.16)",
  /**
   * Operational chamber — dark org-chart field (Midnight Forge + Alloy Blue depth).
   * Contrasts with light KPI rail above.
   */
  canvasChamberBase: "rgba(39, 63, 82, 1)",
  canvasChamberDeep: "rgba(39, 63, 82, 0.92)",
  canvasChamberBlueMist: "rgba(0, 69, 140, 0.32)",
  canvasChamberBlueDepth: "rgba(0, 69, 140, 0.18)",
  canvasChamberPineDrift: "rgba(0, 162, 131, 0.08)",
  canvasChamberVignetteEdge: "rgba(0, 69, 140, 0.45)",
  /** Dots on dark field (River Stone white, minimal) */
  canvasChamberGridDot: "rgba(255, 255, 255, 0.06)",
  /**
   * Bend Pine — “life” / motion / vitality (not full UI green-out).
   */
  ambientLifeBloomCore: "rgba(0, 162, 131, 0.14)",
  ambientLifeBloomMid: "rgba(0, 162, 131, 0.07)",
  ambientLifeBloomEdge: "rgba(0, 162, 131, 0.03)",
  ambientLifeSpec: "rgba(0, 162, 131, 0.5)",
  ambientLifeSpecSoft: "rgba(0, 162, 131, 0.28)",
  /** Company view — higher-contrast specs (still calmer than focus) */
  ambientCompanySpecVivid: "rgba(0, 162, 131, 0.78)",
  ambientCompanySpecMid: "rgba(0, 162, 131, 0.55)",
  ambientCompanyBloomLift: "rgba(0, 162, 131, 0.2)",
  /** Company particles — high read on dark chamber */
  ambientCompanyParticleBright: "rgba(0, 220, 185, 0.95)",
  ambientCompanyParticleCore: "rgba(0, 162, 131, 0.95)",
  /** Focus field — extra drift visibility (behind cards) */
  ambientFocusDriftBright: "rgba(0, 162, 131, 0.55)",
  ambientFocusRingPine: "rgba(0, 162, 131, 0.42)",
  ambientLifeGlow: "rgba(0, 162, 131, 0.22)",
  /** Focus / department — pine-forward bloom, blue structure */
  ambientFocusLifeCore: "rgba(0, 162, 131, 0.36)",
  ambientFocusLifeMid: "rgba(0, 162, 131, 0.2)",
  ambientFocusLifeEdge: "rgba(0, 69, 140, 0.16)",
  ambientFocusLifeSpec: "rgba(0, 162, 131, 0.92)",
  ambientFocusLifeSpecAlt: "rgba(0, 162, 131, 0.55)",
  /** White cards on dark chamber (depth via Midnight Forge) */
  nodeOnChamberShadow: "0 12px 36px rgba(39, 63, 82, 0.42), 0 4px 14px rgba(39, 63, 82, 0.28)",
  nodeOnChamberShadowActive: "0 16px 44px rgba(39, 63, 82, 0.48), 0 0 0 1px rgba(0, 162, 131, 0.4)",
  /** KPI rail — extra light, calm */
  kpiRailWash: "rgba(244, 246, 249, 0.65)",
  kpiBandBusinessLight: "rgba(0, 162, 131, 0.04)",
  kpiBandAiLight: "rgba(0, 69, 140, 0.032)",
} as const;

/** Brand tokens */
export const brand = {
  primary: palette.alloyBlue,
  secondary: palette.bendPine,
  accent: palette.juniperEmber,
} as const;

/** Neutral UI tokens — background/surface from palette or white */
export const neutral = {
  background: palette.riverStone,
  surface: "#FFFFFF",
  textPrimary: palette.midnightForge,
  textSecondary: derived.textSecondary,
  border: derived.border,
} as const;

/** Semantic tokens */
export const semantic = {
  success: palette.bendPine,
  warning: palette.juniperEmber,
  info: palette.alloyBlue,
} as const;

/** All color tokens */
export const colors = {
  palette,
  derived,
  brand,
  neutral,
  semantic,
} as const;

export default colors;
