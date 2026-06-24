/**
 * Normalized Workspace V2 spacing scale — prefer these over one-off margin/padding values.
 *
 * | Token      | rem    | px  | Use |
 * |------------|--------|-----|-----|
 * | hairline   | 0.25   | 4   | chip gaps, inline metric spacing |
 * | tight      | 0.375  | 6   | command band row gaps |
 * | xs         | 0.5    | 8   | compact inline padding |
 * | sm         | 0.75   | 12  | section internal padding, tile pad |
 * | md         | 1      | 16  | zone separation |
 * | lg         | 1.5    | 24  | major surface breaks |
 * | xl         | 2      | 32  | modal section breaks |
 */
export const WS_SPACE = {
    hairline: "0.25rem",
    tight: "0.375rem",
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
} as const;

/** Tailwind-compatible gap classes mapped to the scale. */
export const WS_GAP = {
    hairline: "gap-1",
    tight: "gap-1.5",
    xs: "gap-2",
    sm: "gap-3",
    md: "gap-4",
    lg: "gap-6",
} as const;

/** Tailwind margin-top between major workspace zones. */
export const WS_ZONE_MT = {
    /** Section B below Section A on workspace root */
    commandToGrid: "mt-6",
    /** Subsections within a command band (health → pulse) */
    section: "mt-3",
    /** Rows inside a command surface (process → stage → pulse) */
    bandRow: "mt-1",
} as const;

/** Surface-specific spacing guidance (use WS_SPACE / WS_GAP / WS_ZONE_MT — not ad hoc values). */
export const WS_SURFACE_SPACING = {
    workspaceHeader: {
        sectionGap: WS_ZONE_MT.commandToGrid,
        healthToPulse: WS_ZONE_MT.section,
        kickerToContent: WS_ZONE_MT.bandRow,
    },
    businessProcessGrid: {
        labelToGrid: "mb-2",
        gridGap: WS_GAP.sm,
        tilePad: "px-3 pt-2.5 pb-2",
    },
    workUnitHeader: {
        rowGap: WS_ZONE_MT.bandRow,
        processPillsGap: WS_GAP.tight,
    },
    operationalIntelligence: {
        sectionGap: WS_GAP.sm,
        sectionPad: "px-3 py-2",
    },
} as const;
