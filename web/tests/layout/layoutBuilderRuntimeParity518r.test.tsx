/**
 * Sprint 5.18R — final manual QA blockers.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { patchCustomBlockConfig } from "@/lib/layout/layoutEditorFreeformBlocks";
import { resolveLayoutRuntimeBlockEditMode } from "@/lib/layout/layoutEditorBlockConfig";
import { collectLayoutRuntimeOpportunityNativeBaseline } from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { buildLayoutRuntimeOpportunityNativePatch } from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { resolveLeadDrawerCommandHeaderMeta } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";
import { mergeOpportunityLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergeOpportunityLayoutRuntimeWidgetRecord";
import type { LayoutItem } from "@/lib/layout/layoutV2";

describe("layoutBuilderRuntimeParity 5.18R", () => {
    it("buildLayoutRuntimeOpportunityNativePatch emits location_id when draft changes", () => {
        const baseline = {
            "opportunity.location_id": "",
        };
        const draft = {
            "opportunity.location_id": "11111111-1111-4111-8111-111111111111",
        };
        expect(buildLayoutRuntimeOpportunityNativePatch(baseline, draft)).toEqual({
            location_id: "11111111-1111-4111-8111-111111111111",
        });
    });

    it("confirmOnly save uses pre-optimistic baseline so PATCH is not empty after applyOptimistic", () => {
        const preOptimisticBaseline = {
            "opportunity.location_id": "",
        };
        const postOptimisticBaseline = {
            "opportunity.location_id": "11111111-1111-4111-8111-111111111111",
        };
        const draft = {
            "opportunity.location_id": "11111111-1111-4111-8111-111111111111",
        };

        expect(buildLayoutRuntimeOpportunityNativePatch(postOptimisticBaseline, draft)).toEqual({});
        expect(buildLayoutRuntimeOpportunityNativePatch(preOptimisticBaseline, draft)).toEqual({
            location_id: "11111111-1111-4111-8111-111111111111",
        });
    });

    it("dirty baseline collection includes opportunity.location_id", () => {
        const baseline = collectLayoutRuntimeOpportunityNativeBaseline({
            id: "opp-1",
            location_id: "22222222-2222-4222-8222-222222222222",
            "opportunity.location": "South Campus",
        });
        expect(baseline["opportunity.location_id"]).toBe("22222222-2222-4222-8222-222222222222");
    });

    it("resolveLayoutRuntimeBlockEditMode defaults to edit_button for editable related lists", () => {
        const item: LayoutItem = {
            id: "rl-1",
            kind: "related_list",
            refKey: "enrollment_children",
            source: "enrollment_children",
            displayMode: "table",
            columns: [
                {
                    refKey: "inquiry_child.first_name",
                    label: "First name",
                    editable: true,
                },
            ],
        };
        expect(resolveLayoutRuntimeBlockEditMode(item, {})).toBe("edit_button");
    });

    it("resolveLayoutRuntimeBlockEditMode stays display_only when no editable descendants", () => {
        const item: LayoutItem = {
            id: "rl-2",
            kind: "related_list",
            refKey: "enrollment_children",
            source: "enrollment_children",
            displayMode: "table",
            columns: [
                {
                    refKey: "inquiry_child.first_name",
                    label: "First name",
                },
            ],
        };
        expect(resolveLayoutRuntimeBlockEditMode(item, {})).toBe("display_only");
    });

    it("header meta uses enriched layout record with phone, child count, and location", () => {
        const layoutRecord = {
            "person.primary_phone": "1231231255",
            "person.primary_email": "family@example.com",
            enrollment_children: [{ id: "c1" }, { id: "c2" }],
            "opportunity.location": "North Campus",
            _customer_name: "Rivera Family",
        };
        const vmRecord = {
            "person.primary_phone": "",
            enrollment_children: [],
        };
        const headerRecord = mergeOpportunityLayoutRuntimeWidgetRecord(layoutRecord, vmRecord);
        const meta = resolveLeadDrawerCommandHeaderMeta(headerRecord, {
            title: "Rivera Family",
            locationLabel: "North Campus",
        });
        expect(meta.metaRow).toContain("(123) 123-1255");
        expect(meta.metaRow).toContain("family@example.com");
        expect(meta.metaRow).toContain("2 children");
        expect(meta.metaRow).toContain("North Campus");
        expect(meta.metaRow).not.toContain("Rivera Family");
        expect(meta.contactRow).toBeNull();
    });

    it("patchCustomBlockConfig preserves spaces and empty intermediate block titles", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections.find((s) => s.rows.some((r) => r.columns.some((c) => c.items.some((i) => i.kind === "field_group"))));
        expect(section).toBeTruthy();
        const block = section!.rows.flatMap((r) => r.columns.flatMap((c) => c.items)).find((i) => i.kind === "field_group");
        expect(block).toBeTruthy();

        const spaced = patchCustomBlockConfig(doc, block!.id, { title: "Household Profile Details" });
        const spacedBlock = spaced.sections
            .flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.items)))
            .find((i) => i.id === block!.id);
        expect(spacedBlock?.label).toBe("Household Profile Details");

        const cleared = patchCustomBlockConfig(spaced, block!.id, { title: "" });
        const clearedBlock = cleared.sections
            .flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.items)))
            .find((i) => i.id === block!.id);
        expect(clearedBlock?.label).toBe("");
    });
});
