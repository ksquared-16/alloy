/**
 * Build shared IdentityCardVM from nested surface config + record truth.
 */

import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    fieldPresentationLabel,
    groupShowAvatarForNestedGroup,
    nestedGroupLabel,
    groupDefsFor,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { fieldIsLinked, fieldIsSaveable, fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import type {
    HouseholdEvidenceChild,
    HouseholdEvidenceContact,
    HouseholdEvidenceGroup,
} from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import { withHouseholdRoleMergedGroups } from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import {
    generateDefaultPlacementsForGroup,
    identitySurfaceFromNestedConfig,
    reconcileIdentityNestedConfig,
    resolveIdentityFieldPolicy,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import {
    composedIdentityDisplayName,
    resolveIdentityFieldValue,
    type IdentityComposeSubject,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompose";
import { resolveIdentityFieldRows, type IdentityFieldRowInput } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldRows";
import { resolveIdentityFieldIcon } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldIcon";
import { isIdentityFieldInlineSaveSupported } from "@/lib/adminV2/runtime/focusPanel/identity/identityInlineChildSave";
import { resolveIdentityFieldLinkContract, normalizeIdentityFieldLinkTarget } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";
import type { PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import { CONTACT_EDIT_FIELD_MAP, personContactSaveKeyForIdentityFieldRef } from "@/lib/adminV2/runtime/focusPanel/household/householdSurfaceFields";
import { storageTierMatchesPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import { resolveIdentityPlacementLabelMode } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import {
    isCompactTitleRedundantIdentityField,
    resolveCompactIdentitySummaryLabelMode,
} from "@/lib/adminV2/runtime/focusPanel/identity/resolveCompactIdentitySummaryLabelMode";
import { composeContextCollectionRows } from "@/lib/adminV2/runtime/focusPanel/identity/composeIdentityContextRows";
import {
    enabledEvidenceSections,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { IdentityCardVM, IdentityRecordVM, IdentityFieldRowVM, IdentityEvidenceCollectionVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import { inferAvatarRoleFromSectionKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";
import { resolveCanonicalIdentityFieldLabel } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";


function householdContactFieldSaveSupported(fieldRef: string): boolean {
    return personContactSaveKeyForIdentityFieldRef(fieldRef) !== null;
}

function initialsFor(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
    return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function catalogLabel(
    fieldRef: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): string {
    return resolveCanonicalIdentityFieldLabel(fieldRef, tenantFieldDefinitions);
}

function resolveEvidenceCollectionsForGroup(
    config: NestedSurfaceConfig,
    groupKey: string,
): IdentityEvidenceCollectionVM[] {
    const group = config.groups.find((entry) => entry.key === groupKey);
    const configured = (group?.evidenceCollections ?? []).map((collection) => ({
        key: collection.key,
        label: collection.label,
        enabled: collection.enabled !== false,
    }));
    if (configured.length > 0) return configured;

    if (config.surfaceId === "children_surface" && (groupKey === "roster" || groupKey === "identity")) {
        return enabledEvidenceSections(config).map((section) => ({
            key: section.key,
            label:
                nestedGroupLabel(config, section.key)
                ?? groupDefsFor(config.surfaceId).find((def) => def.key === section.key)?.label
                ?? section.key,
            enabled: true,
        }));
    }

    return [];
}


function placementsForIdentityGroupPurpose(
    config: NestedSurfaceConfig,
    groupKey: string,
    purpose: "summary" | "context_facts" | "details",
): ReturnType<typeof generateDefaultPlacementsForGroup> {
    const group = config.groups.find((g) => g.key === groupKey);
    if (!group) return [];
    // Always re-pack from key order + fieldLayoutWidths. Stored fieldPlacements may be
    // stale after Builder beside/reorder; regenerate preserves policy/label/icon only.
    return generateDefaultPlacementsForGroup(group).filter((placement) =>
        storageTierMatchesPurpose(placement.tier, purpose),
    );
}

function buildRecordRows(args: {
    config: NestedSurfaceConfig;
    groupKey: string;
    subject: IdentityComposeSubject;
    purpose: "summary" | "context_facts" | "details";
    canMutate: boolean;
    isFieldSaveSupported?: (fieldRef: string) => boolean;
    editGroupKey?: string;
    maskedChannels?: boolean;
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
}): ReturnType<typeof resolveIdentityFieldRows> {
    const group = args.config.groups.find((g) => g.key === args.groupKey);
    if (!group) return [];
    let placements = placementsForIdentityGroupPurpose(args.config, args.groupKey, args.purpose);
    if (args.editGroupKey && args.editGroupKey !== args.groupKey) {
        const editPlacements = placementsForIdentityGroupPurpose(args.config, args.editGroupKey, args.purpose);
        const seen = new Set(placements.map((placement) => `${placement.tier}:${placement.fieldRef}`));
        for (const placement of editPlacements) {
            const key = `${placement.tier}:${placement.fieldRef}`;
            if (seen.has(key)) continue;
            seen.add(key);
            placements.push(placement);
        }
    }
    const inputs: IdentityFieldRowInput[] = [];
    for (const placement of placements) {
        const policy = resolveIdentityFieldPolicy({
            config: args.config,
            groupKey: args.groupKey,
            fieldRef: placement.fieldRef,
            editGroupKey: args.editGroupKey,
            tier: args.purpose,
        });
        if (!fieldShouldRender(policy)) continue;
        const authoredLabelModeEarly =
            placement.labelMode === "hidden"
            || placement.labelMode === "eyebrow"
            || placement.labelMode === "visible"
                ? placement.labelMode
                : group.fieldModes?.[placement.fieldRef]?.showLabel === false
                  ? ("hidden" as const)
                  : group.fieldModes?.[placement.fieldRef]?.showLabel === true
                    ? ("visible" as const)
                    : null;
        // Compact summary: omit title-redundant name parts entirely (runtime projection only).
        if (
            args.purpose === "summary"
            && authoredLabelModeEarly == null
            && isCompactTitleRedundantIdentityField(placement.fieldRef)
        ) {
            continue;
        }
        const isMaskedChannel =
            args.maskedChannels
            && args.subject.kind === "person"
            && (placement.fieldRef === "person.phone" || placement.fieldRef === "person.email");
        const value = isMaskedChannel
            ? "Contact details restricted"
            : resolveIdentityFieldValue(args.subject, placement.fieldRef);
        const saveSupported =
            args.isFieldSaveSupported?.(placement.fieldRef)
            ?? isIdentityFieldInlineSaveSupported(placement.fieldRef);
        const linkContract = resolveIdentityFieldLinkContract(placement.fieldRef);
        const hasExplicitPolicy = Boolean(
            placement.policy
            || group.fieldPolicies?.[placement.fieldRef]
            || (args.editGroupKey
                ? args.config.groups.find((g) => g.key === args.editGroupKey)?.fieldPolicies?.[
                      placement.fieldRef
                  ]
                : undefined),
        );
        // Enrollment fields default to Linked when no explicit policy is stored.
        const effectivePolicy =
            policy === "read-only" && linkContract.canOfferLinked && !hasExplicitPolicy
                ? "linked"
                : policy;
        const editable = args.canMutate && fieldIsSaveable(effectivePolicy) && saveSupported;
        const linked = fieldIsLinked(effectivePolicy) && linkContract.canOfferLinked;
        const linkTarget = linked
            ? normalizeIdentityFieldLinkTarget(placement.linkTarget, placement.fieldRef)
                ?? linkContract.defaultTarget
            : null;
        const authoredLabelMode = authoredLabelModeEarly;
        const placementForRuntime = {
            ...placement,
            labelMode: resolveCompactIdentitySummaryLabelMode({
                fieldRef: placement.fieldRef,
                authoredLabelMode:
                    authoredLabelMode
                    ?? resolveIdentityPlacementLabelMode(placement, group.fieldModes, placement.fieldRef),
                purpose: args.purpose,
                treatResolvedVisibleAsUnauthored: authoredLabelMode == null,
            }),
        };
        inputs.push({
            placement: placementForRuntime,
            label: fieldPresentationLabel(
                args.config,
                args.groupKey,
                placement.fieldRef,
                catalogLabel(placement.fieldRef, args.tenantFieldDefinitions),
            ),
            value,
            icon: resolveIdentityFieldIcon({ group, fieldRef: placement.fieldRef }),
            policy: effectivePolicy,
            editable,
            linked,
            linkLabel: linked ? linkContract.linkLabel : null,
            linkDestination: linked ? (linkTarget?.toCard ?? linkContract.destinationCard) : null,
            linkTarget,
        });
    }
    return resolveIdentityFieldRows(inputs);
}

function contactSubject(contact: HouseholdEvidenceContact): IdentityComposeSubject {
    return { kind: "person", value: contact };
}

function childSubject(child: HouseholdEvidenceChild | ChildrenEvidenceChild): IdentityComposeSubject {
    return { kind: "child", value: child };
}

function finalizeIdentityRecordVM(args: {
    id: string;
    title: string;
    avatar?: IdentityRecordVM["avatar"];
    badge?: string | null;
    summaryRows: IdentityFieldRowVM[];
    contextFactRows: IdentityFieldRowVM[];
    detailRows: IdentityFieldRowVM[];
    evidenceCollections?: IdentityRecordVM["evidenceCollections"];
}): IdentityRecordVM {
    const contextRows = composeContextCollectionRows(args.contextFactRows);
    return {
        id: args.id,
        title: args.title,
        avatar: args.avatar,
        badge: args.badge,
        summaryRows: args.summaryRows,
        contextFactRows: args.contextFactRows,
        contextRows,
        detailRows: args.detailRows,
        detailsRows: args.detailRows,
        expandedRows: args.detailRows,
        canShowDetails: args.detailRows.length > 0 || args.contextFactRows.length > 0,
        canExpand: args.detailRows.length > 0 || args.contextFactRows.length > 0,
        evidenceCollections: args.evidenceCollections,
    };
}

function buildContactRecordVM(args: {
    config: NestedSurfaceConfig;
    groupKey: string;
    contact: HouseholdEvidenceContact;
    canMutate: boolean;
    maskedChannels?: boolean;
}): IdentityRecordVM {
    const subject = contactSubject(args.contact);
    const showAvatar = groupShowAvatarForNestedGroup(args.config, args.groupKey);
    const summaryRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        purpose: "summary",
        canMutate: args.canMutate,
        editGroupKey: "contact_edit",
        isFieldSaveSupported: householdContactFieldSaveSupported,
        maskedChannels: args.maskedChannels,
    });
    const contextFactRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        purpose: "context_facts",
        canMutate: args.canMutate,
        editGroupKey: "contact_edit",
        isFieldSaveSupported: householdContactFieldSaveSupported,
        maskedChannels: args.maskedChannels,
    });
    const detailRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        purpose: "details",
        canMutate: args.canMutate,
        editGroupKey: "contact_edit",
        isFieldSaveSupported: householdContactFieldSaveSupported,
        maskedChannels: args.maskedChannels,
    });
    return finalizeIdentityRecordVM({
        id: args.contact.personId,
        title: composedIdentityDisplayName(subject, args.config, args.groupKey, args.contact.name),
        avatar: {
            imageUrl: args.contact.imageUrl ?? null,
            initials: args.contact.initials || initialsFor(args.contact.name),
            visible: showAvatar,
            role: inferAvatarRoleFromSectionKey(args.groupKey),
        },
        badge: args.contact.roleLabel,
        summaryRows,
        contextFactRows,
        detailRows,
        evidenceCollections: resolveEvidenceCollectionsForGroup(args.config, args.groupKey),
    });
}

function buildChildRecordVM(args: {
    config: NestedSurfaceConfig;
    groupKey: string;
    child: HouseholdEvidenceChild | ChildrenEvidenceChild;
    canMutate: boolean;
    isFieldSaveSupported?: (fieldRef: string) => boolean;
}): IdentityRecordVM {
    const subject = childSubject(args.child);
    const showAvatar = groupShowAvatarForNestedGroup(args.config, args.groupKey);
    const summaryRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        purpose: "summary",
        canMutate: args.canMutate,
        isFieldSaveSupported: args.isFieldSaveSupported,
        editGroupKey: "child_edit",
    });
    const contextFactRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        purpose: "context_facts",
        canMutate: args.canMutate,
        isFieldSaveSupported: args.isFieldSaveSupported,
        editGroupKey: "child_edit",
    });
    const detailRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        purpose: "details",
        canMutate: args.canMutate,
        isFieldSaveSupported: args.isFieldSaveSupported,
        editGroupKey: "child_edit",
    });
    const name = "name" in args.child ? args.child.name : "Child";
    return finalizeIdentityRecordVM({
        id: args.child.id,
        title: composedIdentityDisplayName(subject, args.config, args.groupKey, name),
        avatar: {
            imageUrl: "imageUrl" in args.child ? args.child.imageUrl ?? null : null,
            initials: initialsFor(name),
            visible: showAvatar,
            role: "child",
        },
        badge: args.groupKey === "children" ? "Child" : null,
        summaryRows,
        contextFactRows,
        detailRows,
        evidenceCollections: resolveEvidenceCollectionsForGroup(args.config, args.groupKey),
    });
}

