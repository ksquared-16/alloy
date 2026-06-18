/**
 * Sprint 5.18J — final runtime parity blockers.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerOverviewPanelShell from "@/components/layout/DrawerOverviewPanelShell";
import LeadOperatingSummaryCard from "@/components/layout/lead/LeadOperatingSummaryCard";
import { CheckSquare2 } from "lucide-react";
import {
    clampLayoutBuilderInspectorRailWidth,
    readLayoutBuilderInspectorRailWidth,
    writeLayoutBuilderInspectorRailWidth,
    LAYOUT_BUILDER_INSPECTOR_RAIL_MIN_PX,
    LAYOUT_BUILDER_INSPECTOR_RAIL_MAX_PX,
} from "@/lib/layout/layoutBuilderInspectorRailWidth";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { formatLayoutRuntimeStatusLabel } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";
import {
    overlayLayoutEditorContactBlockRecord,
    resolveLayoutEditorContactBlockPerson,
} from "@/lib/layout/runtime/resolveLayoutEditorContactBlockRecord";
import { resolveLayoutRuntimeRepeaterFieldValue } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";

describe("layoutBuilderRuntimeParity 5.18J", () => {
    it("clamps inspector rail width within bounds", () => {
        expect(clampLayoutBuilderInspectorRailWidth(700)).toBe(LAYOUT_BUILDER_INSPECTOR_RAIL_MAX_PX);
        expect(clampLayoutBuilderInspectorRailWidth(200)).toBe(LAYOUT_BUILDER_INSPECTOR_RAIL_MIN_PX);
    });

    it("persists inspector rail width when browser storage is available", () => {
        const data: Record<string, string> = {};
        const mockStorage = {
            getItem: (key: string) => data[key] ?? null,
            setItem: (key: string, value: string) => {
                data[key] = value;
            },
        };
        vi.stubGlobal("window", {
            localStorage: mockStorage,
            sessionStorage: mockStorage,
        });
        writeLayoutBuilderInspectorRailWidth(700);
        expect(readLayoutBuilderInspectorRailWidth()).toBe(LAYOUT_BUILDER_INSPECTOR_RAIL_MAX_PX);
        vi.unstubAllGlobals();
    });

    it("renders pine drawer overview panel shell classes in runtime", () => {
        const html = renderToStaticMarkup(
            <DrawerOverviewPanelShell sectionKey="household_contact" title="Household">
                <p>Body</p>
            </DrawerOverviewPanelShell>,
        );
        expect(html).toContain("border-l-alloy-juniper/70");
        expect(html).toContain("from-emerald-50/70");
    });

    it("uses enrollment status vocabulary for child status fields", () => {
        expect(
            formatLayoutRuntimeStatusLabel("waitlisted", {
                refKey: "inquiry_child.outcome_status_key",
                renderHint: "status",
            }),
        ).toBe("Waitlisted");
        expect(
            formatLayoutRuntimeStatusLabel("new_inquiry", {
                refKey: "inquiry_child.outcome_status_key",
                renderHint: "status",
            }),
        ).toBeNull();
        expect(
            formatLayoutRuntimeStatusLabel("new_inquiry", {
                refKey: "opportunity.status_key",
                renderHint: "status",
            }),
        ).toBe("New Lead");
    });

    it("resolves additional parents from household relationships without duplicating primary", () => {
        const record = {
            id: "opp-1",
            customer_id: "cust-1",
            opportunities: { primary_person_id: "p-primary" },
            _opportunity_persons: [
                { person_id: "p-primary", role_type: "primary_contact", name: "Alex Lyons", phone: "111", email: "a@test.com" },
                { person_id: "p-parent", role_type: "parent", name: "Jamie Lyons", phone: "222", email: "j@test.com" },
                { person_id: "p-emergency", role_type: "emergency_contact", name: "Chris Lyons", phone: "333", email: "c@test.com" },
            ],
        };

        const primary = resolveLayoutEditorContactBlockPerson(record, "primary");
        const parents = resolveLayoutEditorContactBlockPerson(record, "parents", {
            excludedPersonIds: new Set([primary?.personId ?? ""]),
        });
        const emergency = resolveLayoutEditorContactBlockPerson(record, "emergency", {
            excludedPersonIds: new Set([primary?.personId ?? "", parents?.personId ?? ""]),
        });

        expect(primary?.displayName).toBe("Alex Lyons");
        expect(parents?.displayName).toBe("Jamie Lyons");
        expect(emergency?.displayName).toBe("Chris Lyons");

        const parentOverlay = overlayLayoutEditorContactBlockRecord(record, "parents", parents);
        expect(parentOverlay["person.secondary_contact_name"]).toBe("Jamie Lyons");
        expect(parentOverlay["person.secondary_email"]).toBe("j@test.com");
    });

    it("does not fall back to primary phone for empty secondary repeater fields", () => {
        const row = {
            "person.primary_contact_name": "Alex Primary",
            "person.primary_phone": "555-111-1111",
            "person.secondary_contact_name": "",
            "person.secondary_phone": "",
        };
        const resolved = resolveLayoutRuntimeRepeaterFieldValue(row, "person.secondary_phone", { renderHint: "phone" });
        expect(resolved.isPlaceholder).toBe(true);
    });

    it("applies KPI icon tone classes from configured tone", () => {
        const html = renderToStaticMarkup(
            <LeadOperatingSummaryCard title="Current Work" icon={<CheckSquare2 className="h-3.5 w-3.5" />} accent="red">
                <p>Summary</p>
            </LeadOperatingSummaryCard>,
        );
        expect(html).toContain('data-layout-runtime-widget-tone="red"');
        expect(html).toContain("text-red-600/85");
        expect(html).toContain("border-l-red-500/70");
    });

    it("exposes relationship contact groups in field picker", () => {
        const groups = buildOpportunityDrawerEditorFieldPickerGroups();
        expect(groups.map((group) => group.entityLabel)).toContain("Additional Parents");
    });
});
