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
import { fieldIsSaveable, fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import type {
    HouseholdEvidenceChild,
    HouseholdEvidenceContact,
    HouseholdEvidenceGroup,
} from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
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
import type { PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import { CONTACT_EDIT_FIELD_MAP } from "@/lib/adminV2/runtime/focusPanel/household/householdSurfaceFields";
import { storageTierMatchesPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import { composeSummaryAndContextFacts } from "@/lib/adminV2/runtime/focusPanel/identity/composeIdentityContextRows";
import type { IdentityCardVM, IdentityRecordVM, IdentityFieldRowVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

function initialsFor(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
    return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function catalogLabel(surfaceId: string, groupKey: string, fieldRef: string): string {
    const def = groupDefsFor(surfaceId).find((g) => g.key === groupKey);
    const item = def?.defaultFieldKeys.includes(fieldRef)
        ? fieldRef
        : fieldRef;
    return item.replace(/^[a-z_]+\./, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
}): ReturnType<typeof resolveIdentityFieldRows> {
    const group = args.config.groups.find((g) => g.key === args.groupKey);
    if (!group) return [];
    const placements = (group.fieldPlacements ?? generateDefaultPlacementsForGroup(group)).filter(
        (placement) => storageTierMatchesPurpose(placement.tier, args.purpose),
    );
    const inputs: IdentityFieldRowInput[] = [];
    for (const placement of placements) {
        const policy = resolveIdentityFieldPolicy({
            config: args.config,
            groupKey: args.groupKey,
            fieldRef: placement.fieldRef,
            editGroupKey: args.editGroupKey,
        });
        if (!fieldShouldRender(policy)) continue;
        const isMaskedChannel =
            args.maskedChannels
            && args.subject.kind === "person"
            && (placement.fieldRef === "person.phone" || placement.fieldRef === "person.email");
        const value = isMaskedChannel
            ? "Contact details restricted"
            : resolveIdentityFieldValue(args.subject, placement.fieldRef);
        const saveSupported = args.isFieldSaveSupported?.(placement.fieldRef) ?? Boolean(args.editGroupKey);
        const editable = args.canMutate && fieldIsSaveable(policy) && saveSupported;
        inputs.push({
            placement,
            label: fieldPresentationLabel(
                args.config,
                args.groupKey,
                placement.fieldRef,
                catalogLabel(args.config.surfaceId, args.groupKey, placement.fieldRef),
            ),
            value,
            icon: resolveIdentityFieldIcon({ group, fieldRef: placement.fieldRef }),
            policy,
            editable,
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
    const contextRows = composeSummaryAndContextFacts(args.summaryRows, args.contextFactRows);
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
        canShowDetails: args.detailRows.length > 0,
        canExpand: args.detailRows.length > 0,
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
        maskedChannels: args.maskedChannels,
    });
    const contextFactRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        purpose: "context_facts",
        canMutate: args.canMutate,
        editGroupKey: "contact_edit",
        maskedChannels: args.maskedChannels,
    });
    const detailRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        purpose: "details",
        canMutate: args.canMutate,
        editGroupKey: "contact_edit",
        maskedChannels: args.maskedChannels,
    });
    return finalizeIdentityRecordVM({
        id: args.contact.personId,
        title: composedIdentityDisplayName(subject, args.config, args.groupKey, args.contact.name),
        avatar: {
            imageUrl: args.contact.imageUrl ?? null,
            initials: args.contact.initials || initialsFor(args.contact.name),
            visible: showAvatar,
        },
        badge: args.contact.roleLabel,
        summaryRows,
        contextFactRows,
        detailRows,
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
        },
        badge: args.groupKey === "children" ? "Child" : null,
        summaryRows,
        contextFactRows,
        detailRows,
    });
}

/** Build household identity VM from evidence groups + published config. */
export function buildHouseholdIdentityCardVM(args: {
    config: NestedSurfaceConfig | null;
    groups: HouseholdEvidenceGroup[];
    canMutate?: boolean;
    maskedChannels?: boolean;
}): IdentityCardVM {
    const config = reconcileIdentityNestedConfig("household_surface", args.config);
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
    return [...summaryRows, ...detailRows];
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
        },
        badge: args.employee.badge ?? args.employee.title ?? "Employee",
        summaryRows,
        contextFactRows,
        detailRows,
    });
}
