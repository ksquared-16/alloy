import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSubjectManageMenuFromResolvedActions } from "@/lib/admin/recordManage/buildSubjectManageMenuFromResolvedActions";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

const webRoot = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

const sampleActions: ResolvedActionForClient[] = [
    {
        key: "schedule_tour",
        label: "Schedule Tour",
        description: null,
        action_type: "workflow",
        icon: null,
        style: null,
        display_style: "button",
        payload: {},
        workflow_id: null,
    },
    {
        key: "send_message",
        label: "Send Message",
        description: null,
        action_type: "ui_intent",
        icon: null,
        style: null,
        display_style: "button",
        payload: {},
        workflow_id: null,
    },
];

describe("buildSubjectManageMenuFromResolvedActions", () => {
    it("returns the same registry-backed actions as header_menu", () => {
        expect(buildSubjectManageMenuFromResolvedActions(sampleActions)).toEqual(sampleActions);
        expect(buildSubjectManageMenuFromResolvedActions(null)).toEqual([]);
    });
});

describe("opportunity Manage menu wiring", () => {

    it("Manage menu supports registry mode with empty disabled state", () => {
        const menu = read("components/admin/drawer/record/RecordDrawerManageMenu.tsx");
        expect(menu).toContain("registryActions");
        expect(menu).toContain("data-focus-panel-manage-empty");
        expect(menu).toContain("No actions available for this record.");
    });

    it("VM compose sets manage_menu equal to header_menu", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).not.toContain("buildRecordManageMenuForEntity");
        expect(compose).toContain("manage_menu: headerMenuActions");
    });
});

describe("record drawer Manage menu presentation", () => {
    it("uses Manage label and platform menu component in opportunity header controls", () => {
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        const menu = read("components/admin/drawer/record/RecordDrawerManageMenu.tsx");
        expect(controls).toContain("RecordDrawerManageMenu");
        expect(controls).toContain("subjectManageActions");
        expect(controls).toContain("onSubjectManageActionSelect");
        expect(menu).toContain("RECORD_DRAWER_MANAGE_MENU_LABEL");
        expect(menu).toContain('"aria-label": "Record manage menu"');
        expect(menu).toContain("whitespace-nowrap");
    });
});
