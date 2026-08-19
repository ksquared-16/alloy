/**
 * W-57 / `OD-8` — a role read as a responsibility bundle rather than a permission-key matrix.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §46 (`W-57`).
 *
 * **What OD-8 settled, and what it did not.** Access is the canonical home for capability
 * *configuration* — the operator understands and edits capability here, not scattered across
 * Enrollment, Communications, Billing or a Settings subsection. OD-8 explicitly does **not** make
 * Access the owner of what a capability *means*: the platform still owns that, and server
 * enforcement remains authoritative. So this module invents no authority. Every area, every label
 * and every level is derived from {@link PermissionGridRow}, which `W-10` derives from
 * `permission_definitions` — the canonical catalog. A capability added to the catalog appears here
 * with no change to this file, and a capability absent from it cannot be displayed at all.
 *
 * **The grouping is the catalog's, not a product taxonomy.** `groupKey`/`groupLabel` come from
 * `permission_definitions.group_key`. This matters more than it looks: an operator-facing role
 * editor is exactly where someone is tempted to write a friendlier list of domains — *Enrollment,
 * Attendance, Roster, Records* — that the catalog does not define. `IA-R6` forbids simulating
 * unbuilt capability, and OD-8's own text forbids inventing "domain authority that does not exist".
 * A domain with no keys in the catalog grants nothing to nobody and has no row to live in.
 *
 * **`IA-13`'s caveat travels with this summary and bounds what it may claim.** The grid derives one
 * level per area, so a grant set that is not None/View/Manage has no representation. Until `W-10`
 * lands, the capability section is *legible*, not *the vocabulary* — which is why
 * {@link buildRoleAuthorityAreas} always carries `rows` beside the summary and never returns the
 * summary alone. Collapsing an area to one word where the underlying rows disagree would change
 * what the operator believes the role can do, so a disagreeing area is named `limited` and reports
 * its own arithmetic rather than rounding to the nearest confident word.
 */

import {
    levelFromGrantedKeys,
    offerableLevelsForRow,
    rowEnforcement,
    type PermissionGridLevel,
    type PermissionGridRow,
} from "@/lib/admin/permissionGrid";

/**
 * The operator's verb for a level.
 *
 * `none`/`read`/`write` are the *grid's* vocabulary — a projection detail that leaked into operator
 * copy as "No access / Read / Write / Manage". These are the same three levels under the names an
 * administrator uses. Nothing about authority changes: the key sets behind each level are
 * unchanged, and `keysForLevel` remains the only thing that decides what a level grants.
 */
export const OPERATOR_LEVEL_LABEL: Readonly<Record<PermissionGridLevel, string>> = Object.freeze({
    none: "No access",
    read: "View",
    write: "Manage",
});

/**
 * What a role can do across one catalog group.
 *
 * `limited` is not a fourth level — it is the honest name for *the rows disagree*, and it exists so
 * that a mixed area is never rounded up to `manage` or down to `view`. Both roundings are authority
 * misstatements: one tells the operator the role can change things it cannot, the other hides that
 * it can.
 */
export type AreaAuthority = "none" | "view" | "manage" | "limited";

export type RoleAuthorityArea = {
    groupKey: string;
    groupLabel: string;
    /** The collapsed reading, computed over ENFORCED rows only. */
    authority: AreaAuthority;
    /** Enforced rows this role holds at `read` or better. */
    granted: number;
    /** Enforced rows in this area — the denominator `granted` is out of. */
    enforcedTotal: number;
    /**
     * Rows in this area that nothing in the platform consults. Counted separately and never folded
     * into `authority`: `W-50`/`IA-R8` — a grant on a key nothing reads is still a row in the
     * database, but it is not a capability the role *has*, and letting it raise an area to "Manage"
     * would be the revocation-theatre failure inverted.
     */
    unenforced: number;
    /** Every row, in catalog order. The summary never travels without them. */
    rows: PermissionGridRow[];
};

/** Is any level beyond "no access" actually enforced for this row? */
function rowIsEnforced(row: PermissionGridRow): boolean {
    return !rowEnforcement(row).inert && offerableLevelsForRow(row).some((level) => level !== "none");
}

/**
 * Project a role's granted key set into catalog groups.
 *
 * Order is the order `buildPermissionGridRows` returned, which is the catalog's own — this function
 * does not re-sort, because a stable operator-facing order is the projection's property to own and
 * a second sort here would let the two disagree.
 */
export function buildRoleAuthorityAreas(
    gridRows: readonly PermissionGridRow[],
    grantKeys: ReadonlySet<string>,
): RoleAuthorityArea[] {
    const byGroup = new Map<string, RoleAuthorityArea>();

    for (const row of gridRows) {
        let area = byGroup.get(row.groupKey);
        if (!area) {
            area = {
                groupKey: row.groupKey,
                groupLabel: row.groupLabel,
                authority: "none",
                granted: 0,
                enforcedTotal: 0,
                unenforced: 0,
                rows: [],
            };
            byGroup.set(row.groupKey, area);
        }
        area.rows.push(row);
    }

    for (const area of byGroup.values()) {
        const levels: PermissionGridLevel[] = [];
        for (const row of area.rows) {
            if (!rowIsEnforced(row)) {
                area.unenforced += 1;
                continue;
            }
            area.enforcedTotal += 1;
            const level = levelFromGrantedKeys(row, new Set(grantKeys));
            levels.push(level);
            if (level !== "none") area.granted += 1;
        }
        area.authority = collapseLevels(levels);
    }

    return [...byGroup.values()];
}

/**
 * Collapse a set of per-row levels into one area reading.
 *
 * An area with no enforced rows is `none` — not because the role holds nothing, but because there
 * is nothing in this area the platform would act on. The caller renders that distinction using
 * `enforcedTotal`; collapsing it to a word here and losing the count is exactly the omission this
 * type is shaped to prevent.
 */
export function collapseLevels(levels: readonly PermissionGridLevel[]): AreaAuthority {
    if (levels.length === 0) return "none";
    const distinct = new Set(levels);
    if (distinct.size === 1) {
        const only = [...distinct][0]!;
        if (only === "write") return "manage";
        if (only === "read") return "view";
        return "none";
    }
    return "limited";
}

/**
 * The chip an operator reads for an area.
 *
 * A `limited` area states its own arithmetic — *"Limited · 2 of 6"* — because the word alone would
 * be the collapse this module exists to refuse. The others carry no count: they are already exact.
 */
export function areaAuthorityLabel(area: RoleAuthorityArea): string {
    switch (area.authority) {
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

/**
 * The areas a role actually holds something in — the "what can this role do" answer.
 *
 * Areas with no enforced rows are excluded whether or not grants exist on their keys, because a
 * role that was granted the whole catalog would otherwise read as though it could do everything,
 * most of which nothing performs. That exclusion is visible: the caller still renders those areas
 * in the editor, marked, so the record is not hidden — only the *summary* declines to claim them.
 */
export function heldAuthorityAreas(areas: readonly RoleAuthorityArea[]): RoleAuthorityArea[] {
    return areas.filter((area) => area.enforcedTotal > 0 && area.granted > 0);
}
