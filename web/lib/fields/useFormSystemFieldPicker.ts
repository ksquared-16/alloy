"use client";

import { useCallback, useEffect, useState } from "react";
import {
    buildFormSystemFieldPicker,
    FORM_PICKER_ENTITY_TYPES,
    type FieldDefinitionPickerRow,
} from "@/lib/fields/formFieldRegistryPicker";
import {
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    type SystemFieldRegistryEntry,
} from "@/lib/forms/systemFieldRegistry";

function toPickerRow(r: Record<string, unknown>): FieldDefinitionPickerRow {
    return {
        entity_type: String(r.entity_type ?? ""),
        field_key: String(r.field_key ?? ""),
        field_type: String(r.field_type ?? "text"),
        label: r.label != null ? String(r.label) : null,
        description: r.description != null ? String(r.description) : null,
        help_text: r.help_text != null ? String(r.help_text) : null,
        placeholder: r.placeholder != null ? String(r.placeholder) : null,
        config: r.config != null && typeof r.config === "object" ? (r.config as Record<string, unknown>) : null,
        is_system: Boolean(r.is_system),
        is_active: r.is_active !== false,
    };
}

/**
 * Loads org field_definitions for Forms Builder system-field picker (registry-first).
 * Falls back to OPERATIONAL_FORM_SYSTEM_FIELDS when fetch fails or returns empty.
 */
export function useFormSystemFieldPicker(): {
    systemFields: readonly SystemFieldRegistryEntry[];
    loading: boolean;
    reload: () => void;
} {
    const [systemFields, setSystemFields] = useState<readonly SystemFieldRegistryEntry[]>(
        OPERATIONAL_FORM_SYSTEM_FIELDS
    );
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const results = await Promise.all(
                FORM_PICKER_ENTITY_TYPES.map(async (entityType) => {
                    const res = await fetch(
                        `/api/admin/field-definitions?entity_type=${encodeURIComponent(entityType)}`,
                        { cache: "no-store" }
                    );
                    if (!res.ok) return [] as FieldDefinitionPickerRow[];
                    const json = (await res.json()) as { field_definitions?: Record<string, unknown>[] };
                    return (json.field_definitions ?? []).map(toPickerRow);
                })
            );
            const allRows = results.flat();
            setSystemFields(buildFormSystemFieldPicker(allRows));
        } catch {
            setSystemFields(OPERATIONAL_FORM_SYSTEM_FIELDS);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return { systemFields, loading, reload: load };
}
