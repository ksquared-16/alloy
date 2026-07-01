/** Legacy access-validation seed department key (pre–real-dept reuse). Still recognized until rows are cleaned. */
export const ACCESS_VALIDATION_ENROLLMENT_DEPT_KEY = "access_val_dept_enrollment";

/** Canonical enrollment pillar (`enrollment`) or legacy access-validation enrollment dept key. */
export function isEnrollmentLikeDepartmentKey(key: string | null | undefined): boolean {
    const k = (key ?? "").trim().toLowerCase();
    return k === "enrollment" || k === ACCESS_VALIDATION_ENROLLMENT_DEPT_KEY;
}
