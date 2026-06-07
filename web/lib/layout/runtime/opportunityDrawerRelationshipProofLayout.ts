/**
 * Opportunity drawer — relationship/reference proof layout (Phase 1).
 *
 * Extends the lead drawer default with explicit binding metadata demonstrating
 * Layout Contract V1 can express operational relationships without flattening
 * or creating parallel presentation systems. Used by tests and proof paths only.
 */

import {
    LAYOUT_DOC_FORMAT_VERSION,
    LAYOUT_GRID_COLUMNS,
    type LayoutDoc,
    type LayoutItem,
    type LayoutRenderHint,
    type LayoutSection,
} from "../layoutV2";
import { buildLeadDrawerDefaultDoc } from "../defaultLeadLayouts";
import { withItemBinding } from "./classifyLayoutItemBinding";
import { OPPORTUNITY_COMPUTE_KEYS } from "./opportunityRelationRegistry";
import type { LayoutItemBindingMetadata } from "./valueBinding";

function id(...parts: string[]): string {
    return parts.join("-");
}

function bindingField(
    base: string,
    refKey: string,
    label: string,
    binding: LayoutItemBindingMetadata,
    renderHint: LayoutRenderHint = "text",
): LayoutItem {
    return withItemBinding(
        {
            id: id(base, "f", refKey.replace(/\./g, "_")),
            kind: "field",
            refKey,
            label,
            renderHint,
            editable: false,
            sourceEntity: binding.sourceEntity,
        },
        binding,
    );
}

function col(base: string, idx: number, width: number, items: LayoutItem[]) {
    return { id: id(base, `c${idx}`), width, items };
}

function row(base: string, columns: ReturnType<typeof col>[]) {
    return { id: base, columns };
}

function section(sKey: string, title: string, rows: ReturnType<typeof row>[], defaultExpanded = false): LayoutSection {
    return {
        id: id("opportunities", "rel_proof", sKey),
        key: sKey,
        title,
        collapsible: true,
        defaultExpanded,
        rows,
    };
}

/**
 * Proof layout: opportunity drawer with relationship/reference/computed items.
 * Not wired to live runtime — demonstrates Phase 1 binding expressiveness.
 */
