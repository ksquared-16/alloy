/**
 * Layout runtime — make_primary_contact relationship action context and visibility.
 *
 * Doctrine: primary contact designation is not a scalar inline edit.
 */

import { resolveLeadSummaryPrimaryPersonId } from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import {
    MAKE_PRIMARY_CONTACT_SCOPE_LABELS,
    type MakePrimaryContactScopeKind,
} from "@/lib/admin/actions/makePrimaryContactAction";
import { householdShowsPrimaryContactControl } from "@/lib/admin/person/personDrawerHouseholdPrimaryContactDisplay";
import type { LayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import { resolveLayoutEditorContactBlockPerson } from "@/lib/layout/runtime/resolveLayoutEditorContactBlockRecord";
import {
    resolveOpportunityDrawerHouseholdContacts,
    type DrawerHouseholdContactRow,
} from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type MakePrimaryContactActionContext = {
    customerId: string;
    opportunityId: string;
    targetPersonId: string;
    targetPersonName: string;
    currentPrimaryPersonId: string | null;
    currentPrimaryPersonName: string | null;
    scopeLabels: string[];
    adultCount: number;
};

function trimOrNull(value: unknown): string | null {
    const text = String(value ?? "").trim();
    return text || null;
}

function pickDisplayName(record: ProofRuntimeRecord, personId: string): string | null {
    const projection = resolveOpportunityDrawerHouseholdContacts(record);
    const match = projection.contacts.find((row) => row.person_id === personId);
    return match?.display_name ?? null;
}

function resolveTargetPersonFromRow(row: ProofRuntimeRecord): { personId: string; displayName: string } | null {
    const personId = trimOrNull(row.person_id ?? row["person.id"]);
    if (!personId) return null;
    const displayName =
        trimOrNull(
            row["person.primary_contact_name"]
            ?? row["person.display_name"]
            ?? row["person.name"]
            ?? row["person.primary_contact_name"],
        ) ?? personId;
    return { personId, displayName };
}

function defaultScopeKinds(): MakePrimaryContactScopeKind[] {
    return ["household", "opportunity"];
}

/** Resolve action context for opportunity/household primary contact reassignment. */
export function resolveMakePrimaryContactActionContext(args: {
    anchorRecord: ProofRuntimeRecord;
    rowRecord?: ProofRuntimeRecord;
    layoutContactRole?: LayoutEditorContactRole | null;
    opportunityId?: string | null;
}): MakePrimaryContactActionContext | null {
    const anchor = args.anchorRecord;
    const customerId = trimOrNull(anchor.customer_id);
    if (!customerId) return null;

    const opportunityId = trimOrNull(args.opportunityId ?? anchor.id ?? anchor.opportunity_id);
    if (!opportunityId) return null;

    let targetPersonId: string | null = null;
    let targetPersonName: string | null = null;

    if (args.rowRecord) {
        const fromRow = resolveTargetPersonFromRow(args.rowRecord);
        if (fromRow) {
            targetPersonId = fromRow.personId;
            targetPersonName = fromRow.displayName;
        }
    } else if (args.layoutContactRole) {
        const person = resolveLayoutEditorContactBlockPerson(anchor, args.layoutContactRole);
        if (person?.personId) {
            targetPersonId = person.personId;
            targetPersonName = person.displayName || person.personId;
        }
    }

    if (!targetPersonId) return null;

    const projection = resolveOpportunityDrawerHouseholdContacts(anchor);
    const currentPrimaryPersonId =
        projection.primaryPersonId ?? resolveLeadSummaryPrimaryPersonId(anchor as Record<string, unknown>);
    const currentPrimaryPersonName =
        currentPrimaryPersonId ? pickDisplayName(anchor, currentPrimaryPersonId) : null;
    const resolvedTargetName = targetPersonName ?? pickDisplayName(anchor, targetPersonId) ?? targetPersonId;

    return {
        customerId,
        opportunityId,
        targetPersonId,
        targetPersonName: resolvedTargetName,
        currentPrimaryPersonId,
        currentPrimaryPersonName,
        scopeLabels: defaultScopeKinds().map((kind) => MAKE_PRIMARY_CONTACT_SCOPE_LABELS[kind]),
        adultCount: projection.contacts.length,
    };
}

/** Whether the make_primary_contact action should render for the current row/block. */
export function shouldShowMakePrimaryContactAction(args: {
    context: MakePrimaryContactActionContext | null;
    canMutate: boolean;
}): boolean {
    const ctx = args.context;
    if (!ctx || !args.canMutate) return false;
    if (!householdShowsPrimaryContactControl({
        guardianCount: ctx.adultCount,
        isPrimary: Boolean(ctx.currentPrimaryPersonId && ctx.targetPersonId === ctx.currentPrimaryPersonId),
        canMutate: true,
    })) {
        return false;
    }
    if (ctx.currentPrimaryPersonId && ctx.targetPersonId === ctx.currentPrimaryPersonId) return false;
    return true;
}

export function drawerHouseholdContactRowFromContext(
    context: MakePrimaryContactActionContext,
): DrawerHouseholdContactRow {
    return {
        person_id: context.targetPersonId,
        display_name: context.targetPersonName,
        role_label: null,
        role_type: null,
        is_primary: false,
        phone: null,
        email: null,
        initials: "",
    };
}
