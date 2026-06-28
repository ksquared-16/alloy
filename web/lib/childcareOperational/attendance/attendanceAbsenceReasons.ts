/**
 * Absence reason controlled vocabulary (P2.1).
 *
 * First-class, classifiable reasons attached to absence facts via the existing
 * `reason_key` column on child_attendance_events. The excused/unexcused
 * classification is OPERATIONAL metadata only — it deliberately carries NO
 * billing or subsidy semantics yet (those resolve downstream in L5 / processing,
 * which may map these keys to their own policies). This stays a code-owned
 * controlled vocabulary now; it can be promoted to a tenant-configurable table
 * later without changing the stored shape.
 */

export type AbsenceReasonClassification = "excused" | "unexcused" | "unspecified";

export type AbsenceReasonDef = {
    key: string;
    label: string;
    classification: AbsenceReasonClassification;
};

export const ABSENCE_REASONS: readonly AbsenceReasonDef[] = [
    { key: "illness", label: "Illness", classification: "excused" },
    { key: "medical_appointment", label: "Medical appointment", classification: "excused" },
    { key: "family_emergency", label: "Family emergency", classification: "excused" },
    { key: "planned_absence", label: "Planned absence", classification: "excused" },
    { key: "holiday_closure", label: "Holiday / closure", classification: "excused" },
    { key: "weather_closure", label: "Weather closure", classification: "excused" },
    { key: "vacation", label: "Vacation", classification: "unexcused" },
    { key: "no_show", label: "No show", classification: "unexcused" },
    { key: "unexplained", label: "Unexplained", classification: "unexcused" },
    { key: "other", label: "Other", classification: "unspecified" },
] as const;

const BY_KEY: ReadonlyMap<string, AbsenceReasonDef> = new Map(
    ABSENCE_REASONS.map((r) => [r.key, r])
);

export function isAbsenceReasonKey(key: string): boolean {
    return BY_KEY.has(key);
}

export function absenceReasonDef(key: string): AbsenceReasonDef | null {
    return BY_KEY.get(key) ?? null;
}

/** Classification for a reason key; 'unspecified' when key is absent/unknown. */
export function classifyAbsenceReason(key: string | null | undefined): AbsenceReasonClassification {
    if (!key) return "unspecified";
    return BY_KEY.get(key)?.classification ?? "unspecified";
}

/** True only when the reason maps to an excused classification. No billing meaning. */
export function isExcusedAbsence(key: string | null | undefined): boolean {
    return classifyAbsenceReason(key) === "excused";
}
