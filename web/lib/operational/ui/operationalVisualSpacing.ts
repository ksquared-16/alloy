/**
 * Operational spacing helpers — enforces the 8·12·16·20·24px rhythm from PX-1.
 */

/** Allowed vertical rhythm steps in pixels */
export const OPERATIONAL_SPACING_SCALE_PX = [8, 12, 16, 20, 24] as const;

export type OperationalSpacingPx = (typeof OPERATIONAL_SPACING_SCALE_PX)[number];

/** Tailwind spacing unit (1 unit = 4px) for each allowed step */
export const OPERATIONAL_SPACING_TAILWIND = {
    8: 2,
    12: 3,
    16: 4,
    20: 5,
    24: 6,
} as const satisfies Record<OperationalSpacingPx, number>;

export function isOperationalSpacingPx(value: number): value is OperationalSpacingPx {
    return (OPERATIONAL_SPACING_SCALE_PX as readonly number[]).includes(value);
}

/**
 * Maps a pixel step to Tailwind `space-y-*` / `gap-*` class suffix.
 * Throws if value is not on the operational scale (dev-time guard in tests).
 */
export function operationalSpacingUnit(px: OperationalSpacingPx): number {
    return OPERATIONAL_SPACING_TAILWIND[px];
}

/** `space-y-{n}` for region stacks */
export function opSpaceY(px: OperationalSpacingPx): string {
    return `space-y-${operationalSpacingUnit(px)}`;
}

/** `gap-{n}` for flex/grid groups */
export function opGap(px: OperationalSpacingPx): string {
    return `gap-${operationalSpacingUnit(px)}`;
}
