/**
 * Person drawer — make primary contact action context (household scoped, no opportunity id).
 */

import { householdShowsPrimaryContactControl } from "@/lib/admin/person/personDrawerHouseholdPrimaryContactDisplay";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import {
    resolvePersonDrawerHouseholdContacts,
    type DrawerHouseholdContactRow,
} from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type PersonDrawerMakePrimaryContactContext = {
    customerId: string;
    targetPersonId: string;
    targetPersonName: string;
    currentPrimaryPersonId: string | null;
    currentPrimaryPersonName: string | null;
    adultCount: number;
};

function trimOrNull(value: unknown): string | null {
    const text = String(value ?? "").trim();
    return text || null;
}

function resolveCustomerId(record: ProofRuntimeRecord, targetPersonId: string): string | null {
    const direct = trimOrNull(record.customer_id);
    if (direct) return direct;

    const viewingPersonId = trimOrNull(record.id ?? record["person.id"]);
    const model = resolvePersonDrawerHouseholdModel(record, { viewing_person_id: viewingPersonId });
    for (const group of model.groups) {
        const inGroup = [
            ...group.guardians,
            ...group.emergency_contacts,
            ...group.authorized_pickups,
            ...group.other_household_members,
        ].some((member) => member.person_id === targetPersonId);
        if (inGroup) return group.customer_id;
    }
    return model.groups[0]?.customer_id ?? null;
}

function pickDisplayName(contacts: DrawerHouseholdContactRow[], personId: string): string | null {
    return contacts.find((row) => row.person_id === personId)?.display_name ?? null;
}

export function resolvePersonDrawerMakePrimaryContactContext(args: {
    anchorRecord: ProofRuntimeRecord;
    rowRecord?: ProofRuntimeRecord;
}): PersonDrawerMakePrimaryContactContext | null {
    const targetPersonId = trimOrNull(
        args.rowRecord?.person_id ?? args.rowRecord?.["person.id"] ?? args.rowRecord?.id,
    );
    if (!targetPersonId) return null;

    const customerId = resolveCustomerId(args.anchorRecord, targetPersonId);
    if (!customerId) return null;

    const projection = resolvePersonDrawerHouseholdContacts(args.anchorRecord, {
        maxVisible: Number.MAX_SAFE_INTEGER,
    });
    const currentPrimaryPersonId = projection.contacts.find((row) => row.is_primary)?.person_id ?? null;
    const targetPersonName =
        trimOrNull(
            args.rowRecord?.["person.primary_contact_name"]
            ?? args.rowRecord?.["person.display_name"]
            ?? args.rowRecord?.["person.name"],
        ) ?? pickDisplayName(projection.contacts, targetPersonId) ?? targetPersonId;

    return {
        customerId,
        targetPersonId,
        targetPersonName,
        currentPrimaryPersonId,
        currentPrimaryPersonName:
            currentPrimaryPersonId ? pickDisplayName(projection.contacts, currentPrimaryPersonId) : null,
        adultCount: projection.contacts.length,
    };
}

export function shouldShowPersonDrawerMakePrimaryContactAction(args: {
    context: PersonDrawerMakePrimaryContactContext | null;
    canMutate: boolean;
    isPrimary: boolean;
}): boolean {
    const ctx = args.context;
    if (!ctx || !args.canMutate) return false;
    return householdShowsPrimaryContactControl({
        guardianCount: ctx.adultCount,
        isPrimary: args.isPrimary,
        canMutate: true,
    });
}
