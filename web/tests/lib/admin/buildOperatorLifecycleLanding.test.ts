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

    // Work View runtime materialization — configured Work Views (without bound queue lanes) must each
    // become their own nav item routed via `?work_view=<id>`, not collapse to a single default lane.
    function enrollmentCardWithWorkViews(
        workViews: Array<Record<string, unknown>>,
    ): ReturnType<typeof buildOperatorLifecycleLandingCards>[number] | undefined {
        return buildOperatorLifecycleLandingCards({
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
                                    stages: [],
                                    work_views_v1: workViews,
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
        })[0];
    }

    // Canonical configs use 1-based display_order (parseWorkViewRow clamps to >= 1).
    const SIX_WORK_VIEWS = [
        { id: "new_leads", label: "New Leads", display_order: 1 },
        { id: "active_pipeline", label: "Active Pipeline", display_order: 2 },
        { id: "registration", label: "Registration", display_order: 3 },
        { id: "waitlist", label: "Waitlist", display_order: 4 },
        { id: "tours", label: "Tours", display_order: 5 },
        { id: "all_leads", label: "All Leads", display_order: 6 },
    ];

    it("Work Views without compat_queue_key are excluded; falls through to pipeline lane nav", () => {
        // SIX_WORK_VIEWS — none have compat_queue_key → all excluded → falls back to pipeline lanes.
        const card = enrollmentCardWithWorkViews(SIX_WORK_VIEWS);
        expect((card?.workQueues.length ?? 0)).toBeGreaterThan(0);
        for (const q of card?.workQueues ?? []) {
            expect(q.href).not.toContain("work_view=");
            expect(q.href).not.toContain("queue=");
            expect(q.href.startsWith("/workspace/work-unit/")).toBe(true);
        }
    });

    it("Work Views with compat_queue_key produce clean lane-slug hrefs; those without are dropped", () => {
        const card = enrollmentCardWithWorkViews([
            { id: "nl", label: "New Leads", compat_queue_key: "new_leads", display_order: 1 },
            { id: "tours_v", label: "Tours", compat_queue_key: "tours", display_order: 2 },
            { id: "all_v", label: "All Leads", display_order: 3 },  // no compat → excluded
        ]);
        expect(card?.workQueues.map((q) => q.label)).toEqual(["New Leads", "Tours"]);
        expect(card?.workQueues.map((q) => q.href)).toEqual([
            "/workspace/work-unit/new-leads",
            "/workspace/work-unit/tours",
        ]);
        for (const q of card?.workQueues ?? []) {
            expect(q.href).not.toContain("work_view=");
            expect(q.href.startsWith("/workspace/work-unit/")).toBe(true);
            expect(q.href).not.toContain("/dept/");
        }
    });

    it("excludes hidden Work Views from compat-bound set; preserves configured order", () => {
        const card = enrollmentCardWithWorkViews([
            { id: "nl", label: "New Leads", compat_queue_key: "new_leads", display_order: 1 },
            { id: "hv", label: "Hidden", compat_queue_key: "waitlist", display_order: 2, visible_in_runtime: false },
            { id: "tours_v", label: "Tours", compat_queue_key: "tours", display_order: 3 },
        ]);
        expect(card?.workQueues.map((q) => q.label)).toEqual(["New Leads", "Tours"]);
    });

    it("orders compat-bound Work Views by display_order regardless of array order", () => {
        const card = enrollmentCardWithWorkViews([
            { id: "all_v", label: "All Leads", compat_queue_key: "enrollment_completed", display_order: 6 },
            { id: "nl", label: "New Leads", compat_queue_key: "new_leads", display_order: 1 },
            { id: "wl", label: "Waitlist", compat_queue_key: "waitlist", display_order: 4 },
        ]);
        expect(card?.workQueues.map((q) => q.label)).toEqual(["New Leads", "Waitlist", "All Leads"]);
    });

    it("mixes lane-bound and predicate-only Work Views — predicate-only is excluded from tile nav", () => {
        const card = enrollmentCardWithWorkViews([
            // Bound to a real pipeline lane → clean slug.
            { id: "new_leads", label: "New Leads", compat_queue_key: "new_leads", display_order: 1 },
            // No bound lane → excluded from tile nav (cannot produce a clean slug).
            { id: "all_leads", label: "All Leads", display_order: 2 },
        ]);
        expect(card?.workQueues.map((q) => q.href)).toEqual([
            "/workspace/work-unit/new-leads",
        ]);
        expect(card?.workQueues.map((q) => q.label)).toEqual(["New Leads"]);
    });

    // FAILING TEST — demonstrates the bug before fix.
    // Workspace tile work view hrefs must be clean slugs only — no ?work_view= or ?queue= params.
    // Before fix: SIX_WORK_VIEWS (all without compat_queue_key) produce ?work_view= URLs.
    it("workspace tile hrefs must not contain work_view= or queue= params — clean slugs only", () => {
        const card = enrollmentCardWithWorkViews(SIX_WORK_VIEWS);
        for (const q of card?.workQueues ?? []) {
            expect(q.href).not.toContain("work_view=");
            expect(q.href).not.toContain("queue=");
            expect(q.href).toMatch(/^\/workspace\/work-unit\/[a-z0-9-]+$/);
        }
    });

    it("active-pipeline href = /workspace/work-unit/active-pipeline", () => {
        const card = enrollmentCardWithWorkViews([
            { id: "active_pipeline", label: "Active Pipeline", compat_queue_key: "active_pipeline", display_order: 1 },
        ]);
        expect(card?.workQueues[0]?.href).toBe("/workspace/work-unit/active-pipeline");
    });

    it("new-leads href = /workspace/work-unit/new-leads", () => {
        const card = enrollmentCardWithWorkViews([
            { id: "new_leads_view", label: "New Leads", compat_queue_key: "new_leads", display_order: 1 },
        ]);
        expect(card?.workQueues[0]?.href).toBe("/workspace/work-unit/new-leads");
    });

    it("legacy: no configured Work Views falls back to queue-lane nav (New Leads default)", () => {
        const card = enrollmentCardWithWorkViews([]);
        // Falls back to the pipeline queue lanes; New Leads remains the default entry.
        expect((card?.workQueues.length ?? 0)).toBeGreaterThan(0);
        expect(card?.workQueues.some((q) => q.label.toLowerCase().includes("new lead"))).toBe(true);
        expect(card?.entryHref).toBe("/workspace/work-unit/new-leads");
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
