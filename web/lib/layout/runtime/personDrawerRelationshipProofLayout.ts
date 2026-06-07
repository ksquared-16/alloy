/**
 * Person drawer — relationship/reference proof layout.
 *
 * Demonstrates Person → household / children / primary child via relationships.
 * Future module placeholders for modules not yet implemented. Proof-only.
 */

import { LAYOUT_DOC_FORMAT_VERSION, LAYOUT_GRID_COLUMNS, type LayoutDoc, type LayoutItem } from "../layoutV2";
import { withItemBinding } from "./classifyLayoutItemBinding";
import { PERSON_LAYOUT_ANCHOR_ENTITY } from "./personRelationRegistry";
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
const ENTITY = PERSON_LAYOUT_ANCHOR_ENTITY;
const HALF = LAYOUT_GRID_COLUMNS / 2;

/** Future tab placeholders — not real modules. */
export const PERSON_FUTURE_DRAWER_MODULES = [
    { key: "communications", label: "Communications" },
    { key: "documents", label: "Documents" },
    { key: "enrollment_activity", label: "Enrollment activity" },
] as const;

export function buildPersonDrawerRelationshipProofLayout(): LayoutDoc {
    const profileBase = proofId(ENTITY, PREFIX, "profile");
    const profile = proofSection(
        ENTITY,
        PREFIX,
        "profile",
        "Profile",
        [
            row(proofId(profileBase, "r0"), [
                col(proofId(profileBase, "r0"), 0, HALF, [
                    bindingField(profileBase, "person.first_name", "First name", {
                        bindingClass: "base_field",
                        contractBlockKind: "section",
                        sourceEntity: "person",
                        fieldKey: "first_name",
                    }),
                    bindingField(profileBase, "person.email", "Email", {
                        bindingClass: "base_field",
                        contractBlockKind: "section",
                        sourceEntity: "person",
                        fieldKey: "email",
                    }),
                ]),
                col(proofId(profileBase, "r0"), 1, HALF, [
                    bindingField(profileBase, "person.last_name", "Last name", {
                        bindingClass: "base_field",
                        contractBlockKind: "section",
                        sourceEntity: "person",
                        fieldKey: "last_name",
                    }),
                    bindingField(profileBase, "person.phone", "Phone", {
                        bindingClass: "base_field",
                        contractBlockKind: "section",
                        sourceEntity: "person",
                        fieldKey: "phone",
                    }, "phone"),
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

    const pcBase = proofId(ENTITY, PREFIX, "primary_child");
    const primaryChild = proofSection(
        ENTITY,
        PREFIX,
        "primary_child",
        "Primary child",
        [
            row(proofId(pcBase, "r0"), [
                col(proofId(pcBase, "r0"), 0, HALF, [
                    bindingField(pcBase, "child.name", "Child", {
                        bindingClass: "relationship_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "primary_child",
                        sourceEntity: "child",
                        fieldKey: "name",
                    }),
                ]),
                col(proofId(pcBase, "r0"), 1, HALF, [
                    bindingField(pcBase, "child.date_of_birth", "Date of birth", {
                        bindingClass: "relationship_field",
                        contractBlockKind: "relationship_section",
                        relationKey: "primary_child",
                        sourceEntity: "child",
                        fieldKey: "date_of_birth",
                    }, "date"),
                ]),
            ]),
        ],
    );

    const chBase = proofId(ENTITY, PREFIX, "household_children");
    const childrenRepeater: LayoutItem = withItemBinding(
        {
            id: proofId(chBase, "children_repeater"),
            kind: "related_list",
            refKey: "household_children",
            label: "Children",
            source: "household_children",
            displayMode: "table",
            related: { entityType: "customer_members", filterKey: "household" },
            columns: [
                { label: "Child", refKey: "child.name", width: "medium" },
                { label: "Date of birth", refKey: "child.date_of_birth", width: "medium", renderHint: "date" },
                { label: "Age band", refKey: "child.age_band", width: "medium" },
                { label: "Status", refKey: "child.status_key", width: "medium", renderHint: "status" },
            ],
        },
        {
            bindingClass: "repeater",
            contractBlockKind: "repeater",
            relationKey: "household_children",
            sourceEntity: "child",
        },
    );

    const childrenSection = proofSection(
        ENTITY,
        PREFIX,
        "household_children",
        "Children",
        [row(proofId(chBase, "r0"), [col(proofId(chBase, "r0"), 0, LAYOUT_GRID_COLUMNS, [childrenRepeater])])],
        true,
    );

    const baseDoc: LayoutDoc = {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "drawer",
        entityType: ENTITY,
        sections: [profile, household, primaryChild, childrenSection],
        metadata: {
            template: "person_relationship_proof_v1",
            phase: "runtime_convergence_person_child_foundation",
            anchorEntity: ENTITY,
        },
    };

    return appendFutureModuleSection(
        baseDoc,
        futureModuleSection(ENTITY, PREFIX, [...PERSON_FUTURE_DRAWER_MODULES]),
    );
}
