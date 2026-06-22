/**
 * Sprint 5.18Y — inline edit presentation + relationship contact visibility.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LeadEnrollmentCardList from "@/components/layout/lead/LeadEnrollmentCardList";
import {
    LayoutRuntimeBlockEditProvider,
    layoutRuntimeBlockAllowsFieldEdit,
} from "@/components/layout/LayoutRuntimeBlockEditContext";
import {
    resolveLayoutEditorContactBlockPerson,
    shouldHideEmptyLayoutEditorContactBlock,
} from "@/lib/layout/runtime/resolveLayoutEditorContactBlockRecord";
import { resolveOpportunitySecondaryContactPerson } from "@/lib/layout/runtime/resolveOpportunityRoleContactPerson";
import { layoutRuntimeCollectionColumnIsInlineEditable } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
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
            { refKey: "child.location", label: "School", editable: true },
            { refKey: "child.status", label: "Enrollment status", editable: true },
        ],
    };
}

describe("layoutBuilderRuntimeParity 5.18Y", () => {
    it("related-list edit mode preserves compact row grouping — no stacked enrollment field grid", () => {
        const source = readFileSync(
            resolve(__dirname, "../../components/layout/lead/LeadEnrollmentCardList.tsx"),
            "utf8",
        );
        expect(source).not.toContain("adminv2-drawer-enrollment-field-grid");
        expect(source).toContain("data-child-row-template-row=");
        expect(source).toContain("LeadEnrollmentRepeaterFieldCell");
    });

    it("editable cells render in configured row slots during section edit", () => {
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
                            "child.location": "North Campus",
                            "child.status": "new_lead",
                        },
                    ]}
                    anchorRecord={{}}
                    canMutate
                />
            </LayoutRuntimeBlockEditProvider>,
        );
        expect(html).toContain('data-child-row-template-configured="true"');
        expect(html).toContain('data-child-row-template-row="0"');
        expect(html).toContain('data-child-row-template-row="1"');
    });

    it("non-editable cells remain display-only during edit", () => {
        expect(
            layoutRuntimeCollectionColumnIsInlineEditable({ refKey: "child.name", editable: false }, "production"),
        ).toBe(false);
        expect(
            layoutRuntimeCollectionColumnIsInlineEditable({ refKey: "child.dob_age", editable: false }, "production"),
        ).toBe(false);
        expect(
            layoutRuntimeCollectionColumnIsInlineEditable({ refKey: "child.date_of_birth", editable: true }, "production"),
        ).toBe(true);
    });

    it("section Edit button is hidden by default and visible on hover/focus/editing", () => {
        const source = readFileSync(
            resolve(__dirname, "../../components/layout/LayoutRuntimePlanView.tsx"),
            "utf8",
        );
        expect(source).toContain("opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100");
        expect(source).toContain('data-layout-runtime-block-edit-visible={visibleWhileEditing ? "editing" : "hover"}');
    });

    it("additional contact resolver excludes primary and finds non-role-matched associated person", () => {
        const record = {
            id: "opp-wright",
            customer_id: "cust-wright",
            opportunities: { primary_person_id: "p-justin" },
            _opportunity_persons: [
                { person_id: "p-justin", role_type: "primary_contact", name: "Justin Wright", phone: "111", email: "j@test.com" },
                { person_id: "p-other", role_type: "associated", name: "Jordan Wright", phone: "222", email: "jordan@test.com" },
            ],
        };
        const primary = resolveLayoutEditorContactBlockPerson(record, "primary");
        const additional = resolveLayoutEditorContactBlockPerson(record, "secondary", {
            excludedPersonIds: new Set([primary?.personId ?? ""]),
        });
        const parentsOnly = resolveLayoutEditorContactBlockPerson(record, "parents", {
            excludedPersonIds: new Set([primary?.personId ?? ""]),
        });
        expect(primary?.displayName).toBe("Justin Wright");
        expect(additional?.displayName).toBe("Jordan Wright");
        expect(additional?.personId).not.toBe(primary?.personId);
        expect(parentsOnly).toBeNull();
        expect(shouldHideEmptyLayoutEditorContactBlock("secondary", additional)).toBe(false);
    });

    it("hide when empty does not hide when a non-primary contact exists", () => {
        const record = {
            id: "opp-wright",
            customer_id: "cust-wright",
            opportunities: { primary_person_id: "p-justin" },
            _customer_persons: [
                { customer_id: "cust-wright", person_id: "p-justin", role_type: "primary_contact", name: "Justin Wright" },
                { customer_id: "cust-wright", person_id: "p-other", role_type: "member", name: "Jordan Wright", phone: "222" },
            ],
            _opportunity_persons: [
                { person_id: "p-justin", role_type: "primary_contact", name: "Justin Wright" },
            ],
        };
        const secondary = resolveOpportunitySecondaryContactPerson(record);
        expect(secondary.displayName).toBe("Jordan Wright");
        const additional = resolveLayoutEditorContactBlockPerson(record, "secondary", {
            excludedPersonIds: new Set(["p-justin"]),
        });
        expect(additional?.displayName).toBe("Jordan Wright");
    });

    it("additional contact block does not duplicate primary contact", () => {
        const record = {
            id: "opp-1",
            customer_id: "cust-1",
            opportunities: { primary_person_id: "p-primary" },
            _opportunity_persons: [
                { person_id: "p-primary", role_type: "primary_contact", name: "Alex Lyons", phone: "111", email: "a@test.com" },
                { person_id: "p-parent", role_type: "parent", name: "Jamie Lyons", phone: "222", email: "j@test.com" },
            ],
        };
        const primary = resolveLayoutEditorContactBlockPerson(record, "primary");
        const additional = resolveLayoutEditorContactBlockPerson(record, "parents", {
            excludedPersonIds: new Set([primary?.personId ?? ""]),
        });
        expect(additional?.personId).not.toBe(primary?.personId);
        expect(additional?.displayName).toBe("Jamie Lyons");
    });
});
