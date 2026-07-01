import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";
import type { PersonDrawerRelationshipGroups } from "@/lib/admin/person/personDrawerVisibilityTypes";
import {
    personDrawerIsMixedRolePresentation,
    resolvePersonDrawerPresentationEmphasis,
} from "@/lib/admin/person/personDrawerPresentationEmphasis";

export type PersonDrawerRelationshipSectionModel = {
    /** Drawer section title (Family / Children / Relationships). */
    sectionTitle: string;
    showParents: boolean;
    showGuardians: boolean;
    showEmergency: boolean;
    showChildren: boolean;
    showSiblings: boolean;
    siblingsTitle: string;
};

/**
 * Profile-derived relationship section model — not a persisted person type.
 * Future: `record_drawer_layouts.config_json.section_placements_v1` with `visible_when.roles`.
 */
export function resolvePersonDrawerRelationshipSectionModel(
    profile: PersonDrawerProfileResult,
    groups: PersonDrawerRelationshipGroups
): PersonDrawerRelationshipSectionModel {
    const emphasis = resolvePersonDrawerPresentationEmphasis(profile);
    const mixed = personDrawerIsMixedRolePresentation(profile);

    if (mixed) {
        return {
            sectionTitle: "Family",
            showParents: groups.parents.length > 0,
            showGuardians: groups.guardians.length > 0,
            showEmergency: groups.emergency_contacts.length > 0,
            showChildren: groups.children.length > 0,
            showSiblings: groups.siblings.length > 0,
            siblingsTitle: "Siblings",
        };
    }

    if (emphasis === "child_lifecycle") {
        return {
            sectionTitle: "Family",
            showParents: groups.parents.length > 0,
            showGuardians: groups.guardians.length > 0,
            showEmergency: groups.emergency_contacts.length > 0,
            showChildren: false,
            showSiblings: groups.siblings.length > 0,
            siblingsTitle: "Siblings",
        };
    }

    if (emphasis === "guardian_communication") {
        return {
            sectionTitle: "Children",
            showParents: false,
            showGuardians: false,
            showEmergency: false,
            showChildren: groups.children.length > 0,
            showSiblings: false,
            siblingsTitle: "Children",
        };
    }

    if (emphasis === "emergency_reachability") {
        return {
            sectionTitle: "Relationships",
            showParents: groups.parents.length > 0,
            showGuardians: groups.guardians.length > 0,
            showEmergency: false,
            showChildren: groups.children.length > 0,
            showSiblings: groups.siblings.length > 0,
            siblingsTitle: "Siblings",
        };
    }

    return {
        sectionTitle: "Relationships",
        showParents: groups.parents.length > 0,
        showGuardians: groups.guardians.length > 0,
        showEmergency: groups.emergency_contacts.length > 0,
        showChildren: groups.children.length > 0,
        showSiblings: groups.siblings.length > 0,
        siblingsTitle: "Siblings",
    };
}

export function resolvePersonDrawerRelationshipSectionTitle(profile: PersonDrawerProfileResult): string {
    const emphasis = resolvePersonDrawerPresentationEmphasis(profile);
    if (personDrawerIsMixedRolePresentation(profile)) return "Family";
    if (emphasis === "child_lifecycle") return "Family";
    if (emphasis === "guardian_communication") return "Children";
    return "Relationships";
}

export function personDrawerRelationshipSectionHasContent(
    model: PersonDrawerRelationshipSectionModel,
    groups: PersonDrawerRelationshipGroups
): boolean {
    return (
        (model.showParents && groups.parents.length > 0) ||
        (model.showGuardians && groups.guardians.length > 0) ||
        (model.showEmergency && groups.emergency_contacts.length > 0) ||
        (model.showChildren && groups.children.length > 0) ||
        (model.showSiblings && groups.siblings.length > 0)
    );
}
