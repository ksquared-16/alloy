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
import {
    overlayLayoutEditorContactBlockRecord,
    resolveLayoutEditorContactBlockPerson,
    resolveLayoutEditorContactBlockPersons,
    resolveLayoutEditorContactBlockResolution,
} from "@/lib/layout/runtime/resolveLayoutEditorContactBlockRecord";
import { visibilityConditionForRule } from "@/lib/layout/layoutEditorVisibilityRules";
import { LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS } from "@/lib/layout/layoutEditorContactRoles";
import type { LayoutItem } from "@/lib/layout/layoutV2";

const WRIGHT_FAMILY_RECORD = {
    id: "opp-wright",
    customer_id: "cust-wright",
    opportunities: { primary_person_id: "p-justin" },
    "person.primary_contact_name": "Justin Wright",
    "person.primary_phone": "555-111-1111",
    "person.primary_email": "justin@wright.test",
    "person.secondary_contact_name": "",
    "person.secondary_phone": "",
    "person.secondary_email": "",
    _opportunity_persons: [
        {
            person_id: "p-justin",
            role_type: "primary_contact",
            name: "Justin Wright",
            phone: "555-111-1111",
            email: "justin@wright.test",
        },
        {
            person_id: "p-molly",
            role_type: "member",
            name: "Molly Wright",
            phone: "555-222-2222",
            email: "molly@wright.test",
        },
    ],
};

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
        expect(evaluateLayoutCondition(WRIGHT_FAMILY_RECORD, { type: "exists", path: "person.secondary_contact_name" })).toBe(
            false,
        );
        const additional = resolveLayoutEditorContactBlockPerson(WRIGHT_FAMILY_RECORD, "secondary", {
            excludedPersonIds: new Set(["p-justin"]),
        });
        expect(additional?.displayName).toBe("Molly Wright");
    });

    it("1. additional contact excludes primary", () => {
        const primary = resolveLayoutEditorContactBlockPerson(WRIGHT_FAMILY_RECORD, "primary");
        const additional = resolveLayoutEditorContactBlockPerson(WRIGHT_FAMILY_RECORD, "secondary", {
            excludedPersonIds: new Set([primary?.personId ?? ""]),
        });
        expect(primary?.displayName).toBe("Justin Wright");
        expect(additional?.displayName).toBe("Molly Wright");
        expect(additional?.personId).not.toBe(primary?.personId);
    });

    it("2. additional contact resolves first non-primary associated person", () => {
        const record = {
            ...WRIGHT_FAMILY_RECORD,
            _opportunity_persons: [
                ...(WRIGHT_FAMILY_RECORD._opportunity_persons ?? []),
                {
                    person_id: "p-sibling",
                    role_type: "associated",
                    name: "Sam Wright",
                    phone: "555-333-3333",
                    email: "sam@wright.test",
                },
            ],
        };
        const additional = resolveLayoutEditorContactBlockPerson(record, "secondary", {
            excludedPersonIds: new Set(["p-justin"]),
        });
        expect(additional?.displayName).toBe("Molly Wright");
    });

    it("3. additional contacts resolves multiple non-primary people", () => {
        const record = {
            ...WRIGHT_FAMILY_RECORD,
            _opportunity_persons: [
                ...(WRIGHT_FAMILY_RECORD._opportunity_persons ?? []),
                {
                    person_id: "p-sibling",
                    role_type: "associated",
                    name: "Sam Wright",
                    phone: "555-333-3333",
                    email: "sam@wright.test",
                },
            ],
        };
        const additionalPeople = resolveLayoutEditorContactBlockPersons(record, "secondary", {
            excludedPersonIds: new Set(["p-justin"]),
        });
        expect(additionalPeople.map((person) => person.displayName)).toEqual(["Molly Wright", "Sam Wright"]);
        expect(additionalPeople).toHaveLength(2);
    });

    it("4. phone/email visibility uses resolved related contact, not opportunity primary", () => {
        const resolution = resolveLayoutEditorContactBlockResolution(WRIGHT_FAMILY_RECORD, "secondary", {
            excludedPersonIds: new Set(["p-justin"]),
        });
        const overlaid = overlayLayoutEditorContactBlockRecord(WRIGHT_FAMILY_RECORD, "secondary", resolution);
        expect(overlaid["person.secondary_phone"]).toBe("555-222-2222");
        expect(overlaid["person.secondary_email"]).toBe("molly@wright.test");
        expect(overlaid["person.secondary_phone"]).not.toBe(WRIGHT_FAMILY_RECORD["person.primary_phone"]);
    });

    it("5. hide when empty hides missing additional contact phone/email", () => {
        const record = {
            ...WRIGHT_FAMILY_RECORD,
            _opportunity_persons: [
                WRIGHT_FAMILY_RECORD._opportunity_persons![0]!,
                {
                    person_id: "p-molly",
                    role_type: "member",
                    name: "Molly Wright",
                    phone: "",
                    email: "",
                },
            ],
        };
        const resolution = resolveLayoutEditorContactBlockResolution(record, "secondary", {
            excludedPersonIds: new Set(["p-justin"]),
        });
        const overlaid = overlayLayoutEditorContactBlockRecord(record, "secondary", resolution);
        const phoneCondition = visibilityConditionForRule("hide_when_empty", "person.secondary_phone");
        const emailCondition = visibilityConditionForRule("hide_when_empty", "person.secondary_email");
        expect(evaluateLayoutCondition(overlaid, phoneCondition)).toBe(false);
        expect(evaluateLayoutCondition(overlaid, emailCondition)).toBe(false);
        expect(evaluateLayoutCondition(overlaid, visibilityConditionForRule("hide_when_empty", "person.secondary_contact_name"))).toBe(
            true,
        );
    });

    it("6. show when related record exists works for additional contact block", () => {
        const resolution = resolveLayoutEditorContactBlockResolution(WRIGHT_FAMILY_RECORD, "secondary", {
            excludedPersonIds: new Set(["p-justin"]),
        });
        const overlaid = overlayLayoutEditorContactBlockRecord(WRIGHT_FAMILY_RECORD, "secondary", resolution);
        const condition = visibilityConditionForRule("show_when_contact_record_exists", "person.secondary_phone");
        expect(evaluateLayoutCondition(WRIGHT_FAMILY_RECORD, condition)).toBe(false);
        expect(evaluateLayoutCondition(overlaid, condition)).toBe(true);
        expect(overlaid[LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.resolved]).toBe("1");
    });

    it("7. emergency contact does not fall back to generic additional contact", () => {
        const record = {
            id: "opp-wright",
            customer_id: "cust-wright",
            opportunities: { primary_person_id: "p-justin" },
            _opportunity_persons: [
                {
                    person_id: "p-justin",
                    role_type: "primary_contact",
                    name: "Justin Wright",
                },
                {
                    person_id: "p-molly",
                    role_type: "member",
                    name: "Molly Wright",
                    phone: "555-222-2222",
                },
            ],
        };
        const emergency = resolveLayoutEditorContactBlockPerson(record, "emergency", {
            excludedPersonIds: new Set(["p-justin"]),
        });
        const additional = resolveLayoutEditorContactBlockPerson(record, "secondary", {
            excludedPersonIds: new Set(["p-justin"]),
        });
        expect(emergency).toBeNull();
        expect(additional?.displayName).toBe("Molly Wright");
    });

    it("PlanView evaluates contact_block visibility from relationships when scalar exists check fails", () => {
        const planSource = readFileSync(
            resolve(__dirname, "../../components/layout/LayoutRuntimePlanView.tsx"),
            "utf8",
        );
        expect(planSource).toContain("evaluateLayoutItemVisibility");
        expect(planSource).toContain("resolveLayoutEditorContactBlockResolution(record, role");
    });
});
