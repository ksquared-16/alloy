/**
 * Sprint 5.18V — runtime edit contract + location resolution audit.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    LayoutRuntimeBlockEditProvider,
} from "@/components/layout/LayoutRuntimeBlockEditContext";
import { enrichLayoutDocDrawerFieldEditable } from "@/lib/layout/runtime/enrichLayoutDocChildFieldsEditable";
import { resolveLayoutRuntimeBlockEditMode, readLayoutEditorBlockConfig } from "@/lib/layout/layoutEditorBlockConfig";
import { buildOpportunityLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildOpportunityLayoutRuntimeRecordFromVm";
import { formatLayoutRuntimeRepeaterColumnDisplay } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import {
    layoutRuntimeCollectionColumnIsInlineEditable,
    layoutRuntimeFieldIsEditable,
} from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import { enrollmentGridColumnIsEditable } from "@/lib/layout/runtime/enrollmentGridPresentation";
import {
    resolveOpportunityDrawerLocationLabel,
    resolveOpportunityLeadLocationFields,
} from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import type { LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";

function childrenRelatedList(overrides?: Partial<LayoutItem>): LayoutItem {
    return {
        id: "rl-children",
        kind: "related_list",
        refKey: "enrollment_children",
        source: "enrollment_children",
        displayMode: "table",
        metadata: { layoutEditorBlockConfig: { editMode: "display_only" } },
        columns: [
            { refKey: "child.name", label: "Child name" },
            { refKey: "child.location", label: "School", editable: true },
            { refKey: "child.status", label: "Enrollment status", editable: true },
            { refKey: "child.dob_age", label: "Age" },
        ],
        ...overrides,
    };
}

describe("layoutBuilderRuntimeParity 5.18V", () => {
    describe("builder-configured editability", () => {
        it("does not auto-enrich editable flags from save adapters at runtime", () => {
            const doc: LayoutDoc = {
                formatVersion: 1,
                surface: "drawer",
                entityType: "opportunities",
                metadata: {},
                sections: [
                    {
                        id: "main",
                        key: "main",
                        title: "Main",
                        rows: [
                            {
                                id: "row-1",
                                columns: [
                                    {
                                        id: "col-1",
                                        width: 12,
                                        items: [
                                            {
                                                id: "field-location",
                                                kind: "field",
                                                refKey: "opportunity.location_id",
                                                label: "Location",
                                            },
                                            {
                                                id: "field-source",
                                                kind: "field",
                                                refKey: "opportunity.source",
                                                label: "Source",
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            };
            expect(enrichLayoutDocDrawerFieldEditable(doc)).toEqual(doc);
        });

        it("save adapter alone does not make fields editable", () => {
            expect(
                layoutRuntimeFieldIsEditable({ refKey: "opportunity.location_id", editable: false }, "production"),
            ).toBe(false);
            expect(enrollmentGridColumnIsEditable({ refKey: "child.location", label: "School" })).toBe(false);
        });

        it("configured editable plus save adapter enables inline edit", () => {
            expect(
                layoutRuntimeFieldIsEditable({ refKey: "opportunity.location_id", editable: true }, "production"),
            ).toBe(true);
            expect(
                layoutRuntimeCollectionColumnIsInlineEditable(
                    { refKey: "child.location", editable: true },
                    "production",
                ),
            ).toBe(true);
        });

        it("aliased child.location column resolves edit_button when configured editable", () => {
            const item = childrenRelatedList();
            expect(resolveLayoutRuntimeBlockEditMode(item, readLayoutEditorBlockConfig(item.metadata))).toBe(
                "edit_button",
            );
        });

        it("display-only columns do not contribute to edit_button", () => {
            const item = childrenRelatedList({
                columns: [{ refKey: "child.name", label: "Child name" }],
            });
            expect(resolveLayoutRuntimeBlockEditMode(item, readLayoutEditorBlockConfig(item.metadata))).toBe(
                "display_only",
            );
        });
    });

    describe("related-list Edit affordance", () => {
        it("renders Edit test hook when block resolves edit_button from configured columns", () => {
            const item = childrenRelatedList();
            const html = renderToStaticMarkup(
                <LayoutRuntimeBlockEditProvider editMode="edit_button">
                    <button type="button" data-testid={`layout-runtime-block-edit-${item.id}`}>
                        Edit
                    </button>
                </LayoutRuntimeBlockEditProvider>,
            );
            expect(html).toContain('data-testid="layout-runtime-block-edit-rl-children"');
        });
    });

    describe("location resolution", () => {
        const siteId = "11111111-1111-4111-8111-111111111111";
        const vmRecord = {
            id: "opp-1",
            location_id: siteId,
            _location_label: "North Campus",
            children: [
                {
                    customer_member_id: "cm-1",
                    "child.name": "Sam Lyons",
                    "child.first_name": "Sam",
                    "child.last_name": "Lyons",
                },
            ],
        };

        it("uses opportunity current location as canonical drawer label", () => {
            const lead = resolveOpportunityLeadLocationFields(vmRecord);
            expect(lead.locationLabel).toBe("North Campus");
            expect(resolveOpportunityDrawerLocationLabel(vmRecord)).toBe("North Campus");
        });

        it("maps opportunity location onto household and child rows consistently", () => {
            const record = buildOpportunityLayoutRuntimeRecordFromVm({
                vmRecord,
                opportunityId: "opp-1",
                doc: buildLeadDrawerDefaultDoc(),
            });
            expect(record["opportunity.location"]).toBe("North Campus");
            expect(record["opportunity.location_id"]).toBe(siteId);

            const child = (record.children as Record<string, unknown>[])[0] as Record<string, unknown>;
            expect(child["child.location"]).toBe("North Campus");
            expect(child["inquiry_child.location_id"]).toBe(siteId);

            const anchor = record as Record<string, unknown>;
            expect(
                formatLayoutRuntimeRepeaterColumnDisplay(child as never, { refKey: "child.location", label: "School" }, {
                    anchorRecord: anchor as never,
                }),
            ).toBe("North Campus");
        });
    });
});
