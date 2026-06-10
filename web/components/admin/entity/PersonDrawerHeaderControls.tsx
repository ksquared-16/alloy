"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import BosDrawerAssistCta from "@/components/admin/drawer/BosDrawerAssistCta";
import { DrawerHeaderAttentionBlock } from "@/components/admin/drawer/DrawerHeaderAttentionBlock";
import { RecordDrawerManageMenu } from "@/components/admin/drawer/record/RecordDrawerManageMenu";
import { buildRecordManageMenuForEntity } from "@/lib/admin/recordManage/buildRecordManageMenu";
import type { RecordManageEntityKind, RecordManageMenuActionKey } from "@/lib/admin/recordManage/types";

type Props = {
    personId: string;
    overviewData: Record<string, unknown>;
    opportunitySingular?: string;
    manageEntityKind?: RecordManageEntityKind;
    /** Save actions rendered on the top row beside Work with BOS. */
    actionsSlot?: ReactNode;
    /** Proof-layout header — actions row only (no attention block below). */
    proofLayoutActions?: boolean;
    canMutate?: boolean;
    manageBusyKey?: RecordManageMenuActionKey | null;
    onManageSelect?: (key: RecordManageMenuActionKey) => void;
    manageDisabledReason?: string | null;
};

/** Person drawer title-rail — controls top-right; attention context below (full width, left-aligned). */
export function PersonDrawerHeaderControls({
    personId,
    overviewData,
    opportunitySingular = "Person",
    manageEntityKind = "person",
    actionsSlot = null,
    proofLayoutActions = false,
    canMutate = false,
    manageBusyKey = null,
    onManageSelect,
    manageDisabledReason = null,
}: Props) {
    const manageMenuItems = useMemo(
        () => buildRecordManageMenuForEntity(manageEntityKind, opportunitySingular),
        [manageEntityKind, opportunitySingular]
    );

    const actionsRow = (
        <div
            className="flex shrink-0 flex-nowrap items-center justify-end gap-2 overflow-visible"
            data-person-header-controls-row="actions"
        >
            <BosDrawerAssistCta
                bare
                entityId={personId}
                overviewData={overviewData}
                opportunitySingular={opportunitySingular}
                inquiryWorkflow={false}
                proofLayoutActions={proofLayoutActions}
                actionVariant="juniper"
            />
            <RecordDrawerManageMenu
                items={manageMenuItems}
                disabled={!canMutate || !!manageBusyKey}
                disabledReason={manageDisabledReason}
                busyKey={manageBusyKey}
                onSelect={onManageSelect ?? (() => undefined)}
                proofLayoutActions={proofLayoutActions}
            />
            {actionsSlot}
        </div>
    );

    if (proofLayoutActions) {
        return actionsRow;
    }

    return (
        <div className="flex w-full min-w-0 max-w-full flex-col items-stretch gap-1" data-person-header-controls="true">
            {actionsRow}
            <DrawerHeaderAttentionBlock overviewData={overviewData} />
        </div>
    );
}
