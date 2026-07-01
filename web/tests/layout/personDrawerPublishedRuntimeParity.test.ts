/**
 * Person drawer — published runtime parity with Experience Builder configuration.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { createExperienceBuilderCard } from "@/lib/layout/layoutBuilderCardAuthoring";
import { applyPeerCardWidth } from "@/lib/layout/layoutBuilderPeerCardRows";
import {
    readSectionRowGroup,
    readSectionRowSpan,
    segmentSectionsForRowLayout,
} from "@/lib/layout/layoutEditorSectionLayout";
import { validateDrawerLayoutDoc } from "@/lib/layout/drawerLayoutEditorModel";
import {
    patchLayoutEditorRelatedListConfig,
    readLayoutEditorRelatedListConfig,
    LAYOUT_EDITOR_RELATED_LIST_MAX_ROW_FIELDS,
} from "@/lib/layout/layoutEditorRelatedListConfig";
import { buildPersonDrawerLinkedChildRelatedListFieldPickerGroups } from "@/lib/layout/personDrawerLayoutEditorFieldCatalog";
import {
    isAllowedPersonDrawerLinkedChildFieldRefKey,
    PERSON_DRAWER_LINKED_CHILD_FIELD_REFS,
} from "@/lib/layout/surfaceLayoutRegistry";
import { isAllowedDrawerEditorFieldRefKey } from "@/lib/layout/drawerSurfaceFieldValidation";
import { personOverviewCompositionHints } from "@/lib/layout/runtime/personOverviewComposition";
import { normalizeInquiryChildBlockToLayoutRuntimeRow } from "@/lib/layout/runtime/normalizeLayoutRuntimeChildRow";
import { formatLayoutRuntimeRepeaterColumnDisplay } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import LayoutEditorSectionFlowView from "@/components/layout/LayoutEditorSectionFlowView";
import type { LayoutSection } from "@/lib/layout/layoutV2";

function pickerRefKeys() {
    return buildPersonDrawerLinkedChildRelatedListFieldPickerGroups()
        .flatMap((group) => group.fields.map((field) => field.refKey));
}

describe("person drawer linked children field inventory", () => {
    it("exposes canonical enrollment status in linked-child picker", () => {
        const refs = pickerRefKeys();
        expect(refs).toContain("inquiry_child.outcome_status_key");
        expect(PERSON_DRAWER_LINKED_CHILD_FIELD_REFS).toContain("inquiry_child.outcome_status_key");
    });

    it("validator allows resolvable linked-child enrollment status", () => {
        expect(isAllowedPersonDrawerLinkedChildFieldRefKey("inquiry_child.outcome_status_key")).toBe(true);
        expect(
            isAllowedDrawerEditorFieldRefKey("inquiry_child.outcome_status_key", {
                surfaceKey: "person_drawer",
                linkedChildContext: true,
            }),
        ).toBe(true);
    });

    it("classifies expected linked-child fields", () => {
        const inventory: Record<string, "A" | "B" | "C" | "D"> = {
            "child.name": "A",
            "child.dob_age": "A",
            "child.date_of_birth": "A",
            "child.program": "A",
            "child.room": "A",
            "child.schedule": "A",
            "inquiry_child.outcome_status_key": "A",
            "child.desired_start_date": "A",
            "inquiry_child.desired_start_date": "A",
            "opportunity.stage_key": "D",
            "waitlist.positionLabel": "D",
        };

        for (const [refKey, expectedClass] of Object.entries(inventory)) {
            if (expectedClass === "A") {
                expect(isAllowedPersonDrawerLinkedChildFieldRefKey(refKey), refKey).toBe(true);
            }
            if (expectedClass === "D") {
                expect(isAllowedPersonDrawerLinkedChildFieldRefKey(refKey), refKey).toBe(false);
            }
        }
    });
});

describe("person drawer related list parity", () => {
    it("supports more than three linked-child fields on publish", () => {
        const uniqueFields = [
            "child.name",
            "child.dob_age",
            "child.program",
            "child.room",
            "child.schedule",
            "inquiry_child.outcome_status_key",
        ];
        const doc = buildPersonDrawerDefaultDoc();
        const { doc: withList, sectionKey } = createExperienceBuilderCard(doc, {
            title: "Linked children",
            widthKey: "full",
            cardType: "related_list",
            surfaceKey: "person_drawer",
        });
        const patched = patchLayoutEditorRelatedListConfig(withList, sectionKey, {
            primaryRow: { fields: uniqueFields },
        });
        const config = readLayoutEditorRelatedListConfig(
            patched.sections.find((s) => s.key === sectionKey)!,
            "person_drawer",
        );
        expect(config.primaryRow.fields.length).toBe(LAYOUT_EDITOR_RELATED_LIST_MAX_ROW_FIELDS);
        const validation = validateDrawerLayoutDoc(patched, "person_drawer");
        expect(validation.ok, validation.errors.join("; ")).toBe(true);
    });

    it("honors layout doc columns when honorLayoutDocBlocks is set", () => {
        const hints = personOverviewCompositionHints({ honorLayoutDocBlocks: true });
        expect(hints.connectedChildrenPrimaryColumnsOnly).toBe(false);
        expect(hints.honorLayoutDocBlocks).toBe(true);
    });
});

describe("person drawer section width parity", () => {
    it("builder and runtime share row-group metadata for half + half overflow cards", () => {
        let doc = buildPersonDrawerDefaultDoc();
        const first = createExperienceBuilderCard(doc, {
            title: "Notes",
            widthKey: "half",
            cardType: "fields",
            surfaceKey: "person_drawer",
            zone: "main",
        });
        doc = first.doc;
        const second = createExperienceBuilderCard(doc, {
            title: "Tasks",
            widthKey: "half",
            cardType: "fields",
            surfaceKey: "person_drawer",
            zone: "main",
            placementIntent: "after_selected",
            afterSectionKey: first.sectionKey,
        });
        doc = second.doc;

        const cards = doc.sections.filter((section) =>
            [first.sectionKey, second.sectionKey].includes(section.key),
        );
        expect(cards).toHaveLength(2);
        const groupId = readSectionRowGroup(cards[0]!);
        expect(groupId).toBeTruthy();
        expect(readSectionRowGroup(cards[1]!)).toBe(groupId);
        expect(cards.map((section) => readSectionRowSpan(section))).toEqual([6, 6]);

        const segments = segmentSectionsForRowLayout(cards);
        expect(segments).toHaveLength(1);
        expect(segments[0]?.kind).toBe("row");
    });

    it("LayoutEditorSectionFlowView renders peer row group side-by-side", () => {
        let doc = buildPersonDrawerDefaultDoc();
        doc = applyPeerCardWidth(doc, "contact_information", "half");
        const { doc: next, sectionKey } = createExperienceBuilderCard(doc, {
            title: "Extra",
            widthKey: "half",
            cardType: "fields",
            surfaceKey: "person_drawer",
            zone: "main",
        });
        const cards = next.sections.filter((section) =>
            ["contact_information", sectionKey].includes(section.key),
        );
        const html = renderToStaticMarkup(
            React.createElement(LayoutEditorSectionFlowView, {
                sections: cards as LayoutSection[],
                renderSection: (section: LayoutSection) =>
                    React.createElement("div", {
                        "data-test-section": section.key,
                    }),
            }),
        );
        expect(html).toContain('data-layout-section-segment="row"');
        expect(html).toContain('data-layout-runtime-peer-row-card="true"');
    });
});

describe("person drawer enrollment status runtime resolution", () => {
    it("resolves inquiry_child.outcome_status_key for linked-child rows", () => {
        const row = normalizeInquiryChildBlockToLayoutRuntimeRow(
            {
                id: "ocm-1",
                ocm_id: "ocm-1",
                customer_member_id: "cm-1",
                person_id: "person-1",
                display_name: "Avery Brooks",
                dob: null,
                age: null,
                desired_program_type: null,
                desired_program_label: null,
                desired_schedule_type: null,
                desired_schedule_label: null,
                outcome_status_key: "waitlisted",
                outcome_status_label: "Waitlisted",
                notes: null,
                desired_start_date: null,
                location_id: null,
                location_label: null,
                program_room_cohort_key: null,
                program_room_cohort_label: null,
                custom_fields: {},
                first_name: "Avery",
                last_name: "Brooks",
                linked_on_inquiry: false,
            },
            0,
        );
        expect(row["inquiry_child.outcome_status_key"]).toBe("waitlisted");
        expect(row["child.status"]).toBe("Waitlisted");
        const display = formatLayoutRuntimeRepeaterColumnDisplay(row, {
            refKey: "inquiry_child.outcome_status_key",
            label: "Enrollment status",
            width: "medium",
        });
        expect(display).toBe("Waitlisted");
    });
});
