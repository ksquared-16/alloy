/**
 * Canonical queue-row provider derivation — adapts existing platform sources into
 * classified provider seeds. This module must not become a manually maintained catalog.
 *
 * Sources (downstream only):
 *   platformFieldResolutionManifest · childcareLayoutFieldCatalog · computedFieldCatalog
 *   layoutEditorContactRoles · queueRowChildrenFieldRegistry · queueRowSiblingFieldRegistry
 *   queueWaitlistPlacementField · queueRecordLayoutV3 defaults · fieldPickerContextCatalog
 */

import type {
    CanonicalDataProvider,
    CanonicalDataProviderSource,
    CanonicalDataProviderSourceDerivation,
    CanonicalDataValueType,
} from "@/lib/fields/canonicalDataProviderModel";
import { conceptKindForComputedField } from "@/lib/fields/fieldConceptModel";
import { COMPUTED_FIELD_CATALOG, computedFieldByRefKey } from "@/lib/fields/computedFieldCatalog";
import { platformFieldByRefKey } from "@/lib/fields/platformFieldCatalog";
import {
    QUEUE_ROW_CHILD_SUMMARY_FIELD_KEYS,
    QUEUE_ROW_CHILD_SUMMARY_FIELD_METADATA,
} from "@/lib/layout/runtime/queueRowChildSummaryFieldRegistry";
import {
    manifestEntryForRefKey,
    type PlatformFieldManifestEntry,
} from "@/lib/layout/platformFieldResolutionManifest";
import { QUEUE_ZONE_EVIDENCE_GROUPS } from "@/lib/adminV2/settings/surfaces/compositionEvidenceGroupRegistry";
import { FIELD_PICKER_QUEUE_LABEL_OVERRIDES } from "@/lib/layout/fieldPickerContextCatalog";
import {
    collectRefKeysFromQueueRecordLayoutV3,
    defaultLeadQueueLayoutV3,
    defaultWaitlistQueueLayoutV3,
} from "@/lib/layout/queueRecordLayoutV3";
import { contactRoleFieldRefs, LAYOUT_EDITOR_CONTACT_ROLES } from "@/lib/layout/layoutEditorContactRoles";
import {
    QUEUE_ROW_CHILDREN_COLLECTION_FIELD_KEY,
    QUEUE_ROW_ACTIVE_CHILD_FIELD_KEYS,
    QUEUE_ROW_CHILDREN_FIELD_KEYS,
} from "@/lib/layout/runtime/queueRowChildrenFieldRegistry";
import { QUEUE_ROW_RESOLVER_BACKED_CHILD_PROFILE_FIELD_KEYS } from "@/lib/layout/runtime/queueRowChildProfileFieldRegistry";
import {
    QUEUE_ROW_SIBLING_FIELD_KEYS,
    QUEUE_ROW_SIBLING_FIELD_METADATA,
} from "@/lib/layout/runtime/queueRowSiblingFieldRegistry";
import { isWaitlistOnlyFieldKey } from "@/lib/layout/runtime/queueWaitlistPlacementField";
import { CHILDCARE_STARTER_FIELD_CATALOG } from "@/lib/layout/childcareLayoutFieldCatalog";

const BOTH: CanonicalDataProvider["availability"] = { pipeline: true, waitlist: true };
const WAITLIST_ONLY: CanonicalDataProvider["availability"] = { pipeline: false, waitlist: true };

function sourceMeta(source: CanonicalDataProviderSource, sourceModule: string): CanonicalDataProviderSourceDerivation {
    return { source, sourceModule };
}

function valueTypeFromFieldType(fieldType?: string): CanonicalDataValueType {
    switch (fieldType?.toLowerCase()) {
        case "number":
        case "integer":
            return "number";
        case "date":
        case "datetime":
            return "date";
        case "boolean":
            return "boolean";
        case "select":
        case "multiselect":
            return "choice";
        case "status":
            return "status";
        case "email":
        case "phone":
        case "url":
            return "link";
        default:
            return "text";
    }
}

