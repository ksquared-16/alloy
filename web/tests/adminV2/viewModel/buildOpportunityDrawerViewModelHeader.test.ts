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
        status_key: "open",
        status_label: "Open",
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
        status_key: "closed",
        status_label: "Closed",
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
                record: { status_key: "open" },
                statusDefs,
                layoutMode: "classic",
            })
        ).toEqual({ renderAs: "hidden" });
    });

    it("returns dropdown when multiple MVP case status defs exist on workflow_v1", () => {
        const control = buildOpportunityStatusControlVm({
            record: { status_key: "open", _status_display: "Open" },
            statusDefs,
            layoutMode: "workflow_v1",
        });
        expect(control.renderAs).toBe("dropdown");
        if (control.renderAs === "dropdown") {
            expect(control.status_key).toBe("open");
            expect(control.options).toHaveLength(2);
            expect(control.options.map((o) => o.status_key)).toEqual(["open", "closed"]);
        }
    });

    it("returns readonly pill when fewer than two MVP case defs", () => {
        const control = buildOpportunityStatusControlVm({
            record: { status_key: "open", _status_display: "Open" },
            statusDefs: [statusDefs[0]!],
            layoutMode: "workflow_v1",
        });
        expect(control).toEqual({ renderAs: "readonly_pill", label: "Open", status_key: "open" });
    });

    it("excludes legacy pipeline keys from dropdown options", () => {
        const control = buildOpportunityStatusControlVm({
            record: { status_key: "new_inquiry", _status_display: "New Lead" },
            statusDefs: [
                ...statusDefs,
                {
                    id: "3",
                    org_id: "org-1",
                    industry_key: null,
                    entity_type: "opportunities",
                    status_key: "new_inquiry",
                    status_label: "New Lead",
                    sort_order: 2,
                    is_active: true,
                    is_system: false,
                    metadata: null,
                },
            ],
            layoutMode: "workflow_v1",
        });
        expect(control.renderAs).toBe("dropdown");
        if (control.renderAs === "dropdown") {
            expect(control.options.map((o) => o.status_key)).toEqual(["open", "closed"]);
        }
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
