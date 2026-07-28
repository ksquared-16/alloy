/**
 * Map internal assignment errors to operator-facing copy.
 * Never surface payload field names (e.g. enrollmentAgreementId).
 */

export function operatorFacingAssignmentError(raw: string | null | undefined): string {
    const msg = (raw ?? "").trim();
    if (!msg) return "Something went wrong. Try again.";

    const lower = msg.toLowerCase();
    if (lower.includes("enrollmentagreementid") || lower.includes("enrollment_agreement_id")) {
        return "This child is not enrolled yet. Save as a Proposed Assignment, or complete enrollment first.";
    }
    if (lower.includes("assignment_type_id") || lower.includes("assignment type is required")) {
        return "Choose an Assignment Category before saving.";
    }
    if (lower.includes("schedule_pattern_id") || lower.includes("pattern")) {
        if (lower.includes("required")) return "Choose a schedule pattern (days and hours) before saving.";
    }
    if (lower.includes("room") && lower.includes("required")) {
        return "This Assignment Category requires an operational space. Select a room before saving.";
    }
    if (lower.includes("program") && lower.includes("required")) {
        return "This Assignment Category requires a program. Select a program before saving.";
    }
    if (lower.includes("terminal enrollment")) {
        return "This enrollment has ended. Choose an active enrollment or create a Proposed Assignment.";
    }
    if (lower.includes("primary assignment") && lower.includes("supersede")) {
        return "This child already has a primary Assignment. Make another primary first, or use Make Primary.";
    }
    // Strip obvious field-name leakage
    if (/^[a-zA-Z0-9_]+ is required$/.test(msg)) {
        return "Some required information is missing. Check Category, days, and dates, then try again.";
    }
    return msg.replace(/enrollmentAgreementId/gi, "enrollment").replace(/assignment_type_id/gi, "Assignment Category");
}
