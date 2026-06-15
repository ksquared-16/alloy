"use client";

import { useCallback, useMemo, useState } from "react";
import DrawerHouseholdContactCardList from "@/components/layout/DrawerHouseholdContactCardList";
import LeadHouseholdPrimaryContactConfirmModal from "@/components/layout/lead/LeadHouseholdPrimaryContactConfirmModal";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { useLayoutRuntimeHostContext } from "@/components/layout/LayoutRuntimePlanView";
import { patchLeadHouseholdPrimaryContact } from "@/lib/admin/person/patchLeadHouseholdPrimaryContact";
import { householdShowsPrimaryContactControl } from "@/lib/admin/person/personDrawerHouseholdPrimaryContactDisplay";
import { resolveOpportunityDrawerHouseholdContacts } from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import type { DrawerHouseholdContactRow } from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    record: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
    canMutate?: boolean;
};

/** Lead household section — primary + guardian/contact adults with optional reassignment. */
export default function LeadHouseholdContactsWidget({
    record,
    onAdornmentAction,
    canMutate: canMutateProp,
}: Props) {
    const host = useLayoutRuntimeHostContext();
    const canMutate = canMutateProp ?? host.canMutate ?? false;

    const customerId = String(record.customer_id ?? "").trim();
    const opportunityId = String(record.id ?? host.entityId ?? "").trim();
    const projection = useMemo(() => resolveOpportunityDrawerHouseholdContacts(record), [record]);

    const adultCount = projection.contacts.length;
    const canReassignPrimary = canMutate && Boolean(customerId) && adultCount > 1;

    const [pending, setPending] = useState<DrawerHouseholdContactRow | null>(null);
    const [savingPersonId, setSavingPersonId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const requestMakePrimary = useCallback(
        (contact: DrawerHouseholdContactRow) => {
            if (!canReassignPrimary || contact.is_primary || !contact.person_id) return;
            if (
                !householdShowsPrimaryContactControl({
                    guardianCount: adultCount,
                    isPrimary: contact.is_primary,
                    canMutate: true,
                })
            ) {
                return;
            }
            setError(null);
            setPending(contact);
        },
        [adultCount, canReassignPrimary]
    );

    const handleConfirm = useCallback(async () => {
        if (!pending?.person_id || !customerId || !opportunityId) return;
        setSavingPersonId(pending.person_id);
        setError(null);
        try {
            await patchLeadHouseholdPrimaryContact({
                customerId,
                personId: pending.person_id,
                opportunityId,
                opportunityRecord: record,
            });
            setPending(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update primary contact");
        } finally {
            setSavingPersonId(null);
        }
    }, [customerId, opportunityId, pending, record]);

    return (
        <>
            <DrawerHouseholdContactCardList
                contacts={projection.visible}
                overflowCount={projection.overflowCount}
                anchorRecord={record}
                onAdornmentAction={onAdornmentAction}
                emptyMessage="No household contacts linked yet."
                showPrimaryBadge
                canMutatePrimaryContact={canReassignPrimary}
                onMakePrimaryContact={requestMakePrimary}
                makePrimarySavingPersonId={savingPersonId}
            />
            {error ?
                <p className="mt-2 text-[12px] text-alloy-ember" data-drawer-household-primary-contact-error="true">
                    {error}
                </p>
            :   null}
            <LeadHouseholdPrimaryContactConfirmModal
                isOpen={pending != null}
                personName={pending?.display_name ?? "this person"}
                isLoading={savingPersonId != null}
                onClose={() => {
                    if (savingPersonId) return;
                    setPending(null);
                }}
                onConfirm={handleConfirm}
            />
        </>
    );
}
