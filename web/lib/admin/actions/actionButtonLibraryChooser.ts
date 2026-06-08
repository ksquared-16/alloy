import { ACTION_BUTTON_LIBRARY, type ActionRegistryEntry } from "@/lib/admin/actions/actionDefinitionRegistry";

export type ActionCatalogDefinitionRef = {
    id: string;
    key: string;
};

export type AddableActionLibraryItem = {
    entry: ActionRegistryEntry;
    definitionId: string;
};

/** Supported library actions that exist in the org catalog — hides unseeded and placeholder actions. */
export function listAddableActionLibraryEntries(catalog: ActionCatalogDefinitionRef[]): AddableActionLibraryItem[] {
    const byKey = new Map(catalog.map((d) => [d.key.trim(), d]));
    const out: AddableActionLibraryItem[] = [];
    for (const entry of ACTION_BUTTON_LIBRARY) {
        if (!entry.settingsConfigurable) continue;
        const def = byKey.get(entry.key);
        if (!def?.id) continue;
        out.push({ entry, definitionId: def.id });
    }
    return out;
}
