/**
 * Sprint 5.18AB — active compact-summary related-list edit path + contact visibility.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LayoutRuntimeRelatedListCompactRows from "@/components/layout/LayoutRuntimeRelatedListCompactRows";
import LeadEnrollmentRepeaterFieldCell from "@/components/layout/lead/LeadEnrollmentRepeaterFieldCell";
import LayoutRuntimeDrawerEditProvider from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import {
    LayoutRuntimeBlockEditProvider,
} from "@/components/layout/LayoutRuntimeBlockEditContext";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import { resolveLayoutEditorContactBlockPerson } from "@/lib/layout/runtime/resolveLayoutEditorContactBlockRecord";
import type { LayoutItem } from "@/lib/layout/layoutV2";

function compactChildrenItem(): LayoutItem {
    return {
        id: "rl-children-compact",
        kind: "related_list",
        refKey: "children",
        source: "children",
        displayMode: "table",
        metadata: {
            layoutEditorRelatedListConfig: { presentationMode: "compact" },
            layoutEditorBlockConfig: {
                blockType: "child_row_template",
                childRowGroups: [
                    { columnIndices: [0, 1], columnCount: 2 },
                    { columnIndices: [2, 3, 4], columnCount: 3 },
                ],
            },
        },
        columns: [
            { refKey: "child.name", label: "Name" },
            { refKey: "child.dob_age", label: "Age" },
            { refKey: "child.date_of_birth", label: "DOB", editable: true },
            { refKey: "inquiry_child.desired_start_date", label: "Start Date", editable: true },
            { refKey: "child.status", label: "Status", editable: true },
        ],
    };
}

describe("layoutBuilderRuntimeParity 5.18AB", () => {
    it("compact summary active path uses LeadEnrollmentRepeaterFieldCell — not stacked LayoutRuntimeFieldInput", () => {
        const compactSource = readFileSync(
            resolve(__dirname, "../../components/layout/LayoutRuntimeRelatedListCompactRows.tsx"),
            "utf8",
        );
        expect(compactSource).toContain("LeadEnrollmentRepeaterFieldCell");
        expect(compactSource).not.toContain("LayoutRuntimeRelatedListCell");
        expect(compactSource).not.toContain("LayoutRuntimeFieldInput");
    });

    it("compact summary preserves flex-wrap row lines in display mode", () => {
        const item = compactChildrenItem();
        const html = renderToStaticMarkup(
            <LayoutRuntimeBlockEditProvider editMode="edit_button">
                <LayoutRuntimeRelatedListCompactRows
                    item={item}
                    columns={item.columns!}
                    rows={[
                        {
                            id: "child-1",
                            "child.id": "child-1",
                            "child.name": "Emyrson Wright",
                            "child.dob_age": "4y",
                            "child.date_of_birth": "2021-08-14",
                            "inquiry_child.desired_start_date": "2025-09-01",
                            "child.status": "new_lead",
                        },
                    ]}
                    anchorRecord={{}}
                />
            </LayoutRuntimeBlockEditProvider>,
        );
        expect(html).toContain('data-layout-runtime-related-list-compact="true"');
        expect(html).toContain('data-layout-runtime-compact-row-line="0"');
        expect(html).toContain('data-layout-runtime-compact-row-line="1"');
        expect(html).toContain('data-enrollment-inline-field="true"');
        expect(html).not.toContain('data-enrollment-field-editing="true"');
        expect(html).not.toContain("adminv2-drawer-enrollment-field-grid");
    });

    it("compact summary edit swaps value nodes to inline-cell controls on same row lines", () => {
        const item = compactChildrenItem();
        const html = renderToStaticMarkup(
            <LayoutRuntimeDrawerEditProvider record={{}}>
                <LeadEnrollmentRepeaterFieldCell
                    item={item}
                    col={{ refKey: "child.date_of_birth", label: "DOB", editable: true }}
                    row={{ "child.date_of_birth": "2021-08-14" }}
                    rowKey="child-1"
                    anchorRecord={{}}
                    isEditing
                />
            </LayoutRuntimeDrawerEditProvider>,
        );
        expect(html).toContain('data-enrollment-inline-field="true"');
        expect(html).toContain('data-enrollment-field-editing="true"');
        expect(html).toContain('data-layout-runtime-field-variant="inline-cell"');
        expect(html).toContain("DOB");
        expect(html).not.toContain("adminv2-drawer-enrollment-field-grid");
    });

    it("non-editable compact cells stay display-only during section edit", () => {
        const html = renderToStaticMarkup(
            <LeadEnrollmentRepeaterFieldCell
                item={compactChildrenItem()}
                col={{ refKey: "child.name", label: "Name", editable: false }}
                row={{ "child.name": "Emyrson Wright" }}
                rowKey="child-1"
                anchorRecord={{}}
                isEditing
            />,
        );
        expect(html).toContain("Emyrson Wright");
        expect(html).not.toContain('data-layout-runtime-field-variant="inline-cell"');
        expect(html).toContain('data-enrollment-field-editing="false"');
    });

    it("additional contact block visible when relationship exists but scalar is empty", () => {
        const record = {
            id: "opp-wright",
            customer_id: "cust-wright",
            opportunities: { primary_person_id: "p-justin" },
            "person.secondary_contact_name": "",
            _opportunity_persons: [
                { person_id: "p-justin", role_type: "primary_contact", name: "Justin Wright" },
                { person_id: "p-other", role_type: "associated", name: "Jordan Wright", phone: "222" },
            ],
        };
        expect(evaluateLayoutCondition(record, { type: "exists", path: "person.secondary_contact_name" })).toBe(false);
        const additional = resolveLayoutEditorContactBlockPerson(record, "secondary", {
            excludedPersonIds: new Set(["p-justin"]),
        });
        expect(additional?.displayName).toBe("Jordan Wright");
    });

    it("PlanView evaluates contact_block visibility from relationships when scalar exists check fails", () => {
        const planSource = readFileSync(
            resolve(__dirname, "../../components/layout/LayoutRuntimePlanView.tsx"),
            "utf8",
        );
        expect(planSource).toContain("evaluateLayoutItemVisibility");
        expect(planSource).toContain("resolveLayoutEditorContactBlockPerson(record, readLayoutEditorContactRole");
    });
});
