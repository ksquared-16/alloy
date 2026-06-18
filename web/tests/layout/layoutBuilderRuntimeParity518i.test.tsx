/**
 * Sprint 5.18I — drawer visual parity + builder usability polish.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerOverviewPanelShell from "@/components/layout/DrawerOverviewPanelShell";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import { formatLayoutRuntimeStatusLabel } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";
import { resolveLayoutRuntimeRepeaterFieldValue } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";

describe("layoutBuilderRuntimeParity 5.18I", () => {
    it("stretches drawer overview panel shell to fill peer row height", () => {
        const html = renderToStaticMarkup(
            <DrawerOverviewPanelShell sectionKey="household_contact" title="Household">
                <p>Body</p>
            </DrawerOverviewPanelShell>,
        );
        expect(html).toContain("flex h-full min-h-0 flex-col");
        expect(html).toContain("flex-1");
    });

    it("resolves opportunity status keys from configured vocabulary", () => {
        expect(formatLayoutRuntimeStatusLabel("new_inquiry", { refKey: "opportunity.status_key", renderHint: "status" })).toBe(
            "New Lead",
        );
        const resolved = resolveItemValue({ status_key: "tour_scheduled" }, {
            id: "status",
            kind: "field",
            refKey: "opportunity.status_key",
            renderHint: "status",
        });
        expect(resolved.display).toBe("Tour Scheduled");
    });

    it("does not bleed primary contact into secondary repeater fields", () => {
        const row = {
            "person.primary_contact_name": "Alex Primary",
            "person.primary_phone": "555-111-1111",
            "person.secondary_contact_name": "",
            "person.secondary_phone": "",
        };
        const resolved = resolveLayoutRuntimeRepeaterFieldValue(row, "person.secondary_phone", { renderHint: "phone" });
        expect(resolved.isPlaceholder).toBe(true);
        expect(resolved.display).toBeNull();
    });

    it("exposes contact role groups in the opportunity drawer field picker", () => {
        const groups = buildOpportunityDrawerEditorFieldPickerGroups();
        const labels = groups.map((group) => group.entityLabel);
        expect(labels).toContain("Primary Contact");
        expect(labels).toContain("Additional Parents");
        expect(labels).toContain("Billing/Payer Contact");
        expect(labels).toContain("Emergency Contact");
        const parents = groups.find((group) => group.entityLabel === "Additional Parents");
        expect(parents?.fields.some((field) => field.refKey === "person.secondary_contact_name")).toBe(true);
    });
});
