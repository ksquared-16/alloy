/**
 * Tenant-configured Household relationship section instances.
 */

import {
    defaultNestedSurfaceConfig,
    groupDefsFor,
    type NestedSurfaceConfig,
    type NestedSurfaceGroupConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { splitDefaultFieldsForIdentityGroup } from "@/lib/adminV2/settings/surfaces/identityDisclosureDefaults";
import { generateDefaultIdentityFieldPlacements } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import {
    addableHouseholdRelationshipSectionDefinitions,
    canRemoveHouseholdRelationshipInstance,
    householdRelationshipSectionDefinition,
    householdRelationshipSectionDefinitionForLegacyGroup,
    LEGACY_GROUP_KEY_TO_DEFINITION,
    type HouseholdRelationshipSectionDefinition,
    type RelationshipCriteria,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionDefinitions";
import { HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

export type HouseholdRelationshipSectionInstance = {
    instanceKey: string;
    definitionKey: string;
    label: string;
    relationshipCriteria: RelationshipCriteria;
    visibility: "always" | "when_nonempty" | "hidden";
    order: number;
    presentationRef: string;
    enabled: boolean;
    roleOverride?: boolean;
    clickBehavior: HouseholdRelationshipSectionDefinition["clickBehavior"];
    handoffSurfaceKey?: string;
    policy: HouseholdRelationshipSectionDefinition["policy"];
};

const NON_INSTANCE_GROUP_KEYS = new Set(["contact_edit", "child_edit", "address"]);

function defaultVisibility(definitionKey: string): "always" | "when_nonempty" | "hidden" {
    if (definitionKey === "parent_primary" || definitionKey === "children") return "always";
    return "when_nonempty";
}

function seedGroupFromDefinition(
    surfaceId: string,
    def: HouseholdRelationshipSectionDefinition,
    instanceKey: string,
    existing?: NestedSurfaceGroupConfig,
): NestedSurfaceGroupConfig {
    const presentationKey = def.presentationGroupKey;
    const groupDef = groupDefsFor(surfaceId).find((entry) => entry.key === presentationKey);
    const layerKeys = groupDef
        ? (() => {
              const split = splitDefaultFieldsForIdentityGroup(surfaceId, presentationKey, groupDef.defaultFieldKeys);
              return {
                  selectedFieldKeys: split.summary,
                  contextFieldKeys: split.contextFacts,
                  expandedFieldKeys: split.details,
              };
          })()
        : { selectedFieldKeys: [], contextFieldKeys: [], expandedFieldKeys: [] };

    const base: NestedSurfaceGroupConfig = existing ?? {
        key: instanceKey,
        ...layerKeys,
        enabled: true,
    };

    return {
        ...base,
        key: instanceKey,
        definitionKey: def.definitionKey,
        instanceKey,
        presentationRef: presentationKey,
        sectionLabel: base.sectionLabel ?? def.defaultLabel,
        sectionSemantic: base.sectionSemantic ?? def.sectionSemantic,
        relationshipCriteria: base.relationshipCriteria ?? def.defaultCriteria,
        sectionVisibility: base.sectionVisibility ?? defaultVisibility(def.definitionKey),
        enabled: base.enabled !== false,
    };
}

/** Infer and persist definition/instance metadata on legacy groups. */
export function migrateHouseholdRelationshipSectionInstances(config: NestedSurfaceConfig): NestedSurfaceConfig {
    if (config.surfaceId !== HOUSEHOLD_SURFACE_ID) return config;

    const seenDefinitions = new Set<string>();
    const groups = config.groups.map((group, index) => {
        if (NON_INSTANCE_GROUP_KEYS.has(group.key)) return group;
        const def =
            (group.definitionKey ? householdRelationshipSectionDefinition(group.definitionKey) : undefined)
            ?? householdRelationshipSectionDefinitionForLegacyGroup(group.key);
        if (!def) return group;

        if (!def.allowMultipleInstances) {
            if (seenDefinitions.has(def.definitionKey)) {
                return { ...group, enabled: false };
            }
            seenDefinitions.add(def.definitionKey);
        }

        const instanceKey = group.instanceKey ?? group.key;
        return seedGroupFromDefinition(config.surfaceId, def, instanceKey, {
            ...group,
            key: instanceKey,
            instanceKey,
            definitionKey: def.definitionKey,
            presentationRef: group.presentationRef ?? def.presentationGroupKey,
            sectionOrder: group.sectionOrder ?? index,
        });
    });

    return { ...config, groups };
}

export function listHouseholdRelationshipSectionInstances(
    config: NestedSurfaceConfig | null,
): HouseholdRelationshipSectionInstance[] {
    if (!config) return [];
    const migrated = migrateHouseholdRelationshipSectionInstances(config);
    const instances: HouseholdRelationshipSectionInstance[] = [];
    migrated.groups.forEach((group, index) => {
        if (NON_INSTANCE_GROUP_KEYS.has(group.key)) return;
        if (group.enabled === false) return;
        const def =
            (group.definitionKey ? householdRelationshipSectionDefinition(group.definitionKey) : undefined)
            ?? householdRelationshipSectionDefinitionForLegacyGroup(group.key);
        if (!def) return;
        instances.push({
            instanceKey: group.instanceKey ?? group.key,
            definitionKey: def.definitionKey,
            label: group.sectionLabel?.trim() || def.defaultLabel,
            relationshipCriteria: group.relationshipCriteria ?? def.defaultCriteria ?? {},
            visibility: group.sectionVisibility ?? defaultVisibility(def.definitionKey),
            order: group.sectionOrder ?? index,
            presentationRef: group.presentationRef ?? def.presentationGroupKey,
            enabled: true,
            roleOverride: group.roleOverride,
            clickBehavior: def.clickBehavior,
            handoffSurfaceKey: def.handoffSurfaceKey,
            policy: def.policy,
        });
    });
    return instances;
}

export function existingHouseholdDefinitionKeys(config: NestedSurfaceConfig): Set<string> {
    return new Set(
        listHouseholdRelationshipSectionInstances(config).map((instance) => instance.definitionKey),
    );
}

export function addableHouseholdRelationshipSections(config: NestedSurfaceConfig) {
    return addableHouseholdRelationshipSectionDefinitions(existingHouseholdDefinitionKeys(config));
}

/** Resolve presentation group key for field authoring (registry lookup). */
export function presentationGroupKeyForInstance(
    config: NestedSurfaceConfig,
    instanceKey: string,
): string {
    const group = config.groups.find((entry) => (entry.instanceKey ?? entry.key) === instanceKey);
    if (!group) return instanceKey;
    return group.presentationRef ?? group.key;
}

function nextCustomInstanceKey(config: NestedSurfaceConfig, definitionKey: string): string {
    const prefix = `${definitionKey}_`;
    const count = config.groups.filter((group) => group.definitionKey === definitionKey).length;
    return `${prefix}${count + 1}`;
}

/** Add a section instance from a canonical definition. */
export function addHouseholdRelationshipSectionInstance(
    config: NestedSurfaceConfig,
    definitionKey: string,
    options?: { label?: string },
): NestedSurfaceConfig {
    const def = householdRelationshipSectionDefinition(definitionKey);
    if (!def) return config;

    const existing = config.groups.find(
        (group) => group.definitionKey === definitionKey || group.key === def.presentationGroupKey,
    );

    if (existing && !def.allowMultipleInstances) {
        const instanceKey = existing.instanceKey ?? existing.key;
        const groups = config.groups.map((group) =>
            (group.instanceKey ?? group.key) === instanceKey
                ? seedGroupFromDefinition(config.surfaceId, def, instanceKey, {
                      ...group,
                      enabled: true,
                      sectionLabel: options?.label ?? group.sectionLabel ?? def.defaultLabel,
                      definitionKey: def.definitionKey,
                      instanceKey,
                      presentationRef: def.presentationGroupKey,
                  })
                : group,
        );
        return migrateHouseholdRelationshipSectionInstances({ ...config, groups });
    }

    const instanceKey = def.allowMultipleInstances
        ? nextCustomInstanceKey(config, definitionKey)
        : def.presentationGroupKey;

    const seeded = seedGroupFromDefinition(config.surfaceId, def, instanceKey, {
        key: instanceKey,
        selectedFieldKeys: [],
        enabled: true,
        sectionLabel: options?.label ?? def.defaultLabel,
        fieldPlacements: generateDefaultIdentityFieldPlacements({
            selectedFieldKeys: [...(groupDefsFor(config.surfaceId).find((g) => g.key === def.presentationGroupKey)
                ?.defaultFieldKeys ?? [])],
        }),
    });

    const withoutDupes = def.allowMultipleInstances
        ? config.groups
        : config.groups.filter((group) => group.key !== def.presentationGroupKey || group.enabled === false);

    return migrateHouseholdRelationshipSectionInstances({
        ...config,
        groups: [...withoutDupes, seeded],
    });
}

export function removeHouseholdRelationshipSectionInstance(
    config: NestedSurfaceConfig,
    instanceKey: string,
): NestedSurfaceConfig {
    const group = config.groups.find((entry) => (entry.instanceKey ?? entry.key) === instanceKey);
    if (!group?.definitionKey) return config;
    if (!canRemoveHouseholdRelationshipInstance({ definitionKey: group.definitionKey })) return config;

    return migrateHouseholdRelationshipSectionInstances({
        ...config,
        groups: config.groups.map((entry) =>
            (entry.instanceKey ?? entry.key) === instanceKey ? { ...entry, enabled: false } : entry,
        ),
    });
}

export function renameHouseholdRelationshipSectionInstance(
    config: NestedSurfaceConfig,
    instanceKey: string,
    label: string,
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((group) =>
            (group.instanceKey ?? group.key) === instanceKey
                ? { ...group, sectionLabel: label.trim() || undefined }
                : group,
        ),
    };
}

export function setHouseholdRelationshipSectionCriteria(
    config: NestedSurfaceConfig,
    instanceKey: string,
    criteria: RelationshipCriteria,
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((group) =>
            (group.instanceKey ?? group.key) === instanceKey
                ? { ...group, relationshipCriteria: criteria }
                : group,
        ),
    };
}

export function setHouseholdRelationshipSectionVisibility(
    config: NestedSurfaceConfig,
    instanceKey: string,
    visibility: "always" | "when_nonempty" | "hidden",
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((group) =>
            (group.instanceKey ?? group.key) === instanceKey
                ? { ...group, sectionVisibility: visibility }
                : group,
        ),
    };
}

/** Default household config with migrated section instances. */
export function defaultHouseholdRelationshipSectionConfig(): NestedSurfaceConfig {
    return migrateHouseholdRelationshipSectionInstances(defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID));
}

export function legacyGroupKeyForDefinition(definitionKey: string): string | undefined {
    const entry = Object.entries(LEGACY_GROUP_KEY_TO_DEFINITION).find(([, key]) => key === definitionKey);
    return entry?.[0];
}
