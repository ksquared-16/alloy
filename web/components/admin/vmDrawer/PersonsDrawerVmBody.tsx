"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EntityDrawerOverview from "@/components/admin/entity/EntityDrawerOverview";
import EntityDocumentsSection from "@/components/admin/EntityDocumentsSection";
import PersonDrawerChildCommunicationsPlaceholder from "@/components/admin/entity/PersonDrawerChildCommunicationsPlaceholder";
import PersonDrawerChildLifecycleRail from "@/components/admin/entity/PersonDrawerChildLifecycleRail";
import PersonDrawerEnrollmentActivity from "@/components/admin/entity/PersonDrawerEnrollmentActivity";
import PersonDrawerOperatingActivityTab from "@/components/admin/entity/PersonDrawerOperatingActivityTab";
import PersonDrawerOperatingSections from "@/components/admin/entity/PersonDrawerOperatingSections";
import PersonDrawerParentLifecycleRail from "@/components/admin/entity/PersonDrawerParentLifecycleRail";
import PersonEmployeePlacementSection from "@/components/admin/entity/PersonEmployeePlacementSection";
import { PersonDrawerRelationshipsOverview } from "@/components/admin/entity/PersonDrawerVisibilitySections";
import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import { normalizeDocumentRows } from "@/lib/admin/normalizeDocumentRow";
import { readPersonEmployeePlacementValues } from "@/lib/admin/personEmployeePlacementFields";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { personDrawerHasRelationshipContent } from "@/lib/admin/person/personDrawerRelationshipVisibility";
import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import { resolvePersonDrawerProfileFromRecordWithHint } from "@/lib/admin/person/personDrawerChildChrome";
import { resolvePersonDrawerProfileFromRecordWithParentHint } from "@/lib/admin/person/personDrawerParentChrome";
import { personDrawerShouldShowEmployeePlacement } from "@/lib/admin/person/personDrawerPresentationProfile";
import { personDrawerOperatingSummaryVisible } from "@/lib/admin/person/personDrawerShellPolicy";
import { resolvePersonDrawerVmOverviewSections,
    type PersonDrawerVmChrome,
} from "@/lib/admin/person/resolvePersonDrawerVmOverviewSections";
import DrawerLayoutRuntimeOverviewBody from "@/components/admin/vmDrawer/DrawerLayoutRuntimeOverviewBody";
import {
    isLayoutRuntimeChildDrawerBodyEnabledClient,
    isLayoutRuntimePersonDrawerBodyEnabledClient,
} from "@/lib/layout/featureFlag";
import { useDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";
import { personDisplayName } from "@/lib/adminFormatters";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";
import type { PersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/types";
import type { ResolvedPersonDrawerLayoutVariant } from "@/lib/admin/person/personDrawerLayoutRuntime";

type PersonRelatedPayload = {
    documents?: unknown[];
};

export type PersonsDrawerVmBodyProps = {
    displayVm: PersonDrawerViewModel | ChildDrawerViewModel;
    chrome: PersonDrawerVmChrome;
    layoutVariant: ResolvedPersonDrawerLayoutVariant;
    isChildSurface: boolean;
    personId: string;
    canMutate: boolean;
    drawerTab: DrawerTabKey;
    onSelectTab: (tab: DrawerTabKey) => void;
    onOpenDrawer: (type: AdminDrawerEntityType, id: string) => void;
    onOpenLinkedPerson: (personId: string) => void;
};

const OPERATING_TAB_LIST: DrawerTabKey[] = ["overview", "related", "documents", "communications"];
const OPERATING_TAB_LABELS: Record<string, string> = {
    overview: "Overview",
    related: "Activity",
    documents: "Documents",
    communications: "Communications",
};

export function PersonsDrawerVmTabStrip({
    active,
    onSelect,
}: {
    active: DrawerTabKey;
    onSelect: (tab: DrawerTabKey) => void;
}) {
    return (
        <div className="flex min-h-0 flex-wrap gap-0.5 rounded-lg border border-admin-border bg-white py-1.5 px-1.5">
            {OPERATING_TAB_LIST.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    onClick={() => onSelect(tab)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium leading-snug transition-colors adminv2-record-modal-tab ${active === tab ? "adminv2-record-modal-tab--active" : "text-alloy-forge/80 hover:bg-alloy-stone/50"}`}
                >
                    {OPERATING_TAB_LABELS[tab] ?? tab}
                </button>
            ))}
        </div>
    );
}

export default function PersonsDrawerVmBody({
    displayVm,
    chrome,
    layoutVariant,
    isChildSurface,
    personId,
    canMutate,
    drawerTab,
    onSelectTab,
    onOpenDrawer,
    onOpenLinkedPerson,
}: PersonsDrawerVmBodyProps) {
    const { drawer } = useAdminDrawer();
    const record = displayVm.record;
    const [personRelatedData, setPersonRelatedData] = useState<PersonRelatedPayload | null>(null);
    const [personRelatedLoading, setPersonRelatedLoading] = useState(false);

    useEffect(() => {
        onSelectTab("overview");
        setPersonRelatedData(null);
    }, [personId, chrome, onSelectTab]);

    useEffect(() => {
        if (chrome === "generic") return;
        if (drawerTab !== "documents" || personRelatedData || personRelatedLoading) return;
        setPersonRelatedLoading(true);
        void fetch(`/api/admin/entity/persons/${encodeURIComponent(personId)}/related`, {
            credentials: "include",
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((json: PersonRelatedPayload | null) => setPersonRelatedData(json ?? null))
            .catch(() => setPersonRelatedData(null))
            .finally(() => setPersonRelatedLoading(false));
    }, [chrome, drawerTab, personId, personRelatedData, personRelatedLoading]);

    const childChromeHint = useMemo(
        () => ({ presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS }),
        []
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
        [record, chrome, layoutVariant, parentChromeHint, isChildSurface, childChromeHint]
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

    const commsMetadata = useMemo(() => {
        const primaryLabel = personDisplayName({
            first_name: record.first_name as string | null | undefined,
            last_name: record.last_name as string | null | undefined,
            full_name: record.full_name as string | null | undefined,
        });
        return {
            primaryLabel: primaryLabel !== "—" ? primaryLabel : null,
            status: null,
            location: null,
            children: null,
            relatedContacts: null,
        };
    }, [record]);

    const showOperatingSections = personDrawerOperatingSummaryVisible({
        bodyHydrated: true,
        record,
    });

    const layoutAssignmentQueryParams = useMemo(() => {
        const opportunityId = drawer.personDrawerOpenSeed?.opportunity_id?.trim() || null;
        return opportunityId ? { opportunityId } : undefined;
    }, [drawer.personDrawerOpenSeed?.opportunity_id]);

    const personLayoutBody = useDrawerLayoutRuntimeBody({
        cutoverEnabled: isLayoutRuntimePersonDrawerBodyEnabledClient() && !isChildSurface,
        entityId: personId,
        vmReady: Boolean(record?.id),
        apiPath: "/api/admin/layout-runtime/person-drawer-body",
        queryParams: layoutAssignmentQueryParams,
        logTag: "person_drawer",
    });

    const childLayoutBody = useDrawerLayoutRuntimeBody({
        cutoverEnabled: isLayoutRuntimeChildDrawerBodyEnabledClient() && isChildSurface,
        entityId: personId,
        vmReady: Boolean(record?.id),
        apiPath: "/api/admin/layout-runtime/child-drawer-body",
        queryParams: layoutAssignmentQueryParams,
        logTag: "child_drawer",
    });

    const activeLayoutBody = isChildSurface ? childLayoutBody : personLayoutBody;

    const vmOverviewBody = (
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
    );

    const layoutOverviewBody = (
        <DrawerLayoutRuntimeOverviewBody
            layoutBody={activeLayoutBody}
            vmFallback={vmOverviewBody}
            entityId={personId}
            surface={isChildSurface ? "child_drawer_overview" : "person_drawer_overview"}
        />
    );

    const overviewPanel =
        chrome === "generic" || drawerTab === "overview" ?
            <div className="space-y-4" data-adminv2-person-drawer-overview-tab="true">
                {isChildSurface ?
                    <PersonDrawerChildLifecycleRail
                        record={record}
                        chromeHint={childChromeHint}
                        onSelectTab={onSelectTab}
                    />
                :   null}
                {chrome === "parent" ?
                    <PersonDrawerParentLifecycleRail
                        record={record}
                        chromeHint={parentChromeHint}
                        onSelectTab={onSelectTab}
                    />
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
                {activeLayoutBody.cutoverEnabled ? layoutOverviewBody : vmOverviewBody}
            </div>
        :   null;

    if (chrome === "generic") {
        return (
            <div data-adminv2-person-drawer-body="true" data-drawer-vm-runtime-overview="true">
                {overviewPanel}
            </div>
        );
    }

    return (
        <div data-adminv2-person-drawer-body="true" data-drawer-vm-runtime-overview="true">
            {drawerTab === "overview" ? overviewPanel : null}
            {drawerTab === "related" ?
                <PersonDrawerOperatingActivityTab variant={isChildSurface ? "child" : "parent"} />
            :   null}
            {drawerTab === "documents" ?
                <div className="pt-2 space-y-3">
                    <EntityDocumentsSection
                        documents={normalizeDocumentRows(personRelatedData?.documents)}
                        loading={personRelatedLoading}
                        uploadEntityType="person"
                        entityId={personId}
                        canMutate={canMutate}
                        onAfterUpload={() => setPersonRelatedData(null)}
                    />
                </div>
            :   null}
            {drawerTab === "communications" && isChildSurface ?
                <div className="pt-2">
                    <PersonDrawerChildCommunicationsPlaceholder />
                </div>
            :   null}
            {drawerTab === "communications" && chrome === "parent" ?
                <div
                    className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2 min-h-[22rem] h-[min(72vh,calc(100dvh-15rem))]"
                    data-person-drawer-parent-comms="true"
                >
                    <CommunicationsDrawerSection
                        key={personId}
                        embedded
                        className="min-h-0 flex-1"
                        apiEntityType="persons"
                        entityId={personId}
                        active
                        backgroundPreload={false}
                        threadContextMetadata={commsMetadata}
                    />
                </div>
            :   null}
        </div>
    );
}
