/**
 * Maps approximate child age (months) to childcare CRM program labels used in seeds and queue previews.
 * Keep labels aligned with `PROG_LABELS` in `seedRealisticChildcareDemoData.ts`.
 *
 * Display convention: `Program — age span` (em dash, no parentheses). Optional `age_group` is left empty
 * so queue secondaries do not duplicate ranges; legacy rows may still carry an `age_group` string in metadata.
 */

/** @deprecated Legacy keys — still recognized so stale metadata / seeds remain readable until backfilled. */
const LEGACY_PROGRAM_TO_AGE_GROUP: Record<string, string> = {
    "Toddler (2–3)": "Ages 24–36 mo",
    "Preschool (3–4)": "Ages 36–48 mo",
    "Pre-K (4–5)": "Ages 48–60 mo",
    "Infant (6–12 mo)": "Ages 6–12 mo",
    "Young Toddler (12–24 mo)": "Ages 12–24 mo",
};

export function ageGroupForProgramLabel(programLabel: string): string {
    const k = programLabel.trim();
    if (LEGACY_PROGRAM_TO_AGE_GROUP[k]) return LEGACY_PROGRAM_TO_AGE_GROUP[k]!;
    if (k.includes("—")) return "";
    return "";
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
    if (ageMonths < 18) {
        program_label = "Infant — 0–18 months";
    } else if (ageMonths < 24) {
        program_label = "Young Toddler — 18–24 months";
    } else if (ageMonths < 36) {
        program_label = "Toddler — 2–3 years";
    } else if (ageMonths < 48) {
        program_label = "Preschool — 3–4 years";
    } else if (ageMonths < 60) {
        program_label = "Pre-K — 4–5 years";
    } else {
        program_label = "School Age — 5+ years";
    }
    return { program_label, age_group: "" };
}

/**
 * Compact queue group headers: show program name only (drop trailing " — age span").
 * Storage / cohort labels may still carry the full form.
 */
export function programLabelWithoutAgeRange(label: string | null | undefined): string | null {
    const raw = typeof label === "string" ? label.trim() : "";
    if (!raw) return null;
    const stripped = raw.replace(/\s+[—–-]\s+.+$/u, "").trim();
    return stripped || raw;
}
