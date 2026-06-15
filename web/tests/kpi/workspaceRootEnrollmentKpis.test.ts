import { describe, expect, it } from "vitest";
import {
    aggregateWorkspaceEnrollmentKpiRollup,
    buildWorkspaceRootOrgOpportunityKpis,
    type WorkspaceGrowthDeptSnapshot,
} from "@/lib/workspace/viewModels/workspaceRootRollup";

const enrollmentSnapshot = (
    partial: Partial<WorkspaceGrowthDeptSnapshot> & Pick<WorkspaceGrowthDeptSnapshot, "id">
): WorkspaceGrowthDeptSnapshot => ({
    key: "enrollment",
    pipelineExact: null,
    lifecycleAnalytics: null,
    ...partial,
});

describe("workspace root enrollment KPI rollup", () => {
    it("returns em dash values when no lifecycle analytics are available", () => {
        const kpis = buildWorkspaceRootOrgOpportunityKpis([
            enrollmentSnapshot({ id: "d1", key: "operations" }),
        ]);
        expect(kpis.map((k) => k.label)).toEqual([
            "Active Leads",
            "Scheduled Tours",
            "Enrollment Opportunities",
            "Waitlisted Families",
        ]);
        expect(kpis.every((k) => k.value === "—")).toBe(true);
    });

    it("aggregates childcare enrollment metrics across growth departments", () => {
        const snapshots: WorkspaceGrowthDeptSnapshot[] = [
            enrollmentSnapshot({
                id: "d1",
                lifecycleAnalytics: {
                    counts: {
                        total: 20,
                        intake: 4,
                        qualification: 3,
                        execution: 2,
                        decision: 1,
                        success: 2,
                        failure: 1,
                        unclassified: 0,
                    },
                    statusBreakdown: [
                        { status_key: "enrolled", count: 2 },
                        { status_key: "lost", count: 1 },
                        { status_key: "tour_scheduled", count: 5 },
                        { status_key: "waitlisted", count: 3 },
                    ],
                },
            }),
            enrollmentSnapshot({
                id: "d2",
                key: "growth",
                lifecycleAnalytics: {
                    counts: {
                        total: 10,
                        intake: 2,
                        qualification: 1,
                        execution: 1,
                        decision: 0,
                        success: 1,
                        failure: 0,
                        unclassified: 0,
                    },
                    statusBreakdown: [
                        { status_key: "enrolled", count: 1 },
                        { status_key: "tour_scheduled", count: 2 },
                        { status_key: "waitlisted", count: 1 },
                    ],
                },
            }),
        ];

        expect(aggregateWorkspaceEnrollmentKpiRollup(snapshots)).toEqual({
            activeLeads: 26,
            scheduledTours: 7,
            enrollmentOpportunities: 14,
            waitlistedFamilies: 4,
            sawLifecycleAnalytics: true,
        });

        const kpis = buildWorkspaceRootOrgOpportunityKpis(snapshots);
        expect(kpis.map((k) => [k.label, k.value])).toEqual([
            ["Active Leads", "26"],
            ["Scheduled Tours", "7"],
            ["Enrollment Opportunities", "14"],
            ["Waitlisted Families", "4"],
        ]);
    });
});
