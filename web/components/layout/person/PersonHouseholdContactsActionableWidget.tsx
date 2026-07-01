"use client";

import { useCallback, useMemo, useState } from "react";
import DrawerHouseholdContactCardList from "@/components/layout/DrawerHouseholdContactCardList";
import LeadHouseholdPrimaryContactConfirmModal from "@/components/layout/lead/LeadHouseholdPrimaryContactConfirmModal";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { useLayoutRuntimeHostContext } from "@/components/layout/LayoutRuntimePlanView";
import { patchPersonDrawerHouseholdPrimaryContact } from "@/lib/admin/person/patchPersonDrawerHouseholdPrimaryContact";
import { householdShowsPrimaryContactControl } from "@/lib/admin/person/personDrawerHouseholdPrimaryContactDisplay";
import {
    resolvePersonDrawerHouseholdContacts,
    type DrawerHouseholdContactRow,
} from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import { resolvePersonDrawerMakePrimaryContactContext } from "@/lib/layout/runtime/resolvePersonDrawerMakePrimaryContactContext";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function trimOrNull(value: unknown): string | null {
    const text = String(value ?? "").trim();
    return text || null;
}

/**
 * Count all linked household adults for primary-reassignment threshold.
 * Uses `_household_adult_links` without role filtering so the count matches
 * operator expectation when the viewing person is excluded from the visible list.
 */
function countPersonDrawerReassignableAdults(record: ProofRuntimeRecord): number {
    const links = Array.isArray(record._household_adult_links) ?
            (record._household_adult_links as Array<Record<string, unknown>>)
        :   [];
    const ids = new Set<string>();
    for (const link of links) {
        const personId = trimOrNull(link.person_id);
        if (personId) ids.add(personId);
    }
    return ids.size;
}

/** Any visible linked adult with a person id can be made primary. */
function contactEligibleForPrimaryReassignment(contact: DrawerHouseholdContactRow): boolean {
    return Boolean(trimOrNull(contact.person_id));
}

type Props = {
    record: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
    canMutate?: boolean;
    emptyMessage?: string;
};

/** Person drawer household adults — primary badge + make-primary for non-primary members. */
export default function PersonHouseholdContactsActionableWidget({
    record,
    onAdornmentAction,
    canMutate: canMutateProp,
    emptyMessage = "No household members linked yet.",
}: Props) {
    const host = useLayoutRuntimeHostContext();
    const canMutate = canMutateProp ?? host.canMutate ?? false;
    const projection = useMemo(() => resolvePersonDrawerHouseholdContacts(record), [record]);
    const reassignableAdultCount = useMemo(
        () => countPersonDrawerReassignableAdults(record),
        [record],
    );
    const canReassignPrimary = canMutate && reassignableAdultCount > 1;

    const [pending, setPending] = useState<DrawerHouseholdContactRow | null>(null);
    const [savingPersonId, setSavingPersonId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const requestMakePrimary = useCallback(
        (contact: DrawerHouseholdContactRow) => {
            if (!canReassignPrimary || contact.is_primary || !contact.person_id) return;
            if (
                !householdShowsPrimaryContactControl({
                    guardianCount: reassignableAdultCount,
                    isPrimary: contact.is_primary,
                    canMutate: true,
                })
                || !contactEligibleForPrimaryReassignment(contact)
            ) {
                return;
            }
            setError(null);
            setPending(contact);
        },
        [reassignableAdultCount, canReassignPrimary],
    );

    const handleConfirm = useCallback(async () => {
        if (!pending?.person_id) return;
        const rowRecord: ProofRuntimeRecord = {
            id: pending.person_id,
            person_id: pending.person_id,
            "person.id": pending.person_id,
            "person.primary_contact_name": pending.display_name,
        };
        const context = resolvePersonDrawerMakePrimaryContactContext({
            anchorRecord: record,
            rowRecord,
        });
        if (!context?.customerId) {
            setError("Household account not found for this contact");
            return;
        }

        setSavingPersonId(pending.person_id);
        setError(null);
        try {
            await patchPersonDrawerHouseholdPrimaryContact({
                customerId: context.customerId,
                personId: pending.person_id,
                personRecord: record,
            });
            setPending(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update primary contact");
        } finally {
            setSavingPersonId(null);
        }
    }, [pending, record]);

    return (
        <div data-drawer-household-contacts-actionable="true" data-person-household-contacts-actionable="true">
            <DrawerHouseholdContactCardList
                contacts={projection.visible}
                overflowCount={projection.overflowCount}
                anchorRecord={record}
                onAdornmentAction={onAdornmentAction}
                emptyMessage={emptyMessage}
                showPrimaryBadge
                canMutatePrimaryContact={canReassignPrimary}
                onMakePrimaryContact={requestMakePrimary}
                makePrimarySavingPersonId={savingPersonId}
                makePrimaryContactEligible={contactEligibleForPrimaryReassignment}
            />
            {error ?
                <p className="mt-2 text-[12px] text-alloy-ember" data-drawer-household-primary-contact-error="true">
                    {error}
                </p>
            :   null}
            <LeadHouseholdPrimaryContactConfirmModal
                isOpen={pending != null}
                personName={pending?.display_name ?? "this person"}
                currentPrimaryName={
                    projection.contacts.find((row) => row.is_primary)?.display_name ?? null
                }
                scopeLabels={["Household account"]}
                isLoading={savingPersonId != null}
                onClose={() => {
                    if (savingPersonId) return;
                    setPending(null);
                }}
                onConfirm={handleConfirm}
            />
        </div>
    );
}
