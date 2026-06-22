/**
 * Sprint 5.18P — final drawer config polish before surface cloning.
 */

import { describe, expect, it } from "vitest";
import { layoutRuntimeBlockAllowsFieldEdit } from "@/components/layout/LayoutRuntimeBlockEditContext";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";
import { resolveLayoutRuntimeFieldDisplayLabel } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldDisplayLabel";
import { readLayoutRuntimeRepeaterFieldRaw } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";
import { formatLayoutRuntimeRepeaterColumnDisplay } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { resolveLeadDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";
import { applyLayoutRuntimeDraftToRecord } from "@/lib/layout/runtime/applyLayoutRuntimeDraftToRecord";
import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";

describe("layoutBuilderRuntimeParity 5.18P", () => {
    it("inline editable blocks require explicit edit mode before field inputs render", () => {
        expect(
            layoutRuntimeBlockAllowsFieldEdit({
                editMode: "inline_editable",
                blockEditing: false,
                setBlockEditing: () => {},
            }),
        ).toBe(false);
        expect(
            layoutRuntimeBlockAllowsFieldEdit({
                editMode: "inline_editable",
                blockEditing: true,
                setBlockEditing: () => {},
            }),
        ).toBe(true);
    });

    it("prefers hydrated child.location label over aliased location_id uuid", () => {
        const row = {
            "child.location": "North Campus",
            "inquiry_child.location_id": "11111111-1111-4111-8111-111111111111",
        };
        expect(readLayoutRuntimeRepeaterFieldRaw(row, "child.location")).toBe("North Campus");
        const col: LayoutCollectionColumn = { refKey: "child.location", label: "School" };
        expect(formatLayoutRuntimeRepeaterColumnDisplay(row, col)).toBe("North Campus");
    });

    it("resolves enrollment status keys to configured labels", () => {
        const label = resolveLayoutRuntimeFieldDisplayLabel({
            refKey: "inquiry_child.outcome_status_key",
            rawValue: "active_enrollment",
            row: { "child.status": "Active Enrollment" },
            renderHint: "status",
        });
        expect(label).toBe("Active Enrollment");
    });

    it("enrollment status uses child enrollment domain control — not opportunity status", () => {
        const control = resolveLayoutRuntimeFieldControl("inquiry_child.outcome_status_key");
        expect(control.controlType).toBe("select");
        expect(control.option_source).toBe("enrollment_child_status");
    });

    it("optimistic child row draft syncs location label companion after save patch", () => {
        const record = {
            children: [
                {
                    customer_member_id: "cm-1",
                    "inquiry_child.location_id": "",
                    "child.location": "",
                },
            ],
        };
        const rowKey = "children:0:cm-1";
        const baseline = {
            [`${rowKey}::inquiry_child.location_id`]: "",
            [`${rowKey}::child.location`]: "",
        };
        const draft = {
            [`${rowKey}::inquiry_child.location_id`]: "11111111-1111-4111-8111-111111111111",
            [`${rowKey}::child.location`]: "North Campus",
        };
        const next = applyLayoutRuntimeDraftToRecord({
            record,
            baseline,
            draft,
            rowKeys: [rowKey],
            rows: [record.children![0] as Record<string, unknown>],
        });
        const child = (next.children as Record<string, unknown>[])[0]!;
        expect(child["inquiry_child.location_id"]).toBe("11111111-1111-4111-8111-111111111111");
        expect(child["child.location"]).toBe("North Campus");
        expect(child.location_id).toBe("11111111-1111-4111-8111-111111111111");
    });

    it("header meta lists primary contact, email, phone, child count, and location without duplicate household title", () => {
        const meta = resolveLeadDrawerCommandHeaderMeta(
            {
                "person.primary_contact_name": "Alex Lyons",
                "person.primary_email": "alex.lyons@test.com",
                "person.primary_phone": "(123) 123-1255",
                children: [{ "child.name": "Sam Lyons" }],
                _customer_name: "Lyons Family",
            },
            { title: "Lyons Family", locationLabel: "North Campus" },
        );
        expect(meta.metaRow).toContain("Alex Lyons");
        expect(meta.metaRow).toContain("alex.lyons@test.com");
        expect(meta.metaRow).toContain("(123) 123-1255");
        expect(meta.metaRow).toContain("1 child");
        expect(meta.metaRow).toContain("North Campus");
        expect(meta.metaRow?.match(/Lyons Family/g)?.length ?? 0).toBe(0);
    });
});
