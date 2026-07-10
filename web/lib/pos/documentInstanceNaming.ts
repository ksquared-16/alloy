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
export function proposeGeneratedFormName(sourceDocumentDisplayName: string): string {
    const trimmed = normalizeDisplayNameCandidate(sourceDocumentDisplayName);
    if (!trimmed) return "";
    // Strip trailing received-date segment when present for cleaner form library names.
    const withoutReceived = trimmed.replace(/\s—\sReceived\s[\d/-]+$/, "").trim();
    return withoutReceived || trimmed;
}
