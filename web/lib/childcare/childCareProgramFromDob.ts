/**
 * Maps approximate child age (months) to childcare CRM program labels used in seeds and queue previews.
 * Keep labels aligned with `PROG_LABELS` in `seedRealisticChildcareDemoData.ts`.
 */

export function ageGroupForProgramLabel(programLabel: string): string {
    const m: Record<string, string> = {
        "Toddler (2–3)": "Ages 24–36 mo",
        "Preschool (3–4)": "Ages 36–48 mo",
        "Pre-K (4–5)": "Ages 48–60 mo",
        "Infant (6–12 mo)": "Ages 6–12 mo",
        "Young Toddler (12–24 mo)": "Ages 12–24 mo",
    };
    return m[programLabel] ?? "Ages 3–5 yr";
}

/** Whole months of age from a calendar date-of-birth (YYYY-MM-DD) to `now` (same approach as queue age labels). */
export function approximateAgeMonthsFromDobIso(dobIso: string, now: Date = new Date()): number | null {
    const s = String(dobIso ?? "").trim();
    const ms = Date.parse(s);
    if (!Number.isFinite(ms)) return null;
    const dob = new Date(ms);
    if (Number.isNaN(dob.getTime()) || dob > now) return null;
    let years = now.getFullYear() - dob.getFullYear();
    let months = now.getMonth() - dob.getMonth();
    if (now.getDate() < dob.getDate()) months -= 1;
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    if (years < 0) return null;
    return years * 12 + months;
}

/**
 * Tiered program label for queue/seed display. Buckets match typical center groupings.
 * `ageMonths` is approximate whole months.
 */
export function programLabelAndAgeGroupFromAgeMonths(ageMonths: number): { program_label: string; age_group: string } {
    let program_label: string;
    if (ageMonths < 12) {
        program_label = "Infant (6–12 mo)";
    } else if (ageMonths < 24) {
        program_label = "Young Toddler (12–24 mo)";
    } else if (ageMonths < 36) {
        program_label = "Toddler (2–3)";
    } else if (ageMonths < 48) {
        program_label = "Preschool (3–4)";
    } else if (ageMonths < 60) {
        program_label = "Pre-K (4–5)";
    } else {
        program_label = "Pre-K (4–5)";
    }
    return { program_label, age_group: ageGroupForProgramLabel(program_label) };
}
