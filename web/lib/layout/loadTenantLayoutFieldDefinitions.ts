import type { SupabaseClient } from "@supabase/supabase-js";

import {
    LAYOUT_TENANT_FIELD_ENTITY_TYPES,
    type TenantFieldDefinitionRow,
} from "@/lib/layout/tenantLayoutFieldPickerCatalog";

/** Load org field_definitions rows for layout/queue picker merge. */
export async function loadTenantFieldDefinitionsForLayoutPicker(
    supabase: SupabaseClient,
    orgId: string,
): Promise<TenantFieldDefinitionRow[]> {
    const { data, error } = await supabase
        .from("field_definitions")
        .select("field_key, label, entity_type, field_type, section_key, config, is_system, is_active, is_visible_in_drawer, org_id")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .in("entity_type", [...LAYOUT_TENANT_FIELD_ENTITY_TYPES]);

    if (error) throw new Error(error.message);

    return (data ?? []).flatMap((row) => {
        const r = row as {
            field_key?: string;
            label?: string | null;
            entity_type?: string;
            field_type?: string;
            section_key?: string | null;
            config?: Record<string, unknown> | null;
            is_system?: boolean;
            is_active?: boolean;
            is_visible_in_drawer?: boolean;
            org_id?: string;
        };
        const field_key = String(r.field_key ?? "").trim();
        const entity_type = String(r.entity_type ?? "").trim();
        if (!field_key || !entity_type) return [];
        return [
            {
                field_key,
                entity_type,
                label: r.label ?? null,
                field_type: String(r.field_type ?? "text"),
                section_key: r.section_key ?? null,
                config: r.config ?? null,
                is_system: r.is_system === true,
                is_active: r.is_active !== false,
                is_visible_in_drawer: r.is_visible_in_drawer,
                org_id: r.org_id,
            },
        ];
    });
}
