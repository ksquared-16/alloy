import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildOpportunityDrawerPipelineState } from "@/lib/adminV2/drawerPipeline";
import { compileJobDrawerShell } from "@/lib/adminV2/drawerPipeline/adapters/job/compileShell";
import type { DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

function minimalOppShell(): DrawerShellContract {
    return {
        entity_type: "opportunity",
        layout_version: "test",
        tabs: ["overview"],
        overview_sections: [{ key: "inquiry_children", title: "Children", defaultExpanded: true, collapsible: true, fields: [] }],
        section_slots: [{ section_key: "inquiry_children", lifecycle: "immediate" }],
        geometry: { summary_right_column_reserved: true, family_contacts_in_summary: true },
        layout_config_snapshot: {},
    };
}

describe("drawer above-fold doctrine", () => {
    it("DrawerAboveFoldRenderer does not import layout discovery helpers", () => {
        const src = read("components/admin/drawer/DrawerAboveFoldRenderer.tsx");
        expect(src).not.toContain("getEntityPresentation");
        expect(src).not.toContain("recordChrome");
        expect(src).toContain("data-shell-slot-placeholder");
    });

    it("job shell compiler does not gate column layout on full hydrate", () => {
        const src = read("lib/adminV2/drawerPipeline/adapters/job/buildAboveFoldRenderModel.ts");
        expect(src).not.toMatch(/full_pending[\s\S]{0,60}reserved/);
        expect(src).not.toMatch(/full_complete[\s\S]{0,60}column/);
    });

    it("opportunity pipeline column mode stable when full pending", () => {
        const pending = buildOpportunityDrawerPipelineState({
            shell: minimalOppShell(),
            record: { id: "o1", _record_surface: "drawer_primary" },
            drawer_id: "o1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: true,
            first_paint_gates_active: true,
            enrichment_layout_ready: false,
            below_fold_enrichment_ready: false,
            task_assist_enabled: true,
        });
        const full = buildOpportunityDrawerPipelineState({
            shell: minimalOppShell(),
            record: { id: "o1", _record_surface: "full" },
            drawer_id: "o1",
            background_full_failed: false,
            workflow_v1: true,
            above_fold_locked: false,
            first_paint_gates_active: false,
            enrichment_layout_ready: true,
            below_fold_enrichment_ready: true,
            task_assist_enabled: true,
        });
        expect(pending.above_fold.inquiry_summary?.column_mode).toBe("two");
        expect(full.above_fold.inquiry_summary?.column_mode).toBe("two");
        expect(pending.above_fold.inquiry_summary?.show_right_column).toBe(
            full.above_fold.inquiry_summary?.show_right_column
        );
    });

    it("compileJobDrawerShell fixes section order from shell not runtime discovery", () => {
        const shell = compileJobDrawerShell({ tabs: ["overview"] });
        const keys = shell.overview_sections.map((s) => s.key);
        expect(keys[0]).toBe("property_service_v2");
        expect(keys).toContain("communications_canonical_embed");
    });
});
