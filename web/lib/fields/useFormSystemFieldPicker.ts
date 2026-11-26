"use client";

import { useCallback, useEffect, useState } from "react";
import {
    buildFormSystemFieldPicker,
    buildFormSystemFieldPickerPlatformBaseline,
    buildFormRelationshipFieldPicker,
    buildFormRelationshipFieldPickerPlatformBaseline,
    FORM_PICKER_ENTITY_TYPES,
    type FieldDefinitionPickerRow,
} from "@/lib/fields/formFieldRegistryPicker";
import type { SystemFieldRegistryEntry } from "@/lib/forms/systemFieldRegistry";

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

export type FormSystemFieldPickerState = {
    /** Platform baseline immediately; tenant business fields merge after load. */
    systemFields: readonly SystemFieldRegistryEntry[];
    /** Relationship role leaves — separate optgroups from scalar mapped fields. */
    relationshipFields: readonly SystemFieldRegistryEntry[];
    /** True while org field_definitions fetch is in flight. Platform fields remain available. */
    loading: boolean;
    /** Set when tenant fetch fails — platform fields are preserved. */
    error: string | null;
    reload: () => void;
};

/**
 * Loads org field_definitions for Forms Builder system-field picker (canonical derivation).
 *
 * First paint: synchronous platform-supported canonical fields (no empty state).
 * After load: tenant field_definitions merge in; legacy operational catalog fills hydration gaps only.
 */
export function useFormSystemFieldPicker(): FormSystemFieldPickerState {
    const [systemFields, setSystemFields] = useState<readonly SystemFieldRegistryEntry[]>(() =>
        buildFormSystemFieldPickerPlatformBaseline(),
    );
    const [relationshipFields, setRelationshipFields] = useState<readonly SystemFieldRegistryEntry[]>(() =>
        buildFormRelationshipFieldPickerPlatformBaseline(),
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const results = await Promise.all(
                FORM_PICKER_ENTITY_TYPES.map(async (entityType) => {
                    const res = await fetch(
                        `/api/admin/field-definitions?entity_type=${encodeURIComponent(entityType)}`,
                        { cache: "no-store" },
                    );
                    if (!res.ok) return [] as FieldDefinitionPickerRow[];
                    const json = (await res.json()) as { field_definitions?: Record<string, unknown>[] };
                    return (json.field_definitions ?? []).map(toPickerRow);
                }),
            );
            const allRows = results.flat();
            setSystemFields(buildFormSystemFieldPicker(allRows));
            setRelationshipFields(buildFormRelationshipFieldPicker(allRows));
        } catch {
            setError("Organization fields could not be loaded. Platform fields remain available.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return { systemFields, relationshipFields, loading, error, reload: load };
}
