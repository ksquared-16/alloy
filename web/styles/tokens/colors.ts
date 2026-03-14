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
