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
import type { IdentityCardVM, IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

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
    tier: "summary" | "expanded";
    canMutate: boolean;
    isFieldSaveSupported?: (fieldRef: string) => boolean;
    editGroupKey?: string;
}): ReturnType<typeof resolveIdentityFieldRows> {
    const group = args.config.groups.find((g) => g.key === args.groupKey);
    if (!group) return [];
    const placements = (group.fieldPlacements ?? generateDefaultPlacementsForGroup(group)).filter(
        (placement) => placement.tier === args.tier,
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
        const value = resolveIdentityFieldValue(args.subject, placement.fieldRef);
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

function buildContactRecordVM(args: {
    config: NestedSurfaceConfig;
    groupKey: string;
    contact: HouseholdEvidenceContact;
    canMutate: boolean;
}): IdentityRecordVM {
    const subject = contactSubject(args.contact);
    const showAvatar = groupShowAvatarForNestedGroup(args.config, args.groupKey);
    const summaryRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        tier: "summary",
        canMutate: args.canMutate,
        editGroupKey: "contact_edit",
    });
    const expandedRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        tier: "expanded",
        canMutate: args.canMutate,
        editGroupKey: "contact_edit",
    });
    return {
        id: args.contact.personId,
        title: composedIdentityDisplayName(subject, args.config, args.groupKey, args.contact.name),
        avatar: {
            imageUrl: args.contact.imageUrl ?? null,
            initials: args.contact.initials || initialsFor(args.contact.name),
            visible: showAvatar,
        },
        badge: args.contact.roleLabel,
        summaryRows,
        expandedRows,
        canExpand: expandedRows.length > 0,
    };
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
        tier: "summary",
        canMutate: args.canMutate,
        isFieldSaveSupported: args.isFieldSaveSupported,
        editGroupKey: "child_edit",
    });
    const expandedRows = buildRecordRows({
        config: args.config,
        groupKey: args.groupKey,
        subject,
        tier: "expanded",
        canMutate: args.canMutate,
        isFieldSaveSupported: args.isFieldSaveSupported,
        editGroupKey: "child_edit",
    });
    const name = "name" in args.child ? args.child.name : "Child";
    return {
        id: args.child.id,
        title: composedIdentityDisplayName(subject, args.config, args.groupKey, name),
        avatar: {
            imageUrl: "imageUrl" in args.child ? args.child.imageUrl ?? null : null,
            initials: initialsFor(name),
            visible: showAvatar,
        },
        badge: args.groupKey === "children" ? "Child" : null,
        summaryRows,
        expandedRows,
        canExpand: expandedRows.length > 0,
    };
}

/** Build household identity VM from evidence groups + published config. */
export function buildHouseholdIdentityCardVM(args: {
    config: NestedSurfaceConfig | null;
    groups: HouseholdEvidenceGroup[];
    canMutate?: boolean;
}): IdentityCardVM {
    const config = args.config
        ? reconcileIdentityNestedConfig("household_surface", args.config)
        : null;
    const surfaceKey = "household_surface";
    if (!config) {
        return { surfaceKey, sections: [] };
    }
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

/** Build children identity VM for one child record. */
export function buildChildIdentityRecordVM(args: {
    config: NestedSurfaceConfig | null;
    child: ChildrenEvidenceChild;
    groupKey?: string;
    canMutate?: boolean;
    isFieldSaveSupported?: (fieldRef: string) => boolean;
}): IdentityRecordVM {
    const config = args.config
        ? reconcileIdentityNestedConfig("children_surface", args.config)
        : null;
    if (!config) {
        return {
            id: args.child.id,
            title: args.child.name,
            summaryRows: [],
            expandedRows: [],
            canExpand: false,
        };
    }
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
        tier: "summary",
        canMutate: args.canMutate ?? false,
    });
    const expandedRows = buildRecordRows({
        config,
        groupKey,
        subject,
        tier: "expanded",
        canMutate: args.canMutate ?? false,
    });
    return {
        id: args.employee.id,
        title: args.employee.name,
        avatar: {
            imageUrl: args.employee.imageUrl ?? null,
            initials: initialsFor(args.employee.name),
            visible: true,
        },
        badge: args.employee.badge ?? args.employee.title ?? "Employee",
        summaryRows,
        expandedRows,
        canExpand: expandedRows.length > 0,
    };
}
