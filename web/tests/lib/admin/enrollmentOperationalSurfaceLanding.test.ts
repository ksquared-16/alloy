import { describe, expect, it } from "vitest";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    buildCanonicalOperationalWorkViewHref,
    buildEnrollmentOperationalSurfaceFields,
    ensureEnrollmentOperationalSurfaceCard,
    enrollmentOperationalSurfaceNeedsHydration,
    isEnrollmentLifecycleCard,
    resolveEnrollmentWorkUnitForSurface,
} from "@/lib/admin/enrollmentOperationalSurfaceLanding";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";

const enrollmentWorkViewsV1 = [
    { id: "tours", label: "Tours", compat_queue_key: "tours", display_order: 1 },
    {
        id: "ready_to_enroll",
        label: "Ready to Enroll",
        compat_queue_key: "enrollment_offers",
        display_order: 2,
    },
    {
        id: "follow_ups",
        label: "Follow Ups",
        compat_queue_key: "communications_followup",
        display_order: 3,
    },
];

const enrollmentCard = (): OperatorLifecycleLandingCard => ({
    id: "dept-1:proc-1",
    departmentId: "dept-1",
    processKey: "lead_management",
    label: "Enrollment",
    description: "Enrollment pipeline",
    entryHref: "/workspace/work-unit/new-leads",
    workQueues: [],
    stageCount: 7,
    activeRecordCount: 3,
    needsAttentionCount: 2,
});

describe("isEnrollmentLifecycleCard", () => {
    it("matches process keys, labels, and entry href markers", () => {
        expect(isEnrollmentLifecycleCard({ processKey: "lead_management", label: "Lead Management", entryHref: "/workspace/work-unit/new-leads" })).toBe(true);
        expect(isEnrollmentLifecycleCard({ processKey: "enrollment", label: "Enrollment", entryHref: "/workspace/work-unit/enrollment-pipeline" })).toBe(true);
        expect(isEnrollmentLifecycleCard({ processKey: "billing", label: "Billing", entryHref: "/workspace/work-unit/billing" })).toBe(false);
        expect(isEnrollmentLifecycleCard({ processKey: "ops", label: "Enrollment Ops", entryHref: "/workspace" })).toBe(true);
    });
});

