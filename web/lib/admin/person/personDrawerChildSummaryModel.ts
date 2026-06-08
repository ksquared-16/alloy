import {
    personDrawerChildAgeLabel,
    personDrawerChildDisplayName,
    personDrawerChildGenderLabel,
    resolvePersonDrawerPrimaryGuardian,
} from "@/lib/admin/person/personDrawerChildIdentity";
import { resolvePersonDrawerChildPlacementFromRecord } from "@/lib/admin/person/personDrawerChildPlacementContext";

export type PersonDrawerChildSummaryModel = {
    display_name: string;
    initials: string;
    photo_url: string | null;
    dob_label: string | null;
    age_label: string | null;
    gender_label: string | null;
    program_label: string | null;
    location_label: string | null;
    room_label: string | null;
    status_label: string | null;
    primary_opportunity_id: string | null;
    primary_ocm_id: string | null;
    primary_guardian: ReturnType<typeof resolvePersonDrawerPrimaryGuardian>;
};

function personDrawerPhotoUrl(record: Record<string, unknown>): string | null {
    for (const key of ["photo_url", "avatar_url", "profile_photo_url", "profile_image_url"]) {
        const value = record[key];
        if (value != null && String(value).trim() !== "") {
            return String(value).trim();
        }
    }
    return null;
}

function initialsFromDisplayName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

function personDrawerDobLabel(record: Record<string, unknown>): string | null {
    const dobRaw = record.date_of_birth ?? record.dob;
    if (dobRaw == null || String(dobRaw).trim() === "") return null;
    const iso = String(dobRaw).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(dobRaw).trim();
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y!, m! - 1, d);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Primary above-the-fold child identity + enrollment mirror context.
 * Program/location come from `_enrollment_mirror` (OCM / opportunity) — never from `persons` location fields.
 */
export function resolvePersonDrawerChildSummaryModel(record: Record<string, unknown>): PersonDrawerChildSummaryModel {
    const display_name = personDrawerChildDisplayName(record) ?? "Child";
    const placement = resolvePersonDrawerChildPlacementFromRecord(record);

    return {
        display_name,
        initials: initialsFromDisplayName(display_name),
        photo_url: personDrawerPhotoUrl(record),
        dob_label: personDrawerDobLabel(record),
        age_label: personDrawerChildAgeLabel(record),
        gender_label: personDrawerChildGenderLabel(record),
        program_label: placement.program_label,
        location_label: placement.location_label,
        room_label: placement.room_label,
        status_label: placement.status_label,
        primary_opportunity_id: placement.primary_opportunity_id,
        primary_ocm_id: placement.primary_ocm_id,
        primary_guardian: resolvePersonDrawerPrimaryGuardian(record),
    };
}
