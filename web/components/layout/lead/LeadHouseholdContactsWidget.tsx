"use client";

import DrawerHouseholdContactCardList from "@/components/layout/DrawerHouseholdContactCardList";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { resolveOpportunityDrawerHouseholdContacts } from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    record: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
};

/** Lead household section — primary + guardian/contact adults from opportunity VM projection. */
export default function LeadHouseholdContactsWidget({ record, onAdornmentAction }: Props) {
    const projection = resolveOpportunityDrawerHouseholdContacts(record);

    return (
        <DrawerHouseholdContactCardList
            contacts={projection.visible}
            overflowCount={projection.overflowCount}
            anchorRecord={record}
            onAdornmentAction={onAdornmentAction}
            emptyMessage="No household contacts linked yet."
            showPrimaryBadge
        />
    );
}
