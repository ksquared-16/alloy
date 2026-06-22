/**
 * Map person VM record → operator-safe layout runtime record.
 */

import type { PersonEnrollmentMirrorRow, PersonHouseholdChildLinkRow, PersonHouseholdContextRow } from "@/lib/admin/person/personDrawerVisibilityTypes";
import { mergeCanonicalOpportunityLayoutRuntimeChildRows } from "./mergeCanonicalOpportunityLayoutRuntimeChildRows";
import { isOpaqueIdValue, pickEntityId, type ProofRuntimeRecord } from "./proofRecordContext";
import { resolveHouseholdAddressFieldValues } from "./resolveHouseholdAddressFieldValues";
import { resolvePersonAddressFieldValues } from "./resolvePersonAddressFieldValues";
import { stampLayoutRuntimeActiveRecordContext } from "./layoutRuntimeRelatedListActiveRecord";

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

function resolveHouseholdName(vmRecord: Record<string, unknown>): string | null {
    return pickDisplay(
        vmRecord["customer.household_name"],
        vmRecord._household_name,
        vmRecord.household_name,
        (vmRecord._household_context as PersonHouseholdContextRow[] | undefined)?.map((row) => row.customer_name),
        (vmRecord._customer_persons as { _customer_name?: string | null; is_primary?: boolean }[] | undefined)
            ?.filter((row) => row.is_primary)
            .map((row) => row._customer_name),
        (vmRecord._customer_persons as { _customer_name?: string | null }[] | undefined)?.map(
            (row) => row._customer_name,
        ),
    );
}

function resolvePersonRelationship(vmRecord: Record<string, unknown>, personId: string): string | null {
    const fromField = pickDisplay(
        vmRecord["person.relationship"],
        vmRecord.relationship_type,
        vmRecord.role_type,
    );
    if (fromField) return fromField;

    for (const row of (vmRecord._customer_persons as {
        person_id?: string;
        is_primary?: boolean;
        _role_label?: string | null;
        role_type?: string | null;
    }[]) ?? []) {
        if (String(row.person_id) !== personId) continue;
        const label = pickDisplay(row._role_label, row.role_type);
        if (label) return label;
        if (row.is_primary) return "Primary contact";
    }

    if (vmRecord._primary_contact_on_opportunity === true) {
        return "Primary contact";
    }

    const oppRole = (vmRecord._enrollment_opportunities as { role_label?: string | null }[] | undefined)?.[0]
        ?.role_label;
    return pickDisplay(oppRole);
}

function enrollmentMirrorByMemberId(
    vmRecord: Record<string, unknown>,
): Map<string, PersonEnrollmentMirrorRow> {
    const mirror = vmRecord._enrollment_mirror as PersonEnrollmentMirrorRow[] | undefined;
    const map = new Map<string, PersonEnrollmentMirrorRow>();
    if (!Array.isArray(mirror)) return map;
    for (const row of mirror) {
        if (row.customer_member_id && !map.has(row.customer_member_id)) {
            map.set(row.customer_member_id, row);
        }
    }
    return map;
}

function mapHouseholdChildLinkRow(
    link: PersonHouseholdChildLinkRow,
    index: number,
    mirrorByMember: Map<string, PersonEnrollmentMirrorRow>,
): ProofRuntimeRecord {
    const mirror = mirrorByMember.get(link.customer_member_id);
    const childPersonId = pickEntityId(link.person_id) ?? "";
    const display = pickDisplay(link.display_name) ?? "—";
    const program = pickDisplay(mirror?.program_label, mirror?.room_label);
    return {
        id: pickEntityId(link.customer_member_id, link.person_id) ?? `household-child-${index}`,
        person_id: childPersonId,
        customer_member_id: link.customer_member_id,
        "child.id": childPersonId,
        "child.customer_member_id": link.customer_member_id,
        "child.name": display,
        "child.display_name": display,
        "child.date_of_birth": pickDisplay(link.date_of_birth) ?? "",
        "child.age_band": pickDisplay(link.age_label) ?? "",
        "child.status": pickDisplay(link.status_label, link.status_key) ?? "",
        "child.program": program ?? "",
        _layout_runtime_child_source: "household",
    };
}

