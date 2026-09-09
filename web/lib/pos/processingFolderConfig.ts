/**
 * Processing folder helpers — derives membership from folder model + item metadata.
 *
 * Folder definitions: `processingFolderModel.ts` + `processingFolderStore.ts` (V1 localStorage).
 * See model file for persistence seam to tenant DB.
 */

import {
    visibleFoldersForScope,
    type ProcessingFolderDefinition,
} from "./processingFolderModel";
import { getProcessingFoldersSnapshot } from "./processingFolderStore";

export type { ProcessingFolderDefinition, ProcessingFolderScope, ProcessingFolderAccent } from "./processingFolderModel";

export function getFormFolders(): ProcessingFolderDefinition[] {
    return visibleFoldersForScope(getProcessingFoldersSnapshot(), "form");
}

export function getWorkFolders(): ProcessingFolderDefinition[] {
    return visibleFoldersForScope(getProcessingFoldersSnapshot(), "work");
}

export function getCategoryFolders(): ProcessingFolderDefinition[] {
    return visibleFoldersForScope(getProcessingFoldersSnapshot(), "category");
}

export function readAdminCategory(metadata?: Record<string, unknown> | null): string | null {
    const raw = metadata?.admin_category;
    if (typeof raw === "string" && raw.trim()) return raw.trim().toLowerCase();
    return null;
}

function haystack(form: { name?: string | null; key?: string; metadata?: Record<string, unknown> }): string {
    return `${form.name ?? ""} ${form.key ?? ""} ${String(form.metadata?.admin_category ?? "")}`.toLowerCase();
}

export function formOrigin(form: { metadata?: Record<string, unknown> }): "generated" | "manual" {
    const meta = form.metadata ?? {};
    /*
     * `source: "document_form_draft"` is what `createFormFromCaseDraft` ACTUALLY writes, and it was
     * the one shape this predicate did not test. Nothing in the product ever wrote the other three:
     * `origin: "document"` existed only in this module's own unit test. So every form generated from
     * an imported document was filed as a manual form, "Generated from documents" sat empty with a
     * "generate one from a document in Work" empty state directly after the operator had done
     * exactly that, and Studio Health counted 0 Generated forever.
     *
     * `processingDevCleanup.isProcessingOwnedForm` already tested both shapes; only this reader
     * missed the real one. The speculative keys are kept so no other writer silently breaks.
     */
    if (
        meta.source === "document_form_draft" ||
        typeof meta.source_case_id === "string" ||
        meta.generated_from_processing === true ||
        meta.processing_case_id ||
        meta.origin === "document"
    ) {
        return "generated";
    }
    return "manual";
}

export function formPublishStatus(form: { has_published_version?: boolean }): "draft" | "published" {
    return form.has_published_version ? "published" : "draft";
}

function folderDef(folderId: string): ProcessingFolderDefinition | undefined {
    return getProcessingFoldersSnapshot().find((f) => f.id === folderId);
}

export function formMatchesStudioFolder(
    form: { name?: string | null; key?: string; metadata?: Record<string, unknown>; has_published_version?: boolean },
    folderId: string
): boolean {
    if (folderId === "generated") return formOrigin(form) === "generated";
    if (folderId === "manual") return formOrigin(form) === "manual";
    if (folderId === "draft") return formPublishStatus(form) === "draft";
    if (folderId === "published") return formPublishStatus(form) === "published";

    const category = readAdminCategory(form.metadata);
    if (category === folderId) return true;

    const def = folderDef(folderId);
    if (!def) return false;
    const stack = haystack(form);
    return def.keywords?.some((kw) => stack.includes(kw)) ?? stack.includes(folderId);
}

export function caseMatchesCategoryFolder(
    row: { sourceDisplay?: { label: string } | null; caseType?: string | null; adminCategory?: string | null },
    folderId: string
): boolean {
    const def = folderDef(folderId);
    if (!def) return false;
    // An explicit category (configured on the source form) is authoritative — keywords are only
    // the fallback "when metadata.admin_category is unset", per the folder model. Without this a
    // form whose name happens not to contain the folder keyword (e.g. "Firefly Lead Capture" vs
    // "enrollment") silently falls back to Incoming no matter how it is configured.
    const explicit = typeof row.adminCategory === "string" ? row.adminCategory.trim().toLowerCase() : "";
    if (explicit) return explicit === folderId;
    const stack = `${row.sourceDisplay?.label ?? ""} ${row.caseType ?? ""}`.toLowerCase();
    return def.keywords?.some((kw) => stack.includes(kw)) ?? stack.includes(folderId);
}

/** Landing shortcuts derived from folder model */
export function processingLandingFolderShortcuts(): { label: string; destination: "work" | "studio" }[] {
    const work = getWorkFolders();
    const form = getFormFolders();
    return [
        ...work.filter((f) => f.id === "incoming" || f.scopes.includes("category")).map((f) => ({ label: f.label, destination: "work" as const })),
        ...form.filter((f) => f.id === "generated" || f.id === "manual").map((f) => ({ label: f.label, destination: "studio" as const })),
        { label: "Packets", destination: "studio" },
    ];
}