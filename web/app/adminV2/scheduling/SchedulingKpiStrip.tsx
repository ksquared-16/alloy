"use client";

/**
 * Assignments operational health — Work vs Studio contextual metrics (Doctrine V3).
 *
 * Work mode surfaces assignment-platform attention counts; Studio mode surfaces
 * administration inventory (types, patterns). Pure presentation — no fetching here.
 */

import { useMemo } from "react";
import WorkspaceOperationalHealth, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealth";

export type SchedulingWorkCounts = {
    childrenMissingAssignments: number | null;
    multipleAssignments: number | null;
    upcomingAssignments: number | null;
    futurePrimaryChanges: number | null;
    assignmentConflicts: number | null;
    expiringSoon: number | null;
};

export type SchedulingStudioCounts = {
    assignmentTypes: number | null;
    patterns: number | null;
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
                key: "missing",
                label: "Missing assignments",
                value: show(work.childrenMissingAssignments),
                tone: work.childrenMissingAssignments && work.childrenMissingAssignments > 0 ? "ember" : "pine",
            },
            {
                key: "multiple",
                label: "Multiple",
                value: show(work.multipleAssignments),
                tone: work.multipleAssignments && work.multipleAssignments > 0 ? "midnight" : "pine",
            },
            {
                key: "upcoming",
                label: "Upcoming",
                value: show(work.upcomingAssignments),
                tone: "midnight",
            },
            {
                key: "future_primary",
                label: "Future primary",
                value: show(work.futurePrimaryChanges),
                tone: work.futurePrimaryChanges && work.futurePrimaryChanges > 0 ? "gold" : "pine",
            },
            {
                key: "conflicts",
                label: "Conflicts",
                value: show(work.assignmentConflicts),
                tone: work.assignmentConflicts && work.assignmentConflicts > 0 ? "ember" : "pine",
            },
            {
                key: "expiring",
                label: "Expiring soon",
                value: show(work.expiringSoon),
                tone: work.expiringSoon && work.expiringSoon > 0 ? "gold" : "pine",
            },
        ],
        [
            work.childrenMissingAssignments,
            work.multipleAssignments,
            work.upcomingAssignments,
            work.futurePrimaryChanges,
            work.assignmentConflicts,
            work.expiringSoon,
        ]
    );

    const studioItems: WorkspaceOperationalHealthItem[] = useMemo(
        () => [
            { key: "types", label: "Assignment Categories", value: show(studio.assignmentTypes), tone: "midnight" },
            { key: "patterns", label: "Patterns", value: show(studio.patterns), tone: "pine" },
        ],
        [studio.assignmentTypes, studio.patterns]
    );

    const isWork = mode === "work";

    return (
        <WorkspaceOperationalHealth
            eyebrow={isWork ? "Assignment health" : "Studio inventory"}
            items={isWork ? workItems : studioItems}
            loading={loading}
            ariaLabel={isWork ? "Assignment operational health" : "Assignment studio inventory"}
            className="w-full"
            data-testid={isWork ? "assignments-work-health-band" : "assignments-studio-health-band"}
        />
    );
}
