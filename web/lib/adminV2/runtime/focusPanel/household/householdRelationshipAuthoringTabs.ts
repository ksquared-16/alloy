/**
 * Builder section tabs for Household disclosure authoring.
 * Orthogonal to Relationship Sections management (add/reorder/delete).
 */

import {
    HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP,
    isHouseholdParentGuardianRuntimeGroup,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import {
    listHouseholdRelationshipSectionInstances,
    type HouseholdRelationshipSectionInstance,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionInstances";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

export type HouseholdRelationshipAuthoringTab = {
    key: string;
    label: string;
    kind: "parent_guardian_shared" | "parent_override" | "relationship" | "children_handoff";
    instanceKey?: string;
    presentationRef?: string;
};

/**
 * Tabs for Summary / Context / Details / Evidence authoring.
 * Parent / Guardian is one shared tab unless an override is explicitly enabled.
 */
export function buildHouseholdRelationshipAuthoringTabs(
    config: NestedSurfaceConfig | null,
): HouseholdRelationshipAuthoringTab[] {
    const tabs: HouseholdRelationshipAuthoringTab[] = [
        {
            key: HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP,
            label: "Parent / Guardian",
            kind: "parent_guardian_shared",
        },
    ];

    if (!config) return tabs;

    const instances = listHouseholdRelationshipSectionInstances(config);
    for (const instance of instances) {
        if (instance.definitionKey === "parent_primary") continue;

        if (instance.definitionKey === "parent_guardian") {
            if (parentGuardianOverrideEnabled(config, instance)) {
                tabs.push({
                    key: instance.instanceKey,
                    label: operatorFacingSectionLabel(instance),
                    kind: "parent_override",
                    instanceKey: instance.instanceKey,
                    presentationRef: instance.presentationRef,
                });
            }
            continue;
        }

        if (instance.definitionKey === "children") {
            tabs.push({
                key: instance.instanceKey,
                label: operatorFacingSectionLabel(instance),
                kind: "children_handoff",
                instanceKey: instance.instanceKey,
                presentationRef: instance.presentationRef,
            });
            continue;
        }

        tabs.push({
            key: instance.instanceKey,
            label: operatorFacingSectionLabel(instance),
            kind: "relationship",
            instanceKey: instance.instanceKey,
            presentationRef: instance.presentationRef,
        });
    }

    return tabs;
}

export function operatorFacingSectionLabel(instance: HouseholdRelationshipSectionInstance): string {
    const label = instance.label.trim();
    if (!label || /^parent\s*#?\s*2$/i.test(label) || /^parent#2$/i.test(label)) {
        if (instance.definitionKey === "parent_guardian") return "Other Parent / Guardian";
        return instance.label || instance.definitionKey;
    }
    return label;
}

function parentGuardianOverrideEnabled(
    config: NestedSurfaceConfig,
    instance: HouseholdRelationshipSectionInstance,
): boolean {
    const group = config.groups.find(
        (entry) => (entry.instanceKey ?? entry.key) === instance.instanceKey || entry.key === instance.presentationRef,
    );
    return group?.roleOverride === true;
}

/** Map a Builder tab key to the nested group key used for field mutations. */
export function authoringGroupKeyForTab(tabKey: string): string {
    if (tabKey === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP) return HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP;
    if (isHouseholdParentGuardianRuntimeGroup(tabKey)) return HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP;
    return tabKey;
}

/** Selection key for composer region when a tab is chosen. */
export function selectionGroupKeyForTab(tabKey: string): string {
    if (tabKey === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP) return HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP;
    return tabKey;
}