/** Build household identity VM from evidence groups + published config. */
export function buildHouseholdIdentityCardVM(args: {
    config: NestedSurfaceConfig | null;
    groups: HouseholdEvidenceGroup[];
    canMutate?: boolean;
    maskedChannels?: boolean;
}): IdentityCardVM {
    const config = withHouseholdRoleMergedGroups(
        reconcileIdentityNestedConfig("household_surface", args.config),
    );
    const surfaceKey = "household_surface";
    const identityConfig = identitySurfaceFromNestedConfig(config);
    const sections = identityConfig.sections.flatMap((section) => {
        const built = args.groups.find((group) => group.key === section.key);
        if (!built) return [];
        const label =
            nestedGroupLabel(config, section.key)
            ?? built.title
            ?? section.label;
        const items: IdentityRecordVM[] = [];
        for (const contact of built.contacts) {
            items.push(
                buildContactRecordVM({
                    config,
                    groupKey: section.key,
                    contact,
                    canMutate: args.canMutate ?? false,
                    maskedChannels: args.maskedChannels,
                }),
            );
        }
        for (const child of built.children) {
            items.push(
                buildChildRecordVM({
                    config,
                    groupKey: section.key,
                    child,
                    canMutate: args.canMutate ?? false,
                }),
            );
        }
        return [{ key: section.key, label, items, emptyState: items.length === 0 ? section.emptyState : undefined }];
    });
    return { surfaceKey, sections };
}

