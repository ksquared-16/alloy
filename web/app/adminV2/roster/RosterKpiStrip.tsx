"use client";

/**
 * Roster → operational health band (Doctrine V3).
 *
 * Data-only adapter over `WorkspaceOperationalHealth`, the same component
 * Processing / Work Items / Communications / Assignments use. Operational health
 * belongs in the control band, never in the body — the body is the roster itself.
 *
 * Every number here is a count the roster read model already computed. Nothing is
 * derived locally, and there are no trend placeholders that imply a comparison the
 * platform cannot make: `WorkspaceOperationalHealthTrend` is omitted rather than
 * filled with a fabricated "—" direction.
 *
 * Tone follows the same doctrine as the roster chips: pine ONLY for an evaluated,
 * met state; gold for attention; neutral for "the platform cannot tell". A room
 * count the platform could not evaluate must never read as healthy.
 */

import WorkspaceOperationalHealth, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealth";

export type RosterHealthCounts = {
    /** Rooms with a known, unmet staffing demand. */
    roomsShort: number;
    /** Rooms that ARE operating and whose demand could not be resolved. */
    roomsUnknown: number;
    expectedChildren: number;
    scheduledStaff: number;
};

export default function RosterKpiStrip({
    counts,
    range,
    loading,
}: {
    counts: RosterHealthCounts | null;
    /** Names what the counts are ABOUT — a day's operation, or a week's plan. */
    range: "day" | "week";
    loading?: boolean;
}) {
    const value = (n: number | undefined) => (counts == null ? "—" : String(n ?? 0));

    const items: WorkspaceOperationalHealthItem[] = [
        {
            key: "rooms_short",
            label: "Rooms short",
            value: value(counts?.roomsShort),
            tone: (counts?.roomsShort ?? 0) > 0 ? "gold" : "midnight",
        },
        {
            key: "rooms_unknown",
            label: "No staffing rule",
            value: value(counts?.roomsUnknown),
            // Never pine: an unresolvable requirement is not a healthy one.
            tone: (counts?.roomsUnknown ?? 0) > 0 ? "neutral" : "midnight",
        },
        {
            key: "children_expected",
            label: "Children expected",
            value: value(counts?.expectedChildren),
            tone: "midnight",
        },
        {
            key: "staff_scheduled",
            label: "Staff scheduled",
            value: value(counts?.scheduledStaff),
            tone: "midnight",
        },
    ];

    return (
        <WorkspaceOperationalHealth
            eyebrow={range === "week" ? "Planned week" : "Today's operation"}
            items={items}
            loading={loading}
        />
    );
}
