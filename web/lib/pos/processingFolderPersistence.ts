/**
 * The organisation-scoped persistence contract for Forms / Work folder definitions.
 *
 * One shape, validated the same way on both sides of `/api/admin/processing/folders`: the route refuses
 * anything else, and the client store only ever sends what passes here. Pure — no I/O.
 */

import type { ProcessingFolderDefinition, ProcessingFolderScope } from "./processingFolderModel";

/** Key on `org_settings.metadata`. */
export const PROCESSING_FOLDERS_SETTINGS_KEY = "processing_folders" as const;

const SCOPES: ReadonlySet<ProcessingFolderScope> = new Set(["form", "work", "document", "category"]);
const ACCENTS = new Set(["pine", "midnight", "stone"]);
const MAX_FOLDERS = 200;

export function parseProcessingFolderList(
    raw: unknown,
): { ok: true; folders: ProcessingFolderDefinition[] } | { ok: false; error: string } {
    if (!Array.isArray(raw)) return { ok: false, error: "folders must be a list" };
    if (raw.length > MAX_FOLDERS) return { ok: false, error: `at most ${MAX_FOLDERS} folders` };
    const out: ProcessingFolderDefinition[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (!item || typeof item !== "object") return { ok: false, error: "each folder must be an object" };
        const f = item as Record<string, unknown>;
        const id = typeof f.id === "string" ? f.id.trim() : "";
        if (!/^[a-z0-9_]{1,64}$/.test(id)) return { ok: false, error: "folder id is invalid" };
        if (seen.has(id)) return { ok: false, error: "folder ids must be unique" };
        seen.add(id);
        const label = typeof f.label === "string" ? f.label.trim() : "";
        if (!label || label.length > 80) return { ok: false, error: "folder name must be 1–80 characters" };
        const scopes = Array.isArray(f.scopes) ? f.scopes.filter((s): s is ProcessingFolderScope => SCOPES.has(s as ProcessingFolderScope)) : [];
        if (!scopes.length) return { ok: false, error: "folder must have at least one scope" };
        const order = typeof f.order === "number" && Number.isFinite(f.order) ? f.order : 0;
        out.push({
            id,
            label,
            ...(typeof f.description === "string" && f.description.trim() ? { description: f.description.trim().slice(0, 240) } : {}),
            scopes,
            ...(typeof f.accent === "string" && ACCENTS.has(f.accent) ? { accent: f.accent as ProcessingFolderDefinition["accent"] } : {}),
            order,
            isSystem: f.isSystem === true,
            ...(f.hidden === true ? { hidden: true } : {}),
            ...(Array.isArray(f.keywords)
                ? { keywords: f.keywords.filter((k): k is string => typeof k === "string" && k.trim() !== "").slice(0, 20) }
                : {}),
        });
    }
    return { ok: true, folders: out };
}
