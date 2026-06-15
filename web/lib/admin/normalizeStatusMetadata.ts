import {
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    PERSON_STATUS_PROFILE_GENERIC,
} from "@/lib/admin/person/personStatusApplicability";
import {
    LEGACY_ENROLLMENT_OPERATOR_STAGE_METADATA_KEY,
    PROCESS_STAGE_METADATA_KEY,
    PROCESS_STAGE_UNASSIGNED,
} from "@/lib/businessProcesses/processStageMetadata";

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

    if (PROCESS_STAGE_METADATA_KEY in src) {
        const raw = src[PROCESS_STAGE_METADATA_KEY];
        if (raw == null || raw === "") {
            delete out[PROCESS_STAGE_METADATA_KEY];
        } else {
            const t = String(raw).trim();
            if (t === PROCESS_STAGE_UNASSIGNED) {
                delete out[PROCESS_STAGE_METADATA_KEY];
            } else if (t) {
                out[PROCESS_STAGE_METADATA_KEY] = t;
            } else {
                delete out[PROCESS_STAGE_METADATA_KEY];
            }
        }
    }

    if (out[PROCESS_STAGE_METADATA_KEY]) {
        delete out[LEGACY_ENROLLMENT_OPERATOR_STAGE_METADATA_KEY];
    }

    return out;
}
