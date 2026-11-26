/**
 * Identity Collection Card archetype — shared layout interpreter for Children,
 * Household, Person, Employee/Staff, and Guardian/Contact collection cards.
 *
 * Entity adapters supply records + available fields only. Presentation depths,
 * field ordering, row grouping, widths, density, overflow, item actions, card
 * links, read/edit presentation, and responsive field grids all flow through
 * IdentityFieldGrid via build*Identity*VM — not per-entity layout engines.
 */

import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { IdentityCardVM, IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import {
    buildChildIdentityRecordVM,
    buildEmployeeIdentityRecordVM,
    buildHouseholdIdentityCardVM,
} from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { HouseholdEvidenceGroup } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";

export type IdentityCollectionArchetypeKind =
    | "children"
    | "household"
    | "employee"
    | "person"
    | "guardian_contact";

export type IdentityCollectionDensity = "compact" | "standard" | "comfortable";

export type IdentityCollectionOverflowMode = "truncate" | "expand_link" | "scroll";

/** Shared presentation contract owned by the archetype (not entity adapters). */
export type IdentityCollectionCardPresentation = {
    density: IdentityCollectionDensity;
    overflowMode: IdentityCollectionOverflowMode;
    maxVisibleItems: number;
    /** Summary / context / details use the same layout interpreter. */
    shareLayoutInterpreterAcrossDepths: true;
};

export const DEFAULT_IDENTITY_COLLECTION_PRESENTATION: IdentityCollectionCardPresentation = {
    density: "standard",
    overflowMode: "expand_link",
    maxVisibleItems: 8,
    shareLayoutInterpreterAcrossDepths: true,
};

export type IdentityCollectionItemVM = {
    record: IdentityRecordVM;
    overflowHidden: boolean;
};

export type IdentityCollectionCardVM = {
    kind: IdentityCollectionArchetypeKind;
    title: string;
    answerLine: string | null;
    items: IdentityCollectionItemVM[];
    overflowCount: number;
    presentation: IdentityCollectionCardPresentation;
};

/** Slice repeated identity items with shared overflow semantics. */
export function projectIdentityCollectionItems(
    records: readonly IdentityRecordVM[],
    presentation: IdentityCollectionCardPresentation = DEFAULT_IDENTITY_COLLECTION_PRESENTATION,
): { items: IdentityCollectionItemVM[]; overflowCount: number } {
    const max = Math.max(0, presentation.maxVisibleItems);
    const visible = records.slice(0, max);
    const overflowCount = Math.max(0, records.length - visible.length);
    return {
        items: records.map((record, index) => ({
            record,
            overflowHidden: index >= max,
        })),
        overflowCount,
    };
}

/** Children adapter → shared identity collection VM (roster group). */
export function buildChildrenIdentityCollectionCardVM(args: {
    config: NestedSurfaceConfig | null;
    children: readonly ChildrenEvidenceChild[];
    title?: string;
    answerLine?: string | null;
    canMutate?: boolean;
    isFieldSaveSupported?: (fieldRef: string) => boolean;
    presentation?: Partial<IdentityCollectionCardPresentation>;
}): IdentityCollectionCardVM {
    const presentation = {
        ...DEFAULT_IDENTITY_COLLECTION_PRESENTATION,
        ...args.presentation,
    };
    const records = args.children.map((child) =>
        buildChildIdentityRecordVM({
            config: args.config,
            child,
            groupKey: "roster",
            canMutate: args.canMutate,
            isFieldSaveSupported: args.isFieldSaveSupported,
        }),
    );
    const { items, overflowCount } = projectIdentityCollectionItems(records, presentation);
    return {
        kind: "children",
        title: args.title ?? "Children",
        answerLine: args.answerLine ?? null,
        items,
        overflowCount,
        presentation,
    };
}

/** Household adapter → shared identity collection VM. */
export function buildHouseholdIdentityCollectionCardVM(args: {
    config: NestedSurfaceConfig | null;
    groups: HouseholdEvidenceGroup[];
    card?: IdentityCardVM | null;
    title?: string;
    answerLine?: string | null;
    canMutate?: boolean;
    presentation?: Partial<IdentityCollectionCardPresentation>;
}): IdentityCollectionCardVM {
    const presentation = {
        ...DEFAULT_IDENTITY_COLLECTION_PRESENTATION,
        ...args.presentation,
    };
    const card =
        args.card
        ?? buildHouseholdIdentityCardVM({
            config: args.config,
            groups: args.groups,
            canMutate: args.canMutate,
        });
    const records = card.sections.flatMap((section) => section.items);
    const { items, overflowCount } = projectIdentityCollectionItems(records, presentation);
    return {
        kind: "household",
        title: args.title ?? "Household",
        answerLine: args.answerLine ?? null,
        items,
        overflowCount,
        presentation,
    };
}

/** Employee adapter → shared identity collection VM. */
export function buildEmployeeIdentityCollectionCardVM(args: {
    config: NestedSurfaceConfig;
    employees: readonly Parameters<typeof buildEmployeeIdentityRecordVM>[0]["employee"][];
    title?: string;
    answerLine?: string | null;
    canMutate?: boolean;
    presentation?: Partial<IdentityCollectionCardPresentation>;
}): IdentityCollectionCardVM {
    const presentation = {
        ...DEFAULT_IDENTITY_COLLECTION_PRESENTATION,
        ...args.presentation,
    };
    const records = args.employees.map((employee) =>
        buildEmployeeIdentityRecordVM({
            employee,
            config: args.config,
            canMutate: args.canMutate,
        }),
    );
    const { items, overflowCount } = projectIdentityCollectionItems(records, presentation);
    return {
        kind: "employee",
        title: args.title ?? "Employees",
        answerLine: args.answerLine ?? null,
        items,
        overflowCount,
        presentation,
    };
}
