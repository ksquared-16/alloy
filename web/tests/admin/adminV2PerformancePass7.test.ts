import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    assessOpportunityAboveFoldPresentationReady,
    isOpportunityAboveFoldPresentationReady,
} from "@/lib/admin/drawer/opportunityAboveFoldPresentationReady";
import type { RecordDrawerShellContract } from "@/lib/adminV2/shellContracts/types";
import {
    displaySafeLabel,
    isRawInternalDisplayValue,
    opportunityLocationDisplayLabelSafe,
    opportunityStatusDisplayLabelSafe,
} from "@/lib/admin/drawer/opportunityRawValueGuard";
import { resolveOpportunityStatusDisplay } from "@/lib/admin/drawer/opportunityStatusDisplayResolve";
import { logDrawerPresentationGate, logDrawerRawValueGuard } from "@/lib/perf/drawerPresentationGatePerf";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("AdminV2 performance pass 7 — presentation gate", () => {
    it("raw status key suppressed before label ready", () => {
        expect(isRawInternalDisplayValue("tour_scheduled")).toBe(true);
        expect(opportunityStatusDisplayLabelSafe({ status_key: "tour_scheduled", _status_display: "tour_scheduled" })).toBeNull();
        expect(
            opportunityStatusDisplayLabelSafe(
                { status_key: "tour_scheduled", _status_display: "Tour Scheduled" },
                null
            )
        ).toBe("Tour Scheduled");
        expect(
            resolveOpportunityStatusDisplay({
                statusKey: "tour_scheduled",
                statusDefs: [{ status_key: "tour_scheduled", status_label: "Tour Scheduled" }],
            })
        ).toBe("Tour Scheduled");
    });

    it("raw location UUID suppressed before label ready", () => {
        const uuid = "a1111111-1111-4111-8111-111111111111";
        expect(opportunityLocationDisplayLabelSafe({ location_id: uuid })).toBeNull();
        expect(
            opportunityLocationDisplayLabelSafe(
                { location_id: uuid, _location_label: "North Campus" },
                null
            )
        ).toBe("North Campus");
        expect(displaySafeLabel(uuid, { field: "location_id", suppressLog: true })).toBeNull();
    });

    it("overview does not reveal until presentation-ready", () => {
        const record = {
            id: "o1",
            status_key: "tour_scheduled",
            _status_display: "tour_scheduled",
            location_id: "a1111111-1111-4111-8111-111111111111",
            _record_surface: "drawer_primary",
            _identity: { household: { label: "Chen family" } },
            _activity_signal: { last_activity_summary: "Note added" },
        };
        const shell = {
            entity_type: "opportunity" as const,
            inquiry_drawer_mode: "workflow_v1" as const,
            layout_version: "1",
            tabs: ["overview"] as const,
            overview_sections: [],
            section_slots: [{ section_key: "inquiry_children", lifecycle: "reserved_placeholder" as const }],
            geometry: {
                header_actions_rail_min_h_class: "min-h-[2.25rem]",
                inquiry_children_min_h_class: "min-h-[8rem]",
                summary_right_column_reserved: true,
                family_contacts_in_summary: true,
                oper_strip_slot: false,
                communications_tab: false,
            },
            layout_config: {},
        } as RecordDrawerShellContract;
        const blocked = assessOpportunityAboveFoldPresentationReady(record, shell, {
            family_contacts_in_summary: true,
            summary_right_column_reserved: true,
            what_matters_reserved: true,
            inquiry_children_section_visible: true,
            tour_bookings_fetch_armed: true,
            tour_bookings_fetch_settled: true,
        });
        expect(blocked.ready).toBe(false);
        expect(blocked.missing).toContain("status_label");
        expect(blocked.missing).toContain("location_label");

        const ready = assessOpportunityAboveFoldPresentationReady(
            {
                ...record,
                _status_display: "Tour Scheduled",
                _location_label: "North Campus",
                _inquiry_children: [{ person_id: "c1", display_name: "Child", desired_program_label: "Toddler" }],
            },
            shell,
            {
                family_contacts_in_summary: true,
                summary_right_column_reserved: true,
                what_matters_reserved: false,
                inquiry_children_section_visible: true,
                tour_bookings_fetch_armed: false,
                tour_bookings_fetch_settled: false,
            }
        );
        expect(ready.ready).toBe(true);
        expect(
            isOpportunityAboveFoldPresentationReady(
                { id: "o1", status_key: "tour_scheduled", _status_display: "tour_scheduled" },
                shell,
                { what_matters_reserved: false }
            )
        ).toBe(false);
    });

    it("tour slot waits for bookings settle when what matters is reserved", () => {
        const record = {
            id: "o1",
            status_key: "tour_scheduled",
            _status_display: "Tour Scheduled",
            _location_label: "North Campus",
            metadata: { tour_date: "2026-06-01", tour_time: "10:00" },
            _identity: { household: { label: "Chen family" } },
            _activity_signal: {},
            _inquiry_children: [{ person_id: "c1", display_name: "Child", desired_program_label: "Toddler" }],
        };
        const shell = {
            entity_type: "opportunity" as const,
            inquiry_drawer_mode: "workflow_v1" as const,
            layout_version: "1",
            tabs: ["overview"] as const,
            overview_sections: [],
            section_slots: [],
            geometry: {
                header_actions_rail_min_h_class: "min-h-[2.25rem]",
                inquiry_children_min_h_class: "min-h-[8rem]",
                summary_right_column_reserved: true,
                family_contacts_in_summary: true,
                oper_strip_slot: false,
                communications_tab: false,
            },
            layout_config: {},
        } as RecordDrawerShellContract;
        const pending = assessOpportunityAboveFoldPresentationReady(record, shell, {
            what_matters_reserved: true,
            tour_bookings_fetch_armed: false,
            tour_bookings_fetch_settled: false,
        });
        expect(pending.ready).toBe(false);
        expect(pending.missing).toContain("tour_summary");
        expect(pending.skeleton_sections).toContain("what_matters_tour");
    });

    it("primary entity resolves display labels on drawer_primary", () => {
        const entity = read("lib/admin/opportunityEntityRecord.ts");
        expect(entity).toContain("resolveOpportunityStatusDisplay");
        expect(entity).toContain("location_lookup_ms");
        expect(entity).not.toMatch(/vis\._location_label = null;\s*\n\s*\} else \{\s*\n\s*vis\._location_id = null/);
    });

    it("presentation and raw-value perf logs exist", () => {
        logDrawerPresentationGate({
            opportunity_id: "o1",
            ready: false,
            missing: ["status_label"],
            raw_value_suppressed: ["status_key"],
            skeleton_sections: ["what_matters_tour"],
        });
        logDrawerRawValueGuard({ field: "status_key", raw_value: "tour_scheduled", suppressed: true });
        expect(read("lib/perf/drawerPresentationGatePerf.ts")).toContain("perfDrawer");
        expect(read("lib/perf/drawerPresentationGatePerf.ts")).toContain("presentation_gate");
    });
});
