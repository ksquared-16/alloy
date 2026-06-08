/**
 * Child drawer — relationship/reference proof layout.
 *
 * Child durable attributes via child.* base fields; parents, household, and
 * location context via relationships/references (not flat fields).
 * Schedule/attendance/billing appear only as future module placeholders.
 */

import { LAYOUT_DOC_FORMAT_VERSION, LAYOUT_GRID_COLUMNS, type LayoutDoc, type LayoutItem } from "../layoutV2";
import { withItemBinding } from "./classifyLayoutItemBinding";
import { CHILD_COMPUTE_KEYS, CHILD_LAYOUT_ANCHOR_ENTITY } from "./childRelationRegistry";
import {
    appendFutureModuleSection,
    bindingField,
    col,
    futureModuleSection,
    proofId,
    proofSection,
    row,
} from "./proofLayoutHelpers";

const PREFIX = "rel_proof";
const ENTITY = CHILD_LAYOUT_ANCHOR_ENTITY;
const HALF = LAYOUT_GRID_COLUMNS / 2;

/** Future tab placeholders — not real billing, attendance, or scheduling. */
export const CHILD_FUTURE_DRAWER_MODULES = [
    { key: "parents", label: "Parents" },
    { key: "schedule", label: "Schedule" },
    { key: "attendance", label: "Attendance" },
    { key: "billing", label: "Billing" },
    { key: "documents", label: "Documents" },
    { key: "communications", label: "Communications" },
] as const;

export function buildChildDrawerRelationshipProofLayout(): LayoutDoc {
    const profileBase = proofId(ENTITY, PREFIX, "profile");
    const profile = proofSection(
        ENTITY,
        PREFIX,
        "profile",
        "Child profile",
        [
            row(proofId(profileBase, "r0"), [
                col(proofId(profileBase, "r0"), 0, HALF, [
                    bindingField(profileBase, "child.name", "Child", {
                        bindingClass: "base_field",
                        contractBlockKind: "section",
                        sourceEntity: "child",
                        fieldKey: "name",
                    }),
                    bindingField(profileBase, "child.date_of_birth", "Date of birth", {
                        bindingClass: "base_field",
                        contractBlockKind: "section",
                        sourceEntity: "child",
                        fieldKey: "date_of_birth",
                    }, "date"),
                ]),
                col(proofId(profileBase, "r0"), 1, HALF, [
                    bindingField(profileBase, "child.age_band", "Age band", {
                        bindingClass: "base_field",
                        contractBlockKind: "section",
                        sourceEntity: "child",
                        fieldKey: "age_band",
                    }),
                    bindingField(profileBase, "enrollment.enrollment_status", "Enrollment status", {
                        bindingClass: "computed_projection",
                        contractBlockKind: "section",
                        computeKey: CHILD_COMPUTE_KEYS.enrollment_status,
                        sourceEntity: "enrollment",
                        fieldKey: "enrollment_status",
                    }, "status"),
                ]),
            ]),
        ],
        true,
    );

    const hhBase = proofId(ENTITY, PREFIX, "household");
    const household = proofSection(
        ENTITY,
        PREFIX,
        "household",
        "Household",
        [
            row(proofId(hhBase, "r0"), [
                col(proofId(hhBase, "r0"), 0, HALF, [
                    bindingField(hhBase, "customer.household_name", "Household", {
                        bindingClass: "reference_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "household_customer",
                        sourceEntity: "customer",
                        fieldKey: "household_name",
                    }),
                ]),
                col(proofId(hhBase, "r0"), 1, HALF, [
                    bindingField(hhBase, "location.household_address", "Household address", {
                        bindingClass: "reference_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "household_address",
                        locationRole: "household_address",
                        sourceEntity: "location",
                        fieldKey: "formatted_address",
                    }),
                ]),
            ]),
        ],
        true,
    );

    const pcBase = proofId(ENTITY, PREFIX, "primary_contact");
    const primaryContact = proofSection(
        ENTITY,
        PREFIX,
        "primary_contact",
        "Primary contact",
        [
            row(proofId(pcBase, "r0"), [
                col(proofId(pcBase, "r0"), 0, HALF, [
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
                ]),
                col(proofId(pcBase, "r0"), 1, HALF, [
                    bindingField(pcBase, "person.primary_email", "Email", {
                        bindingClass: "relationship_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "primary_contact",
                        sourceEntity: "person",
                        fieldKey: "primary_email",
                    }),
                ]),
            ]),
        ],
        true,
    );

    const parBase = proofId(ENTITY, PREFIX, "parents");
    const parentsRepeater: LayoutItem = withItemBinding(
        {
            id: proofId(parBase, "parents_repeater"),
            kind: "related_list",
            refKey: "parents",
            label: "Parents / guardians",
            source: "parents",
            displayMode: "table",
            related: { entityType: "persons", filterKey: "household" },
            columns: [
                { label: "Name", refKey: "person.primary_contact_name", width: "medium" },
                { label: "Phone", refKey: "person.primary_phone", width: "medium", renderHint: "phone" },
                { label: "Email", refKey: "person.primary_email", width: "medium" },
                { label: "Role", refKey: "person.household_role", width: "medium" },
            ],
        },
        {
            bindingClass: "repeater",
            contractBlockKind: "repeater",
            relationKey: "parents",
            sourceEntity: "person",
        },
    );

    const parentsSection = proofSection(
        ENTITY,
        PREFIX,
        "parents",
        "Parents / guardians",
        [row(proofId(parBase, "r0"), [col(proofId(parBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [parentsRepeater])])],
    );

    const locBase = proofId(ENTITY, PREFIX, "locations");
    const locations = proofSection(
        ENTITY,
        PREFIX,
        "location_context",
        "Location context",
        [
            row(proofId(locBase, "r0"), [
                col(proofId(locBase, "r0"), 0, HALF, [
                    bindingField(locBase, "location.site_label", "School / site", {
                        bindingClass: "reference_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "enrollment_site_location",
                        locationRole: "site",
                        sourceEntity: "location",
                        fieldKey: "label",
                    }),
                ]),
                col(proofId(locBase, "r0"), 1, HALF, [
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
            row(proofId(locBase, "r1"), [
                col(proofId(locBase, "r1"), 0, HALF, [
                    bindingField(locBase, "location.room_label", "Room", {
                        bindingClass: "reference_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "enrollment_room_location",
                        locationRole: "room",
                        sourceEntity: "location",
                        fieldKey: "label",
                    }),
                ]),
            ]),
        ],
    );

    const baseDoc: LayoutDoc = {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "drawer",
        entityType: ENTITY,
        sections: [profile, household, primaryContact, parentsSection, locations],
        metadata: {
            template: "child_relationship_proof_v1",
            phase: "runtime_convergence_person_child_foundation",
            anchorEntity: ENTITY,
            operatorEntityLabel: "Child",
        },
    };

    return appendFutureModuleSection(
        baseDoc,
        futureModuleSection(ENTITY, PREFIX, [...CHILD_FUTURE_DRAWER_MODULES]),
    );
}
