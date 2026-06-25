import { describe, expect, it } from "vitest";
import {
    operatorOperationalPerspectivesEnabled,
    WORK_VIEW_PILL_SECTION_LABEL,
} from "@/lib/adminV2/runtime/configurationRuntimeConvergenceFlag";
import {
    applyOperationalViewsToPillSections,
    buildOperationalViewPreviewRuntimeHref,
    deriveOperationalViewsFromQueueDefinition,
    deriveRuntimePerspectiveWithOperationalViews,
    mergeOperationalViewIntoRuntimePerspective,
    relabelPrimaryPillSectionWorkView,
} from "@/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata";
import { resolveOperationalViewsForWorkUnit } from "@/lib/adminV2/runtime/perspective/resolveStageOperationalViews";

const QUEUE_DEFINITION = {
    version: 2,
    entity_type: "opportunity",
    queues: [
        { key: "tours", label: "Tours", grain: "case" },
        { key: "waitlist", label: "Waitlist", grain: "candidate" },
    ],
} as const;

const DEPARTMENT_METADATA = {
    lifecycle_builder_v1: {
        version: 1,
        active_process_id: "proc-1",
        processes: [
            {
                id: "proc-1",
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                stages: [
                    {
                        id: "st-tour",
                        key: "tour",
                        label: "Tour",
                        sort_order: 0,
                        is_active: true,
                        perspectives_v1: [
                            {
                                queue_key: "tours",
                                label: "Today's Tours",
                                mission: "Follow up on tours scheduled today.",
                                visible_in_rail: true,
                                display_order: 1,
                            },
                            {
                                queue_key: "waitlist",
                                label: "Hidden waitlist",
                                visible_in_rail: false,
                                display_order: 2,
                            },
                        ],
                    },
                ],
            },
        ],
    },
};

describe("Configuration Runtime Phase 3A convergence", () => {
    it("Work View label is operator-facing", () => {
        expect(WORK_VIEW_PILL_SECTION_LABEL).toBe("Work View");
    });

    it("operatorOperationalPerspectivesEnabled is boolean", () => {
        expect(typeof operatorOperationalPerspectivesEnabled()).toBe("boolean");
    });

    it("merges configured label and mission into runtime perspective", () => {
        const base = deriveRuntimePerspectiveWithOperationalViews({
            workUnitId: "wu-1",
            queueDefinition: QUEUE_DEFINITION,
            activeQueueKey: "tours",
            operationalViews: [{ queue_key: "tours", label: "Today's Tours", mission: "Custom mission" }],
        });
        expect(base?.label).toBe("Today's Tours");
        expect(base?.defaultMission).toBe("Custom mission");
    });

    it("applyOperationalViewsToPillSections relabels, hides, and reorders", () => {
        const sections = applyOperationalViewsToPillSections(
            [
                {
                    key: "pipeline",
                    label: "Pipeline",
                    tone: "standard",
                    queues: [
                        { key: "waitlist", label: "Waitlist" },
                        { key: "tours", label: "Tours" },
                    ],
                },
            ],
            [
                { queue_key: "tours", label: "Today's Tours", display_order: 1, visible_in_rail: true },
                { queue_key: "waitlist", label: "Waitlist lane", display_order: 2, visible_in_rail: false },
            ],
        );
        expect(sections?.[0]?.queues.map((q) => q.key)).toEqual(["tours"]);
        expect(sections?.[0]?.queues[0]?.label).toBe("Today's Tours");
    });

    it("resolveOperationalViewsForWorkUnit aggregates pipeline lanes from builder stages", () => {
        const views = resolveOperationalViewsForWorkUnit({
            departmentMetadata: DEPARTMENT_METADATA,
            workUnitMetadata: null,
            queueDefinition: QUEUE_DEFINITION,
        });
        expect(views.find((v) => v.queue_key === "tours")).toMatchObject({
            label: "Today's Tours",
        });
        expect(views.find((v) => v.queue_key === "waitlist")).toMatchObject({
            visible_in_rail: false,
        });
    });

    it("buildOperationalViewPreviewRuntimeHref includes queue param", () => {
        expect(
            buildOperationalViewPreviewRuntimeHref({
                departmentId: "dept-1",
                workUnitId: "wu-1",
                queueKey: "tours",
            }),
        ).toBe("/adminV2/workspace/dept/dept-1/work-unit/wu-1?queue=tours");
    });

    it("deriveOperationalViewsFromQueueDefinition maps queue lanes", () => {
        const views = deriveOperationalViewsFromQueueDefinition({
            version: 2,
            entity_type: "opportunity",
            queues: [{ key: "tours", label: "Tours", grain: "case" }],
        });
        expect(views[0]?.queue_key).toBe("tours");
        expect(views[0]?.label).toBe("Tours");
    });

    it("relabelPrimaryPillSectionWorkView relabels first section", () => {
        const sections = relabelPrimaryPillSectionWorkView([
            {
                key: "pipeline",
                label: "Pipeline",
                tone: "standard",
                queues: [{ key: "tours", label: "Tours" }],
            },
        ]);
        expect(sections?.[0]?.label).toBe("Work View");
    });

    it("mergeOperationalViewIntoRuntimePerspective preserves base when metadata absent", () => {
        const merged = mergeOperationalViewIntoRuntimePerspective(
            {
                key: "tours",
                workUnitId: "wu-1",
                label: "Tours",
                grain: "case",
                groupBy: null,
                sort: [],
                defaultFilters: null,
                defaultMission: "Tours",
                emptyState: { title: "Empty" },
                source: "pill",
            },
            null,
        );
        expect(merged.label).toBe("Tours");
    });
});
