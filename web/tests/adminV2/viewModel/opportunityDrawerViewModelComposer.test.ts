import { beforeEach, describe, expect, it, vi } from "vitest";

import { composeOpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel";
import { OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";

vi.mock("@/lib/admin/effectiveRecordDrawerLayout", () => ({
    fetchEffectiveRecordDrawerLayout: vi.fn(),
}));

vi.mock("@/lib/admin/opportunityEntityRecord", () => ({
    buildOpportunityDrawerVisiblePayload: vi.fn(),
    attachOpportunityHouseholdCustomerPersonsForDrawer: vi.fn(async () => undefined),
}));

vi.mock("@/lib/lifecycle/projectStageWorkRuntime", () => ({
    projectStageWorkRuntime: vi.fn(async () => null),
    primaryWorkIntentProjectionFromStageWork: vi.fn(() => null),
}));

vi.mock("@/lib/admin/opportunityAttentionSuggestionAttachment", () => ({
    attachOpportunityAttentionSuggestionBundle: vi.fn(),
}));

vi.mock("@/lib/admin/actions/resolveActionsForContext", () => ({
    resolveActionsForContext: vi.fn(),
}));

vi.mock("@/lib/admin/loadOpportunityActivitySignal", () => ({
    fetchDepartmentMetadataForActivity: vi.fn(),
}));

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitionsTagged: vi.fn(),
}));

vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityScheduledSendsPreview", () => ({
    loadOpportunityScheduledSendsPreview: vi.fn(),
}));

vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityActiveTourBookingsForViewModel", () => ({
    loadOpportunityActiveTourBookingsForViewModel: vi.fn(),
}));

vi.mock("@/lib/completion/readinessDrawerBootstrap", () => ({
    tryEvaluateDrawerRecordReadiness: vi.fn(() => undefined),
}));

import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import { buildOpportunityDrawerVisiblePayload } from "@/lib/admin/opportunityEntityRecord";
import { attachOpportunityAttentionSuggestionBundle } from "@/lib/admin/opportunityAttentionSuggestionAttachment";
import { fetchEffectiveStatusDefinitionsTagged } from "@/lib/admin/statusDefinitionsResolve";
import { loadOpportunityScheduledSendsPreview } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityScheduledSendsPreview";
import { loadOpportunityActiveTourBookingsForViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityActiveTourBookingsForViewModel";
import { compileOpportunityRecordDrawerShellFromEntity } from "@/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell";

const gate = {
    ok: true as const,
    orgId: "org-1",
    userId: "user-1",
    role: "admin",
    roleKeys: ["admin"],
    access: {} as never,
    dim: {} as never,
};

function makeSupabase(oppRow: Record<string, unknown> | null) {
    return {
        from: (table: string) => {
            if (table === "opportunities") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                single: async () =>
                                    oppRow ?
                                        { data: oppRow, error: null }
                                    :   { data: null, error: { message: "Not found" } },
                            }),
                        }),
                    }),
                };
            }
            if (table === "work_units") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: {
                                        id: "wu-1",
                                        department_id: "dept-1",
                                        metadata: {},
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    } as never;
}

