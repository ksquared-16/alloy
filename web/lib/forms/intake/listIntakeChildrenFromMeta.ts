import type { FormIntakeChildHint, FormIntakeMeta } from "@/lib/forms/intake/formLeadCaptureTypes";

export function intakeChildHasIdentity(child: FormIntakeChildHint | null | undefined): boolean {
    if (!child || typeof child !== "object") return false;
    if (typeof child.display_name === "string" && child.display_name.trim()) return true;
    if (typeof child.first_name === "string" && child.first_name.trim()) return true;
    if (typeof child.last_name === "string" && child.last_name.trim()) return true;
    return false;
}

/** Explicit `children[]` wins; otherwise single `child` (never duplicates). */
export function listIntakeChildrenFromMeta(intake: FormIntakeMeta): FormIntakeChildHint[] {
    const explicit = Array.isArray(intake.children) ? intake.children.filter(intakeChildHasIdentity) : [];
    if (explicit.length > 0) return explicit;
    if (intakeChildHasIdentity(intake.child ?? null)) return [intake.child!];
    return [];
}
