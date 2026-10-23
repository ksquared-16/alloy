/**
 * DERIVED HOMEROOMS (V7-03) — zero, one or many, never chosen, never stored.
 *
 * A child's homerooms on a date are the classrooms where a qualifying assignment of theirs is in
 * effect and the classroom provides Homeroom:
 *
 *   1. the space is a classroom (`operational_group`) whose configured uses (V7-02a `space_uses`)
 *      include a category whose behavior `providesHomeroom` is set — an unconfigured or malformed
 *      space never does, and nothing is inferred from a category's name;
 *   2. the assignment is a committed child assignment in effect ON THE DATE: the date is inside its
 *      inclusive `start_date`–`end_date` window and it was not canceled. Lifecycle status says
 *      whether a row is still live today; for a date, the window is the truth. A superseded row
 *      covers the days before its successor (supersession ends it the day before), so a past date
 *      and the gap before a planned move resolve to the room the child was actually in. A canceled
 *      row never happened;
 *   3. its purpose is compatible: its category provides Homeroom and is one of the space's uses, OR
 *      it is the enrollment's own uncategorized assignment (Director H-COMPAT Option 1);
 *   4. its space is its own room — or, for that uncategorized enrollment assignment only, the room
 *      of the single committed placement of its agreement in effect on the date. No room, or more
 *      than one candidate placement, means no space: nothing is fabricated.
 *
 * `is_primary` is never read. The result is distinct by space and carries every contributing
 * assignment as provenance; its order (label, then id) is for display and establishes no authority.
 *
 * Pure and client-safe: no I/O, no clock.
 */

import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";

export type HomeroomAssignment = {
    id: string;
    subjectType: "child" | "staff";
    commitmentKind: "proposed" | "committed";
    status: string;
    startDate: string;
    endDate: string | null;
    roomLocationId: string | null;
    categoryId: string | null;
    enrollmentAgreementId: string | null;
};

export type HomeroomSpace = {
    id: string;
    label: string | null;
    unitRole: CanonicalUnitRole;
    /** `readSpaceUses`: null = never configured. */
    spaceUses: readonly string[] | null;
    spaceUsesMalformed?: boolean;
};

export type HomeroomPlacement = {
    enrollmentAgreementId: string;
    roomLocationId: string | null;
    status: string;
    startDate: string;
    endDate: string | null;
};

export type HomeroomSource = {
    assignmentId: string;
    /** The assignment's category, or null for the enrollment's own uncategorized assignment. */
    categoryId: string | null;
    /** Where the space came from: the assignment's own room, or its agreement's placement. */
    spaceFrom: "assignment" | "placement";
    startDate: string;
    endDate: string | null;
};

export type DerivedHomeroom = {
    spaceId: string;
    spaceLabel: string | null;
    /** The space's configured uses that provide Homeroom — the configuration that qualifies it. */
    homeroomUseIds: string[];
    sources: HomeroomSource[];
};

export type DeriveHomeroomsInput = {
    onDate: string;
    assignments: readonly HomeroomAssignment[];
    spacesById: ReadonlyMap<string, HomeroomSpace>;
    /** Category ids whose behavior sets `providesHomeroom`. */
    homeroomCategoryIds: ReadonlySet<string>;
    /** Committed placements by agreement — used only for the uncategorized enrollment assignment. */
    placementsByAgreement?: ReadonlyMap<string, readonly HomeroomPlacement[]>;
};

/** Every lifecycle state whose window is a fact about where the child was or will be. */
const DATED_STATUSES = new Set(["planned", "active", "ending", "ended", "superseded"]);

const inEffect = (row: { status: string; startDate: string; endDate: string | null }, onDate: string) =>
    DATED_STATUSES.has(row.status) && row.startDate <= onDate && (row.endDate == null || onDate <= row.endDate);

/** The space's uses that provide Homeroom, or [] when it cannot provide one at all. */
export function homeroomUsesOf(space: HomeroomSpace | undefined, homeroomCategoryIds: ReadonlySet<string>): string[] {
    if (!space || space.unitRole !== "operational_group" || space.spaceUsesMalformed || space.spaceUses == null) return [];
    return space.spaceUses.filter((id) => homeroomCategoryIds.has(id));
}

function placementRoomFor(
    agreementId: string | null,
    onDate: string,
    placementsByAgreement: DeriveHomeroomsInput["placementsByAgreement"],
): string | null {
    if (!agreementId || !placementsByAgreement) return null;
    const rooms = new Set(
        (placementsByAgreement.get(agreementId) ?? [])
            .filter((p) => inEffect(p, onDate) && p.roomLocationId)
            .map((p) => p.roomLocationId as string),
    );
    return rooms.size === 1 ? [...rooms][0] : null;
}

export function deriveHomerooms(input: DeriveHomeroomsInput): DerivedHomeroom[] {
    const bySpace = new Map<string, DerivedHomeroom>();
    for (const a of input.assignments) {
        if (a.subjectType !== "child" || a.commitmentKind !== "committed" || !inEffect(a, input.onDate)) continue;
        const enrollmentOwn = a.categoryId == null && a.enrollmentAgreementId != null;
        if (a.categoryId != null && !input.homeroomCategoryIds.has(a.categoryId)) continue;
        if (a.categoryId == null && !enrollmentOwn) continue;

        let spaceId = a.roomLocationId;
        let spaceFrom: HomeroomSource["spaceFrom"] = "assignment";
        if (!spaceId && enrollmentOwn) {
            spaceId = placementRoomFor(a.enrollmentAgreementId, input.onDate, input.placementsByAgreement);
            spaceFrom = "placement";
        }
        if (!spaceId) continue;

        const space = input.spacesById.get(spaceId);
        const uses = homeroomUsesOf(space, input.homeroomCategoryIds);
        if (uses.length === 0) continue;
        if (a.categoryId != null && !uses.includes(a.categoryId)) continue;

        const entry = bySpace.get(spaceId) ?? { spaceId, spaceLabel: space?.label ?? null, homeroomUseIds: uses, sources: [] };
        entry.sources.push({ assignmentId: a.id, categoryId: a.categoryId, spaceFrom, startDate: a.startDate, endDate: a.endDate });
        bySpace.set(spaceId, entry);
    }
    const result = [...bySpace.values()];
    for (const h of result) h.sources.sort((x, y) => x.assignmentId.localeCompare(y.assignmentId));
    return result.sort((x, y) => (x.spaceLabel ?? "").localeCompare(y.spaceLabel ?? "") || x.spaceId.localeCompare(y.spaceId));
}

/** Operator text for a homeroom set: "Toddler 2 · Toddler 3", or null when there is none. */
export function homeroomLabel(homerooms: readonly DerivedHomeroom[] | null | undefined): string | null {
    const labels = (homerooms ?? []).map((h) => h.spaceLabel?.trim()).filter((l): l is string => Boolean(l));
    return labels.length ? labels.join(" · ") : null;
}
