/**
 * Person drawer — household members expose actionable Make primary contact;
 * activity widgets render as standalone section bodies (not nested field-card chrome).
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import PersonOverviewRuntimeComposition from "@/components/layout/person/PersonOverviewRuntimeComposition";
import PersonHouseholdContactsActionableWidget from "@/components/layout/person/PersonHouseholdContactsActionableWidget";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildProofPersonRecord } from "@/lib/layout/runtime/buildProofPersonRecord";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import { personOverviewCompositionHints, sliceLayoutDocSections } from "@/lib/layout/runtime/personOverviewComposition";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

function activitySectionDoc(widgetRefKey: "activity" | "activity_timeline" = "activity"): LayoutDoc {
    const doc = buildPersonDrawerDefaultDoc();
    return {
        ...doc,
        sections: doc.sections
            .filter((section) => section.key === "recent_activity")
            .map((section) => ({
                ...section,
                defaultExpanded: true,
                rows: section.rows.map((row) => ({
                    ...row,
                    columns: row.columns.map((col) => ({
                        ...col,
                        items: col.items.map((item) => {
                            if (item.kind !== "widget_placeholder" || item.refKey !== "activity") return item;
                            return {
                                ...item,
                                refKey: widgetRefKey,
                                id: item.id.replace(/activity$/, widgetRefKey),
                                widget: item.widget ?
                                    { ...item.widget, widgetKey: `person.${widgetRefKey}` }
                                :   item.widget,
                            };
                        }),
                    })),
                })),
            })),
    };
}

function personRecordWithActivityPreview() {
    return {
        ...multiAdultPersonRecord(),
        notes: [{ title: "Follow-up", body: "Called about enrollment", created_at: "2026-06-01T12:00:00Z" }],
        _activity_timeline_events: [
            {
                id: "evt-1",
                event_key: "note.created",
                label: "Note added",
                created_at: "2026-06-01T12:00:00Z",
            },
        ],
    };
}
function multiAdultPersonRecord() {
    return buildProofPersonRecord({
        id: "parent-1",
        customer_id: "cust-1",
        "person.id": "parent-1",
        "person.primary_contact_name": "Jamie Johnson",
        _household_context: [{ customer_id: "cust-1", household_name: "Johnson Household" }],
        _household_adult_links: [
            {
                customer_id: "cust-1",
                person_id: "parent-1",
                display_name: "Jamie Johnson",
                role_type: "parent",
                role_label: "Parent",
                is_primary: true,
            },
            {
                customer_id: "cust-1",
                person_id: "parent-2",
                display_name: "Alex Johnson",
                role_type: "guardian",
                role_label: "Guardian",
            },
        ],
    });
}

function personDocWithActivityTimeline(): LayoutDoc {
    return activitySectionDoc("activity_timeline");
}

function withPersonComposition(children: React.ReactNode) {
    return (
        <LayoutRuntimeCompositionProvider value={personOverviewCompositionHints({ honorLayoutDocBlocks: true })}>
            {children}
        </LayoutRuntimeCompositionProvider>
    );
}

describe("Person drawer — actionable household contacts", () => {
    it("PersonHouseholdContactsActionableWidget exposes DOM markers for make-primary", () => {
        const html = renderToStaticMarkup(
            <PersonHouseholdContactsActionableWidget record={multiAdultPersonRecord()} canMutate />,
        );
        expect(html).toContain('data-drawer-household-contacts-actionable="true"');
        expect(html).toContain('data-drawer-household-make-primary-contact="true"');
        expect(html).toContain("Make primary contact");
    });

    it("related_people widget in household_relationships mounts actionable contacts", () => {
        const doc = sliceLayoutDocSections(buildPersonDrawerDefaultDoc(), ["household_relationships"]);
        const html = renderToStaticMarkup(
            withPersonComposition(
                <LayoutRuntimeDrawerBodyView
                    doc={doc}
                    record={personRecordWithActivityPreview()}
                    entityId="parent-1"
                    canMutate
                />,
            ),
        );
        expect(html).toContain('data-drawer-household-contacts-actionable="true"');
        expect(html).toContain('data-drawer-household-make-primary-contact="true"');
    });

    it("PersonOverviewRuntimeComposition household section exposes make-primary in DOM", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const html = renderToStaticMarkup(
            <PersonOverviewRuntimeComposition
                doc={doc}
                record={multiAdultPersonRecord()}
                entityId="parent-1"
                canMutate
            />,
        );
        expect(html).toContain('data-debug-drawer-path="PersonOverviewRuntimeComposition"');
        expect(html).toContain('data-drawer-household-contacts-actionable="true"');
        expect(html).toContain('data-drawer-household-make-primary-contact="true"');
    });

    it("injects actionable contacts when published layout omits related_people widget", () => {
        const base = buildPersonDrawerDefaultDoc();
        const docWithoutRelatedPeople = {
            ...base,
            sections: base.sections.map((section) => {
                if (section.key !== "household_relationships") return section;
                return {
                    ...section,
                    rows: section.rows.map((row) => ({
                        ...row,
                        columns: row.columns.map((col) => ({
                            ...col,
                            items: col.items.filter(
                                (item) => !(item.kind === "widget_placeholder" && item.refKey === "related_people"),
                            ),
                        })),
                    })),
                };
            }),
        };
        const slice = sliceLayoutDocSections(docWithoutRelatedPeople, ["household_relationships"]);
        const html = renderToStaticMarkup(
            withPersonComposition(
                <LayoutRuntimeDrawerBodyView
                    doc={slice}
                    record={multiAdultPersonRecord()}
                    entityId="parent-1"
                    canMutate
                />,
            ),
        );
        expect(html).toContain('data-person-drawer-household-actionable-injected="true"');
        expect(html).toContain('data-drawer-household-contacts-actionable="true"');
        expect(html).toContain('data-drawer-household-make-primary-contact="true"');
    });

    it("shows Make primary for visible non-guardian linked adults when multiple adults exist", () => {
        const record = buildProofPersonRecord({
            id: "parent-1",
            customer_id: "cust-1",
            "person.id": "parent-1",
            _household_context: [{ customer_id: "cust-1", household_name: "Johnson Household" }],
            _household_adult_links: [
                {
                    customer_id: "cust-1",
                    person_id: "parent-1",
                    display_name: "Jamie Johnson",
                    role_type: "parent",
                    is_primary: true,
                },
                {
                    customer_id: "cust-1",
                    person_id: "parent-2",
                    display_name: "Molly Wright",
                    role_type: "emergency_contact",
                    role_label: "Emergency contact",
                },
            ],
        });
        const html = renderToStaticMarkup(
            <PersonHouseholdContactsActionableWidget record={record} canMutate />,
        );
        expect(html).toContain('data-drawer-household-make-primary-contact="true"');
        expect(html).toContain("Molly Wright");
    });

    it("household_members related_list on person drawer uses actionable contacts (not read-only repeater)", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const membersList = {
            id: "person_household_members_list",
            kind: "related_list" as const,
            refKey: "household_members",
            source: "household_members",
            label: "Household members",
            displayMode: "list" as const,
            columns: [
                { label: "Name", refKey: "person.primary_contact_name", width: "medium" as const },
                { label: "Primary", refKey: "person.is_primary", width: "medium" as const },
            ],
        };
        const withMembers = {
            ...doc,
            sections: doc.sections.map((s) =>
                s.key === "household_relationships" ?
                    {
                        ...s,
                        rows: [
                            s.rows[0]!,
                            {
                                id: "hh_members_row",
                                columns: [{ id: "hh_members_col", width: 12, items: [membersList] }],
                            },
                        ],
                    }
                :   s,
            ),
        };
        const slice = sliceLayoutDocSections(withMembers, ["household_relationships"]);
        const html = renderToStaticMarkup(
            withPersonComposition(
                <LayoutRuntimeDrawerBodyView
                    doc={slice}
                    record={multiAdultPersonRecord()}
                    entityId="parent-1"
                    canMutate
                />,
            ),
        );
        expect(html).toContain('data-drawer-household-contacts-actionable="true"');
        expect(html).toContain('data-drawer-household-make-primary-contact="true"');
        expect(html).not.toContain('data-lead-contact-repeater-card-list="true"');
    });
});

describe("Person drawer — activity widget standalone section body", () => {
    it("activity widget renders standalone, not inside toned field-card shell", () => {
        const html = renderToStaticMarkup(
            withPersonComposition(
                <LayoutRuntimeDrawerBodyView
                    doc={activitySectionDoc("activity")}
                    record={personRecordWithActivityPreview()}
                    entityId="parent-1"
                    canMutate
                />,
            ),
        );
        expect(html).toContain('data-layout-runtime-standalone-widget="activity"');
        expect(html).toContain('data-layout-runtime-widget-section-body="true"');
        expect(html).toContain('data-layout-runtime-activity-widget="true"');
    });

    it("activity_timeline widget renders standalone in composition section", () => {
        const html = renderToStaticMarkup(
            withPersonComposition(
                <LayoutRuntimeDrawerBodyView
                    doc={personDocWithActivityTimeline()}
                    record={personRecordWithActivityPreview()}
                    entityId="parent-1"
                    canMutate
                />,
            ),
        );
        expect(html).toContain('data-layout-runtime-standalone-widget="activity_timeline"');
        expect(html).toContain('data-layout-runtime-widget-section-body="true"');
    });
});
