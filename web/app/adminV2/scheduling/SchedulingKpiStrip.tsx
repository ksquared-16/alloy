"use client";

/**
 * Scheduling operational health — Work vs Studio contextual metrics (Doctrine V3).
 *
 * Pure presentation adapter: the container resolves counts (from the scheduling read
 * API + the operational calculations registry) and passes them in; this file only maps
 * them onto the canonical `WorkspaceOperationalHealth` band. No layout or trend styling
 * lives here, and it never fetches — so the control band cannot double-load the workspace.
 */

import { useMemo } from "react";
import WorkspaceOperationalHealth, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealth";

export type SchedulingWorkCounts = {
    /** Children ready to start with no room yet. */
    toDecide: number | null;
    /** e.g. "6 / 7" rooms within ratio, or null when the ratio read-model is unresolved. */
    roomsInRatio: string | null;
    /** Site fill percentage, e.g. "82%", or null when occupancy is unresolved. */
    fill: string | null;
    /** Children whose start date falls within this week. */
    startsThisWeek: number | null;
};

export type SchedulingStudioCounts = {
    patterns: number | null;
    calculations: number | null;
};

const DASH = "—";
const show = (v: number | string | null): string => (v == null ? DASH : String(v));

export default function SchedulingKpiStrip({
    mode,
    work,
    studio,
    loading = false,
}: {
    mode: "work" | "studio";
    work: SchedulingWorkCounts;
    studio: SchedulingStudioCounts;
    loading?: boolean;
}) {
    const workItems: WorkspaceOperationalHealthItem[] = useMemo(
        () => [
            {
                key: "to_decide",
                label: "To decide",
                value: show(work.toDecide),
                tone: work.toDecide && work.toDecide > 0 ? "ember" : "pine",
            },
            {
                key: "rooms_in_ratio",
                label: "Rooms in ratio",
                value: show(work.roomsInRatio),
                tone: "pine",
            },
            {
                key: "fill",
                label: "Fill",
                value: show(work.fill),
                tone: "pine",
            },
            {
                key: "starts_this_week",
                label: "Starts this week",
                value: show(work.startsThisWeek),
                tone: "midnight",
            },
        ],
        [work.toDecide, work.roomsInRatio, work.fill, work.startsThisWeek]
    );

    const studioItems: WorkspaceOperationalHealthItem[] = useMemo(
        () => [
            { key: "patterns", label: "Patterns", value: show(studio.patterns), tone: "midnight" },
            { key: "calculations", label: "Calculations", value: show(studio.calculations), tone: "pine" },
        ],
        [studio.patterns, studio.calculations]
    );

    const isWork = mode === "work";

    return (
        <WorkspaceOperationalHealth
            eyebrow={isWork ? "This week" : "Studio health"}
            items={isWork ? workItems : studioItems}
            loading={loading}
            ariaLabel={isWork ? "Scheduling operational health" : "Scheduling studio health"}
            className="w-full"
            data-testid={isWork ? "scheduling-work-health-band" : "scheduling-studio-health-band"}
        />
    );
}
