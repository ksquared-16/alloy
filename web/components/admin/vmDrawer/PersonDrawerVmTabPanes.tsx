"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EntityDocumentsSection from "@/components/admin/EntityDocumentsSection";
import PersonDrawerChildCommunicationsPlaceholder from "@/components/admin/entity/PersonDrawerChildCommunicationsPlaceholder";
import PersonDrawerOperatingActivityTab from "@/components/admin/entity/PersonDrawerOperatingActivityTab";
import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import { normalizeDocumentRows } from "@/lib/admin/normalizeDocumentRow";
import { personDisplayName } from "@/lib/adminFormatters";
import type { DrawerTabKey } from "@/lib/entityPresentation";

type Props = {
    personId: string;
    drawerTab: DrawerTabKey;
    record: Record<string, unknown>;
    isChildSurface: boolean;
    chrome: "child" | "parent" | "generic";
    canMutate: boolean;
};

export default function PersonDrawerVmTabPanes({
    personId,
    drawerTab,
    record,
    isChildSurface,
    chrome,
    canMutate,
}: Props) {
    const [personRelatedData, setPersonRelatedData] = useState<{ documents?: unknown[] } | null>(null);
    const [personRelatedLoading, setPersonRelatedLoading] = useState(false);

    useEffect(() => {
        setPersonRelatedData(null);
    }, [personId, chrome]);

    useEffect(() => {
        if (chrome === "generic") return;
        if (drawerTab !== "documents" || personRelatedData || personRelatedLoading) return;
        setPersonRelatedLoading(true);
        void fetch(`/api/admin/entity/persons/${encodeURIComponent(personId)}/related`, {
            credentials: "include",
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => setPersonRelatedData(json ?? null))
            .catch(() => setPersonRelatedData(null))
            .finally(() => setPersonRelatedLoading(false));
    }, [chrome, drawerTab, personId, personRelatedData, personRelatedLoading]);

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

    if (drawerTab === "related") {
        return <PersonDrawerOperatingActivityTab variant={isChildSurface ? "child" : "parent"} />;
    }

    if (drawerTab === "documents") {
        return (
            <div className="pt-2 space-y-3" data-person-drawer-documents-tab="true">
                <EntityDocumentsSection
                    documents={normalizeDocumentRows(personRelatedData?.documents)}
                    loading={personRelatedLoading}
                    uploadEntityType="person"
                    entityId={personId}
                    canMutate={canMutate}
                    onAfterUpload={() => setPersonRelatedData(null)}
                />
            </div>
        );
    }

    if (drawerTab === "communications" && isChildSurface) {
        return (
            <div className="pt-2" data-person-drawer-child-comms-tab="true">
                <PersonDrawerChildCommunicationsPlaceholder />
            </div>
        );
    }

    if (drawerTab === "communications" && chrome === "parent") {
        return (
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
        );
    }

    return null;
}
