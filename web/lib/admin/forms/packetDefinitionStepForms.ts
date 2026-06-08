/**
 * Admin packet step editor: keep form dropdown options in sync with saved steps.
 * Supabase/PostgREST may return `form_definitions` as an object or a single-element array.
 */

export type PacketStepFormOption = {
    id: string;
    name: string;
    key: string;
    has_published_version?: boolean;
};

export function normalizeJoinedFormDefinition<T extends { id: string; name: string; key: string }>(
    raw: T | readonly T[] | null | undefined
): T | null {
    if (raw == null) return null;
    if (Array.isArray(raw)) return (raw[0] as T | undefined) ?? null;
    return raw as T;
}

type ItemWithJoin = {
    form_definition_id: string;
    form_definitions?: PacketStepFormOption | readonly PacketStepFormOption[] | null;
};

/**
 * Merge org form list with forms referenced by saved packet items so `<select value={id}>`
 * always has a matching `<option>` (and published steps are selectable even if the list
 * endpoint is briefly empty or stale).
 */
export function mergeFormListWithPacketItems(
    formsFromApi: readonly PacketStepFormOption[],
    items: readonly ItemWithJoin[]
): PacketStepFormOption[] {
    const byId = new Map<string, PacketStepFormOption>();
    for (const f of formsFromApi) {
        byId.set(f.id, { ...f });
    }
    for (const row of items) {
        const fd = normalizeJoinedFormDefinition(row.form_definitions);
        if (!fd?.id) continue;
        const prev = byId.get(fd.id);
        byId.set(fd.id, {
            id: fd.id,
            name: fd.name || prev?.name || "Form",
            key: fd.key || prev?.key || "",
            has_published_version: true,
        });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
