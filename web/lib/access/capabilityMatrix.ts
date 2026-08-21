/**
 * The role editor's matrix: operator areas down the side, `No access / View / Manage` across.
 *
 * `W-57` made a role read as a responsibility bundle instead of a permission-key grid. This is the
 * next step the tranche asks for — the same truth, compacted into a matrix an administrator can scan
 * — and it rests on two rules that keep it from becoming a second permission system:
 *
 * 1. **An area level is a PRESET over real rows, never a stored value.** Choosing `Manage` on an area
 *    sets every enforced row in it to write, through `applyGridRowSelection`, one row at a time. The
 *    grant set that leaves this module is the loaded set mutated in place, so `H2`/`RL-48` still
 *    holds: keys the surface cannot draw are carried through untouched.
 * 2. **A disagreeing area is `limited`, and says so.** Rounding a mixed area up to Manage claims
 *    authority the role lacks; rounding it down to View hides authority it has. Both are
 *    misstatements an operator would act on, so the matrix reports the arithmetic instead.
 *
 * Rows nothing enforces are counted separately and never raise an area's level — `W-50`/`IA-R8`: a
 * grant on a key no code consults is a row in a table, not a capability the role has.
 */

import {
    applyGridRowSelection,
    levelFromGrantedKeys,
    offerableLevelsForRow,
    rowEnforcement,
    type PermissionGridLevel,
    type PermissionGridRow,
} from "@/lib/admin/permissionGrid";
import { areaForRow, areaMeta, UNMAPPED, type CapabilityArea } from "@/lib/access/capabilityTaxonomy";
import { collapseLevels, type AreaAuthority } from "@/lib/access/roleAuthoritySummary";

export type MatrixArea = {
    areaKey: string;
    label: string;
    description: string;
    order: number;
    /** The collapsed reading over ENFORCED rows. `limited` means the rows disagree. */
    level: AreaAuthority;
    granted: number;
    enforcedTotal: number;
    /** Rows nothing in the platform consults. Shown, never folded into `level`. */
    unenforced: number;
    /** The real capabilities behind the preset — the progressive-disclosure content. */
    rows: PermissionGridRow[];
};

function rowIsEnforced(row: PermissionGridRow): boolean {
    return !rowEnforcement(row).inert && offerableLevelsForRow(row).some((l) => l !== "none");
}

/**
 * Compose grid rows into operator areas.
 *
 * Rows whose group the taxonomy does not map land in a single trailing area keyed {@link UNMAPPED}.
 * They are rendered — hiding a real capability would be the opposite failure — but they are named as
 * unmapped rather than given an invented product home.
 */
export function buildCapabilityMatrix(
    gridRows: readonly PermissionGridRow[],
    grantKeys: ReadonlySet<string>,
): MatrixArea[] {
    const byArea = new Map<string, PermissionGridRow[]>();
    for (const row of gridRows) {
        const key = areaForRow(row);
        const list = byArea.get(key);
        if (list) list.push(row);
        else byArea.set(key, [row]);
    }

    const areas: MatrixArea[] = [];
    for (const [areaKey, rows] of byArea) {
        const meta: CapabilityArea | null = areaMeta(areaKey);
        const levels: PermissionGridLevel[] = [];
        let granted = 0;
        let unenforced = 0;
        for (const row of rows) {
            if (!rowIsEnforced(row)) {
                unenforced += 1;
                continue;
            }
            const level = levelFromGrantedKeys(row, grantKeys);
            levels.push(level);
            if (level !== "none") granted += 1;
        }
        areas.push({
            areaKey,
            label: meta?.label ?? "Not yet mapped to a product area",
            description:
                meta?.description
                ?? "These capabilities are granted and enforced, but have no operator-facing area yet.",
            order: meta?.order ?? 9999,
            level: collapseLevels(levels),
            granted,
            enforcedTotal: levels.length,
            unenforced,
            rows,
        });
    }

    return areas.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

/** The levels an area can offer as a preset — `Manage` is hidden when no row can be written. */
export function offerableAreaLevels(area: MatrixArea): PermissionGridLevel[] {
    const offered = new Set<PermissionGridLevel>(["none"]);
    for (const row of area.rows) {
        for (const l of offerableLevelsForRow(row)) offered.add(l);
    }
    return (["none", "read", "write"] as const).filter((l) => offered.has(l));
}

/**
 * Apply an area preset to the whole grant set.
 *
 * Delegates to `applyGridRowSelection` per row, which is what preserves `H2`: only the keys those
 * rows define are touched, and anything the surface cannot draw survives. A row that cannot offer
 * the chosen level is set to the strongest level it CAN offer — never skipped silently and never
 * pushed past what it supports, so `Manage` on an area holding a read-only capability grants that
 * capability read rather than nothing.
 */
export function applyAreaPreset(params: {
    area: MatrixArea;
    level: PermissionGridLevel;
    granted: ReadonlySet<string>;
}): Set<string> {
    const { area, level } = params;
    let next = new Set(params.granted);
    for (const row of area.rows) {
        if (!rowIsEnforced(row)) continue;
        const offered = offerableLevelsForRow(row);
        const target: PermissionGridLevel =
            offered.includes(level) ? level
            : level === "write" && offered.includes("read") ? "read"
            : "none";
        next = applyGridRowSelection({ row, level: target, granted: next });
    }
    return next;
}

/** The chip an operator reads. `limited` carries its arithmetic; the others are already exact. */
export function areaLevelLabel(area: Pick<MatrixArea, "level" | "granted" | "enforcedTotal">): string {
    switch (area.level) {
        case "manage":
            return "Manage";
        case "view":
            return "View";
        case "limited":
            return `Limited · ${area.granted} of ${area.enforcedTotal}`;
        default:
            return "No access";
    }
}

/** Areas an administrator would say the role "has" — used for the compact Overview summary. */
export function heldMatrixAreas(areas: readonly MatrixArea[]): MatrixArea[] {
    return areas.filter((a) => a.enforcedTotal > 0 && a.granted > 0);
}

export { UNMAPPED };
