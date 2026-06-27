import { describe, expect, it } from "vitest";
import { buildOperatorLifecycleLandingCards } from "@/lib/admin/buildOperatorLifecycleLanding";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";

function visibleCatalogEntry(overrides: Partial<LifecycleCatalogEntry>): LifecycleCatalogEntry {
    return {
        id: "dept-1:proc-1",
        config_source: "departments.metadata.lifecycle_builder_v1",
        department_id: "dept-1",
        department_key: "lead_management",
        department_name: "Enrollment",
        process_id: "proc-1",
        process_key: "lead_management",
        lifecycle_name: "Lead Management",
        source: "builder_owned",
        stage_count: 6,
        track_count: 0,
        work_unit_count: 1,
        activation_owned: true,
        can_delete: false,
        can_repair: false,
        workspace: {
            backing_department_exists: true,
            department_is_active: true,
            visible_in_workspace_api: true,
            user_has_access: true,
            name_matches_tile: true,
            runtime_status: "visible",
            tile_name: "Lead Management",
        },
        ...overrides,
    };
}

describe("buildOperatorLifecycleLandingCards", () => {
    it("builds Lead Management from lifecycle catalog with new-leads entry", () => {
        const cards = buildOperatorLifecycleLandingCards({
            catalogEntries: [visibleCatalogEntry({})],
            departments: [
                {
                    id: "dept-1",
                    metadata: {
                        lifecycle_builder_v1: {
                            version: 1,
                            active_process_id: "proc-1",
                            processes: [
                                {
                                    id: "proc-1",
                                    key: "lead_management",
                                    name: "Lead Management",
                                    description:
                                        "Manage new leads, tours, follow-ups, waitlist, enrolling, and enrolled records.",
                                    is_active: true,
                                    stages: [],
                                    work_views_v1: [
                                        { id: "new_leads", label: "New Leads", compat_queue_key: "new_leads", display_order: 0 },
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
                                    ],
                                },
                            ],
                        },
                    },
                },
            ],
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

        expect(cards).toHaveLength(1);
        expect(cards[0]?.label).toBe("Lead Management");
        expect(cards[0]?.entryHref).toBe("/workspace/work-unit/new-leads");
        expect(cards[0]?.stageCount).toBe(6);
        expect(cards[0]?.activeRecordCount).toBeNull();
        expect(cards[0]?.needsAttentionCount).toBeNull();
        // Phase 2 route canonicalization: every work-view nav entry resolves to a canonical operator
        // slug (`/workspace/work-unit/:slug`) — never a dept/uuid (`/dept/…`) or `/adminV2/…` route that
        // forces a redirect chain / duplicate RSC load. Default entry maps the lead lane to `new-leads`.
        expect(cards[0]?.workQueues.map((q) => q.label)).toEqual([
            "New Leads",
            "Tours",
            "Ready to Enroll",
            "Follow Ups",
        ]);
        expect(cards[0]?.workQueues.map((q) => q.href)).toEqual([
            "/workspace/work-unit/new-leads",
            "/workspace/work-unit/tours",
            "/workspace/work-unit/enrollment-offers",
            "/workspace/work-unit/communications-followup",
        ]);
        for (const q of cards[0]?.workQueues ?? []) {
            expect(q.href.startsWith("/workspace/work-unit/")).toBe(true);
            expect(q.href).not.toContain("/dept/");
            expect(q.href).not.toContain("/adminV2/");
        }
        expect(cards[0]?.operationalStory?.headline).toBeTruthy();
        expect(cards[0]?.todaysWork?.[0]?.href).toContain("work_view=");
    });

    it("returns only operator-visible lifecycles", () => {
        const cards = buildOperatorLifecycleLandingCards({
            catalogEntries: [
                visibleCatalogEntry({}),
                visibleCatalogEntry({
                    id: "dept-2:proc-2",
                    department_id: "dept-2",
                    lifecycle_name: "Hidden Lifecycle",
                    workspace: {
                        backing_department_exists: true,
                        department_is_active: true,
                        visible_in_workspace_api: false,
                        user_has_access: true,
                        name_matches_tile: true,
                        runtime_status: "not_visible",
                        tile_name: null,
                    },
                }),
            ],
            departments: [{ id: "dept-1", metadata: {} }],
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

        expect(cards).toHaveLength(1);
        expect(cards[0]?.label).toBe("Lead Management");
    });

    it("maps builder-owned lifecycle stage work units to pipeline queue slugs (not lifecycle_wu_lead)", () => {
        const cards = buildOperatorLifecycleLandingCards({
            catalogEntries: [visibleCatalogEntry({})],
            departments: [
                {
                    id: "dept-1",
                    metadata: {
                        lifecycle_builder_v1: {
                            version: 1,
                            active_process_id: "proc-1",
                            processes: [
                                {
                                    id: "proc-1",
                                    key: "lead_management",
                                    name: "Lead Management",
                                    is_active: true,
                                    stages: [
                                        { id: "s1", key: "lead", label: "New Leads", sort_order: 0, is_active: true },
                                        { id: "s2", key: "tour", label: "Tours", sort_order: 1, is_active: true },
                                    ],
                                },
                            ],
                        },
                    },
                },
            ],
            workUnits: [
                {
                    id: "wu-lead",
                    department_id: "dept-1",
                    key: "lifecycle_wu_lead",
                    name: "New Leads",
                    queue_definition: {},
                },
            ],
        });

        expect(cards[0]?.entryHref).toBe("/workspace/work-unit/new-leads");
        expect(cards[0]?.workQueues.map((q) => q.platformKey)).toEqual(["new_leads", "tours"]);
    });
});
