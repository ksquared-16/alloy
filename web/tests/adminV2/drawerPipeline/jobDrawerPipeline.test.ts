import { describe, expect, it } from "vitest";
import {
    buildJobDrawerPipelineState,
    compileJobDrawerShell,
    JOB_DEFERRED_OVERVIEW_SECTION_KEYS,
} from "@/lib/adminV2/drawerPipeline";
import { drawerRelationshipsFullHydrateFailed } from "@/lib/adminV2/drawerPipeline/enrichmentState";

describe("compileJobDrawerShell", () => {
    it("freezes v2 overview sections and reserves header signals", () => {
        const shell = compileJobDrawerShell({ tabs: ["overview", "related", "activity"] });
        expect(shell.entity_type).toBe("job");
        expect(shell.overview_sections.length).toBeGreaterThan(0);
        expect(shell.geometry.header_signals_reserved).toBe(true);
        const comms = shell.section_slots.find((s) => s.section_key === "communications_canonical_embed");
        expect(comms?.lifecycle).toBe("below_fold_deferred");
    });
});

describe("buildJobDrawerPipelineState", () => {
    it("keeps header signal structure while full hydrate is pending", () => {
        const state = buildJobDrawerPipelineState({
            tabs: ["overview"],
            record: { id: "job-1", _record_surface: "drawer_primary", title: "Test" },
            drawer_id: "job-1",
            schedules: [],
            payment_status_label: "Unpaid",
            payment_is_paid: false,
            payment_failed: false,
            cleaning_record_modal: false,
        });
        expect(state.above_fold.header_signals?.reserved).toBe(true);
        expect(state.above_fold.header_signals?.value_phase).toBe("value");
        expect(state.above_fold.header_signals?.lines?.paymentLabel).toBe("Unpaid");
        expect(drawerRelationshipsFullHydrateFailed(state.enrichment)).toBe(false);
    });

    it("does not warn on pending full hydrate", () => {
        const state = buildJobDrawerPipelineState({
            tabs: ["overview"],
            record: { id: "job-1", _record_surface: "drawer_primary" },
            drawer_id: "job-1",
            schedules: [],
            payment_status_label: "—",
            payment_is_paid: false,
            payment_failed: false,
            cleaning_record_modal: false,
        });
        expect(state.enrichment.full_pending).toBe(true);
        expect(drawerRelationshipsFullHydrateFailed(state.enrichment)).toBe(false);
    });

    it("marks deferred comms section skeleton until full", () => {
        const state = buildJobDrawerPipelineState({
            tabs: ["overview"],
            record: { id: "job-1", _record_surface: "drawer_visible" },
            drawer_id: "job-1",
            schedules: [],
            payment_status_label: "—",
            payment_is_paid: false,
            payment_failed: false,
            cleaning_record_modal: false,
        });
        const comms = state.above_fold.sections.find((s) => s.section_key === "communications_canonical_embed");
        expect(JOB_DEFERRED_OVERVIEW_SECTION_KEYS.has("communications_canonical_embed")).toBe(true);
        expect(comms?.value_phase).toBe("skeleton");
    });

    it("stable section keys before and after full surface", () => {
        const primary = buildJobDrawerPipelineState({
            tabs: ["overview"],
            record: { id: "job-1", _record_surface: "drawer_primary" },
            drawer_id: "job-1",
            schedules: [{ start_at: "2030-01-01T12:00:00Z" }],
            payment_status_label: "Paid",
            payment_is_paid: true,
            payment_failed: false,
            cleaning_record_modal: false,
        });
        const full = buildJobDrawerPipelineState({
            tabs: ["overview"],
            record: { id: "job-1", _record_surface: "full" },
            drawer_id: "job-1",
            schedules: [{ start_at: "2030-01-01T12:00:00Z" }],
            payment_status_label: "Paid",
            payment_is_paid: true,
            payment_failed: false,
            cleaning_record_modal: false,
        });
        const primaryKeys = primary.above_fold.sections.map((s) => s.section_key);
        const fullKeys = full.above_fold.sections.map((s) => s.section_key);
        expect(fullKeys).toEqual(primaryKeys);
        expect(primary.above_fold.header_signals?.lines?.scheduleLabel).toBe(full.above_fold.header_signals?.lines?.scheduleLabel);
    });
});
