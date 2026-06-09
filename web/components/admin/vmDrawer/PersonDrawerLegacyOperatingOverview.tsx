"use client";

/**
 * Emergency legacy VM overview — only when LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1.
 */

import { useMemo } from "react";
import EntityDrawerOverview from "@/components/admin/entity/EntityDrawerOverview";
import PersonDrawerChildLifecycleRail from "@/components/admin/entity/PersonDrawerChildLifecycleRail";
import PersonDrawerEnrollmentActivity from "@/components/admin/entity/PersonDrawerEnrollmentActivity";
import PersonDrawerOperatingSections from "@/components/admin/entity/PersonDrawerOperatingSections";
import PersonDrawerParentLifecycleRail from "@/components/admin/entity/PersonDrawerParentLifecycleRail";
import PersonEmployeePlacementSection from "@/components/admin/entity/PersonEmployeePlacementSection";
import { PersonDrawerRelationshipsOverview } from "@/components/admin/entity/PersonDrawerVisibilitySections";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import { readPersonEmployeePlacementValues } from "@/lib/admin/personEmployeePlacementFields";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { personDrawerHasRelationshipContent } from "@/lib/admin/person/personDrawerRelationshipVisibility";
import { resolvePersonDrawerProfileFromRecordWithHint } from "@/lib/admin/person/personDrawerChildChrome";
import { resolvePersonDrawerProfileFromRecordWithParentHint } from "@/lib/admin/person/personDrawerParentChrome";
import { personDrawerShouldShowEmployeePlacement } from "@/lib/admin/person/personDrawerPresentationProfile";
import { personDrawerOperatingSummaryVisible } from "@/lib/admin/person/personDrawerShellPolicy";
import {
    resolvePersonDrawerVmOverviewSections,
    type PersonDrawerVmChrome,
} from "@/lib/admin/person/resolvePersonDrawerVmOverviewSections";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";
import type { PersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/types";
import type { ResolvedPersonDrawerLayoutVariant } from "@/lib/admin/person/personDrawerLayoutRuntime";

type Props = {
    displayVm: PersonDrawerViewModel | ChildDrawerViewModel;
    chrome: PersonDrawerVmChrome;
    layoutVariant: ResolvedPersonDrawerLayoutVariant;
    isChildSurface: boolean;
    personId: string;
    canMutate: boolean;
    onOpenDrawer: (type: AdminDrawerEntityType, id: string) => void;
    onOpenLinkedPerson: (personId: string) => void;
};

export default function PersonDrawerLegacyOperatingOverview({
    displayVm,
    chrome,
    layoutVariant,
    isChildSurface,
    personId,
    canMutate,
    onOpenDrawer,
    onOpenLinkedPerson,
}: Props) {
    const record = displayVm.record;

    const childChromeHint = useMemo(
        () => ({ presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS }),
        [],
    );
    const parentChromeHint = useMemo(() => {
        if (chrome !== "parent") return null;
        return { presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS };
    }, [chrome]);

    const overviewSections = useMemo(
        () =>
            resolvePersonDrawerVmOverviewSections({
                record,
                chrome,
                layoutVariant,
                parentChromeHint,
                childChromeHint: isChildSurface ? childChromeHint : null,
            }),
        [record, chrome, layoutVariant, parentChromeHint, isChildSurface, childChromeHint],
    );

    const customSectionContent = useMemo(() => {
        const profile =
            chrome === "parent" ?
                resolvePersonDrawerProfileFromRecordWithParentHint(record, parentChromeHint)
            : chrome === "child" ?
                resolvePersonDrawerProfileFromRecordWithHint(record, childChromeHint)
            :   resolvePersonDrawerProfileFromRecord(record);
        const enrollmentMirror =
            (record._enrollment_mirror as Parameters<typeof PersonDrawerEnrollmentActivity>[0]["mirrorRows"]) ?? [];
        const enrollmentOpps =
            (record._enrollment_opportunities as Parameters<typeof PersonDrawerEnrollmentActivity>[0]["opportunityRows"]) ?? [];
        const openPersonDrawer = (type: string, id: string) => onOpenDrawer(type as AdminDrawerEntityType, id);
        const hasRelationships =
            chrome === "generic" && personDrawerHasRelationshipContent(record, profile);
        const enrollmentActivity =
            chrome === "generic" && (enrollmentMirror.length > 0 || enrollmentOpps.length > 0) ?
                <PersonDrawerEnrollmentActivity
                    mirrorRows={enrollmentMirror}
                    opportunityRows={enrollmentOpps}
                    onOpenDrawer={openPersonDrawer}
                />
            :   null;
        return {
            ...(personId &&
            chrome === "generic" &&
            personDrawerShouldShowEmployeePlacement(profile) ?
                {
                    employee_placement: (
                        <PersonEmployeePlacementSection
                            personId={personId}
                            initialValues={readPersonEmployeePlacementValues(record)}
                            canMutate={canMutate}
                            compactOperatingSurface
                            onPersonUpdated={() => {}}
                        />
                    ),
                }
            :   {}),
            ...(hasRelationships ?
                {
                    relationships: (
                        <PersonDrawerRelationshipsOverview record={record} onOpenDrawer={openPersonDrawer} />
                    ),
                }
            :   {}),
            ...(enrollmentActivity ? { enrollment_activity: enrollmentActivity } : {}),
        };
    }, [record, chrome, parentChromeHint, childChromeHint, personId, canMutate, onOpenDrawer]);

    const showOperatingSections = personDrawerOperatingSummaryVisible({
        bodyHydrated: true,
        record,
    });

    return (
        <div className="space-y-4" data-person-drawer-legacy-operating-overview="true">
            {isChildSurface ?
                <PersonDrawerChildLifecycleRail record={record} chromeHint={childChromeHint} onSelectTab={() => {}} />
            :   null}
            {chrome === "parent" ?
                <PersonDrawerParentLifecycleRail record={record} chromeHint={parentChromeHint} onSelectTab={() => {}} />
            :   null}
            {showOperatingSections && (chrome === "parent" || chrome === "child") ?
                <PersonDrawerOperatingSections
                    variant={layoutVariant}
                    record={record}
                    personId={personId}
                    canMutate={canMutate}
                    bodyHydrated
                    childChromeHint={isChildSurface ? childChromeHint : null}
                    parentChromeHint={parentChromeHint}
                    onOpenDrawer={onOpenDrawer}
                    onOpenLinkedPerson={onOpenLinkedPerson}
                    onPersonUpdated={() => {}}
                    onRecordUpdated={() => {}}
                />
            :   null}
            <EntityDrawerOverview
                entityType="persons"
                data={record}
                customSectionContent={customSectionContent}
                overviewSectionsOverride={overviewSections}
                canEdit={canMutate}
                sectionSurface="premium"
                personChildLifecycleOverview={chrome === "child"}
                onOpenDrawer={(type, id) => onOpenDrawer(type as AdminDrawerEntityType, id)}
            />
        </div>
    );
}
