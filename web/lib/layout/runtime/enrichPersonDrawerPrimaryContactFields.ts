/**
 * Project household primary-contact role onto person drawer scalar fields.
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

import {
    formatLayoutRuntimePrimaryContactDisplay,
    LAYOUT_RUNTIME_PRIMARY_CONTACT_LABEL,
    LAYOUT_RUNTIME_NOT_PRIMARY_CONTACT_LABEL,
} from "@/lib/layout/runtime/layoutRuntimePrimaryContactField";
export type PersonDrawerPrimaryContactProjection = {
    isPrimary: boolean;
    display: string;
};

export function resolvePersonDrawerPrimaryContactProjection(
    vmRecord: Record<string, unknown>,
    personId: string,
): PersonDrawerPrimaryContactProjection {
    for (const raw of (vmRecord._customer_persons as {
        person_id?: string;
        is_primary?: boolean;
        is_household_primary_contact?: boolean;
        role_type?: string | null;
    }[]) ?? []) {
        if (String(raw.person_id ?? "").trim() !== personId) continue;
        const role = String(raw.role_type ?? "").trim().toLowerCase();
        const isPrimary =
            raw.is_household_primary_contact === true
            || raw.is_primary === true
            || role === "primary_contact"
            || role === "primary";
        return {
            isPrimary,
            display: formatLayoutRuntimePrimaryContactDisplay(isPrimary),
        };
    }

    const anchorPersonId = String(vmRecord.id ?? vmRecord["person.id"] ?? "").trim();
    if (
        vmRecord._primary_contact_on_opportunity === true
        && anchorPersonId
        && personId === anchorPersonId
    ) {
        return { isPrimary: true, display: LAYOUT_RUNTIME_PRIMARY_CONTACT_LABEL };
    }

    return { isPrimary: false, display: LAYOUT_RUNTIME_NOT_PRIMARY_CONTACT_LABEL };
}

/** Fill person.is_primary_contact when relationship context exists on the VM record. */
export function enrichPersonDrawerPrimaryContactFields(
    record: ProofRuntimeRecord,
    vmRecord: Record<string, unknown>,
    personId: string,
): ProofRuntimeRecord {
    const projection = resolvePersonDrawerPrimaryContactProjection(vmRecord, personId);
    return {
        ...record,
        "person.is_primary_contact": projection.display,
        "person.is_primary": projection.isPrimary ? "Primary" : "",
    };
}
