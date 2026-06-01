/**
 * Display-only form ↔ requirement coverage for Enrollment Process hub (MVP).
 * Forms are capture mechanisms; lifecycle defines what must exist.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

export type EnrollmentFormCoverageRow = {
    formName: string;
    href: string;
    captures: readonly string[];
    satisfies: readonly string[];
    missing: readonly string[];
};

const STAGE_FORM_HINTS: Record<
    LifecycleOperatorStage,
    readonly { formName: string; captures: readonly string[]; satisfies: readonly string[] }[]
> = {
    lead: [
        {
            formName: "Enrollment lead intake",
            captures: ["First name", "Last name", "Email or phone"],
            satisfies: ["Person", "Primary contact"],
        },
    ],
    qualification: [
        {
            formName: "Family profile update",
            captures: ["Child", "Program", "Desired start"],
            satisfies: ["Child", "Program"],
        },
    ],
    tour: [
        {
            formName: "Tour scheduling",
            captures: ["Tour date", "Tour time"],
            satisfies: ["Tour scheduled"],
        },
    ],
    waitlist: [
        {
            formName: "Waitlist confirmation",
            captures: ["Waitlist position", "Desired start"],
            satisfies: ["Waitlist"],
        },
    ],
    enrollment: [
        {
            formName: "Enrollment packet",
            captures: ["Documents", "Start date", "Classroom"],
            satisfies: ["Enrollment packet", "Start date"],
        },
    ],
    enrolled: [],
};

export function enrollmentFormCoverageForStage(
    stage: LifecycleOperatorStage,
    requiredLabels: readonly string[]
): EnrollmentFormCoverageRow[] {
    const requiredSet = new Set(requiredLabels);
    return STAGE_FORM_HINTS[stage].map((hint) => {
        const satisfies = hint.satisfies.filter((s) => requiredSet.has(s));
        const missing = [...requiredSet].filter((r) => !hint.satisfies.includes(r));
        return {
            formName: hint.formName,
            href: "/adminV2/forms",
            captures: hint.captures,
            satisfies,
            missing,
        };
    });
}
