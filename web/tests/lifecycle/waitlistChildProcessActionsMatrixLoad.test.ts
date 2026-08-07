import { describe, expect, it } from "vitest";

import {
    buildLifecycleActionsMatrixRows,
} from "@/lib/lifecycle/lifecycleActionsMatrix";
import {
    buildLifecycleConfiguredActionRows,
} from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import { isLifecycleProcessActionDefinitionEntityType } from "@/lib/lifecycle/lifecycleStageBaseActions";

describe("isLifecycleProcessActionDefinitionEntityType", () => {
    it("accepts opportunity and OCM grains used by Process Actions", () => {
        expect(isLifecycleProcessActionDefinitionEntityType(null)).toBe(true);
        expect(isLifecycleProcessActionDefinitionEntityType("opportunity")).toBe(true);
        expect(isLifecycleProcessActionDefinitionEntityType("opportunity_customer_member")).toBe(true);
        expect(isLifecycleProcessActionDefinitionEntityType("person")).toBe(false);
    });
});

describe("Waitlist Child Process Actions load", () => {
    it("keeps OCM waitlist_child placements visible as enabled in the matrix", () => {
        const configured = buildLifecycleConfiguredActionRows([
            {
                definition: {
                    id: "def-waitlist",
                    key: "waitlist_child",
                    label: "Waitlist Child",
                    entity_type: "opportunity_customer_member",
                    is_active: true,
                },
                placements: [
                    {
                        id: "pl-1",
                        action_definition_id: "def-waitlist",
                        surface: "record_header",
                        slot: "overflow",
                        entity_type: "opportunity",
                        department_id: null,
                        work_unit_id: null,
                        is_active: true,
                        condition_config: {
                            lifecycle_builder_configured: true,
                            lifecycle_action_scope: "lifecycle",
                        },
                    },
                ],
            },
        ]);

        expect(configured).toHaveLength(1);
        expect(configured[0]!.key).toBe("waitlist_child");

        const placementSurfaceSlots = new Map([
            ["pl-1", { surface: "record_header", slot: "overflow" }],
        ]);
        const rows = buildLifecycleActionsMatrixRows({
            baseActions: [
                {
                    key: "waitlist_child",
                    label: "Waitlist Child",
                    definition_key: "waitlist_child",
                },
            ],
            configured,
            placementSurfaceSlots,
        });

        const waitlist = rows.find((r) => r.base_action_key === "waitlist_child");
        expect(waitlist?.enabled).toBe(true);
        expect(waitlist?.placement_ids).toContain("overflow");
    });
});
