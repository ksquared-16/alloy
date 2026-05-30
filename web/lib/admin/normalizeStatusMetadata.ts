import {
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    PERSON_STATUS_PROFILE_GENERIC,
} from "@/lib/admin/person/personStatusApplicability";

/** Coerce status_definitions.metadata for DB writes — never null. */
export function normalizeStatusDefinitionMetadata(raw: unknown): Record<string, unknown> {
    if (raw == null) return {};
    if (typeof raw !== "object" || Array.isArray(raw)) return {};

    const src = raw as Record<string, unknown>;
    const out: Record<string, unknown> = { ...src };

    const normalizeStringList = (value: unknown): string[] | undefined => {
        if (!Array.isArray(value)) return undefined;
        const items = value
            .map((v) => String(v ?? "").trim())
            .filter(Boolean);
        return items.length > 0 ? items : undefined;
    };

    const profiles = normalizeStringList(src.applies_to_profiles);
    if (profiles) {
        out.applies_to_profiles = profiles.filter(
            (p) => p === PERSON_STATUS_PROFILE_CHILD_LIFECYCLE || p === PERSON_STATUS_PROFILE_GENERIC
        );
    }

    const roles = normalizeStringList(src.applies_to_roles);
    if (roles) out.applies_to_roles = roles;

    return out;
}
