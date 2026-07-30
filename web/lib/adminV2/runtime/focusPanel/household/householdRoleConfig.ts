/**
 * Role-based Household identity configuration.
 *
 * Parent / Guardian defaults live on `contact_edit` and apply to Primary Contact
 * and Other Parent / Guardian unless a section has an explicit role override.
 *
 * Published `contact_edit` tier config is authoritative when inheriting:
 * - explicit keys (including `[]`) replace runtime seed entirely
 * - `undefined` tier keys may fall back to runtime seed
 */

import type { NestedSurfaceConfig, NestedSurfaceGroupConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    generateDefaultIdentityFieldPlacements,
    identityFieldLayoutWidthForPurpose,
    resolveIdentityPlacementLabelMode,
    type IdentityFieldPlacement,
} from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import { chunkNestedSurfaceFieldsForHalfRowLayout } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import { migrateIdentityDisclosureGroup } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import { normalizeIdentityStorageTier } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

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

/**
 * Normalize Household identity field refs to canonical Field Platform identity.
 * Deduplicate by this identity — never by label string.
 */
export const HOUSEHOLD_IDENTITY_FIELD_ALIASES: Record<string, string> = {
    "contact.phone": "person.phone",
    "contact.email": "person.email",
    "contact.first_name": "person.first_name",
    "contact.last_name": "person.last_name",
    "contact.address_line": "person.address_line1",
    "contact.address_line1": "person.address_line1",
    "contact.address_line2": "person.address_line2",
    "contact.address": "person.address_line1",
    "person.address_line": "person.address_line1",
    "person.address": "person.address_line1",
    "person.dob": "person.date_of_birth",
    "contact.date_of_birth": "person.date_of_birth",
    "contact.dob": "person.date_of_birth",
};

export function normalizeHouseholdIdentityFieldRef(fieldRef: string): string {
    const trimmed = fieldRef.trim();
    return HOUSEHOLD_IDENTITY_FIELD_ALIASES[trimmed] ?? trimmed;
}

/** Deduplicate an ordered field-ref list by canonical identity. PURE. */
export function dedupeHouseholdIdentityFieldRefs(fieldRefs: readonly string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const ref of fieldRefs) {
        const canonical = normalizeHouseholdIdentityFieldRef(ref);
        if (!canonical || seen.has(canonical)) continue;
        seen.add(canonical);
        out.push(canonical);
    }
    return out;
}

function bridgeTemplateFieldRef(templateRef: string): string {
    return normalizeHouseholdIdentityFieldRef(templateRef);
}

/**
 * Choose authoritative tier keys from the Parent / Guardian template.
 * - template defined (including `[]`) → use bridged template keys
 * - template `undefined` → leave unset (do NOT inherit seeded primary_contact pollution)
 *
 * Runtime section keys are only used when no template exists (see resolveHouseholdRoleMergedGroup).
 */
function resolveAuthoritativeTierKeys(
    templateKeys: string[] | undefined,
): string[] | undefined {
    if (templateKeys === undefined) return undefined;
    return dedupeHouseholdIdentityFieldRefs(templateKeys.map(bridgeTemplateFieldRef));
}

function mergeFieldMaps<T>(
    template: Record<string, T> | undefined,
    runtime: Record<string, T> | undefined,
): Record<string, T> | undefined {
    if (!template && !runtime) return undefined;
    // Template (published role) wins on key conflict when inheriting.
    return { ...(runtime ?? {}), ...(template ?? {}) };
}

/** Remap contact.* → person.* keys so purpose widths / icons match bridged field refs. */
function remapHouseholdFieldMap<T>(map: Record<string, T> | undefined): Record<string, T> | undefined {
    if (!map) return undefined;
    const out: Record<string, T> = {};
    for (const [key, value] of Object.entries(map)) {
        out[normalizeHouseholdIdentityFieldRef(key)] = value;
    }
    return out;
}

function mergeHouseholdFieldMaps<T>(
    template: Record<string, T> | undefined,
    runtime: Record<string, T> | undefined,
): Record<string, T> | undefined {
    return mergeFieldMaps(remapHouseholdFieldMap(template), remapHouseholdFieldMap(runtime));
}

function normalizePlacementFieldRef(placement: IdentityFieldPlacement): IdentityFieldPlacement {
    return {
        ...placement,
        fieldRef: normalizeHouseholdIdentityFieldRef(placement.fieldRef),
    };
}

/**
 * Build placements from the authoritative template, then overlay any runtime
 * policy-only overrides for the same canonical field. Does NOT union seeded
 * runtime fields that were never published on the role template.
 */
