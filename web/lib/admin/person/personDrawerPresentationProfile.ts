import type { EntityDrawerFieldConfig, EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";

function isChildProfile(profile: PersonDrawerProfileResult): boolean {
    return profile.profiles.includes("child");
}

function isParentLikeProfile(profile: PersonDrawerProfileResult): boolean {
    return (
        profile.profiles.includes("parent") ||
        profile.profiles.includes("guardian") ||
        profile.display === "parent" ||
        profile.display === "guardian"
    );
}

function isEmergencyContactProfile(profile: PersonDrawerProfileResult): boolean {
    return profile.profiles.includes("emergency_contact") && !isChildProfile(profile) && !isParentLikeProfile(profile);
}

/** Canonical drawer sections + field_definition section keys. */
const HIDDEN_SECTION_KEYS_CHILD = new Set([
    "contact_info",
    "contact",
    "employee_placement",
    "record_info",
    "identity",
    "guardian_profile",
    "emergency",
]);
const HIDDEN_SECTION_KEYS_PARENT = new Set([
    "record_info",
    "identity",
    "medical",
    "emergency",
    "child_profile",
    "contact_info",
    "contact",
]);
const HIDDEN_SECTION_KEYS_EMERGENCY = new Set([
    "record_info",
    "identity",
    "medical",
    "emergency",
    "child_profile",
    "guardian_profile",
    "employee_placement",
    "enrollment",
    "enrollment_opportunities",
]);

const HIDDEN_FIELD_KEYS_ALL = new Set(["full_name", "person_number", "id", "org_id", "status"]);

const HIDDEN_FIELD_KEYS_CHILD = new Set([
    ...HIDDEN_FIELD_KEYS_ALL,
    "email",
    "phone",
    "date_of_birth",
    "dob",
    "status_key",
]);

const HIDDEN_FIELD_KEYS_PARENT = new Set([
    ...HIDDEN_FIELD_KEYS_ALL,
    "date_of_birth",
    "dob",
    "status_key",
    "email",
    "phone",
]);

const HIDDEN_FIELD_KEYS_EMERGENCY = new Set([...HIDDEN_FIELD_KEYS_ALL, "date_of_birth", "dob", "status_key"]);

const PARENT_CONSENT_FIELD_KEYS = new Set([
    "sms_consent",
    "email_consent",
    "sms_opt_out",
    "email_opt_out",
    "marketing_opt_out",
    "messaging_opt_out",
]);

const CHILD_CONSENT_FIELD_KEYS = new Set([
    "photo_sharing_consent",
    "photo_consent",
    "media_consent",
    "photo_release_consent",
]);

function isConsentSection(sectionKey: string): boolean {
    return sectionKey === "consent" || sectionKey.includes("consent");
}

function shouldShowConsentField(
    fieldKey: string,
    fieldType: string | undefined,
    profile: PersonDrawerProfileResult
): boolean {
    const child = isChildProfile(profile);
    const parentLike = isParentLikeProfile(profile) && !child;
    if (fieldType === "boolean") return true;
    if (parentLike && PARENT_CONSENT_FIELD_KEYS.has(fieldKey)) return true;
    if (child && CHILD_CONSENT_FIELD_KEYS.has(fieldKey)) return true;
    if (/consent|opt_out|opt-out/i.test(fieldKey) && fieldType === "boolean") return true;
    return false;
}

function applyConsentFieldPresentation(
    field: EntityDrawerFieldConfig,
    sectionKey: string,
    profile: PersonDrawerProfileResult,
    fieldType?: string
): EntityDrawerFieldConfig | null {
    const key = field.key;
    if (isConsentSection(sectionKey) || /consent|opt_out|opt-out/i.test(key)) {
        if (!shouldShowConsentField(key, fieldType, profile)) return null;
    } else {
        return field;
    }
    return {
        ...field,
        renderHint: field.renderHint === "primary_yes_no" ? field.renderHint : "primary_yes_no",
        label:
            isChildProfile(profile) && CHILD_CONSENT_FIELD_KEYS.has(key)
                ? field.label ?? "Photo sharing consent"
                : field.label,
    };
}

export function applyPersonDrawerPresentationProfile(
    sections: EntityDrawerSectionConfig[],
    profile: PersonDrawerProfileResult,
    fieldTypesByKey?: Record<string, string>
): EntityDrawerSectionConfig[] {
    const child = isChildProfile(profile);
    const parentLike = isParentLikeProfile(profile) && !child;
    const emergency = isEmergencyContactProfile(profile);

    return sections
        .filter((section) => {
            if (child && HIDDEN_SECTION_KEYS_CHILD.has(section.key)) return false;
            if (parentLike && HIDDEN_SECTION_KEYS_PARENT.has(section.key)) return false;
            if (emergency && HIDDEN_SECTION_KEYS_EMERGENCY.has(section.key)) return false;
            if (
                (child || parentLike) &&
                section.key === "consent" &&
                !section.fields?.some((f) => shouldShowConsentField(f.key, fieldTypesByKey?.[f.key], profile))
            ) {
                return false;
            }
            if (emergency && section.key === "medical") {
                const hasConfiguredMedical = section.fields?.some((f) => {
                    const v = fieldTypesByKey?.[f.key];
                    return v != null && String(v).trim() !== "";
                });
                if (!hasConfiguredMedical) return false;
            }
            return true;
        })
        .map((section) => {
            const hiddenFields = child
                ? HIDDEN_FIELD_KEYS_CHILD
                : parentLike
                  ? HIDDEN_FIELD_KEYS_PARENT
                  : emergency
                    ? HIDDEN_FIELD_KEYS_EMERGENCY
                    : HIDDEN_FIELD_KEYS_ALL;
            const fields = (section.fields ?? [])
                .filter((f) => !hiddenFields.has(f.key))
                .map((f) => applyConsentFieldPresentation(f, section.key, profile, fieldTypesByKey?.[f.key]))
                .filter((f): f is EntityDrawerFieldConfig => f != null);
            return { ...section, fields };
        })
        .filter((section) => {
            if (section.key === "basic_info" && (section.fields?.length ?? 0) === 0) return false;
            if (isConsentSection(section.key) && (section.fields?.length ?? 0) === 0) return false;
            return true;
        });
}

export function personDrawerAboveFoldShowsContact(profile: PersonDrawerProfileResult): boolean {
    return isParentLikeProfile(profile) && !isChildProfile(profile);
}

export function personDrawerAboveFoldShowsDob(profile: PersonDrawerProfileResult): boolean {
    return isChildProfile(profile);
}

export function personDrawerAboveFoldShowsRelationships(profile: PersonDrawerProfileResult): boolean {
    return isChildProfile(profile) || isParentLikeProfile(profile) || isEmergencyContactProfile(profile);
}

export function personDrawerRelationshipPresentation(profile: PersonDrawerProfileResult): {
    hideEmergency: boolean;
    hideSiblings: boolean;
    siblingsGroupTitle: string;
} {
    const parentLike = isParentLikeProfile(profile) && !isChildProfile(profile);
    return {
        hideEmergency: parentLike,
        hideSiblings: parentLike,
        siblingsGroupTitle: parentLike ? "Children" : "Siblings",
    };
}

export function personDrawerShouldShowEmployeePlacement(profile: PersonDrawerProfileResult): boolean {
    return profile.profiles.includes("employee");
}
