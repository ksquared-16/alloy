import { buildPersonEnrollmentActivityEntries } from "@/components/admin/entity/PersonDrawerEnrollmentActivity";
import {
    personDrawerChildAgeLabel,
    personDrawerChildDisplayName,
    personDrawerChildGenderLabel,
    personDrawerCrmDisplayLabel,
    resolvePersonDrawerPrimaryGuardian,
} from "@/lib/admin/person/personDrawerChildIdentity";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

export type PersonDrawerChildSummaryModel = {
    display_name: string;
    initials: string;
    photo_url: string | null;
    dob_label: string | null;
    age_label: string | null;
    gender_label: string | null;
    program_label: string | null;
    location_label: string | null;
    status_label: string | null;
    primary_opportunity_id: string | null;
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

/** Primary above-the-fold child identity + enrollment mirror context. */
export function resolvePersonDrawerChildSummaryModel(record: Record<string, unknown>): PersonDrawerChildSummaryModel {
    const display_name = personDrawerChildDisplayName(record) ?? "Child";
    const mirror = (record._enrollment_mirror as PersonEnrollmentMirrorRow[]) ?? [];
    const opps = (record._enrollment_opportunities as PersonEnrollmentOpportunityRow[]) ?? [];
    const entry = buildPersonEnrollmentActivityEntries(mirror, opps)[0] ?? null;

    return {
        display_name,
        initials: initialsFromDisplayName(display_name),
        photo_url: personDrawerPhotoUrl(record),
        dob_label: personDrawerDobLabel(record),
        age_label: personDrawerChildAgeLabel(record),
        gender_label: personDrawerChildGenderLabel(record),
        program_label: entry?.program_label?.trim() || entry?.room_label?.trim() || null,
        location_label: entry?.location_label?.trim() || null,
        status_label: personDrawerCrmDisplayLabel(entry?.status_label ?? entry?.outcome_label),
        primary_opportunity_id: entry?.opportunity_id ?? null,
        primary_guardian: resolvePersonDrawerPrimaryGuardian(record),
    };
}
