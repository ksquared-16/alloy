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
    /** Rooms with a known, unmet PLANNED staffing demand. Week's headline. */
    roomsShort: number;
    /** Rooms that ARE operating and whose demand could not be resolved. */
    roomsUnknown: number;
    expectedChildren: number;
    scheduledStaff: number;
    /**
     * ACTUAL operating truth, taken from the canonical combined projection's own totals.
     *
     * Optional because only the DAY surface reports them. Week has no actual attendance to report,
     * and making these required would have forced it to send zeros — which read as "nobody came"
     * rather than "this has not happened yet".
     */
    roomsActuallyShort?: number;
    childrenPresent?: number;
    staffPresent?: number;
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

    /*
     * DAY LEADS WITH ACTUAL; WEEK STAYS PLANNING.
     *
     * The band did not change size, and deliberately: doubling every metric into an
     * Expected/Actual pair would have made the operator read eight numbers to find the one that
     * needs them. On a DAY, expected is already on every room card beside its actual — what the band
     * owes is the site-wide answer to "what needs me right now", and that is actual.
     *
     * `Rooms short now` replaces the planned count for the same reason: a room that is planned-short
     * but fully staffed right now is not where anyone should be sent, and a room that is planned-fine
     * and actually short is exactly where they should. Rooms with no resolvable rule stay, because
     * "we cannot tell" is still something an operator has to know.
     *
     * WEEK is untouched. There is no actual attendance in the future, and showing a zero there would
     * read as "nobody came" rather than "this has not happened yet".
     */
    const isDay = range === "day";

    const items: WorkspaceOperationalHealthItem[] = isDay
        ? [
              {
                  key: "rooms_short_now",
                  label: "Rooms short now",
                  value: value(counts?.roomsActuallyShort),
                  tone: (counts?.roomsActuallyShort ?? 0) > 0 ? "gold" : "midnight",
              },
              {
                  key: "rooms_unknown",
                  label: "No staffing rule",
                  value: value(counts?.roomsUnknown),
                  // Never pine: an unresolvable requirement is not a healthy one.
                  tone: (counts?.roomsUnknown ?? 0) > 0 ? "neutral" : "midnight",
              },
              {
                  key: "children_here",
                  label: "Children here now",
                  value: value(counts?.childrenPresent),
                  tone: "midnight",
              },
              {
                  key: "staff_here",
                  label: "Staff here now",
                  value: value(counts?.staffPresent),
                  tone: "midnight",
              },
          ]
        : [
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
