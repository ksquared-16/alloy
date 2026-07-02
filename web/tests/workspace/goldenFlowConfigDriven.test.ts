import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { buildOperatorLifecycleLandingCards } from "@/lib/admin/buildOperatorLifecycleLanding";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";

const WEB_ROOT = path.resolve(__dirname, "../..");

function visibleCatalogEntry(): LifecycleCatalogEntry {
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
    };
}

function cardWithWorkViews(workViews: Array<Record<string, unknown>>) {
    return buildOperatorLifecycleLandingCards({
        catalogEntries: [visibleCatalogEntry()],
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

describe("golden flow is config-driven (renamed Work View follows config)", () => {
    it("a renamed Work View 'Hot Leads' produces label 'Hot Leads' and slug 'hot-leads'", () => {
        // Rename the configured Work View + its lane key — the UI label and the
        // generated href must both follow config, proving no hardcoded 'New Leads'.
        const card = cardWithWorkViews([
            { id: "hot_leads_view", label: "Hot Leads", compat_queue_key: "hot_leads", display_order: 1 },
        ]);
        expect(card?.workQueues[0]?.label).toBe("Hot Leads");
        expect(card?.workQueues[0]?.href).toBe("/workspace/work-unit/hot-leads");
        // And never leaks param-based routing.
        expect(card?.workQueues[0]?.href).not.toContain("work_view=");
        expect(card?.workQueues[0]?.href).not.toContain("queue=");
    });

    it("configured Work View order + labels drive the tile nav (no static array)", () => {
        const card = cardWithWorkViews([
            { id: "b", label: "Beta Lane", compat_queue_key: "waitlist", display_order: 2 },
            { id: "a", label: "Alpha Lane", compat_queue_key: "new_leads", display_order: 1 },
        ]);
        expect(card?.workQueues.map((q) => q.label)).toEqual(["Alpha Lane", "Beta Lane"]);
    });
});

describe("no static hardcoded Work View label list in production runtime source", () => {
    // The tile-nav builder and the header pill adapter must build labels from
    // configured Work Views — not from a literal array of enrollment lane names.
    const HARDCODED_LABELS = ["New Leads", "Active Pipeline", "Registration", "Waitlist", "Tours", "All Leads"];
    const PRODUCTION_SOURCES = [
        "lib/admin/buildOperatorLifecycleLanding.ts",
        "components/admin/workspace/WorkspaceRootLifecycleGrid.tsx",
        "components/admin/workspace/WorkUnitUnifiedOperationalHeader.tsx",
        "components/admin/workspace/layout/WorkUnitCommandSurface.tsx",
    ];

    for (const rel of PRODUCTION_SOURCES) {
        it(`${rel} contains no hardcoded Work View label literals`, () => {
            const src = fs.readFileSync(path.join(WEB_ROOT, rel), "utf8");
            for (const label of HARDCODED_LABELS) {
                expect(src).not.toContain(`"${label}"`);
                expect(src).not.toContain(`'${label}'`);
            }
        });
    }
});
