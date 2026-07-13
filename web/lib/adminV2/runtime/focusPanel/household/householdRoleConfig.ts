/**
 * Role-based Household identity configuration.
 *
 * Parent / Guardian defaults live on `contact_edit` and apply to Primary Contact
 * and Other Parent / Guardian unless a section has an explicit role override.
 */

import type { NestedSurfaceConfig, NestedSurfaceGroupConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { generateDefaultIdentityFieldPlacements } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import { migrateIdentityDisclosureGroup } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";

/** Canonical Parent / Guardian template group (not a runtime section). */
export const HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP = "contact_edit" as const;

/** Runtime sections that inherit Parent / Guardian field configuration by default. */
export const HOUSEHOLD_PARENT_GUARDIAN_RUNTIME_GROUPS = [
    "primary_contact",
    "other_parent_guardian",
] as const;

export type HouseholdParentGuardianRuntimeGroup = (typeof HOUSEHOLD_PARENT_GUARDIAN_RUNTIME_GROUPS)[number];

export function isHouseholdParentGuardianRuntimeGroup(
    groupKey: string,
): groupKey is HouseholdParentGuardianRuntimeGroup {
    return (HOUSEHOLD_PARENT_GUARDIAN_RUNTIME_GROUPS as readonly string[]).includes(groupKey);
}

/** Builder authoring target — semantic role, not a representative record. */
export function householdAuthoringGroupKey(groupKey: string): string {
    if (isHouseholdParentGuardianRuntimeGroup(groupKey)) return HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP;
    return groupKey;
}

export function householdAuthoringGroupLabel(groupKey: string, registryLabel?: string): string {
    if (groupKey === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP) return "Parent / Guardian";
    return registryLabel ?? groupKey;
}


function bridgeTemplateFieldRef(templateRef: string): string {
    return PARENT_GUARDIAN_TEMPLATE_TO_RUNTIME_FIELD[templateRef] ?? templateRef;
}

const PARENT_GUARDIAN_TEMPLATE_TO_RUNTIME_FIELD: Record<string, string> = {
    "contact.phone": "person.phone",
    "contact.email": "person.email",
    "contact.first_name": "person.primary_contact_name",
    "contact.last_name": "person.primary_contact_name",
};

function templatePlacementForRuntimeField(
    templatePlacements: ReturnType<typeof generateDefaultIdentityFieldPlacements>,
    runtimeFieldRef: string,
    tier: string,
) {
    const direct = templatePlacements.find(
        (placement) => placement.fieldRef === runtimeFieldRef && placement.tier === tier,
    );
    if (direct) return direct;
    const templateRef = Object.entries(PARENT_GUARDIAN_TEMPLATE_TO_RUNTIME_FIELD).find(
        ([, runtimeRef]) => runtimeRef === runtimeFieldRef,
    )?.[0];
    if (!templateRef) return undefined;
    return templatePlacements.find(
        (placement) => placement.fieldRef === templateRef && placement.tier === tier,
    );
}

function mergePlacements(
    template: NestedSurfaceGroupConfig,
    runtime: NestedSurfaceGroupConfig,
): NestedSurfaceGroupConfig["fieldPlacements"] {
    const templatePlacements = template.fieldPlacements ?? generateDefaultIdentityFieldPlacements(template);
    const runtimePlacements = runtime.fieldPlacements ?? generateDefaultIdentityFieldPlacements(runtime);
    const runtimeByKey = new Map(
        runtimePlacements.map((placement) => [`${placement.tier}:${placement.fieldRef}`, placement]),
    );
    const merged = runtimePlacements.map((runtimePlacement) => {
        const override = runtimeByKey.get(`${runtimePlacement.tier}:${runtimePlacement.fieldRef}`);
        const templatePlacement = templatePlacementForRuntimeField(
            templatePlacements,
            runtimePlacement.fieldRef,
            runtimePlacement.tier,
        );
        if (override?.policy) return override;
        if (templatePlacement?.policy) {
            return { ...runtimePlacement, policy: templatePlacement.policy };
        }
        return runtimePlacement;
    });

    for (const templatePlacement of templatePlacements) {
        const runtimeFieldRef = bridgeTemplateFieldRef(templatePlacement.fieldRef);
        const exists = merged.some(
            (placement) =>
                placement.fieldRef === runtimeFieldRef && placement.tier === templatePlacement.tier,
        );
        if (exists) continue;
        merged.push({ ...templatePlacement, fieldRef: runtimeFieldRef });
    }

    return merged;
}

function mergeFieldMaps<T extends Record<string, unknown>>(
    template: T | undefined,
    runtime: T | undefined,
): T | undefined {
    if (!template && !runtime) return undefined;
    return { ...(template ?? {}), ...(runtime ?? {}) } as T;
}

/** Merge Parent / Guardian template into a runtime parent section when not overridden. */
export function resolveHouseholdRoleMergedGroup(
    config: NestedSurfaceConfig,
    runtimeGroupKey: string,
): NestedSurfaceGroupConfig | undefined {
    const runtime = config.groups.find((group) => group.key === runtimeGroupKey);
    if (!runtime) return undefined;
    if (!isHouseholdParentGuardianRuntimeGroup(runtimeGroupKey)) return runtime;
    if (runtime.roleOverride === true) return runtime;

    const template = config.groups.find((group) => group.key === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP);
    if (!template) return runtime;

    const templateContextKeys = (template.contextFieldKeys ?? []).map(bridgeTemplateFieldRef);
    const templateDetailKeys = (template.expandedFieldKeys ?? []).map(bridgeTemplateFieldRef);

    const mergedBase = {
        ...runtime,
        selectedFieldKeys:
            runtime.selectedFieldKeys.length > 0 ? runtime.selectedFieldKeys : [...template.selectedFieldKeys],
        contextFieldKeys:
            (runtime.contextFieldKeys?.length ?? 0) > 0
                ? runtime.contextFieldKeys
                : templateContextKeys.length > 0
                    ? templateContextKeys
                    : runtime.contextFieldKeys,
        expandedFieldKeys:
            (runtime.expandedFieldKeys?.length ?? 0) > 0
                ? runtime.expandedFieldKeys
                : templateDetailKeys.length > 0
                    ? templateDetailKeys
                    : template.expandedFieldKeys,
        fieldPolicies: mergeFieldMaps(template.fieldPolicies, runtime.fieldPolicies),
        fieldLabels: mergeFieldMaps(template.fieldLabels, runtime.fieldLabels),
        fieldLayoutWidths: mergeFieldMaps(template.fieldLayoutWidths, runtime.fieldLayoutWidths),
        evidenceCollections:
            (runtime.evidenceCollections?.length ?? 0) > 0
                ? runtime.evidenceCollections
                : template.evidenceCollections,
    };

    const migrated = migrateIdentityDisclosureGroup(mergedBase);
    return {
        ...migrated,
        fieldPlacements: mergePlacements(template, migrated),
    };
}

/** Nested config with role-merged parent sections for runtime VM building. */
export function withHouseholdRoleMergedGroups(config: NestedSurfaceConfig): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((group) => {
            if (!isHouseholdParentGuardianRuntimeGroup(group.key)) return group;
            return resolveHouseholdRoleMergedGroup(config, group.key) ?? group;
        }),
    };
}
