import { getOptionSetKeyFromConfig } from "@/lib/admin/fieldDefinitionOptionSetConfig";
import {
    LOCATION_METADATA_OPTION_SET_KEYS,
    LOCATION_METADATA_SELECT_FIELD_KEYS,
    type LocationFieldDefLike,
} from "@/lib/admin/location/locationMetadataFieldKeys";

export type { LocationFieldDefLike };

export { LOCATION_METADATA_SELECT_FIELD_KEYS };

export function labelForLocationMetadataSelectValue(
    fieldKey: string,
    value: unknown,
    selectOptions?: { value: string; label: string }[]
): string | null {
    const raw = value == null ? "" : String(value).trim();
    if (!raw) return null;
    const opt = (selectOptions ?? []).find((o) => o.value === raw);
    return opt?.label ?? raw;
}

export function optionSetKeysForLocationMetadataFields(
    defs: LocationFieldDefLike[] | undefined
): Record<(typeof LOCATION_METADATA_SELECT_FIELD_KEYS)[number], string> {
    const out: Record<string, string> = { ...LOCATION_METADATA_OPTION_SET_KEYS };
    if (!defs?.length) return out as Record<(typeof LOCATION_METADATA_SELECT_FIELD_KEYS)[number], string>;
    const keys = new Set<string>(LOCATION_METADATA_SELECT_FIELD_KEYS);
    for (const d of defs) {
        if (!keys.has(d.field_key)) continue;
        const setKey = getOptionSetKeyFromConfig(d.config ?? null);
        if (setKey) out[d.field_key] = setKey;
    }
    return out as Record<(typeof LOCATION_METADATA_SELECT_FIELD_KEYS)[number], string>;
}

export function mapOptionItemsToSelectOptions(
    items: Array<{ item_key?: string; label?: string | null }> | undefined
): { value: string; label: string }[] {
    return (items ?? [])
        .map((i) => {
            const value = String(i.item_key ?? "").trim();
            if (!value) return null;
            const label = String(i.label ?? value).trim() || value;
            return { value, label };
        })
        .filter((o): o is { value: string; label: string } => o != null);
}

export function resolveLocationMetadataSelectOptionsByFieldKey(args: {
    fieldDefs?: LocationFieldDefLike[];
    optionItemsBySetKey?: Record<string, Array<{ item_key?: string; label?: string | null }>>;
}): Record<string, { value: string; label: string }[]> {
    const out: Record<string, { value: string; label: string }[]> = {};
    const setKeys = optionSetKeysForLocationMetadataFields(args.fieldDefs);
    for (const fieldKey of LOCATION_METADATA_SELECT_FIELD_KEYS) {
        const setKey = setKeys[fieldKey];
        const items = setKey ? args.optionItemsBySetKey?.[setKey] : undefined;
        const mapped = mapOptionItemsToSelectOptions(items);
        if (mapped.length > 0) out[fieldKey] = mapped;
    }
    return out;
}
