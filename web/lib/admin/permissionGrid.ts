/**
 * The operator permission grid — a **projection of the permission catalog**, not a list.
 *
 * W-10 (`docs/platform/planning/vacilando-os/qa/access-identity-v2/03-implementation-qa-sequence.md` §7).
 * Until W-10 this file held `PERMISSION_GRID_ROWS`, a hand-maintained array of rows naming catalog
 * keys by hand. That is the structure behind C5: a row could name a key seeded into no catalog
 * table, and `PUT /api/admin/rbac/grants` rejects the *whole* submission when one key is unknown —
 * so one stale row destroyed the operator's other selections on the screen. W-3 removed the one
 * offending row; W-10 removes the ability to author one.
 *
 * `buildPermissionGridRows` derives every row from `permission_definitions` (the single catalog
 * since the Phase 0 migration `20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql`,
 * which is also the table `PUT /rbac/grants` validates against and the target of the one surviving
 * FK on `role_permission_grants.permission_key`). **A row naming a key the catalog does not hold is
 * therefore not a defect to catch in review — it is unrepresentable.**
 *
 * Two properties are load-bearing and locked by `web/tests/admin/permissionGrid.test.ts`:
 *
 *   - **Total coverage (RL-3).** Every catalog key reaches exactly one row and one column. The
 *     projection may never silently drop a key: a dropped key is an ungrantable capability, which
 *     is the C5 failure re-created one level up.
 *   - **H2 (RL-48).** `applyGridRowSelection` touches only the keys of the row being edited, so a
 *     save preserves grants the surface never displayed. The editor seeds its set from the server's
 *     full grant response and PUTs the union; H2 is what keeps that non-destructive.
 */

export type PermissionGridLevel = "none" | "read" | "write";

/** One `permission_definitions` row, as served by `GET /api/admin/rbac/permissions`. */
export type PermissionCatalogEntry = {
    key: string;
    group_key?: string | null;
    label?: string | null;
};

export type PermissionGridRow = {
    /** The capability area — the key stem shared by this row's keys. Stable across renders. */
    id: string;
    /** Operator-facing. Derived from the catalog's own labels; never a raw dotted key. */
    label: string;
    /** `permission_definitions.group_key`, carried through for grouping. */
    groupKey: string;
    /** Operator-facing form of `groupKey`. */
    groupLabel: string;
    /** catalog keys that represent "Read" for this area */
    readKeys: string[];
    /** catalog keys that represent "Write/Manage" for this area (Write implies Read in UI) */
    writeKeys: string[];
};

/**
 * The final key segment classifies a key into a column, and only these segments do.
 *
 * An unrecognised final segment makes the key **its own capability area** rather than folding it
 * into its stem's row. That is deliberate and it is an authority decision, not a cosmetic one:
 * `settings.users_roles` is the delegated Users & Roles authority, and folding it into the
 * `settings` row would put it behind the same radio as `settings.manage` — one operator gesture
 * silently granting a second, stronger capability. Guessing at verbs widens grants; refusing to
 * guess only costs an extra row.
 */
const READ_SEGMENTS = new Set(["read", "view"]);
const WRITE_SEGMENTS = new Set(["write", "manage", "send"]);

/** Leading words stripped from a catalog label to leave the capability area's name. */
const LABEL_VERB_PREFIX = /^(view|read|manage|write|send)\s+/i;

const UNGROUPED_KEY = "other";

type Classified = { area: string; column: "read" | "write" };

/**
 * Split a catalog key into its capability area and column.
 * Exported for the regression locks — the classification is the whole projection.
 */
export function classifyPermissionKey(key: string): Classified {
    const trimmed = key.trim();
    const lastDot = trimmed.lastIndexOf(".");
    if (lastDot > 0) {
        const segment = trimmed.slice(lastDot + 1).toLowerCase();
        if (READ_SEGMENTS.has(segment)) return { area: trimmed.slice(0, lastDot), column: "read" };
        if (WRITE_SEGMENTS.has(segment)) return { area: trimmed.slice(0, lastDot), column: "write" };
    }
    // No recognised verb: the key is its own area, and it authorises *doing* the thing.
    return { area: trimmed, column: "write" };
}

