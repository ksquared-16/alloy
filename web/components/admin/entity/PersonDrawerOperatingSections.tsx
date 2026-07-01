"use client";

import PersonDrawerChildSummary from "@/components/admin/entity/PersonDrawerChildSummary";
import PersonDrawerEmployeeStatusSection from "@/components/admin/entity/PersonDrawerEmployeeStatusSection";
import PersonDrawerHouseholdAddress from "@/components/admin/entity/PersonDrawerHouseholdAddress";
import PersonDrawerHouseholdSection from "@/components/admin/entity/PersonDrawerHouseholdSection";
import PersonDrawerParentHouseholdSection from "@/components/admin/entity/PersonDrawerParentHouseholdSection";
import PersonDrawerParentSummary from "@/components/admin/entity/PersonDrawerParentSummary";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import {
    personDrawerHouseholdAddressHasContent,
    resolvePersonDrawerHouseholdAddressModel,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdAddress";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import type { PersonDrawerParentChromeHint } from "@/lib/admin/person/personDrawerParentChrome";
import {
    resolvePersonOperatingSections,
    type PersonOperatingSectionKey,
    type ResolvedPersonDrawerLayoutVariant,
} from "@/lib/admin/person/personDrawerLayoutRuntime";
import { readPersonEmployeePlacementValues } from "@/lib/admin/personEmployeePlacementFields";
import { stampPersonDrawerParentHeaderContext } from "@/lib/admin/person/resolvePersonDrawerParentHouseholdModel";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import PersonCommunicationPreferencesSection from "@/components/admin/communications/PersonCommunicationPreferencesSection";

export type PersonDrawerOperatingSectionsProps = {
    variant: ResolvedPersonDrawerLayoutVariant;
    record: Record<string, unknown>;
    personId: string | null;
    canMutate: boolean;
    bodyHydrated: boolean;
    childChromeHint?: PersonDrawerChildChromeHint | null;
    parentChromeHint?: PersonDrawerParentChromeHint | null;
    onOpenDrawer: (type: AdminDrawerEntityType, id: string) => void;
    onOpenLinkedPerson: (personId: string) => void;
    onPersonUpdated: (json: Record<string, unknown>) => void;
    onRecordUpdated: (next: Record<string, unknown>) => void;
};

function sectionEnabled(
    sections: PersonOperatingSectionKey[],
    key: PersonOperatingSectionKey
): boolean {
    return sections.includes(key);
}

function personAddressRenderable(record: Record<string, unknown>): boolean {
    const model = resolvePersonDrawerHouseholdAddressModel(record);
    return personDrawerHouseholdAddressHasContent(model);
}

/** Config-driven operating modules above EntityDrawerOverview (child/parent surfaces). */
export default function PersonDrawerOperatingSections({
    variant,
    record,
    personId,
    canMutate,
    bodyHydrated,
    childChromeHint,
    parentChromeHint,
    onOpenDrawer,
    onOpenLinkedPerson,
    onPersonUpdated,
    onRecordUpdated,
}: PersonDrawerOperatingSectionsProps) {
    const sections = resolvePersonOperatingSections(variant);
    if (sections.length === 0) return null;

    const layoutSource = variant.source;
    const householdModel = resolvePersonDrawerHouseholdModel(record, {
        viewing_person_id: personId,
    });
    const householdHasContent = householdModel.groups.length > 0;
    const showHousehold =
        sectionEnabled(sections, "household") && bodyHydrated && householdHasContent;
    const showAddressContent =
        sectionEnabled(sections, "household_address") && bodyHydrated && personAddressRenderable(record);
    const showEmployeeStatus =
        sectionEnabled(sections, "employee_status") &&
        personId &&
        personId !== "new" &&
        bodyHydrated &&
        "is_employee" in record;
    const isParentVariant = sections.includes("parent_summary");

    return (
        <div
            data-person-drawer-operating-sections="true"
            data-person-drawer-layout-variant={variant.variant_key}
            data-person-drawer-layout-source={layoutSource}
        >
            {sectionEnabled(sections, "child_summary") ? (
                <PersonDrawerChildSummary
                    record={record}
                    chromeHint={childChromeHint}
                    layoutVariantKey={variant.variant_key}
                    canMutate={canMutate}
                    onPersonUpdated={onPersonUpdated}
                />
            ) : null}
            {sectionEnabled(sections, "parent_summary") ? (
                <PersonDrawerParentSummary
                    record={record}
                    chromeHint={parentChromeHint}
                    layoutVariantKey={variant.variant_key}
                    canMutate={canMutate}
                    onPersonUpdated={onPersonUpdated}
                />
            ) : null}
            {isParentVariant && personId && personId !== "new" ? (
                <div className="mt-3">
                    <PersonCommunicationPreferencesSection personId={personId} canMutate={canMutate} />
                </div>
            ) : null}
            {showHousehold && isParentVariant ? (
                <PersonDrawerParentHouseholdSection
                    record={stampPersonDrawerParentHeaderContext(record)}
                    chromeHint={parentChromeHint}
                    onOpenDrawer={(type, id) => onOpenDrawer(type as AdminDrawerEntityType, id)}
                    onOpenLinkedPerson={onOpenLinkedPerson}
                    canMutate={canMutate}
                    onRecordUpdated={onRecordUpdated}
                />
            ) : null}
            {showHousehold && !isParentVariant ? (
                <PersonDrawerHouseholdSection
                    record={record}
                    onOpenDrawer={(type, id) => onOpenDrawer(type as AdminDrawerEntityType, id)}
                    onOpenLinkedPerson={onOpenLinkedPerson}
                    viewingPersonId={personId}
                    dataDrawerVariant="child"
                    canMutate={canMutate}
                    onRecordUpdated={onRecordUpdated}
                />
            ) : null}
            {showAddressContent ? (
                <PersonDrawerHouseholdAddress
                    record={record}
                    chromeHint={parentChromeHint}
                    canMutate={canMutate}
                    onRecordUpdated={onRecordUpdated}
                />
            ) : null}
            {showEmployeeStatus ? (
                <PersonDrawerEmployeeStatusSection
                    personId={personId}
                    initialValues={readPersonEmployeePlacementValues(record)}
                    canMutate={canMutate}
                    compactOperatingSurface
                    deferSave
                    onPersonUpdated={onPersonUpdated}
                />
            ) : null}
        </div>
    );
}
