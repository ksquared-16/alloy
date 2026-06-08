import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { personDrawerRelationshipInputFromRecord } from "@/lib/admin/person/personDrawerRelationshipInput";
import type { PersonHouseholdAdultLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";
import { resolveChildAgeDisplayLabel } from "@/lib/admin/drawer/childAgeDisplay";
import { personDrawerGenderDisplayLabel } from "@/lib/admin/person/personDrawerGenderField";

/** Person-drawer-only CRM display labels — does not mutate stored status keys. */
export function personDrawerCrmDisplayLabel(label: string | null | undefined): string | null {
    const raw = String(label ?? "").trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower === "inquiry") return "Lead";
    if (lower === "family inquiry") return "Family Lead";
    if (lower.includes("inquiry")) {
        return raw.replace(/\binquiry\b/gi, (match) =>
            match[0] === match[0]?.toUpperCase() ? "Lead" : "lead"
        );
    }
    return raw;
}

export function personDrawerChildDisplayName(record: Record<string, unknown>): string | null {
    const full = String(record.full_name ?? "").trim();
    if (full) return full;
    const parts = [record.first_name, record.last_name]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : null;
}

export function personDrawerChildAgeLabel(record: Record<string, unknown>): string | null {
    const personId = String(record.id ?? record.person_id ?? "").trim() || null;
    const dobRaw = record.date_of_birth ?? record.dob;
    const dobIso = dobRaw != null && String(dobRaw).trim() !== "" ? String(dobRaw).slice(0, 10) : null;
    return resolveChildAgeDisplayLabel({
        person_id: personId,
        person_date_of_birth: dobIso,
    });
}

export function personDrawerChildGenderLabel(record: Record<string, unknown>): string | null {
    const fromField = personDrawerGenderDisplayLabel(record);
    if (fromField) return fromField;
    for (const key of ["gender", "gender_key", "sex"]) {
        const value = record[key];
        if (value != null && String(value).trim() !== "") {
            return String(value).trim();
        }
    }
    return null;
}

export type PersonDrawerPrimaryGuardian = {
    person_id: string | null;
    display_name: string;
    role_label: string | null;
};

export function resolvePersonDrawerPrimaryGuardian(record: Record<string, unknown>): PersonDrawerPrimaryGuardian | null {
    const householdLinks = (record._household_adult_links as PersonHouseholdAdultLinkRow[] | undefined) ?? [];
    const groups = buildPersonDrawerRelationshipGroups(personDrawerRelationshipInputFromRecord(record));
    const adults = [...groups.parents, ...groups.guardians];

    const primaryHousehold =
        householdLinks.find((link) => link.is_primary) ??
        householdLinks.find((link) => {
            const role = String(link.role_type ?? "").toLowerCase();
            return role === "parent" || role === "primary" || role === "primary_contact";
        }) ??
        householdLinks[0];

    if (primaryHousehold) {
        const matched = adults.find((row) => row.person_id === primaryHousehold.person_id);
        const name =
            matched?.display_name?.trim() ||
            primaryHousehold.display_name?.trim() ||
            null;
        if (!name) return null;
        return {
            person_id: primaryHousehold.person_id ?? matched?.person_id ?? null,
            display_name: name,
            role_label:
                primaryHousehold.role_label?.trim() ||
                matched?.relationship_label?.trim() ||
                "Guardian",
        };
    }

    const first = adults[0];
    if (!first?.display_name?.trim() && !first?.person_id) return null;
    return {
        person_id: first.person_id ?? null,
        display_name: first.display_name?.trim() || "Unnamed",
        role_label: first.relationship_label?.trim() || "Guardian",
    };
}

export type PersonDrawerChildIdentitySummary = {
    display_name: string | null;
    age_label: string | null;
    gender_label: string | null;
    household_label: string | null;
    primary_guardian: PersonDrawerPrimaryGuardian | null;
};

export function resolvePersonDrawerChildIdentitySummary(
    record: Record<string, unknown>,
    householdLabel: string | null
): PersonDrawerChildIdentitySummary {
    return {
        display_name: personDrawerChildDisplayName(record),
        age_label: personDrawerChildAgeLabel(record),
        gender_label: personDrawerChildGenderLabel(record),
        household_label: householdLabel,
        primary_guardian: resolvePersonDrawerPrimaryGuardian(record),
    };
}

/** Enrollment section title for child lifecycle emphasis (CRM-aligned). */
export const PERSON_DRAWER_CHILD_ENROLLMENT_SECTION_TITLE = "Enrollment";
