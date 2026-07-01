/**
 * Fingerprints for Forms / Enrollment QA gate scripts.
 * Used by cleanup script and QA runners — do not match real family records.
 */

export const FORMS_QA_GUARDIAN_NAMES = [
    "Jordan Enrollment Lead",
    "Jordan Lifecycle Coherence",
    "Jordan IC55",
] as const;

export const FORMS_QA_EMAIL_PREFIXES = ["ic56-lead-proof-", "lifecycle-coherence-"] as const;

export const FORMS_QA_NOTES_SNIPPETS = [
    "IC-5.6 enrollment lead proof",
    "Enrollment lifecycle coherence gate",
] as const;

function readPayloadValues(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    const root = payload as Record<string, unknown>;
    const values = root.values;
    if (values && typeof values === "object" && !Array.isArray(values)) {
        return values as Record<string, unknown>;
    }
    return root;
}

function readStringField(obj: Record<string, unknown>, key: string): string | null {
    const v = obj[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** True when email matches QA script patterns (@example.com + known prefix). */
export function isFormsQaArtifactEmail(email: string | null | undefined): boolean {
    if (!email?.trim()) return false;
    const normalized = email.trim().toLowerCase();
    if (!normalized.endsWith("@example.com")) return false;
    const local = normalized.slice(0, -"@example.com".length);
    return FORMS_QA_EMAIL_PREFIXES.some((prefix) => local.startsWith(prefix));
}

/** True when guardian display name matches a known QA script constant. */
export function isFormsQaGuardianName(name: string | null | undefined): boolean {
    if (!name?.trim()) return false;
    const trimmed = name.trim();
    return FORMS_QA_GUARDIAN_NAMES.some((n) => n === trimmed);
}

/** Match form_submission.payload against QA script fingerprints. */
export function submissionPayloadMatchesFormsQaFingerprint(payload: unknown): boolean {
    const values = readPayloadValues(payload);
    const guardianName =
        readStringField(values, "guardian_full_name") ??
        readStringField(values, "guardian_name") ??
        readStringField(values, "full_name");
    const email =
        readStringField(values, "guardian_email") ??
        readStringField(values, "email");
    const notes = readStringField(values, "notes");

    if (isFormsQaGuardianName(guardianName)) return true;
    if (isFormsQaArtifactEmail(email)) return true;
    if (notes && FORMS_QA_NOTES_SNIPPETS.some((s) => notes.includes(s))) return true;
    return false;
}

/** Opportunity title/name patterns from QA intake (guardian-only enrollment lead). */
export function opportunityNameMatchesFormsQaFingerprint(name: string | null | undefined): boolean {
    if (!name?.trim()) return false;
    const trimmed = name.trim();
    if (isFormsQaGuardianName(trimmed)) return true;
    if (trimmed.startsWith("Jordan ") && trimmed.includes("Enrollment")) return true;
    return false;
}
