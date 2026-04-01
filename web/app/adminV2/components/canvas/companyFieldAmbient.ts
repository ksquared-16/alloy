/**
 * Shared data for AdminV2 "company field" ambient — used by SystemCanvas (AmbientFocusNode, companyLayout: field)
 * and by the workspace shell (WorkspaceAmbientLayer) so specs/bloom/rings stay one product family.
 */

export const COMPANY_FIELD_DRIFT: { l: number; t: number }[] = [
  { l: 12, t: 18 }, { l: 88, t: 22 }, { l: 6, t: 52 }, { l: 94, t: 48 }, { l: 48, t: 8 },
  { l: 52, t: 92 }, { l: 22, t: 72 }, { l: 78, t: 68 }, { l: 35, t: 38 }, { l: 65, t: 42 },
  { l: 18, t: 88 }, { l: 82, t: 85 }, { l: 50, t: 50 }, { l: 8, t: 12 }, { l: 92, t: 14 },
  { l: 44, t: 62 }, { l: 56, t: 58 }, { l: 30, t: 28 }, { l: 70, t: 32 }, { l: 14, t: 44 },
  { l: 86, t: 40 }, { l: 40, t: 82 }, { l: 60, t: 78 },
  { l: 4, t: 24 }, { l: 96, t: 30 }, { l: 24, t: 8 }, { l: 76, t: 6 }, { l: 10, t: 62 },
  { l: 90, t: 58 }, { l: 42, t: 18 }, { l: 58, t: 14 }, { l: 16, t: 36 }, { l: 84, t: 34 },
  { l: 32, t: 88 }, { l: 68, t: 90 }, { l: 50, t: 68 }, { l: 28, t: 52 }, { l: 72, t: 48 },
  { l: 46, t: 42 }, { l: 54, t: 38 }, { l: 38, t: 72 }, { l: 62, t: 76 }, { l: 6, t: 78 },
  { l: 94, t: 74 }, { l: 20, t: 14 }, { l: 80, t: 12 }, { l: 2, t: 46 }, { l: 98, t: 52 },
  { l: 52, t: 28 }, { l: 48, t: 74 }, { l: 66, t: 22 }, { l: 34, t: 26 },
];

export const COMPANY_FIELD_EDGE: { l: number; t: number }[] = [
  ...Array.from({ length: 14 }, (_, i) => ({ l: (i * 100) / 13, t: 1.2 })),
  ...Array.from({ length: 14 }, (_, i) => ({ l: (i * 100) / 13, t: 98.8 })),
  ...Array.from({ length: 12 }, (_, i) => ({ l: 1.2, t: 8 + (i * 84) / 11 })),
  ...Array.from({ length: 12 }, (_, i) => ({ l: 98.8, t: 8 + (i * 84) / 11 })),
];

/**
 * Extra drift layers (~+40% total points vs prior full set) — phase / mirror transforms of base
 * drift so distribution stays even (no random clumps). Perimeter styling still applies only to
 * COMPANY_FIELD_EDGE (last N entries in COMPANY_FIELD_DRIFT_FULL).
 */
export const COMPANY_FIELD_DRIFT_PHASE_A: { l: number; t: number }[] = COMPANY_FIELD_DRIFT.map((p, i) => ({
  l: (p.l + 29 + ((i * 7) % 19)) % 100,
  t: (p.t + 41 + ((i * 5) % 17)) % 100,
}));

export const COMPANY_FIELD_DRIFT_PHASE_B: { l: number; t: number }[] = COMPANY_FIELD_DRIFT.map((p, i) => ({
  l: (p.l * 0.88 + 7 + (i % 9)) % 100,
  t: (100 - p.t * 0.9 + 12) % 100,
}));

/** First 31 of PHASE_B completes +83 interior points (52 + 31) ≈ +40% on prior 208 total */
const COMPANY_FIELD_DRIFT_PHASE_B_TRIM = COMPANY_FIELD_DRIFT_PHASE_B.slice(0, 31);

export const COMPANY_FIELD_DRIFT_FULL: { l: number; t: number }[] = [
  ...COMPANY_FIELD_DRIFT,
  ...COMPANY_FIELD_DRIFT.map((p, i) => ({ l: (p.l + 19) % 100, t: (p.t + 23 + i) % 100 })),
  ...COMPANY_FIELD_DRIFT.map((p, i) => ({ l: (p.l * 0.7 + 15) % 100, t: (p.t * 0.8 + 10) % 100 })),
  ...COMPANY_FIELD_DRIFT_PHASE_A,
  ...COMPANY_FIELD_DRIFT_PHASE_B_TRIM,
  ...COMPANY_FIELD_EDGE,
];

/** First index in COMPANY_FIELD_DRIFT_FULL that uses perimeter drift styling */
export const COMPANY_FIELD_DRIFT_PERIMETER_START =
  COMPANY_FIELD_DRIFT_FULL.length - COMPANY_FIELD_EDGE.length;