function resolvePersonLayoutRuntimeChildRows(vmRecord: Record<string, unknown>): ProofRuntimeRecord[] {
    const mirrorByMember = enrollmentMirrorByMemberId(vmRecord);
    const childLinks = (vmRecord._household_child_links as PersonHouseholdChildLinkRow[] | undefined) ?? [];
    if (childLinks.length > 0) {
        return childLinks.map((link, index) => mapHouseholdChildLinkRow(link, index, mirrorByMember));
    }

    const metadata =
        vmRecord.metadata && typeof vmRecord.metadata === "object" && !Array.isArray(vmRecord.metadata)
            ? (vmRecord.metadata as Record<string, unknown>)
            : null;
    const merged = mergeCanonicalOpportunityLayoutRuntimeChildRows({
        inquiryChildren: vmRecord._inquiry_children,
        householdChildren: vmRecord._household_children ?? vmRecord.household_children,
        metadata,
    });
    if (merged.length > 0) {
        const contextSource = pickDisplay(vmRecord._person_children_context_source);
        return merged.map((row) => {
            const memberId = pickEntityId(row.customer_member_id, row["child.customer_member_id"]);
            const mirror = memberId ? mirrorByMember.get(memberId) : undefined;
            const enriched = {
                ...row,
                ...(contextSource ? { _layout_runtime_child_source: contextSource } : {}),
            };
            if (!mirror) return enriched;
            return {
                ...enriched,
                "child.program": pickDisplay(row["child.program"], mirror.program_label, mirror.room_label) ?? "",
            };
        });
    }

    for (const sourceKey of ["_children", "children", "household_children"] as const) {
        const raw = vmRecord[sourceKey];
        if (!Array.isArray(raw) || raw.length === 0) continue;
        return raw.map((row, index) => {
            const child = row as Record<string, unknown>;
            const childPersonId = pickEntityId(child.person_id, child.id) ?? "";
            const memberId = pickEntityId(child.customer_member_id) ?? "";
            const display = pickDisplay(child.display_name, child.name, child._child_name) ?? "—";
            const mirror = memberId ? mirrorByMember.get(memberId) : undefined;
            return {
                id: pickEntityId(child.id, child.person_id, child.customer_member_id) ?? `child-${index}`,
                person_id: childPersonId,
                customer_member_id: memberId,
                "child.id": childPersonId,
                "child.customer_member_id": memberId,
                "child.name": display,
                "child.display_name": display,
                "child.date_of_birth": pickDisplay(child.dob, child.date_of_birth) ?? "",
                "child.age_band": pickDisplay(child.age_band, child.age) ?? "",
                "child.status": pickDisplay(child.status_label, child.status_key, child.status) ?? "",
                "child.program": pickDisplay(child.program, mirror?.program_label) ?? "",
                _layout_runtime_child_source: pickDisplay(vmRecord._person_children_context_source) ?? "legacy",
            };
        });
    }

    return [];
}

export function buildPersonLayoutRuntimeRecordFromVm(input: {
    vmRecord: Record<string, unknown>;
    personId: string;
}): ProofRuntimeRecord {
    const { vmRecord, personId } = input;
    const fullName = pickDisplay(
        vmRecord["person.primary_contact_name"],
        vmRecord._person_name,
        vmRecord.full_name,
        [vmRecord.first_name, vmRecord.last_name].filter(Boolean).join(" "),
    );
    const householdName = resolveHouseholdName(vmRecord) ?? "";
    const phone = pickDisplay(vmRecord.phone, vmRecord["person.primary_phone"], vmRecord._primary_phone) ?? "";
    const email = pickDisplay(vmRecord.email, vmRecord["person.primary_email"], vmRecord._primary_email) ?? "";
    const relationship = resolvePersonRelationship(vmRecord, personId) ?? "";
    const householdAddressFields = resolveHouseholdAddressFieldValues(vmRecord);
    const personAddressFields = resolvePersonAddressFieldValues(vmRecord);
    const address = householdAddressFields["location.household_address"] ?? "";
    const childRows = resolvePersonLayoutRuntimeChildRows(vmRecord);

    const overviewData: Record<string, unknown> = {
        ...vmRecord,
        notes: vmRecord.notes,
        recent_communication: vmRecord.recent_communication,
        follow_up_notes: vmRecord.follow_up_notes,
        last_activity_summary: vmRecord.last_activity_summary,
        last_activity_at: vmRecord.last_activity_at,
        documents: vmRecord.documents ?? vmRecord._documents_preview,
    };

    const record: ProofRuntimeRecord = {
        ...vmRecord,
        id: personId,
        "person.id": personId,
        first_name: pickDisplay(vmRecord.first_name) ?? "",
        last_name: pickDisplay(vmRecord.last_name) ?? "",
        "person.first_name": pickDisplay(vmRecord.first_name) ?? "",
        "person.last_name": pickDisplay(vmRecord.last_name) ?? "",
        "person.primary_contact_name": fullName ?? "—",
        "person.primary_phone": phone,
        "person.primary_email": email,
        "person.phone": phone,
        "person.email": email,
        "person.relationship": relationship,
        "customer.household_name": householdName,
        "customer.name": householdName,
        _household_name: householdName,
        household_name: householdName,
        "location.household_address": address,
        ...householdAddressFields,
        ...personAddressFields,
        _overview_data: overviewData,
        ...(vmRecord._inquiry_summary_tasks ? { _inquiry_summary_tasks: vmRecord._inquiry_summary_tasks } : {}),
    };

    if (childRows.length > 0) {
        record.household_children = childRows;
        record.children = childRows;
    }

    if (householdName || address) {
        record._relations = {
            ...(householdName ?
                {
                    household_customer: {
                        handle: householdName,
                        entityType: "customer",
                        fields: { household_name: householdName },
                    },
                }
            :   {}),
            ...(address ?
                {
                    household_address: {
                        handle: address,
                        entityType: "location",
                        fields: { formatted_address: address },
                    },
                }
            :   {}),
        };
    }

    return stampLayoutRuntimeActiveRecordContext(record, {
        anchorEntity: "person",
        entityId: personId,
    });
}
