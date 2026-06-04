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

    it("structureSettled requires above-fold sections to be settled", () => {
        const vm = {
            structureSettled: true as const,
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
        } satisfies Pick<OpportunityDrawerViewModel, "structureSettled" | "above_fold">;
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
