import type { NormalizedValidationError } from "@/lib/forms/validateSubmission";

/** Single-line messages for lightweight embed / API UX. */
export function formatPublicValidationErrors(errors: NormalizedValidationError[]): string[] {
    return errors.map((e) => {
        const loc = e.path.length ? e.path.join(" › ") : "Form";
        return `${loc}: ${e.message}`;
    });
}