export function buildOpportunityDrawerRelationshipProofLayout(): LayoutDoc {
    const lead = buildLeadDrawerDefaultDoc();

    const half = LAYOUT_GRID_COLUMNS / 2;

    const pcBase = id("opportunities", "rel_proof", "primary_contact");
    const primaryContact = section(
        "primary_contact",
        "Primary contact",
        [
            row(id(pcBase, "r0"), [
                col(id(pcBase, "r0"), 0, half, [
                    bindingField(pcBase, "person.primary_contact_name", "Name", {
                        bindingClass: "relationship_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "primary_contact",
                        sourceEntity: "person",
                        fieldKey: "primary_contact_name",
                    }),
                    bindingField(pcBase, "person.primary_phone", "Phone", {
                        bindingClass: "relationship_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "primary_contact",
                        sourceEntity: "person",
                        fieldKey: "primary_phone",
                    }, "phone"),
                    bindingField(pcBase, "person.primary_email", "Email", {
                        bindingClass: "relationship_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "primary_contact",
                        sourceEntity: "person",
                        fieldKey: "primary_email",
                    }),
                ]),
                col(id(pcBase, "r0"), 1, half, [
                    bindingField(pcBase, "person.is_employee", "Employee (contact)", {
                        bindingClass: "relationship_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "primary_contact",
                        sourceEntity: "person",
                        fieldKey: "is_employee",
                    }, "primary_yes_no"),
                ]),
            ]),
        ],
        true,
    );

    const locBase = id("opportunities", "rel_proof", "locations");
    const locations = section("location_context", "Location context", [
        row(id(locBase, "r0"), [
            col(id(locBase, "r0"), 0, half, [
                bindingField(locBase, "location.site_label", "School / site", {
                    bindingClass: "reference_field",
                    contractBlockKind: "relationship_section",
                    relationKey: "enrollment_site_location",
                    locationRole: "site",
                    sourceEntity: "location",
                    fieldKey: "label",
                }),
            ]),
            col(id(locBase, "r0"), 1, half, [
                bindingField(locBase, "location.classroom_label", "Classroom", {
                    bindingClass: "reference_field",
                    contractBlockKind: "relationship_section",
                    relationKey: "enrollment_classroom_location",
                    locationRole: "classroom",
                    sourceEntity: "location",
                    fieldKey: "label",
                }),
            ]),
        ]),
        row(id(locBase, "r1"), [
            col(id(locBase, "r1"), 0, half, [
                bindingField(locBase, "location.room_label", "Room", {
                    bindingClass: "reference_field",
                    contractBlockKind: "relationship_section",
                    relationKey: "enrollment_room_location",
                    locationRole: "room",
                    sourceEntity: "location",
                    fieldKey: "label",
                }),
            ]),
            col(id(locBase, "r1"), 1, half, [
                bindingField(locBase, "location.household_address", "Household address", {
                    bindingClass: "reference_field",
                    contractBlockKind: "relationship_section",
                    relationKey: "household_address",
                    locationRole: "household_address",
                    sourceEntity: "location",
                    fieldKey: "formatted_address",
                }),
            ]),
        ]),
    ]);

    const progBase = id("opportunities", "rel_proof", "program");
    const programConfig = section("program_configuration", "Program & placement", [
        row(id(progBase, "r0"), [
            col(id(progBase, "r0"), 0, half, [
                bindingField(progBase, "enrollment.program_category", "Program category", {
                    bindingClass: "computed_projection",
                    contractBlockKind: "section",
                    computeKey: OPPORTUNITY_COMPUTE_KEYS.program_category,
                    sourceEntity: "enrollment",
                    fieldKey: "program_category",
                }),
            ]),
            col(id(progBase, "r0"), 1, half, [
                bindingField(progBase, "enrollment.placement_priority", "Placement priority", {
                    bindingClass: "computed_projection",
                    contractBlockKind: "section",
                    computeKey: OPPORTUNITY_COMPUTE_KEYS.placement_priority,
                    sourceEntity: "enrollment",
                    fieldKey: "placement_priority",
                }),
            ]),
        ]),
    ]);

    const ecBase = id("opportunities", "rel_proof", "enrollment_children");
    const enrollmentChildren: LayoutItem = withItemBinding(
        {
            id: id(ecBase, "children_repeater"),
            kind: "related_list",
            refKey: "enrollment_children",
            label: "Enrollment children",
            source: "enrollment_children",
            displayMode: "table",
            related: { entityType: "customer_members", filterKey: "opportunity" },
            columns: [
                { label: "Child", refKey: "child_inquiry.child_name", width: "medium" },
                { label: "Desired start", refKey: "child_inquiry.desired_start_date", width: "medium", renderHint: "date" },
                { label: "Site preference", refKey: "child_inquiry.location_id", width: "medium" },
                { label: "Program room cohort", refKey: "child_inquiry.program_room_cohort_key", width: "medium" },
                { label: "Status", refKey: "child_inquiry.outcome_status_key", width: "medium", renderHint: "status" },
            ],
        },
        {
            bindingClass: "repeater",
            contractBlockKind: "repeater",
            relationKey: "enrollment_children",
            sourceEntity: "child_inquiry",
        },
    );

    const childrenSection = section("enrollment_children", "Enrollment children", [
        row(id(ecBase, "r0"), [col(id(ecBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [enrollmentChildren])]),
    ], true);

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "drawer",
        entityType: "opportunities",
        sections: [...lead.sections, primaryContact, locations, programConfig, childrenSection],
        metadata: {
            template: "opportunity_relationship_proof_v1",
            phase: "runtime_convergence_phase_1",
            anchorEntity: "opportunities",
        },
    };
}
