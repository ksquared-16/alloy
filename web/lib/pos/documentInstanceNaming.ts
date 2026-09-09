/**
 * Document instance display naming with collision-safe discriminators.
 */

import { buildDocumentDisplayName, cleanFilenameToTitle } from "@/lib/pos/processingCase/formDraft/deriveDocumentTitle";

export function normalizeDisplayNameCandidate(name: string): string {
    return name.replace(/\s+/g, " ").trim();
}

/** Append (2), (3)… when base name already exists in tenant context. */
export function resolveDisplayNameWithCollision(
    baseName: string,
    existingDisplayNames: readonly string[]
): string {
    const normalized = normalizeDisplayNameCandidate(baseName);
    if (!normalized) return normalized;
    const existing = new Set(existingDisplayNames.map((n) => normalizeDisplayNameCandidate(n).toLowerCase()));
    if (!existing.has(normalized.toLowerCase())) return normalized;

    let suffix = 2;
    while (suffix < 1000) {
        const candidate = `${normalized} (${suffix})`;
        if (!existing.has(candidate.toLowerCase())) return candidate;
        suffix += 1;
    }
    return `${normalized} (${Date.now()})`;
}

export function proposeImportDisplayName(input: {
    fileName: string;
    classificationKey?: string | null;
    subjectLabel?: string | null;
    periodLabel?: string | null;
    receivedAt?: string | null;
    existingDisplayNames?: readonly string[];
}): string {
    const fromFile = cleanFilenameToTitle(input.fileName);
    const base = buildDocumentDisplayName({
        documentTypeLabel: fromFile ?? "Unclassified document",
        subjectLabel: input.subjectLabel,
        periodLabel: input.periodLabel,
        receivedAt: input.receivedAt ?? new Date().toISOString(),
    });
    return resolveDisplayNameWithCollision(base, input.existingDisplayNames ?? []);
}

/** Generated native form name — separate from source document display name. */
/**
 * Which title should a generated Form be NAMED after?
 *
 * `draft.title` is a DOCUMENT title, and when the document's own text yields no heading it falls
 * back to the classification bucket's label — so an imported enrollment application called
 * "Northwind Enrollment Application v2" generated a Form named "Enrollment Packet", because that
 * is what `CLASSIFICATION_LABELS.enrollment_document` says every enrollment document is. Every
 * enrollment document in the org would have generated a Form with that same name, and the name
 * belongs to the Packet, which is a different thing that this Form is at most one piece of.
 *
 * The naming hierarchy: the document's own heading identifies it best; failing that the display
 * name the administrator sees and can set; and only then the classification bucket, which is a
 * useful answer to "what kind of paperwork is this" and a poor answer to "what is this form
 * called". The administrator renames it afterwards either way — this is the default, not a lock.
 */
export function proposeGeneratedFormNameFromSources(input: {
    draftTitle?: string | null;
    draftTitleFromText?: boolean;
    documentDisplayLabel?: string | null;
}): string {
    const draftTitle = (input.draftTitle ?? "").trim();
    const displayLabel = (input.documentDisplayLabel ?? "").trim();
    // A heading the document itself carries is the most specific name available.
    if (input.draftTitleFromText && draftTitle) return proposeGeneratedFormName(draftTitle);
    if (displayLabel) return proposeGeneratedFormName(displayLabel);
    return proposeGeneratedFormName(draftTitle);
}

export function proposeGeneratedFormName(sourceDocumentDisplayName: string): string {
    const trimmed = normalizeDisplayNameCandidate(sourceDocumentDisplayName);
    if (!trimmed) return "";
    // Strip trailing received-date segment when present for cleaner form library names.
    const withoutReceived = trimmed.replace(/\s—\sReceived\s[\d/-]+$/, "").trim();
    return withoutReceived || trimmed;
}