/** Build shared identity field rows for household contact edit from canonical config. */
export function buildHouseholdContactEditFieldRows(args: {
    config: NestedSurfaceConfig | null;
    values: PersonContactValues;
    canMutate?: boolean;
}): IdentityFieldRowVM[] {
    const config = reconcileIdentityNestedConfig({
        surfaceKey: "household_surface",
        currentConfig: args.config,
    });
    const subject: IdentityComposeSubject = { kind: "contact_edit", value: args.values };
    const summaryRows = buildRecordRows({
        config,
        groupKey: "contact_edit",
        subject,
        purpose: "summary",
        canMutate: args.canMutate ?? true,
        editGroupKey: "contact_edit",
        isFieldSaveSupported: (fieldRef) => fieldRef in CONTACT_EDIT_FIELD_MAP,
    });
    const detailRows = buildRecordRows({
        config,
        groupKey: "contact_edit",
        subject,
        purpose: "details",
        canMutate: args.canMutate ?? true,
        editGroupKey: "contact_edit",
        isFieldSaveSupported: (fieldRef) => fieldRef in CONTACT_EDIT_FIELD_MAP,
    });
    // Alias-normalize by mutation value key so contact.phone and person.phone do not double-render.
    const seenValueKeys = new Set<string>();
    const deduped: IdentityFieldRowVM[] = [];
    for (const row of [...summaryRows, ...detailRows]) {
        const cells = row.cells.filter((cell) => {
            const valueKey = CONTACT_EDIT_FIELD_MAP[cell.fieldRef];
            if (!valueKey) return false;
            if (seenValueKeys.has(valueKey)) return false;
            seenValueKeys.add(valueKey);
            return true;
        });
        if (cells.length === 0) continue;
        deduped.push({ ...row, cells });
    }
    return deduped;
}

