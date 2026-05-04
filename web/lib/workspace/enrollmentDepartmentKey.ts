/** Access-validation seed department key (must match `seedAccessValidationDemo.ts`). */
export const ACCESS_VALIDATION_ENROLLMENT_DEPT_KEY = "access_val_dept_enrollment";

/** Canonical childcare/bootstrap enrollment pillar OR access-validation enrollment demo dept. */
export function isEnrollmentLikeDepartmentKey(key: string | null | undefined): boolean {
    const k = (key ?? "").trim().toLowerCase();
    return k === "enrollment" || k === ACCESS_VALIDATION_ENROLLMENT_DEPT_KEY;
}
