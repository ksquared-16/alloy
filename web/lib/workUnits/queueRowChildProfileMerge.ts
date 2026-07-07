/**
 * Merge child profile fields (DOB, age, gender) from household enrichment into queue row context.
 *
 * QueueService attaches `_household_children` with person DOB while `_inquiry_children` and
 * `_crm_compact_children` often lack profile columns. Collection rendering reads frozen context only.
 */

import { inquiryChildProfileFieldsFromRaw } from "@/lib/admin/drawer/inquiryChildrenHydration";

export type InquiryChildProfileFields = ReturnType<typeof inquiryChildProfileFieldsFromRaw>;

function trimOrNull(raw: unknown): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t || null;
}

/** Lookup household child rows by customer_member_id, id, or person_id. */
export function buildHouseholdChildrenLookup(row: Record<string, unknown>): Map<string, Record<string, unknown>> {
    const map = new Map<string, Record<string, unknown>>();
    const household = row._household_children;
    if (!Array.isArray(household)) return map;

    for (const entry of household) {
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) continue;
        const raw = entry as Record<string, unknown>;
        for (const id of [
            trimOrNull(raw.customer_member_id),
            trimOrNull(raw.id),
            trimOrNull(raw.person_id),
        ]) {
            if (id && !map.has(id)) map.set(id, raw);
        }
    }
    return map;
}

function lookupIdsFromRaw(raw: Record<string, unknown>): string[] {
    return [
        trimOrNull(raw.ocm_id),
        trimOrNull(raw.id),
        trimOrNull(raw.customer_member_id),
        trimOrNull(raw.person_id),
    ].filter((id): id is string => Boolean(id));
}

function mergeProfileFields(
    direct: InquiryChildProfileFields,
    fallback: InquiryChildProfileFields,
): InquiryChildProfileFields {
    return {
        date_of_birth: direct.date_of_birth ?? fallback.date_of_birth,
        age_label: direct.age_label ?? fallback.age_label,
        gender_label: direct.gender_label ?? fallback.gender_label,
    };
}

/** Resolve profile fields from inquiry/OCM raw, falling back to matching `_household_children` row. */
export function mergeInquiryChildProfileFromHousehold(
    raw: Record<string, unknown>,
    householdLookup: Map<string, Record<string, unknown>>,
): InquiryChildProfileFields {
    const direct = inquiryChildProfileFieldsFromRaw(raw);
    if (direct.date_of_birth && direct.age_label && direct.gender_label) return direct;

    for (const id of lookupIdsFromRaw(raw)) {
        const householdRaw = householdLookup.get(id);
        if (!householdRaw) continue;
        return mergeProfileFields(direct, inquiryChildProfileFieldsFromRaw(householdRaw));
    }
    return direct;
}

/** CRM compact lines may embed age in primary text — split when profile fields are absent. */
export function splitCrmCompactPrimaryDisplay(primary: string): { displayName: string; ageLabel: string | null } {
    const trimmed = primary.trim();
    const match = trimmed.match(/^(.+?)\s+\(([^)]+)\)\s*$/);
    if (!match) return { displayName: trimmed, ageLabel: null };
    return { displayName: match[1]!.trim(), ageLabel: match[2]!.trim() || null };
}

export function mergeCrmCompactLineProfile(
    line: { ocmId?: string | null; customerMemberId?: string | null; personId?: string | null; primary: string },
    householdLookup: Map<string, Record<string, unknown>>,
): InquiryChildProfileFields & { displayName: string } {
    const { displayName: parsedName, ageLabel: parsedAge } = splitCrmCompactPrimaryDisplay(line.primary);
    let profile: InquiryChildProfileFields = {
        date_of_birth: null,
        age_label: parsedAge,
        gender_label: null,
    };

    for (const id of [line.ocmId, line.customerMemberId, line.personId]) {
        const key = id?.trim();
        if (!key) continue;
        const householdRaw = householdLookup.get(key);
        if (!householdRaw) continue;
        profile = mergeProfileFields(profile, inquiryChildProfileFieldsFromRaw(householdRaw));
        break;
    }

    return { ...profile, displayName: parsedName };
}
