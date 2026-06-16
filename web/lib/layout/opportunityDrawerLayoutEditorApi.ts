/**
 * Opportunity drawer layout editor — fetch helpers (testable, settings-only).
 */

import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";

export async function fetchEntityLayoutRecord(id: string): Promise<EntityLayoutRecord> {
    const res = await fetch(`/api/admin/entity-layouts/${encodeURIComponent(id)}`);
    const json = (await res.json().catch(() => ({}))) as EntityLayoutRecord & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to load layout");
    return json;
}

export async function patchEntityLayoutDraft(id: string, name: string, doc: LayoutDoc): Promise<EntityLayoutRecord> {
    const res = await fetch(`/api/admin/entity-layouts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, doc }),
    });
    const json = (await res.json().catch(() => ({}))) as EntityLayoutRecord & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Save failed");
    return json;
}

export async function publishEntityLayoutDraft(id: string): Promise<EntityLayoutRecord> {
    const res = await fetch(`/api/admin/entity-layouts/${encodeURIComponent(id)}/publish`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as EntityLayoutRecord & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Publish failed");
    return json;
}

export async function duplicateEntityLayoutDraft(sourceId: string, name?: string): Promise<EntityLayoutRecord> {
    const res = await fetch(`/api/admin/entity-layouts/${encodeURIComponent(sourceId)}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(name ? { name } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as EntityLayoutRecord & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Could not create draft from published layout");
    return json;
}