describe("buildEnrollmentOperationalSurfaceFields", () => {
    it("builds story and work lines from configured work views", () => {
        const fields = buildEnrollmentOperationalSurfaceFields({
            card: enrollmentCard(),
            departmentMetadata: {
                lifecycle_builder_v1: {
                    version: 1,
                    active_process_id: "proc-1",
                    processes: [
                        {
                            id: "proc-1",
                            key: "lead_management",
                            name: "Enrollment",
                            is_active: true,
                            stages: [],
                            work_views_v1: enrollmentWorkViewsV1,
                        },
                    ],
                },
            },
            workUnits: [
                {
                    id: "wu-pipeline",
                    department_id: "dept-1",
                    key: "enrollment_pipeline",
                    name: "Enrollment Pipeline",
                    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
                },
            ],
            queueSummaries: [
                {
                    id: "wu-pipeline",
                    queues: [
                        { key: "tours", count: 2 },
                        { key: "enrollment_offers", count: 1 },
                        { key: "communications_followup", count: 3 },
                    ],
                },
            ],
        });

        expect(fields).not.toBeNull();
        expect(fields?.operationalStory.headline).toContain("2 families are waiting");
        expect(fields?.operationalStory.body).toContain("conversations moving");
        expect(fields?.todaysWork).toHaveLength(3);
        expect(fields?.todaysWork[0]?.label).toBe("Tours");
        expect(fields?.todaysWork[0]?.count).toBe(2);
        expect(fields?.todaysWork[0]?.href).toContain("work_view=");
    });

    it("per-view counts come from the operational projection (base rows + predicates), NOT lane summaries", () => {
        const baseRows = [
            { id: "lyons", status_key: "new_inquiry" },
            { id: "b", status_key: "waitlist" },
            { id: "c", status_key: "enrolled" },
        ];
        const fields = buildEnrollmentOperationalSurfaceFields({
            card: enrollmentCard(),
            departmentMetadata: {
                lifecycle_builder_v1: {
                    version: 1,
                    active_process_id: "proc-1",
                    processes: [
                        {
                            id: "proc-1",
                            key: "lead_management",
                            name: "Enrollment",
                            is_active: true,
                            stages: [],
                            work_views_v1: [
                                // Predicate-only "All Leads" — no compat_queue_key; empty filter = include-all.
                                { id: "all_leads", label: "All Leads", display_order: 1, filters_v1: [] },
                                // Predicate view — no bound lane.
                                {
                                    id: "new_leads",
                                    label: "New Leads",
                                    display_order: 2,
                                    filters_v1: [
                                        { field_key: "opportunity_status", operator: "equals", value: "new_inquiry" },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
            workUnits: [
                {
                    id: "wu-pipeline",
                    department_id: "dept-1",
                    key: "enrollment_pipeline",
                    name: "Enrollment Pipeline",
                    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
                },
            ],
            // Deliberately WRONG lane summaries — if these were used, All Leads would be 0 and New Leads 99.
            queueSummaries: [
                { id: "wu-pipeline", queues: [{ key: "new_leads", count: 99 }] },
            ],
            baseRows,
        });

        const byId = Object.fromEntries((fields?.todaysWork ?? []).map((w) => [w.id, w.count]));
        // All Leads = all base rows (3) via empty-filter projection — NOT 0 from the absent lane summary.
        expect(byId.all_leads).toBe(3);
        // New Leads = predicate-filtered (1 new_inquiry) — NOT 99 from the lane summary.
        expect(byId.new_leads).toBe(1);
    });

    it("falls back to lane summaries when base rows are not yet available", () => {
        const fields = buildEnrollmentOperationalSurfaceFields({
            card: enrollmentCard(),
            departmentMetadata: {
                lifecycle_builder_v1: {
                    version: 1,
                    active_process_id: "proc-1",
                    processes: [
                        {
                            id: "proc-1",
                            key: "lead_management",
                            name: "Enrollment",
                            is_active: true,
                            stages: [],
                            work_views_v1: enrollmentWorkViewsV1,
                        },
                    ],
                },
            },
            workUnits: [
                {
                    id: "wu-pipeline",
                    department_id: "dept-1",
                    key: "enrollment_pipeline",
                    name: "Enrollment Pipeline",
                    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
                },
            ],
            queueSummaries: [{ id: "wu-pipeline", queues: [{ key: "tours", count: 2 }] }],
            // no baseRows → lane-summary fallback (back-compat).
        });
        expect(fields?.todaysWork.find((w) => w.id === "tours")?.count).toBe(2);
    });

    it("still builds surface when pipeline work unit is missing", () => {
        const fields = buildEnrollmentOperationalSurfaceFields({
            card: enrollmentCard(),
            departmentMetadata: {
                lifecycle_builder_v1: {
                    version: 1,
                    active_process_id: "proc-1",
                    processes: [
                        {
                            id: "proc-1",
                            key: "lead_management",
                            name: "Enrollment",
                            is_active: true,
                            stages: [],
                            work_views_v1: enrollmentWorkViewsV1,
                        },
                    ],
                },
            },
            workUnits: [],
        });
        expect(fields).not.toBeNull();
        expect(fields?.todaysWork).toHaveLength(3);
        expect(fields?.todaysWork.every((line) => line.href.includes("work_view="))).toBe(true);
        expect(fields?.todaysWork.every((line) => line.count === 0)).toBe(true);
    });

    it("returns null for non-enrollment processes", () => {
        const fields = buildEnrollmentOperationalSurfaceFields({
            card: { ...enrollmentCard(), processKey: "billing", label: "Billing", entryHref: "/workspace/work-unit/billing" },
            workUnits: [],
        });
        expect(fields).toBeNull();
    });
});

describe("ensureEnrollmentOperationalSurfaceCard", () => {
    it("hydrates missing operational fields at render time", () => {
        const hydrated = ensureEnrollmentOperationalSurfaceCard(enrollmentCard(), {
            departmentMetadata: {
                lifecycle_builder_v1: {
                    version: 1,
                    active_process_id: "proc-1",
                    processes: [
                        {
                            id: "proc-1",
                            key: "lead_management",
                            name: "Enrollment",
                            is_active: true,
                            stages: [],
                            work_views_v1: enrollmentWorkViewsV1,
                        },
                    ],
                },
            },
            workUnits: [
                {
                    id: "wu-pipeline",
                    department_id: "dept-1",
                    key: "enrollment_pipeline",
                    name: "Enrollment Pipeline",
                    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
                },
            ],
        });
        expect(hydrated.operationalStory?.headline).toBeTruthy();
        expect(hydrated.todaysWork?.length).toBe(3);
    });
});

describe("enrollmentOperationalSurfaceNeedsHydration", () => {
    it("detects stale cached cards missing operational story", () => {
        expect(enrollmentOperationalSurfaceNeedsHydration([enrollmentCard()])).toBe(true);
        expect(
            enrollmentOperationalSurfaceNeedsHydration([
                ensureEnrollmentOperationalSurfaceCard(enrollmentCard()),
            ]),
        ).toBe(false);
    });
});

describe("resolveEnrollmentWorkUnitForSurface", () => {
    it("falls back to entry href slug when pipeline picker misses", () => {
        const pick = resolveEnrollmentWorkUnitForSurface({
            departmentId: "dept-1",
            entryHref: "/workspace/work-unit/new-leads",
            workUnits: [],
        });
        expect(pick.key).toBe("new_leads");
    });
});

describe("buildCanonicalOperationalWorkViewHref", () => {
    it("builds canonical /workspace/work-unit slug with work_view query", () => {
        expect(
            buildCanonicalOperationalWorkViewHref({
                workUnitPlatformKey: "enrollment_pipeline",
                workViewId: "tours",
                queueKey: "tours",
            }),
        ).toBe("/workspace/work-unit/enrollment-pipeline?work_view=tours&queue=tours");
    });
});