describe("composeOpportunityDrawerViewModel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchEffectiveRecordDrawerLayout).mockResolvedValue({
            ok: true,
            layout: {
                source: "global_template",
                record_drawer_layout_id: null,
                record_layout_id: "layout-1",
                key: "default",
                entity_type: "opportunity",
                config_json: {
                    inquiry_drawer_mode: "workflow_v1",
                    overview_section_order: ["inquiry_children"],
                    overview_hidden_sections: [],
                    inquiry_workflow_sections: [{ key: "inquiry_children", title: "Children", field_keys: [] }],
                },
                is_active: true,
                created_at: new Date().toISOString(),
                global_template_count: 1,
            },
        });
        vi.mocked(buildOpportunityDrawerVisiblePayload).mockResolvedValue({
            id: "opp-1",
            org_id: "org-1",
            name: "Test Lead",
            status_key: "new",
            _status_display: "New",
            _work_unit_department_id: "dept-1",
            work_unit_id: "wu-1",
            _inquiry_summary_tasks: { state: "loaded", open_tasks: [], open_count: 0 },
            _inquiry_children: [],
            _identity: {
                household: { id: "cust-1", label: "Smith" },
                primary_person: null,
                primary_contact: null,
                primary_child: null,
                inquiry: { title: "Test Lead", lines: [], section_key: "quote" },
            },
        });
        vi.mocked(fetchEffectiveStatusDefinitionsTagged).mockResolvedValue({
            rows: [
                {
                    id: "1",
                    org_id: "org-1",
                    industry_key: null,
                    entity_type: "opportunities",
                    status_key: "new",
                    status_label: "New",
                    sort_order: 0,
                    is_active: true,
                    is_system: false,
                    metadata: null,
                },
                {
                    id: "2",
                    org_id: "org-1",
                    industry_key: null,
                    entity_type: "opportunities",
                    status_key: "tour_scheduled",
                    status_label: "Tour scheduled",
                    sort_order: 1,
                    is_active: true,
                    is_system: false,
                    metadata: null,
                },
            ],
            processCacheHit: true,
            combinedCacheHit: true,
            telemetry: {
                normalized_entity_type: "opportunities",
                process_cache_hit: true,
                next_cache_attempted: false,
                next_cache_hit: false,
                uncached_ms: 0,
                overrides_ms: null,
                defaults_ms: null,
                merge_ms: null,
            },
        });
        vi.mocked(loadOpportunityScheduledSendsPreview).mockResolvedValue({
            state: "empty",
            next_follow_up_iso: null,
            scheduled_send_count: 0,
            scheduled_sends: [],
        });
        vi.mocked(loadOpportunityActiveTourBookingsForViewModel).mockResolvedValue([]);
        vi.mocked(attachOpportunityAttentionSuggestionBundle).mockResolvedValue({
            _operational_attention: null,
            _operational_attention_error: null,
            _attention_suggestion: null,
            _operational_summary: null,
            _operational_recommendation: null,
        });
        vi.mocked(resolveActionsForContext).mockResolvedValue({
            primary: [],
            secondary: [],
            overflow: [],
            right_rail: [],
            row_inline: [],
            header: [
                {
                    key: "schedule_tour",
                    label: "Schedule tour",
                    description: null,
                    action_type: "workflow",
                    icon: null,
                    style: null,
                    display_style: "button",
                    payload: {},
                    workflow_id: null,
                },
            ],
        });
    });

    it("skips classic layout with structureSettled false", async () => {
        vi.mocked(fetchEffectiveRecordDrawerLayout).mockResolvedValue({
            ok: true,
            layout: {
                source: "global_template",
                record_drawer_layout_id: null,
                record_layout_id: "layout-1",
                key: "default",
                entity_type: "opportunity",
                config_json: {
                    overview_section_order: [],
                    overview_hidden_sections: [],
                },
                is_active: true,
                created_at: new Date().toISOString(),
                global_template_count: 1,
            },
        });

        const result = await composeOpportunityDrawerViewModel({
            supabase: makeSupabase({ id: "opp-1", org_id: "org-1" }),
            gate,
            opportunityId: "opp-1",
            departmentId: "dept-1",
            workUnitId: "wu-1",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.skipped.structureSettled).toBe(false);
            expect(result.skipped.reason).toBe("classic_layout_deferred");
            expect(result.skipped.compose_version).toBe(OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION);
        }
    });

    it("returns structureSettled true for workflow_v1 with header actions and settled summaries", async () => {
        const result = await composeOpportunityDrawerViewModel({
            supabase: makeSupabase({ id: "opp-1", org_id: "org-1", work_unit_id: "wu-1" }),
            gate,
            opportunityId: "opp-1",
            departmentId: "dept-1",
            workUnitId: "wu-1",
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.viewModel.structureSettled).toBe(true);
            expect(result.viewModel.layout.mode).toBe("workflow_v1");
            expect(result.viewModel.actions.header).toHaveLength(1);
            expect(result.viewModel.header.status.renderAs).toBe("dropdown");
            expect(result.viewModel.summaries.tasks.state).toBe("loaded");
            expect(result.viewModel.summaries.reminders.state).toBe("empty");
            expect(result.viewModel.first_paint.settled).toBe(true);
            expect(result.viewModel.first_paint.data.tour_bookings).toEqual([]);
            expect(result.viewModel.first_paint.dependencies.some((d) => d.key === "tour_bookings")).toBe(true);
            expect(result.viewModel.workspace.queue_definition).toBeNull();
            expect(result.viewModel.workspace.work_intent_runtime).toBeNull();
            expect(result.viewModel.above_fold.record._record_surface).toBeUndefined();
            expect(compileOpportunityRecordDrawerShellFromEntity).toBeDefined();
        }
    });

    it("returns not found skip when opportunity missing", async () => {
        const result = await composeOpportunityDrawerViewModel({
            supabase: makeSupabase(null),
            gate,
            opportunityId: "opp-missing",
            departmentId: "dept-1",
            workUnitId: "wu-1",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.skipped.reason).toBe("opportunity_not_found");
        }
    });
});
