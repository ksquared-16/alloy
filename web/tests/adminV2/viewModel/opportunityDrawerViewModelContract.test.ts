import { describe, expect, it } from "vitest";

import {
    aboveFoldSectionsStructureSettled,
    isClassicLayoutDeferredReason,
    OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
    opportunityDrawerViewModelStructureSettled,
    stripOpportunityDrawerRecordStaging,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";

describe("opportunityDrawerViewModelContract", () => {
    it("rejects skeleton and pending above-fold value phases", () => {
        expect(
            aboveFoldSectionsStructureSettled([
                {
                    section_key: "inquiry_children",
                    lifecycle: "reserved_placeholder",
                    default_expanded: true,
                    collapsible: true,
                    value_phase: "skeleton",
                },
            ])
        ).toBe(false);
        expect(
            aboveFoldSectionsStructureSettled([
                {
                    section_key: "inquiry_children",
                    lifecycle: "reserved_placeholder",
                    default_expanded: true,
                    collapsible: true,
                    value_phase: "value",
                },
            ])
        ).toBe(true);
    });

    it("structureSettled requires above-fold sections and first_paint contract to be settled", () => {
        const vm = {
            structureSettled: true as const,
            layout: {
                mode: "workflow_v1" as const,
                tabs: ["overview"] as const,
                default_tab: "overview" as const,
                shell: {
                    entity_type: "opportunity" as const,
                    layout_version: "default",
                    tabs: ["overview"] as const,
                    overview_sections: [],
                    section_slots: [],
                    geometry: { summary_right_column_reserved: true },
                    layout_config_snapshot: { inquiry_drawer_mode: "workflow_v1", overview_section_order: [] },
                },
            },
            first_paint: {
                settled: true as const,
                viewport_slots: [
                    "header",
                    "status",
                    "location",
                    "actions",
                    "tabs",
                    "lead_summary",
                    "tour_slot",
                    "tasks_summary",
                    "reminders_summary",
                ] as const,
                dependencies: [
                    {
                        key: "tour_bookings",
                        disposition: "first_paint_required",
                        status: "empty",
                        satisfied_by: "server_fetch",
                    },
                ],
                data: { tour_bookings: [] },
                deferred: [],
                background: [],
            },
            above_fold: {
                render_model: {
                    sections: [
                        {
                            section_key: "lead_summary",
                            lifecycle: "immediate" as const,
                            default_expanded: true,
                            collapsible: false,
                            value_phase: "value" as const,
                        },
                    ],
                },
                record: { id: "opp-1" },
            },
        } satisfies Pick<OpportunityDrawerViewModel, "structureSettled" | "above_fold" | "first_paint" | "layout">;
        expect(opportunityDrawerViewModelStructureSettled(vm)).toBe(true);
    });

    it("stripOpportunityDrawerRecordStaging removes surface staging keys", () => {
        const stripped = stripOpportunityDrawerRecordStaging({
            id: "opp-1",
            _record_surface: "drawer_primary",
            _operational_attention_deferred: true,
            _drawer_primary_phase_ms: { x: 1 },
            name: "Test",
        });
        expect(stripped).toEqual({ id: "opp-1", name: "Test" });
    });

    it("tracks compose version constant", () => {
        expect(OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("identifies classic layout skip reason", () => {
        expect(isClassicLayoutDeferredReason("classic_layout_deferred")).toBe(true);
        expect(isClassicLayoutDeferredReason("layout_unavailable")).toBe(false);
    });
});