function buildAuthoritativePlacements(
    template: NestedSurfaceGroupConfig,
    runtime: NestedSurfaceGroupConfig,
    summaryKeys: string[],
    contextKeys: string[] | undefined,
    detailKeys: string[] | undefined,
): NestedSurfaceGroupConfig["fieldPlacements"] {
    const mergedFieldModes = mergeFieldMaps(template.fieldModes, runtime.fieldModes);
    const templatePlacements = (template.fieldPlacements ?? generateDefaultIdentityFieldPlacements(template)).map(
        normalizePlacementFieldRef,
    );
    const runtimePlacements = (runtime.fieldPlacements ?? []).map(normalizePlacementFieldRef);
    const templateByTierField = new Map(
        templatePlacements.map((placement) => [
            `${normalizeIdentityStorageTier(placement.tier)}:${placement.fieldRef}`,
            placement,
        ]),
    );
    const runtimeByTierField = new Map(
        runtimePlacements.map((placement) => [
            `${normalizeIdentityStorageTier(placement.tier)}:${placement.fieldRef}`,
            placement,
        ]),
    );

    const buildTier = (
        tier: "summary" | "context_fact" | "details",
        keys: string[] | undefined,
    ): IdentityFieldPlacement[] => {
        if (!keys) return [];
        const purpose =
            tier === "context_fact" ? ("context_facts" as const) : tier === "details" ? ("details" as const) : ("summary" as const);
        // Pack with purpose-scoped widths (Summary full vs Context Facts half stay independent).
        // Never assign row=index — that forced one field per row and broke half stacking.
        // Layout widths: Parent / Guardian template is authoritative (like summary keys).
        // Do not gap-fill from primary_contact — that leaked Context Facts half pairings
        // into Summary and forced phone|email onto one row after "Full" authoring.
        const layoutGroup: NestedSurfaceGroupConfig = {
            ...template,
            fieldModes: mergedFieldModes,
            fieldLayoutWidths: remapHouseholdFieldMap(template.fieldLayoutWidths),
            fieldLayoutWidthsByPurpose: {
                summary: remapHouseholdFieldMap(template.fieldLayoutWidthsByPurpose?.summary),
                context_facts: remapHouseholdFieldMap(template.fieldLayoutWidthsByPurpose?.context_facts),
                details: remapHouseholdFieldMap(template.fieldLayoutWidthsByPurpose?.details),
            },
            fieldIcons: mergeHouseholdFieldMaps(template.fieldIcons, runtime.fieldIcons),
        };
        const widthFor = (fieldRef: string) => {
            const purposeMap = layoutGroup.fieldLayoutWidthsByPurpose?.[purpose];
            const explicit =
                purposeMap?.[fieldRef]
                ?? (purpose === "summary" ? layoutGroup.fieldLayoutWidths?.[fieldRef] : undefined);
            if (explicit) return explicit;
            // Template placement width only — never runtime primary_contact halves.
            const key = `${tier}:${fieldRef}`;
            return (
                templateByTierField.get(key)?.width
                ?? identityFieldLayoutWidthForPurpose(layoutGroup, fieldRef, purpose)
            );
        };
        const chunks = chunkNestedSurfaceFieldsForHalfRowLayout(keys, widthFor);
        const out: IdentityFieldPlacement[] = [];
        chunks.forEach((chunk, rowIndex) => {
            chunk.forEach((fieldRef, columnIndex) => {
                const key = `${tier}:${fieldRef}`;
                const templatePlacement = templateByTierField.get(key);
                const runtimeOverride = runtimeByTierField.get(key);
                const width = widthFor(fieldRef);
                const icon =
                    templatePlacement?.icon
                    ?? runtimeOverride?.icon
                    ?? layoutGroup.fieldIcons?.[fieldRef];
                out.push({
                    fieldRef,
                    tier,
                    row: rowIndex + 1,
                    column: (columnIndex + 1) as 1 | 2 | 3,
                    width,
                    icon,
                    labelMode: resolveIdentityPlacementLabelMode(
                        {
                            fieldRef,
                            labelMode: runtimeOverride?.labelMode ?? templatePlacement?.labelMode,
                        },
                        mergedFieldModes,
                        fieldRef,
                    ),
                    hideWhenEmpty: templatePlacement?.hideWhenEmpty ?? runtimeOverride?.hideWhenEmpty,
                    policy: runtimeOverride?.policy ?? templatePlacement?.policy,
                    linkTarget: runtimeOverride?.linkTarget ?? templatePlacement?.linkTarget,
                });
            });
        });
        return out;
    };

    return [
        ...buildTier("summary", summaryKeys),
        ...buildTier("context_fact", contextKeys),
        ...buildTier("details", detailKeys),
    ];
}

