/**
 * Focus Panel collection presentation adapters — canonical provider policy without local identity.
 *
 * Cards observe OperationalContext; this module applies canonical collection provider semantics
 * (ordering, active-only) to rows already composed upstream. It does not define provider refs,
 * resolver ownership, or fetch collections.
 */

import { findCanonicalCollectionProvider } from "@/lib/fields/collection/canonicalCollectionProviderRegistry";
import type { CanonicalCollectionItem } from "@/lib/fields/relationship/canonicalCollectionResolution";
import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";

export const FOCUS_PANEL_CHILDREN_COLLECTION_REF = "children" as const;

export type FocusPanelChildDrawerRow = ReturnType<typeof mapRawInquiryChildrenToDrawerRows>[number];

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function childDisplayName(row: FocusPanelChildDrawerRow): string {
    const composed = [trimOrNull(row.first_name), trimOrNull(row.last_name)].filter(Boolean).join(" ");
    const named = trimOrNull(row.display_name) ?? composed;
    return named || "Child";
}

/** Apply canonical children collection ordering/active policy to inquiry-child drawer rows. */
export function applyCanonicalChildrenCollectionPolicy(
    rows: readonly FocusPanelChildDrawerRow[],
    rawRows: readonly Record<string, unknown>[],
): FocusPanelChildDrawerRow[] {
    const provider = findCanonicalCollectionProvider(FOCUS_PANEL_CHILDREN_COLLECTION_REF);
    const activeOnly = provider?.activeOnly ?? true;

    const paired = rows.map((row, index) => ({ row, raw: rawRows[index] ?? {} }));
    const filtered = activeOnly
        ? paired.filter(({ raw }) => raw.is_active !== false)
        : paired;

    const seen = new Set<string>();
    const deduped = filtered.filter(({ row }) => {
        const id = trimOrNull(row.id) ?? trimOrNull(row.person_id);
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });

    if (provider?.orderingPolicy === "created_at") {
        return deduped
            .sort((a, b) => String(a.raw.created_at ?? "").localeCompare(String(b.raw.created_at ?? "")))
            .map(({ row }) => row);
    }

    return deduped
        .sort((a, b) => childDisplayName(a.row).localeCompare(childDisplayName(b.row), undefined, { sensitivity: "base" }))
        .map(({ row }) => row);
}

/**
 * The DURABLE child-row source, for a record surface that is about one child.
 *
 * `_inquiry_children` is a CASE's roster: one enrollment's view of a family's children, carrying that
 * enrollment's desired program, schedule and outcome. On a durable child record there is no
 * enrollment and no family roster — the collection has exactly one member and it is the subject.
 *
 * This key exists so that fact can be stated without borrowing the case's name for it. Writing the
 * subject into `_inquiry_children` would have worked identically today and told every future reader
 * that an inquiry exists, which is the case-shaped-truth copying the convergence audit forbids.
 *
 * The rows are shaped the same because the ROW SHAPE is canonical child identity —
 * `mapRawInquiryChildrenToDrawerRows` is total and defaults every enrollment-scoped field to null,
 * so a durable row maps to a child with no participation projections. That is the honest answer for
 * a host that has not loaded participation, and it is the state the card already renders correctly.
 */
export const DURABLE_CHILD_ROWS_KEY = "_durable_child_rows" as const;

/** Normalize Focus Panel children rows from operational truth using canonical collection policy. */
export function normalizeFocusPanelChildrenRowsFromTruth(truth: Record<string, unknown>): {
    rows: FocusPanelChildDrawerRow[];
    rawRows: Record<string, unknown>[];
} {
    // A case's roster, or a record's single subject — never both. A durable host supplies one key
    // and a case host the other, so there is no precedence to get wrong.
    const source =
        (truth._inquiry_children as unknown[] | undefined)
        ?? (truth[DURABLE_CHILD_ROWS_KEY] as unknown[] | undefined)
        ?? [];
    const rawRows = source.map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}));
    const mapped = mapRawInquiryChildrenToDrawerRows(rawRows);
    return {
        rows: applyCanonicalChildrenCollectionPolicy(mapped, rawRows),
        rawRows,
    };
}

/** Map canonical collection items to stable child ids for identity merge (belonging grain). */
export function childIdentityFromCanonicalCollectionItem(item: CanonicalCollectionItem): {
    id: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    dob: string | null;
} {
    const rec = item.record as Record<string, unknown>;
    const firstName = trimOrNull(rec.first_name);
    const lastName = trimOrNull(rec.last_name);
    const composed = [firstName, lastName].filter(Boolean).join(" ");
    const displayName = (trimOrNull(rec.display_name) ?? trimOrNull(rec.full_name) ?? composed) || "Child";
    return {
        id: item.item_id,
        displayName,
        firstName,
        lastName,
        dob: trimOrNull(rec.dob)?.slice(0, 10) ?? null,
    };
}
