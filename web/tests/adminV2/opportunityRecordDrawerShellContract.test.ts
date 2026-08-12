import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { filterOpportunityOverviewSectionsForFirstPaint } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { stabilizeOpportunityWorkflowOverviewSections } from "@/lib/admin/drawer/opportunityDrawerLayoutStability";
import {
    compileOpportunityRecordDrawerShell,
    compileOpportunityRecordDrawerShellFromEntity,
} from "@/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell";
import { OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP } from "@/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

const WORKFLOW_V1_CFG = {
    inquiry_drawer_mode: "workflow_v1" as const,
    inquiry_workflow_sections: [
        { key: "inq_identity", title: "Identity", field_keys: ["name"], default_expanded: true },
    ],
    overview_section_order: ["inq_identity", "inquiry_children", "inquiry_tuition", "details"],
};

const FIELD_DEFS = [
    {
        field_key: "name",
        field_type: "text",
        label: "Name",
        section_key: "details",
        sort_order: 0,
        is_visible_in_drawer: true,
    },
];

describe("compileOpportunityRecordDrawerShell (P1-1)", () => {
    it("compiles stable workflow v1 tabs and section keys from layout config", () => {
        const shell = compileOpportunityRecordDrawerShell({
            config_json: WORKFLOW_V1_CFG,
            field_definitions: FIELD_DEFS,
            field_section_labels: { details: "Details" },
        });
        expect(shell).not.toBeNull();
        expect(shell!.tabs).toEqual(OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP);
        expect(shell!.inquiry_drawer_mode).toBe("workflow_v1");
        const keys = shell!.overview_sections.map((s) => s.key);
        expect(keys).toContain("inq_identity");
        expect(keys).toContain("inquiry_children");
        expect(keys).toContain("inquiry_tuition");
        expect(shell!.geometry.summary_right_column_reserved).toBe(true);
        expect(shell!.geometry.inquiry_children_min_h_class).toMatch(/min-h-/);
    });

    it("section slot count matches overview sections (shell structure invariant)", () => {
        const shell = compileOpportunityRecordDrawerShell({
            config_json: WORKFLOW_V1_CFG,
            field_definitions: FIELD_DEFS,
            field_section_labels: {},
        });
        expect(shell!.section_slots.map((s) => s.section_key).sort()).toEqual(
            shell!.overview_sections.map((s) => s.key).sort()
        );
    });
});

describe("shell structure stable across hydration (P1-2 doctrine)", () => {
    it("first-paint filter keeps section keys while collapsing deferred sections", () => {
        const sections = [
            { key: "inq_identity", title: "Identity", defaultExpanded: true, collapsible: true, fields: [] },
            { key: "inquiry_children", title: "Children", defaultExpanded: true, collapsible: true, fields: [] },
            { key: "inquiry_tuition", title: "Tuition", defaultExpanded: true, collapsible: true, fields: [] },
        ];
        const before = filterOpportunityOverviewSectionsForFirstPaint(sections, true, false);
        const after = filterOpportunityOverviewSectionsForFirstPaint(sections, true, true);
        expect(before.map((s) => s.key)).toEqual(after.map((s) => s.key));
        expect(before).toHaveLength(3);
        expect(before.find((s) => s.key === "inquiry_children")?.defaultExpanded).toBe(false);
        expect(before.find((s) => s.key === "inquiry_tuition")?.defaultExpanded).toBe(false);
        expect(before.find((s) => s.key === "inq_identity")?.defaultExpanded).toBe(true);
    });

    it("above-fold lock does not drop deferred sections from the shell map", () => {
        const sections = [
            { key: "inq_identity", title: "Identity", defaultExpanded: true, collapsible: true, fields: [] },
            { key: "inquiry_children", title: "Children", defaultExpanded: true, collapsible: true, fields: [] },
            { key: "inquiry_tuition", title: "Tuition", defaultExpanded: true, collapsible: true, fields: [] },
        ];
        const locked = stabilizeOpportunityWorkflowOverviewSections(sections, {
            aboveFoldLocked: true,
            firstPaintGatesActive: true,
            enrichmentLayoutReady: false,
        });
        expect(locked.map((s) => s.key).sort()).toEqual(sections.map((s) => s.key).sort());
    });

    it("compile from bootstrap-shaped entity matches compile from config alone for section keys", () => {
        const entity = {
            _field_definitions: FIELD_DEFS,
            _field_sections: [{ section_key: "details", label: "Details" }],
        };
        const fromEntity = compileOpportunityRecordDrawerShellFromEntity(WORKFLOW_V1_CFG, entity);
        const fromConfig = compileOpportunityRecordDrawerShell({
            config_json: WORKFLOW_V1_CFG,
            field_definitions: FIELD_DEFS,
            field_section_labels: { details: "Details" },
        });
        expect(fromEntity!.overview_sections.map((s) => s.key)).toEqual(
            fromConfig!.overview_sections.map((s) => s.key)
        );
    });
});
