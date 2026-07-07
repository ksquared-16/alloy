import type { StoredFormDraftPreview } from "./types";

export type DetectionModeKind = "acroform" | "text_assisted" | "manual_required" | "manual_review" | "not_detected";

export function resolveDetectionMode(draft: StoredFormDraftPreview | null): DetectionModeKind {
    if (!draft) return "not_detected";
    const version = draft.generator_version ?? "";
    if (version.includes("acroform")) return "acroform";
    if (version.startsWith("manual")) return "manual_review";
    if (draft.fields.length === 0) return "manual_required";
    const weak = (draft.warnings ?? []).some((w) => /weak detection/i.test(w));
    if (weak || version.startsWith("fp12")) return "text_assisted";
    return "text_assisted";
}

export function detectionModeLabel(draft: StoredFormDraftPreview | null): string {
    switch (resolveDetectionMode(draft)) {
        case "acroform":
            return "AcroForm fields detected";
        case "text_assisted":
            return "Text-assisted detection — review required";
        case "manual_required":
            return "Manual setup required";
        case "manual_review":
            return "Operator-reviewed setup";
        default:
            return "Not detected yet";
    }
}

export function detectionModeHelper(draft: StoredFormDraftPreview | null): string {
    switch (resolveDetectionMode(draft)) {
        case "acroform":
            return "Fillable PDF widgets were read directly. Resolve each question before publishing.";
        case "text_assisted":
            return "Fields were inferred from document text — verify meaning, not just labels.";
        case "manual_required":
            return "Alloy could not detect questions automatically. Add them manually.";
        case "manual_review":
            return "Questions reflect your reviewed understanding of the document.";
        default:
            return "Run detection to read questions from the uploaded document.";
    }
}
