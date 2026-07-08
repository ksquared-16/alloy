/**
 * Processing V1 folder model — configurable folder definitions for Studio Forms and Work.
 *
 * ## Persistence seam (V1 → tenant DB)
 *
 * - **V1:** `processingFolderStore.ts` persists overrides in `localStorage` keyed by org id
 *   when available, else a global dev key. Defaults come from `DEFAULT_PROCESSING_FOLDERS`.
 * - **Future:** Replace the store loader with tenant config from the configuration workspace
 *   (same shape). UI (`ProcessingManageFoldersDialog`) stays unchanged; only the store
 *   adapter swaps from localStorage → `GET/PATCH /api/admin/processing/folders`.
 */

export type ProcessingFolderScope = "form" | "work" | "document" | "category";

export type ProcessingFolderAccent = "pine" | "midnight" | "stone";

export interface ProcessingFolderDefinition {
    id: string;
    label: string;
    description?: string;
    /** Which surfaces may show this folder */
    scopes: ProcessingFolderScope[];
    accent?: ProcessingFolderAccent;
    order: number;
    /** System folders cannot be deleted; label/reorder may be limited */
    isSystem: boolean;
    /** Soft-hide from rails without deleting definition */
    hidden?: boolean;
    /** Fallback keyword match when metadata.admin_category is unset */
    keywords?: string[];
}

export const PROCESSING_FOLDER_STORAGE_VERSION = 1;

export const DEFAULT_PROCESSING_FOLDERS: ProcessingFolderDefinition[] = [
    {
        id: "generated",
        label: "Generated from documents",
        description: "Forms created from document imports in Work.",
        scopes: ["form"],
        accent: "pine",
        order: 10,
        isSystem: true,
    },
    {
        id: "manual",
        label: "Manual forms",
        description: "Forms built from scratch in Studio.",
        scopes: ["form"],
        accent: "midnight",
        order: 20,
        isSystem: true,
    },
    {
        id: "draft",
        label: "Drafts",
        scopes: ["form"],
        accent: "stone",
        order: 30,
        isSystem: true,
    },
    {
        id: "published",
        label: "Published",
        scopes: ["form"],
        accent: "pine",
        order: 40,
        isSystem: true,
    },
    {
        id: "incoming",
        label: "Incoming",
        description: "Active imports requiring review.",
        scopes: ["work"],
        accent: "pine",
        order: 50,
        isSystem: true,
    },
    {
        id: "completed",
        label: "Completed",
        scopes: ["work"],
        accent: "stone",
        order: 200,
        isSystem: true,
    },
    {
        id: "enrollment",
        label: "Enrollment",
        scopes: ["form", "work", "category"],
        accent: "pine",
        order: 60,
        isSystem: false,
        keywords: ["enrollment", "enroll"],
    },
    {
        id: "medical",
        label: "Medical",
        scopes: ["form", "work", "category"],
        accent: "midnight",
        order: 70,
        isSystem: false,
        keywords: ["medical", "health", "immunization"],
    },
    {
        id: "subsidy",
        label: "Subsidy",
        scopes: ["form", "work", "category"],
        accent: "pine",
        order: 80,
        isSystem: false,
        keywords: ["subsidy", "assistance", "ccdf"],
    },
    {
        id: "licensing",
        label: "Licensing",
        scopes: ["form", "work", "category"],
        accent: "midnight",
        order: 90,
        isSystem: false,
        keywords: ["licensing", "license", "permit"],
    },
];

export function sortFolders(folders: ProcessingFolderDefinition[]): ProcessingFolderDefinition[] {
    return [...folders].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function visibleFoldersForScope(
    folders: ProcessingFolderDefinition[],
    scope: ProcessingFolderScope
): ProcessingFolderDefinition[] {
    return sortFolders(folders.filter((f) => !f.hidden && f.scopes.includes(scope)));
}

export function folderAccentClass(accent: ProcessingFolderAccent | undefined): string {
    if (accent === "pine") return "border-l-alloy-bend-pine bg-alloy-bend-pine/[0.04]";
    if (accent === "midnight") return "border-l-alloy-midnight bg-alloy-midnight/[0.03]";
    return "border-l-alloy-stone/40 bg-alloy-stone/[0.04]";
}

export function slugifyFolderId(label: string): string {
    const base = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
    return base || `folder_${Date.now().toString(36)}`;
}

export function mergeFolderDefaults(stored: ProcessingFolderDefinition[] | null): ProcessingFolderDefinition[] {
    if (!stored?.length) return sortFolders([...DEFAULT_PROCESSING_FOLDERS]);
    const byId = new Map(DEFAULT_PROCESSING_FOLDERS.map((f) => [f.id, { ...f }]));
    for (const row of stored) {
        const existing = byId.get(row.id);
        if (existing?.isSystem) {
            byId.set(row.id, {
                ...existing,
                label: row.label?.trim() ? row.label : existing.label,
                description: row.description ?? existing.description,
                order: row.order ?? existing.order,
                hidden: row.hidden ?? false,
                accent: row.accent ?? existing.accent,
            });
        } else {
            byId.set(row.id, row);
        }
    }
    return sortFolders([...byId.values()]);
}