/** Merge Parent / Guardian template into a runtime parent section when not overridden. */
export function resolveHouseholdRoleMergedGroup(
    config: NestedSurfaceConfig,
    runtimeGroupKey: string,
): NestedSurfaceGroupConfig | undefined {
    const runtime = config.groups.find((group) => group.key === runtimeGroupKey);
    if (!runtime) return undefined;
    if (!isHouseholdParentGuardianRuntimeGroup(runtimeGroupKey)) return runtime;
    if (runtime.roleOverride === true) {
        // Still normalize aliases + dedupe on explicit overrides.
        return {
            ...runtime,
            selectedFieldKeys: dedupeHouseholdIdentityFieldRefs(runtime.selectedFieldKeys),
            contextFieldKeys:
                runtime.contextFieldKeys === undefined
                    ? undefined
                    : dedupeHouseholdIdentityFieldRefs(runtime.contextFieldKeys),
            expandedFieldKeys:
                runtime.expandedFieldKeys === undefined
                    ? undefined
                    : dedupeHouseholdIdentityFieldRefs(runtime.expandedFieldKeys),
            fieldPlacements: (runtime.fieldPlacements ?? []).map(normalizePlacementFieldRef),
        };
    }

    const template = config.groups.find((group) => group.key === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP);
    if (!template) {
        return {
            ...runtime,
            selectedFieldKeys: dedupeHouseholdIdentityFieldRefs(runtime.selectedFieldKeys),
            contextFieldKeys:
                runtime.contextFieldKeys === undefined
                    ? undefined
                    : dedupeHouseholdIdentityFieldRefs(runtime.contextFieldKeys),
            expandedFieldKeys:
                runtime.expandedFieldKeys === undefined
                    ? undefined
                    : dedupeHouseholdIdentityFieldRefs(runtime.expandedFieldKeys),
            fieldPlacements: (runtime.fieldPlacements ?? []).map(normalizePlacementFieldRef),
        };
    }

    // Summary keys always exist on the template group — published role wins completely.
    const summaryKeys = dedupeHouseholdIdentityFieldRefs(
        template.selectedFieldKeys.map(bridgeTemplateFieldRef),
    );
    const contextKeys = resolveAuthoritativeTierKeys(template.contextFieldKeys);
    const detailKeys = resolveAuthoritativeTierKeys(template.expandedFieldKeys);

    const mergedBase: NestedSurfaceGroupConfig = {
        ...runtime,
        selectedFieldKeys: summaryKeys,
        contextFieldKeys: contextKeys,
        expandedFieldKeys: detailKeys,
        fieldPolicies: mergeHouseholdFieldMaps(template.fieldPolicies, runtime.fieldPolicies),
        fieldLabels: mergeHouseholdFieldMaps(template.fieldLabels, runtime.fieldLabels),
        fieldIcons: mergeHouseholdFieldMaps(template.fieldIcons, runtime.fieldIcons),
        fieldLayoutWidths: remapHouseholdFieldMap(template.fieldLayoutWidths),
        fieldLayoutWidthsByPurpose: {
            summary: remapHouseholdFieldMap(template.fieldLayoutWidthsByPurpose?.summary),
            context_facts: remapHouseholdFieldMap(template.fieldLayoutWidthsByPurpose?.context_facts),
            details: remapHouseholdFieldMap(template.fieldLayoutWidthsByPurpose?.details),
        },
        fieldModes: mergeHouseholdFieldMaps(template.fieldModes, runtime.fieldModes),
        evidenceCollections:
            template.evidenceCollections !== undefined
                ? template.evidenceCollections
                : runtime.evidenceCollections,
        fieldPlacements: buildAuthoritativePlacements(
            template,
            runtime,
            summaryKeys,
            contextKeys,
            detailKeys,
        ),
    };

    const migrated = migrateIdentityDisclosureGroup(mergedBase);
    // Re-apply placements after migrate — migrate regenerates from keys; keep our
    // normalized/authoritative placements when present.
    const fieldPlacements = buildAuthoritativePlacements(
        template,
        runtime,
        summaryKeys,
        contextKeys,
        detailKeys,
    );
    return {
        ...migrated,
        selectedFieldKeys: summaryKeys,
        contextFieldKeys: contextKeys,
        expandedFieldKeys: detailKeys,
        fieldModes: mergeHouseholdFieldMaps(template.fieldModes, runtime.fieldModes),
        fieldIcons: mergedBase.fieldIcons,
        fieldLayoutWidths: mergedBase.fieldLayoutWidths,
        fieldLayoutWidthsByPurpose: mergedBase.fieldLayoutWidthsByPurpose,
        fieldPlacements,
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
