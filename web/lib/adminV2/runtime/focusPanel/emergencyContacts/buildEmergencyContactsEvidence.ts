/**
 * Emergency Contacts evidence — canonical Person ↔ Child relationship instances.
 */

import {
    buildFocusPanelRelationshipInstanceViewModels,
    type FocusPanelRelationshipInstanceViewModel,
} from "@/lib/fields/personChildRelationship/focusPanelPersonChildRelationshipAdapterContract";
import type { PersonChildRelationshipInstance } from "@/lib/fields/personChildRelationship/personChildRelationshipEntity";
import { operationalRoleLabel } from "@/lib/fields/personChildRelationship/personChildRelationshipOperationalRoles";
import { projectLegacyCustomerMemberContactsToRelationshipInstances } from "@/lib/fields/personChildRelationship/personChildRelationshipLegacyReadAdapter";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type EmergencyContactEvidenceItem = FocusPanelRelationshipInstanceViewModel & {
    customer_member_id: string;
    child_id: string | null;
    operational_role_labels: readonly string[];
    priority: number | null;
    status: string | null;
};

export type EmergencyContactsEvidence = {
    items: EmergencyContactEvidenceItem[];
    count: number;
    answerLine: string;
    supportingLine: string | null;
};

type TruthRelationshipBag = {
    customer_member_id: string;
    customer_id: string;
    child_id?: string | null;
    items: readonly PersonChildRelationshipInstance[];
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

export function relationshipBagsFromTruth(truth: Record<string, unknown>): TruthRelationshipBag[] {
    const raw = truth._person_child_relationships_by_member;
    if (!Array.isArray(raw)) return [];
    const out: TruthRelationshipBag[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const rec = entry as Record<string, unknown>;
        const memberId = trimOrNull(rec.customer_member_id);
        const customerId = trimOrNull(rec.customer_id);
        if (!memberId || !customerId) continue;
        out.push({
            customer_member_id: memberId,
            customer_id: customerId,
            child_id: trimOrNull(rec.child_id),
            items: Array.isArray(rec.items) ? (rec.items as PersonChildRelationshipInstance[]) : [],
        });
    }
    return out;
}

function legacyBagForMember(truth: Record<string, unknown>, orgId: string, memberId: string): TruthRelationshipBag | null {
    const raw = truth._customer_member_contacts;
    if (!Array.isArray(raw)) return null;
    const legacyRows = (raw as Record<string, unknown>[]).filter(
        (r) => trimOrNull(r.customer_member_id) === memberId,
    );
    if (legacyRows.length === 0) return null;
    const customerId = trimOrNull(legacyRows[0]?.customer_id) ?? "";
    const personsById = new Map<string, Record<string, unknown>>();
    for (const row of legacyRows) {
        const personId = trimOrNull(row.person_id);
        if (!personId) continue;
        personsById.set(personId, {
            id: personId,
            display_name: row.display_name ?? row.person_display_name ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
        });
    }
    const projected = projectLegacyCustomerMemberContactsToRelationshipInstances({
        orgId,
        customerId,
        customerMemberId: memberId,
        rows: legacyRows.map((r) => ({
            id: String(r.id ?? ""),
            org_id: orgId,
            customer_id: customerId,
            customer_member_id: memberId,
            contact_id: String(r.contact_id ?? ""),
            role_key: String(r.role_key ?? ""),
            is_active: r.is_active !== false,
            person_id: trimOrNull(r.person_id),
        })),
        personsById,
    });
    return {
        customer_member_id: memberId,
        customer_id: customerId,
        child_id: trimOrNull(legacyRows[0]?.child_person_id),
        items: [...projected.items],
    };
}

function filterEmergencyContacts(items: readonly PersonChildRelationshipInstance[]): PersonChildRelationshipInstance[] {
    return items.filter(
        (item) =>
            item.status !== "inactive"
            && item.operational_roles.some((role) => role.trim().toLowerCase() === "emergency_contact"),
    );
}

function toEvidenceItem(
    instance: PersonChildRelationshipInstance,
    bag: TruthRelationshipBag,
    vm: FocusPanelRelationshipInstanceViewModel,
    optionLabelsByKey?: ReadonlyMap<string, string>,
): EmergencyContactEvidenceItem {
    const typeKey = trimOrNull(instance.relationship_type);
    const typeLabel =
        typeKey && optionLabelsByKey?.get(typeKey) ? optionLabelsByKey.get(typeKey)! : vm.relationship_type_label;
    return {
        ...vm,
        relationship_type_label: typeLabel,
        customer_member_id: bag.customer_member_id,
        child_id: bag.child_id ?? null,
        operational_role_labels: instance.operational_roles.map(operationalRoleLabel),
        priority: instance.priority ?? null,
        status: instance.status ?? null,
    };
}

export function buildEmergencyContactsEvidenceForChild(args: {
    context: OperationalContext;
    customerMemberId: string;
    optionLabelsByKey?: ReadonlyMap<string, string>;
}): EmergencyContactsEvidence {
    const truth = args.context.truth as Record<string, unknown>;
    const orgId = String(truth.org_id ?? "");

    const canonicalBag = relationshipBagsFromTruth(truth).find(
        (b) => b.customer_member_id === args.customerMemberId,
    );
    // Canonical bag wins when present; legacy projection is compatibility-only.
    const bag =
        canonicalBag ?? legacyBagForMember(truth, orgId, args.customerMemberId) ?? undefined;

    const emergency = filterEmergencyContacts(bag?.items ?? []);
    const vms = buildFocusPanelRelationshipInstanceViewModels(emergency);
    const fallbackBag: TruthRelationshipBag = {
        customer_member_id: args.customerMemberId,
        customer_id: String(truth.customer_id ?? ""),
        child_id: null,
        items: [],
    };
    const items = emergency.map((instance, index) =>
        toEvidenceItem(instance, bag ?? fallbackBag, vms[index]!, args.optionLabelsByKey),
    );

    const count = items.length;
    return {
        items,
        count,
        answerLine:
            count === 0
                ? "No emergency contact on file"
                : count === 1
                    ? `${items[0]!.person_display_name} · Emergency Contact`
                    : `${count} emergency contacts`,
        supportingLine: count === 0 ? "Add an emergency contact for this child." : null,
    };
}

export function buildEmergencyContactsEvidence(args: {
    context: OperationalContext;
    optionLabelsByKey?: ReadonlyMap<string, string>;
}): EmergencyContactsEvidence {
    const truth = args.context.truth as Record<string, unknown>;
    const orgId = String(truth.org_id ?? "");
    const bags = relationshipBagsFromTruth(truth);
    const memberIds =
        bags.length > 0
            ? bags.map((b) => b.customer_member_id)
            : [...new Set(
                ((truth._inquiry_children as { customer_member_id?: string }[] | undefined) ?? [])
                    .map((c) => trimOrNull(c.customer_member_id))
                    .filter(Boolean) as string[],
            )];

    const items: EmergencyContactEvidenceItem[] = [];
    for (const memberId of memberIds) {
        const childEvidence = buildEmergencyContactsEvidenceForChild({
            context: args.context,
            customerMemberId: memberId,
            optionLabelsByKey: args.optionLabelsByKey,
        });
        if (childEvidence.items.length === 0 && bags.length === 0) {
            const legacy = legacyBagForMember(truth, orgId, memberId);
            if (!legacy) continue;
        }
        items.push(...childEvidence.items);
    }

    const count = items.length;
    return {
        items,
        count,
        answerLine: count === 0 ? "No emergency contact on file" : `${count} emergency contact${count === 1 ? "" : "s"}`,
        supportingLine: count === 0 ? "Add emergency contacts for enrolled children." : null,
    };
}
