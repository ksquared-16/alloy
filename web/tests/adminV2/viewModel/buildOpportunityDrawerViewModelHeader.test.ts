import { describe, expect, it } from "vitest";

import {
    buildOpportunityDrawerHeaderSubtitle,
    buildOpportunityDrawerHeaderTitle,
    buildOpportunityStatusControlVm,
} from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelHeader";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

const statusDefs: StatusDefinitionRow[] = [
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
];

describe("buildOpportunityStatusControlVm", () => {
    it("returns hidden for classic layout mode", () => {
        expect(
            buildOpportunityStatusControlVm({
                record: { status_key: "new" },
                statusDefs,
                layoutMode: "classic",
            })
        ).toEqual({ renderAs: "hidden" });
    });

    it("returns dropdown when multiple active status defs exist on workflow_v1", () => {
        const control = buildOpportunityStatusControlVm({
            record: { status_key: "new", _status_display: "New" },
            statusDefs,
            layoutMode: "workflow_v1",
        });
        expect(control.renderAs).toBe("dropdown");
        if (control.renderAs === "dropdown") {
            expect(control.status_key).toBe("new");
            expect(control.options).toHaveLength(2);
        }
    });

    it("returns readonly pill when fewer than two active defs", () => {
        const control = buildOpportunityStatusControlVm({
            record: { status_key: "new", _status_display: "New" },
            statusDefs: [statusDefs[0]!],
            layoutMode: "workflow_v1",
        });
        expect(control).toEqual({ renderAs: "readonly_pill", label: "New" });
    });
});

describe("buildOpportunityDrawerHeaderTitle", () => {
    it("prefers name then title then customer", () => {
        expect(buildOpportunityDrawerHeaderTitle({ name: "Alpha", title: "Beta", _customer_name: "Gamma" })).toBe(
            "Alpha"
        );
        expect(buildOpportunityDrawerHeaderTitle({ title: "Beta", _customer_name: "Gamma" })).toBe("Beta");
    });
});

describe("buildOpportunityDrawerHeaderSubtitle", () => {
    it("prefers pipeline stage name", () => {
        expect(
            buildOpportunityDrawerHeaderSubtitle({
                _pipeline_stage_name: "Applied",
                _status_display: "New",
            })
        ).toBe("Applied");
    });
});
