import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildOpportunityDrawerPipelineState } from "@/lib/adminV2/drawerPipeline";
import {
    buildInquirySummaryRightColumnModel,
    rightColumnStructureKeys,
} from "@/lib/adminV2/drawerPipeline/adapters/opportunity/buildInquirySummaryRightColumn";
import type { DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function minimalOpportunityShell(): DrawerShellContract {
    return {
        entity_type: "opportunity",
        layout_version: "test-v1",
        tabs: ["overview"],
        overview_sections: [
            { key: "inquiry_children", title: "Children", defaultExpanded: true, collapsible: true, fields: [] },
        ],
        section_slots: [{ section_key: "inquiry_children", lifecycle: "immediate" }],
        geometry: {
            summary_right_column_reserved: true,
            family_contacts_in_summary: true,
        },
        layout_config_snapshot: { inquiry_drawer_mode: "workflow_v1" },
    };
}

const taskPreviewRecord = {
    id: "opp-1",
    _record_surface: "drawer_primary",
    _inquiry_summary_tasks: {
        state: "loaded",
        open_count: 1,
        open_tasks: [
            {
                id: "t1",
                title: "Call family",
                due_at: "2026-05-22T12:00:00.000Z",
                status: "open",
                source: "manual",
            },
        ],
    },
};

describe("inquiry summary right_column atomic structure", () => {
    it("primary and full share the same visible slot keys", () => {
        const shell = minimalOpportunityShell();
        const primary = buildOpportunityDrawerPipelineState({
            shell,
            record: taskPreviewRecord,
            drawer_id: "opp-1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: true,
            first_paint_gates_active: true,
            enrichment_layout_ready: false,
            below_fold_enrichment_ready: false,
            task_assist_enabled: true,
        });
        const full = buildOpportunityDrawerPipelineState({
            shell,
            record: { ...taskPreviewRecord, _record_surface: "full" },
            drawer_id: "opp-1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: false,
            first_paint_gates_active: false,
            enrichment_layout_ready: true,
            below_fold_enrichment_ready: true,
            task_assist_enabled: true,
        });
        const primaryRc = primary.above_fold.inquiry_summary?.right_column;
        const fullRc = full.above_fold.inquiry_summary?.right_column;
        expect(primaryRc).toBeDefined();
        expect(fullRc).toBeDefined();
        expect(rightColumnStructureKeys(primaryRc!)).toEqual(rightColumnStructureKeys(fullRc!));
        expect(rightColumnStructureKeys(primaryRc!)).toEqual([
            "tasks",
            "reminders",
            "orchestrator_handoff",
        ]);
    });

    it("primary-owned slots: tasks ready, reminders skeleton shell, handoff ready", () => {
        const model = buildInquirySummaryRightColumnModel({
            record: taskPreviewRecord,
            enrichment: {
                record_surface: "drawer_primary",
                primary_loaded: true,
                full_pending: true,
                full_complete: false,
                background_full_failed: false,
                enrichment_held_until_interaction: false,
            },
            below_fold_enrichment_ready: false,
            task_assist_enabled: true,
        });
        expect(model.tasks.state).toBe("ready");
        expect(model.tasks.open_count).toBe(1);
        expect(model.reminders.visible).toBe(true);
        expect(model.reminders.state).toBe("skeleton");
        expect(model.orchestrator_handoff.visible).toBe(true);
        expect(model.orchestrator_handoff.state).toBe("ready");
    });

    it("AdminEntityDrawer uses single OpportunityInquirySummaryRightColumn without late-mount gate", () => {
        const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("OpportunityInquirySummaryRightColumn");
        expect(drawer).toContain("rightColumnModel");
        expect(drawer).not.toContain("adminv2-ws-soft-content-reveal");
        expect(drawer).not.toContain("OpportunityInquirySummaryTaskPreview");
    });

    it("operational strip renders reminders section from rightColumnModel before fetch settles", () => {
        const strip = readFileSync(
            join(webRoot, "components/admin/opportunity/OpportunityOperationalCompactStrip.tsx"),
            "utf8"
        );
        expect(strip).toContain("data-right-column-slot=\"reminders\"");
        expect(strip).toContain("ReminderRowSkeleton");
        expect(strip).toContain("showHandoffCard");
        expect(strip).toContain("rightColumnModel");
    });
});