/** Capitalise the first character only. Title-casing would need a small-word list — a hand list. */
function sentenceCase(text: string): string {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `option_sets` → `Option sets`; `crm` → `CRM`. Short groups are acronyms far more often than words. */
function humanizeGroupKey(groupKey: string): string {
    const words = groupKey.replace(/[._]+/g, " ").trim();
    if (!words) return sentenceCase(UNGROUPED_KEY);
    if (words.length <= 3 && !words.includes(" ")) return words.toUpperCase();
    return sentenceCase(words);
}

/** Last resort when the catalog carries no usable label. Never returns a dotted key. */
function humanizeArea(area: string): string {
    return sentenceCase(area.replace(/[._]+/g, " ").trim()) || area;
}

/**
 * The row label, in preference order: the read key's catalog label with its verb stripped, then the
 * write key's, then the humanized area. A label that still reads as a raw key is rejected — the
 * operator surface states capabilities, not identifiers.
 */
function deriveRowLabel(area: string, readLabels: string[], writeLabels: string[]): string {
    for (const raw of [...readLabels, ...writeLabels]) {
        const stripped = (raw ?? "").replace(LABEL_VERB_PREFIX, "").trim();
        if (!stripped || stripped.includes(".")) continue;
        return sentenceCase(stripped);
    }
    return humanizeArea(area);
}

/**
 * Project a permission catalog onto the operator grid.
 *
 * Total by construction: every entry with a non-empty key lands in exactly one row's `readKeys` or
 * `writeKeys`. Deterministic: rows sort by group then label, keys sort within their column, so the
 * same catalog always renders the same grid.
 */
export function buildPermissionGridRows(
    catalog: readonly PermissionCatalogEntry[] | null | undefined,
): PermissionGridRow[] {
    type Draft = {
        area: string;
        groupKey: string;
        readKeys: Set<string>;
        writeKeys: Set<string>;
        readLabels: string[];
        writeLabels: string[];
    };

    const drafts = new Map<string, Draft>();
    const seen = new Set<string>();

    for (const entry of catalog ?? []) {
        const key = (entry?.key ?? "").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);

        const { area, column } = classifyPermissionKey(key);
        let draft = drafts.get(area);
        if (!draft) {
            draft = {
                area,
                groupKey: (entry.group_key ?? "").trim() || UNGROUPED_KEY,
                readKeys: new Set(),
                writeKeys: new Set(),
                readLabels: [],
                writeLabels: [],
            };
            drafts.set(area, draft);
        }

        const label = (entry.label ?? "").trim();
        if (column === "read") {
            draft.readKeys.add(key);
            if (label) draft.readLabels.push(label);
        } else {
            draft.writeKeys.add(key);
            if (label) draft.writeLabels.push(label);
        }
    }

    const rows: PermissionGridRow[] = [...drafts.values()].map((draft) => ({
        id: draft.area,
        label: deriveRowLabel(draft.area, draft.readLabels, draft.writeLabels),
        groupKey: draft.groupKey,
        groupLabel: humanizeGroupKey(draft.groupKey),
        readKeys: [...draft.readKeys].sort(),
        writeKeys: [...draft.writeKeys].sort(),
    }));

    rows.sort(
        (a, b) =>
            a.groupLabel.localeCompare(b.groupLabel) ||
            a.label.localeCompare(b.label) ||
            a.id.localeCompare(b.id),
    );
    return rows;
}

export function keysForLevel(row: PermissionGridRow, level: PermissionGridLevel): string[] {
    if (level === "none") return [];
    if (level === "read") return [...row.readKeys];
    return [...new Set([...row.readKeys, ...row.writeKeys])];
}

export function levelFromGrantedKeys(row: PermissionGridRow, granted: Set<string>): PermissionGridLevel {
    const hasWrite = row.writeKeys.some((k) => granted.has(k));
    if (hasWrite) return "write";
    const hasRead = row.readKeys.some((k) => granted.has(k));
    if (hasRead) return "read";
    return "none";
}

/**
 * The levels a row can actually offer. A projected area often holds only one column — a row with no
 * write key must not render a "Write / Manage" control that grants nothing, which is the inert-control
 * failure (`T-6`) in miniature.
 */
export function levelsForRow(row: PermissionGridRow): PermissionGridLevel[] {
    const levels: PermissionGridLevel[] = ["none"];
    if (row.readKeys.length > 0) levels.push("read");
    if (row.writeKeys.length > 0) levels.push("write");
    return levels;
}

/**
 * Apply one row's selection to a full set of grants.
 *
 * Only touches keys defined by that row — **H2**. Out-of-grid keys are preserved, so a save from a
 * surface that cannot display every granted key does not silently revoke the rest. Locked by RL-48.
 */
export function applyGridRowSelection(params: {
    row: PermissionGridRow;
    level: PermissionGridLevel;
    granted: Set<string>;
}): Set<string> {
    const { row, level, granted } = params;
    const next = new Set(granted);
    for (const k of [...row.readKeys, ...row.writeKeys]) next.delete(k);
    for (const k of keysForLevel(row, level)) next.add(k);
    return next;
}
