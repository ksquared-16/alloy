/**
 * Sprint 5.18AA — related-list edit preserves display layout.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LeadEnrollmentCardList from "@/components/layout/lead/LeadEnrollmentCardList";
import LeadEnrollmentRepeaterFieldCell from "@/components/layout/lead/LeadEnrollmentRepeaterFieldCell";
import LayoutRuntimeInlineEditFieldControl from "@/components/layout/LayoutRuntimeInlineEditFieldControl";
import { LayoutRuntimeBlockEditProvider } from "@/components/layout/LayoutRuntimeBlockEditContext";
import type { LayoutItem } from "@/lib/layout/layoutV2";

function childrenCardListItem(): LayoutItem {
    return {
        id: "rl-children",
        kind: "related_list",
        refKey: "children",
        source: "children",
        displayMode: "table",
        metadata: {
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

describe("layoutBuilderRuntimeParity 5.18AA", () => {
    it("uses one shared inline field cell for display and edit — no separate edit renderer", () => {
        const listSource = readFileSync(
            resolve(__dirname, "../../components/layout/lead/LeadEnrollmentCardList.tsx"),
            "utf8",
        );
        const metaSource = readFileSync(
            resolve(__dirname, "../../components/layout/lead/LeadEnrollmentCardMetaLines.tsx"),
            "utf8",
        );
        expect(listSource).toContain("LeadEnrollmentRepeaterFieldCell");
        expect(listSource).not.toContain("adminv2-drawer-enrollment-field-grid");
        expect(listSource).not.toContain("flex flex-col gap-0.5");
        expect(metaSource).toContain("LeadEnrollmentRepeaterFieldCell");
        expect(metaSource).not.toContain("MetaInlineField");
    });

    it("inline-cell variant keeps controls on same line as label", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimeInlineEditFieldControl
                refKey="child.date_of_birth"
                value="2021-08-14"
                onChange={() => {}}
                variant="inline-cell"
            />,
        );
        expect(html).toContain('data-layout-runtime-field-variant="inline-cell"');
        expect(html).toContain("w-auto");
        expect(html).not.toContain("w-full");
    });

    it("configured row template uses flex-wrap lines in display and edit", () => {
        const item = childrenCardListItem();
        const html = renderToStaticMarkup(
            <LayoutRuntimeBlockEditProvider editMode="edit_button">
                <LeadEnrollmentCardList
                    item={item}
                    columns={item.columns!}
                    rows={[
                        {
                            id: "child-1",
                            "child.id": "child-1",
                            "child.name": "Emyrson Wright",
                            "child.dob_age": "4y",
                            "child.date_of_birth": "2021-08-14",
                            "child.status": "new_lead",
                        },
                    ]}
                    anchorRecord={{}}
                    canMutate
                />
            </LayoutRuntimeBlockEditProvider>,
        );
        expect(html).toContain('data-child-row-template-row="0"');
        expect(html).toContain('data-enrollment-inline-field="true"');
        expect(html).not.toContain('data-enrollment-field-editing="true"');
    });

    it("LeadEnrollmentRepeaterFieldCell swaps only the value in-place when editing", () => {
        const html = renderToStaticMarkup(
            <LeadEnrollmentRepeaterFieldCell
                item={childrenCardListItem()}
                col={{ refKey: "child.date_of_birth", label: "DOB", editable: true }}
                row={{ "child.date_of_birth": "2021-08-14" }}
                rowKey="row-1"
                anchorRecord={{}}
                isEditing={false}
            />,
        );
        expect(html).toContain('data-enrollment-inline-field="true"');
        expect(html).toContain("DOB");
        expect(html).toMatch(/Aug 14, 2021|2021-08-14/);
        expect(html).not.toContain('data-enrollment-field-editing="true"');
    });

    it("doctrine documents same-template related-list edit", () => {
        const doctrine = readFileSync(
            resolve(__dirname, "../../../docs/platform/operator/experience-builder-doctrine.md"),
            "utf8",
        );
        expect(doctrine).toContain("LeadEnrollmentRepeaterFieldCell");
        expect(doctrine).toContain("inline-cell");
        expect(doctrine).toContain("No separate edit layout");
    });
});
