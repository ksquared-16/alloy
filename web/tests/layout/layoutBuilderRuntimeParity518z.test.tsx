/**
 * Sprint 5.18Z — inline edit visual polish + builder doctrine.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LayoutRuntimeInlineEditFieldControl from "@/components/layout/LayoutRuntimeInlineEditFieldControl";
import LayoutRuntimeFieldInput from "@/components/layout/LayoutRuntimeFieldInput";
import LeadEnrollmentCardList from "@/components/layout/lead/LeadEnrollmentCardList";
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

describe("layoutBuilderRuntimeParity 5.18Z", () => {
    it("inline edit field control uses compact inline variant", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimeInlineEditFieldControl refKey="child.date_of_birth" value="2021-08-14" onChange={() => {}} />,
        );
        expect(html).toContain('data-layout-runtime-field-variant="inline"');
        expect(html).toContain('text-[11px]');
        expect(html).toContain("h-6");
    });

    it("LayoutRuntimeFieldInput supports explicit inline variant", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimeFieldInput
                refKey="inquiry_child.location_id"
                value=""
                onChange={() => {}}
                variant="inline"
            />,
        );
        expect(html).toContain('data-layout-runtime-field-variant="inline"');
    });

    it("configured related-list rows preserve template grid during edit — no form grid", () => {
        const listSource = readFileSync(
            resolve(__dirname, "../../components/layout/lead/LeadEnrollmentCardList.tsx"),
            "utf8",
        );
        const cellSource = readFileSync(
            resolve(__dirname, "../../components/layout/lead/LeadEnrollmentRepeaterFieldCell.tsx"),
            "utf8",
        );
        expect(listSource).not.toContain("adminv2-drawer-enrollment-field-grid");
        expect(listSource).toContain("LeadEnrollmentRepeaterFieldCell");
        expect(cellSource).toContain("data-enrollment-inline-field");
    });

    it("editable cells use inline label+control layout in configured rows", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimeBlockEditProvider editMode="edit_button">
                <LeadEnrollmentCardList
                    item={childrenCardListItem()}
                    columns={childrenCardListItem().columns!}
                    rows={[
                        {
                            id: "child-1",
                            "child.id": "child-1",
                            "child.name": "Emyrson Wright",
                            "child.dob_age": "4y",
                            "child.date_of_birth": "2021-08-14",
                        },
                    ]}
                    anchorRecord={{}}
                    canMutate
                />
            </LayoutRuntimeBlockEditProvider>,
        );
        expect(html).toContain('data-enrollment-inline-field="true"');
        expect(html).toContain('data-child-row-template-row="0"');
        expect(html).toContain('data-child-row-template-row="1"');
    });

    it("section Edit button uses hover/focus/editing visibility contract", () => {
        const source = readFileSync(
            resolve(__dirname, "../../components/layout/LayoutRuntimePlanView.tsx"),
            "utf8",
        );
        expect(source).toContain("opacity-0 group-hover/section:opacity-100");
        expect(source).toContain('data-layout-runtime-block-edit-visible');
        expect(source).toContain("LayoutRuntimeInlineEditFieldControl");
    });

    it("experience builder doctrine doc exists", () => {
        const doctrine = readFileSync(
            resolve(__dirname, "../../../docs/platform/operator/experience-builder-doctrine.md"),
            "utf8",
        );
        expect(doctrine).toContain("LayoutDoc is runtime truth");
        expect(doctrine).toContain("LayoutRuntimeInlineEditFieldControl");
        expect(doctrine).toContain("Relationship-based contacts");
    });

    it("surface cloning plan covers person, child, and queue", () => {
        const plan = readFileSync(
            resolve(__dirname, "../../../docs/platform/operator/experience-builder-surface-cloning-plan.md"),
            "utf8",
        );
        expect(plan).toContain("Person Drawer");
        expect(plan).toContain("Child Drawer");
        expect(plan).toContain("Queue record layouts");
        expect(plan).toContain("defaultPersonLayouts");
        expect(plan).toContain("defaultChildLayouts");
        expect(plan).toContain("queueRecordLayoutV3");
    });
});