/** Build children identity VM for one child record. */
export function buildChildIdentityRecordVM(args: {
    config: NestedSurfaceConfig | null;
    child: ChildrenEvidenceChild;
    groupKey?: string;
    canMutate?: boolean;
    isFieldSaveSupported?: (fieldRef: string) => boolean;
}): IdentityRecordVM {
    const config = reconcileIdentityNestedConfig("children_surface", args.config);
    return buildChildRecordVM({
        config,
        groupKey: args.groupKey ?? "identity",
        child: args.child,
        canMutate: args.canMutate ?? false,
        isFieldSaveSupported: args.isFieldSaveSupported,
    });
}

/** Employee proof fixture — shared renderer without enrollment assumptions. */
export function buildEmployeeIdentityRecordVM(args: {
    employee: {
        id: string;
        name: string;
        title?: string | null;
        department?: string | null;
        email?: string | null;
        phone?: string | null;
        badge?: string | null;
        imageUrl?: string | null;
    };
    config: NestedSurfaceConfig;
    groupKey?: string;
    canMutate?: boolean;
}): IdentityRecordVM {
    const config = reconcileIdentityNestedConfig("employee_surface", args.config);
    const groupKey = args.groupKey ?? "identity";
    const subject: IdentityComposeSubject = { kind: "employee", value: args.employee };
    const summaryRows = buildRecordRows({
        config,
        groupKey,
        subject,
        purpose: "summary",
        canMutate: args.canMutate ?? false,
    });
    const contextFactRows = buildRecordRows({
        config,
        groupKey,
        subject,
        purpose: "context_facts",
        canMutate: args.canMutate ?? false,
    });
    const detailRows = buildRecordRows({
        config,
        groupKey,
        subject,
        purpose: "details",
        canMutate: args.canMutate ?? false,
    });
    return finalizeIdentityRecordVM({
        id: args.employee.id,
        title: args.employee.name,
        avatar: {
            imageUrl: args.employee.imageUrl ?? null,
            initials: initialsFor(args.employee.name),
            visible: true,
            role: "contact",
        },
        badge: args.employee.badge ?? args.employee.title ?? "Employee",
        summaryRows,
        contextFactRows,
        detailRows,
    });
}