function labelForRefKey(refKey: string): string {
    const manifest = manifestEntryForRefKey(refKey);
    if (manifest?.label) return manifest.label;
    const platform = platformFieldByRefKey(refKey);
    if (platform?.label) return platform.label;
    const queueLabel = FIELD_PICKER_QUEUE_LABEL_OVERRIDES[refKey];
    if (queueLabel) return queueLabel;
    const siblingMeta = QUEUE_ROW_SIBLING_FIELD_METADATA[refKey as keyof typeof QUEUE_ROW_SIBLING_FIELD_METADATA];
    if (siblingMeta?.label) return siblingMeta.label;
    const childcare = CHILDCARE_STARTER_FIELD_CATALOG.find((e) => e.refKey === refKey);
    if (childcare?.pickerLabel) return childcare.pickerLabel;
    const computed = computedFieldByRefKey(refKey);
    if (computed?.label) return computed.label;
    const dot = refKey.indexOf(".");
    const raw = dot >= 0 ? refKey.slice(dot + 1) : refKey;
    return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function availabilityForRefKey(refKey: string): CanonicalDataProvider["availability"] {
    return isWaitlistOnlyFieldKey(refKey) ? WAITLIST_ONLY : BOTH;
}

function kindFromManifest(entry: PlatformFieldManifestEntry): CanonicalDataProvider["kind"] {
    if (entry.storageClass === "relationship") return "relationship";
    if (entry.storageClass === "computed") return "runtime_signal";
    if (entry.storageClass === "native_ocm" || entry.storageClass === "native_entity") return "platform_field";
    return "business_field";
}

function providerFromManifest(entry: PlatformFieldManifestEntry): CanonicalDataProvider {
    const availability = availabilityForRefKey(entry.refKey);
    const kind = kindFromManifest(entry);
    const computed = computedFieldByRefKey(entry.refKey);
    const resolvedKind =
        computed != null ? (conceptKindForComputedField(computed) === "calculated_field" ? "calculated_field" : "runtime_signal") : kind;
    return {
        refKey: entry.refKey,
        label: entry.label,
        kind: resolvedKind,
        outputShape: "scalar",
        entityNamespace: entry.refKey.includes(".") ? entry.refKey.slice(0, entry.refKey.indexOf(".")) : entry.pickerGroup,
        fieldType: entry.fieldType,
        valueType: valueTypeFromFieldType(entry.fieldType),
        isSystem: true,
        availability,
        source: sourceMeta("platform_field_manifest", "web/lib/layout/platformFieldResolutionManifest.ts"),
        resolverOwner: "web/lib/layout/runtime/queueRecordScopedResolve.ts",
        relationship:
            entry.storageClass === "relationship"
                ? { relationship_id: `manifest.${entry.refKey}`, leaf_key: entry.refKey.split(".").pop() ?? "value" }
                : undefined,
    };
}

function providerFromChildcareCatalog(entry: (typeof CHILDCARE_STARTER_FIELD_CATALOG)[number]): CanonicalDataProvider {
    const availability = availabilityForRefKey(entry.refKey);
    const kind: CanonicalDataProvider["kind"] = entry.computed
        ? "runtime_signal"
        : entry.relationshipProjection
          ? "relationship"
          : "business_field";
    return {
        refKey: entry.refKey,
        label: entry.pickerLabel,
        kind,
        outputShape: "scalar",
        entityNamespace: entry.refKey.includes(".") ? entry.refKey.slice(0, entry.refKey.indexOf(".")) : "opportunity",
        fieldType: entry.fieldType,
        valueType: valueTypeFromFieldType(entry.fieldType),
        isSystem: true,
        availability,
        source: sourceMeta("childcare_layout_catalog", "web/lib/layout/childcareLayoutFieldCatalog.ts"),
        resolverOwner: entry.storagePath ?? "web/lib/layout/childcareLayoutFieldCatalog.ts",
        relationship:
            kind === "relationship"
                ? {
                      relationship_id: `childcare.${entry.refKey}`,
                      leaf_key: entry.refKey.split(".").pop() ?? "value",
                  }
                : undefined,
    };
}

function relationshipLeafProvider(
    refKey: string,
    relationshipId: string,
    leafKey: string,
    roleLabel: string,
): CanonicalDataProvider {
    return {
        refKey,
        label: labelForRefKey(refKey) || `${roleLabel} → ${leafKey.replace(/_/g, " ")}`,
        kind: "relationship",
        outputShape: "scalar",
        entityNamespace: "person",
        valueType: leafKey === "email" ? "link" : leafKey === "phone" ? "link" : "text",
        isSystem: true,
        availability: BOTH,
        relationship: { relationship_id: relationshipId, leaf_key: leafKey },
        source: sourceMeta("contact_role_catalog", "web/lib/layout/layoutEditorContactRoles.ts"),
        resolverOwner: "web/lib/layout/layoutEditorContactRoles.ts",
    };
}

function collectionProjectionProvider(
    refKey: string,
    collectionRef: string,
    projection: string,
    availability: CanonicalDataProvider["availability"],
    sourceModule: string,
    valueType: CanonicalDataValueType = projection === "count" ? "number" : "text",
): CanonicalDataProvider {
    return {
        refKey,
        label: labelForRefKey(refKey),
        kind: "collection",
        outputShape: "scalar",
        entityNamespace: collectionRef.startsWith("sibling") || collectionRef === "household" ? "queue_row" : "child",
        valueType,
        isSystem: true,
        availability,
        collectionProjection: { collection_ref: collectionRef, projection },
        source: sourceMeta(
            collectionRef === "sibling" || collectionRef === "household" ? "sibling_collection_registry" : "children_collection_registry",
            sourceModule,
        ),
        resolverOwner: sourceModule,
        displayHint: projection === "count" ? "compact_list" : "compact_list",
    };
}

function wholeCollectionProvider(
    refKey: string,
    collectionRef: string,
    availability: CanonicalDataProvider["availability"],
): CanonicalDataProvider {
    return {
        refKey,
        label: labelForRefKey(refKey),
        kind: "collection",
        outputShape: "collection",
        entityNamespace: "child",
        isSystem: true,
        availability,
        source: sourceMeta("children_collection_registry", "web/lib/layout/runtime/queueRowChildrenFieldRegistry.ts"),
        resolverOwner: "web/lib/layout/runtime/queueRowChildrenFieldRegistry.ts",
        displayHint: "compact_list",
    };
}

function computedProviders(): CanonicalDataProvider[] {
    return COMPUTED_FIELD_CATALOG.filter(
        (row) => row.resolver_status === "now" && row.intended_surfaces.includes("queue_row"),
    ).map((row) => {
        const concept = conceptKindForComputedField(row);
        const kind = concept === "calculated_field" ? "calculated_field" : "runtime_signal";
        const dot = row.refKey.indexOf(".");
        return {
            refKey: row.refKey,
            label: row.label,
            kind,
            outputShape: "scalar" as const,
            entityNamespace: dot >= 0 ? row.refKey.slice(0, dot) : row.entity_type,
            settingsEntity: row.settings_entity,
            categoryKey: row.section_key,
            fieldType: row.field_type,
            valueType: valueTypeFromFieldType(row.field_type),
            isSystem: true,
            availability: availabilityForRefKey(row.refKey),
            source: sourceMeta("computed_field_catalog", "web/lib/fields/computedFieldCatalog.ts"),
            resolverOwner: row.resolver_owner,
        };
    });
}

function contactRoleRelationshipProviders(): CanonicalDataProvider[] {
    const out: CanonicalDataProvider[] = [];
    for (const role of LAYOUT_EDITOR_CONTACT_ROLES) {
        if (role === "any") continue;
        const refs = contactRoleFieldRefs(role);
        const relationshipId = `person.contact_role.${role}`;
        const roleLabel =
            role === "primary"
                ? "Primary Contact"
                : role === "parents"
                  ? "Parent / Guardian"
                  : role === "billing"
                    ? "Billing Contact"
                    : role === "emergency"
                      ? "Emergency Contact"
                      : "Secondary Contact";
        out.push(relationshipLeafProvider(refs.name, relationshipId, "name", roleLabel));
        out.push(relationshipLeafProvider(refs.email, relationshipId, "email", roleLabel));
        out.push(relationshipLeafProvider(refs.phone, relationshipId, "phone", roleLabel));
    }
    return out;
}

function childrenCollectionProviders(): CanonicalDataProvider[] {
    const out: CanonicalDataProvider[] = [
        wholeCollectionProvider(QUEUE_ROW_CHILDREN_COLLECTION_FIELD_KEY, "children", BOTH),
    ];
    for (const refKey of QUEUE_ROW_CHILDREN_FIELD_KEYS) {
        if (refKey === QUEUE_ROW_CHILDREN_COLLECTION_FIELD_KEY) continue;
        const projection = refKey.startsWith("children.") ? refKey.slice("children.".length) : refKey;
        out.push(
            collectionProjectionProvider(
                refKey,
                "children",
                projection,
                BOTH,
                "web/lib/layout/runtime/queueRowChildrenFieldRegistry.ts",
                projection === "count" ? "number" : "text",
            ),
        );
    }
    return out;
}

function siblingCollectionProviders(): CanonicalDataProvider[] {
    return QUEUE_ROW_SIBLING_FIELD_KEYS.map((refKey) => {
        if (refKey === "household.otherChildren") {
            return collectionProjectionProvider(
                refKey,
                "household",
                "otherChildren",
                WAITLIST_ONLY,
                "web/lib/layout/runtime/queueRowSiblingFieldRegistry.ts",
                "text",
            );
        }
        const suffix = refKey.slice("sibling.".length);
        return collectionProjectionProvider(
            refKey,
            "sibling",
            suffix,
            WAITLIST_ONLY,
            "web/lib/layout/runtime/queueRowSiblingFieldRegistry.ts",
            suffix === "count" ? "number" : "text",
        );
    });
}

function evidenceGroupDefaultRefKeys(): string[] {
    const keys = new Set<string>();
    for (const groups of Object.values(QUEUE_ZONE_EVIDENCE_GROUPS)) {
        for (const group of groups) {
            for (const refKey of group.defaultFieldKeys) keys.add(refKey);
        }
    }
    return [...keys];
}

function structuredProviderRefKeys(): Set<string> {
    const keys = new Set<string>();
    for (const role of LAYOUT_EDITOR_CONTACT_ROLES) {
        if (role === "any") continue;
        const refs = contactRoleFieldRefs(role);
        keys.add(refs.name);
        keys.add(refs.email);
        keys.add(refs.phone);
    }
    for (const refKey of QUEUE_ROW_CHILDREN_FIELD_KEYS) keys.add(refKey);
    for (const refKey of QUEUE_ROW_SIBLING_FIELD_KEYS) keys.add(refKey);
    return keys;
}

function collectScalarSeedRefKeys(): string[] {
    const keys = new Set<string>([
        ...Object.keys(FIELD_PICKER_QUEUE_LABEL_OVERRIDES),
        ...evidenceGroupDefaultRefKeys(),
        ...collectRefKeysFromQueueRecordLayoutV3(defaultLeadQueueLayoutV3()),
        ...collectRefKeysFromQueueRecordLayoutV3(defaultWaitlistQueueLayoutV3()),
        ...QUEUE_ROW_ACTIVE_CHILD_FIELD_KEYS,
        ...QUEUE_ROW_RESOLVER_BACKED_CHILD_PROFILE_FIELD_KEYS,
        ...QUEUE_ROW_CHILD_SUMMARY_FIELD_KEYS,
    ]);
    for (const row of COMPUTED_FIELD_CATALOG) {
        if (row.resolver_status === "now" && row.intended_surfaces.includes("queue_row")) {
            keys.add(row.refKey);
        }
    }
    const structured = structuredProviderRefKeys();
    return [...keys].filter((refKey) => !structured.has(refKey));
}

function scalarProviderForRefKey(refKey: string): CanonicalDataProvider {
    const existing =
        manifestEntryForRefKey(refKey) ??
        CHILDCARE_STARTER_FIELD_CATALOG.find((e) => e.refKey === refKey) ??
        computedFieldByRefKey(refKey);
    if (existing && "storageClass" in existing) {
        return {
            ...providerFromManifest(existing as PlatformFieldManifestEntry),
            refKey,
            availability: availabilityForRefKey(refKey),
        };
    }
    if (existing && "pickerLabel" in existing) {
        return { ...providerFromChildcareCatalog(existing as (typeof CHILDCARE_STARTER_FIELD_CATALOG)[number]), refKey };
    }
    if (existing && "refKey" in existing) {
        const computed = existing as (typeof COMPUTED_FIELD_CATALOG)[number];
        const kind = conceptKindForComputedField(computed) === "calculated_field" ? "calculated_field" : "runtime_signal";
        return {
            refKey,
            label: computed.label,
            kind,
            outputShape: "scalar" as const,
            entityNamespace: refKey.includes(".") ? refKey.slice(0, refKey.indexOf(".")) : computed.entity_type,
            fieldType: computed.field_type,
            valueType: valueTypeFromFieldType(computed.field_type),
            isSystem: true,
            availability: availabilityForRefKey(refKey),
            source: sourceMeta("computed_field_catalog", "web/lib/fields/computedFieldCatalog.ts"),
            resolverOwner: computed.resolver_owner,
        };
    }
    const queueLabel = FIELD_PICKER_QUEUE_LABEL_OVERRIDES[refKey];
    return {
        refKey,
        label: queueLabel ?? labelForRefKey(refKey),
        kind: refKey.startsWith("queue_row.") ? ("runtime_signal" as const) : ("business_field" as const),
        outputShape: "scalar" as const,
        entityNamespace: refKey.includes(".") ? refKey.slice(0, refKey.indexOf(".")) : "opportunity",
        valueType:
            refKey.includes("date") || refKey.includes("Since") || refKey.includes("dob")
                ? "date"
                : refKey.includes("count")
                  ? "number"
                  : "text",
        isSystem: true,
        availability: availabilityForRefKey(refKey),
        source: queueLabel
            ? sourceMeta("queue_presentation_registry", "web/lib/layout/fieldPickerContextCatalog.ts")
            : sourceMeta("queue_layout_defaults", "web/lib/layout/queueRecordLayoutV3.ts"),
        resolverOwner: "web/lib/layout/runtime/queueRecordScopedResolve.ts",
        displayHint:
            refKey.includes("Label") || refKey.includes("flags") || refKey.includes("status")
                ? "status_pill"
                : undefined,
    };
}

function scalarSeedProviders(): CanonicalDataProvider[] {
    return collectScalarSeedRefKeys().map((refKey) => scalarProviderForRefKey(refKey));
}

function childSummaryProviders(): CanonicalDataProvider[] {
    return QUEUE_ROW_CHILD_SUMMARY_FIELD_KEYS.map((refKey) => {
        const meta = QUEUE_ROW_CHILD_SUMMARY_FIELD_METADATA[refKey];
        return {
            refKey,
            label: meta.label,
            kind: "runtime_signal" as const,
            outputShape: "scalar" as const,
            entityNamespace: "child",
            valueType: "text" as const,
            isSystem: true,
            availability: BOTH,
            source: sourceMeta(
                "children_collection_registry",
                "web/lib/layout/runtime/queueRowChildSummaryFieldRegistry.ts",
            ),
            resolverOwner: meta.resolverOwner,
            displayHint: "compact_list" as const,
        };
    });
}

function waitlistPlacementProviders(): CanonicalDataProvider[] {
    const waitlistOnlyKeys = [
        "waitlist.positionLabel",
        "waitlist.tierLabel",
        "waitlist.priorityLabel",
        "waitlist.waitSince",
        "waitlist.siblingContext",
        "overrides.flags",
        "overrides.reason",
    ] as const;
    return waitlistOnlyKeys.map((refKey) => ({
            refKey,
            label: labelForRefKey(refKey),
            kind: "runtime_signal" as const,
            outputShape: "scalar" as const,
            entityNamespace: refKey.startsWith("overrides.") ? "queue_row" : "queue_row",
            valueType: "text" as const,
            isSystem: true,
            availability: WAITLIST_ONLY,
            source: sourceMeta("waitlist_placement_registry", "web/lib/layout/runtime/queueWaitlistPlacementField.ts"),
            resolverOwner: "web/lib/layout/runtime/queueWaitlistPlacementField.ts",
            displayHint: "status_pill" as const,
    }));
}

/** @internal Test/export hook — scalar ref keys derived before provider enrichment. */
export function queueRowScalarSeedRefKeysForTests(): string[] {
    return collectScalarSeedRefKeys();
}

/** Derive classified queue-row providers from canonical platform sources only. */
export function buildQueueRowProviderSeeds(): CanonicalDataProvider[] {
    const seen = new Map<string, CanonicalDataProvider>();

    function add(provider: CanonicalDataProvider) {
        if (seen.has(provider.refKey)) return;
        seen.set(provider.refKey, provider);
    }

    for (const p of contactRoleRelationshipProviders()) add(p);
    for (const p of childrenCollectionProviders()) add(p);
    for (const p of siblingCollectionProviders()) add(p);
    for (const p of computedProviders()) add(p);
    for (const p of childSummaryProviders()) add(p);
    for (const p of waitlistPlacementProviders()) add(p);
    for (const p of scalarSeedProviders()) add(p);

    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Exported for documentation/tests — lists canonical source modules contributing seeds. */
export const QUEUE_ROW_PROVIDER_DERIVATION_SOURCES: readonly CanonicalDataProviderSourceDerivation[] = [
    sourceMeta("platform_field_manifest", "web/lib/layout/platformFieldResolutionManifest.ts"),
    sourceMeta("childcare_layout_catalog", "web/lib/layout/childcareLayoutFieldCatalog.ts"),
    sourceMeta("computed_field_catalog", "web/lib/fields/computedFieldCatalog.ts"),
    sourceMeta("contact_role_catalog", "web/lib/layout/layoutEditorContactRoles.ts"),
    sourceMeta("children_collection_registry", "web/lib/layout/runtime/queueRowChildrenFieldRegistry.ts"),
    sourceMeta("sibling_collection_registry", "web/lib/layout/runtime/queueRowSiblingFieldRegistry.ts"),
    sourceMeta("waitlist_placement_registry", "web/lib/layout/runtime/queueWaitlistPlacementField.ts"),
    sourceMeta("queue_layout_defaults", "web/lib/layout/queueRecordLayoutV3.ts"),
    sourceMeta("queue_presentation_registry", "web/lib/layout/fieldPickerContextCatalog.ts"),
    sourceMeta("children_collection_registry", "web/lib/layout/runtime/queueRowChildSummaryFieldRegistry.ts"),
    sourceMeta("field_definitions", "web/lib/layout/tenantLayoutFieldPickerCatalog.ts"),
    sourceMeta("legacy_compatibility", "web/lib/fields/queueRowLegacyCompatibility.ts"),
];
