/**
 * Project household primary-contact role onto person drawer scalar fields.
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

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
            display: isPrimary ? "Primary contact" : "Not primary",
        };
    }

    if (vmRecord._primary_contact_on_opportunity === true) {
        return { isPrimary: true, display: "Primary contact" };
    }

    return { isPrimary: false, display: "Not primary" };
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
