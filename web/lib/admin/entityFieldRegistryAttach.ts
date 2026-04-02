import { createAdminClient } from "@/lib/supabaseAdmin";
import { displayFromFieldValueRow } from "@/lib/admin/typedFieldValues";

export const DRAWER_TYPE_TO_FIELD_ENTITY_TYPE: Record<string, string> = {
    customers: "customer",
    jobs: "job",
    opportunities: "opportunity",
    vendors: "vendor",
    schedules: "schedule",
    persons: "person",
    locations: "location",
};

type AdminClient = ReturnType<typeof createAdminClient>;

/** True if the entity row already has a value we should not replace with an empty custom field_values overlay. */
export function hasMeaningfulNativeFieldValue(v: unknown): boolean {
    if (v === undefined) return false;
    if (v === null) return false;
    if (typeof v === "boolean") return true;
    if (typeof v === "number") return !Number.isNaN(v);
    if (typeof v === "string") return v.trim() !== "";
    return true;
}

/**
 * Loads field_definitions for the drawer entity and merges custom (non-system) field_values into `out`.
 * System fields must come from native columns on `out`; field_values rows tied to system definitions are ignored.
 */
export async function attachFieldDefinitionsAndValues(
    supabase: AdminClient,
    out: Record<string, unknown>,
    drawerType: string,
    entityId: string
): Promise<void> {
    const entityType = DRAWER_TYPE_TO_FIELD_ENTITY_TYPE[drawerType];
    if (!entityType) return;
    let orgId: string | null = (out.org_id as string) ?? null;
    if (!orgId && drawerType === "schedules" && out._job) {
        orgId = (out._job as { org_id?: string }).org_id ?? null;
    }
    if (!orgId) return;
    const { data: defRows } = await supabase
        .from("field_definitions")
        .select("id, field_key, field_type, label, section_key, sort_order, is_system, is_visible_in_drawer")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .order("section_key", { ascending: true })
        .order("sort_order", { ascending: true });
    const fieldDefs = (defRows ?? []) as {
        id: string;
        field_key: string;
        field_type: string;
        label: string | null;
        section_key: string | null;
        sort_order: number;
        is_system: boolean;
        is_visible_in_drawer: boolean;
    }[];
    out._field_definitions = fieldDefs;

    const { data: sectionRows } = await supabase
        .from("field_section_definitions")
        .select("section_key, label, sort_order")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .order("sort_order", { ascending: true });
    out._field_sections = (sectionRows ?? []) as { section_key: string; label: string; sort_order: number }[];

    if (fieldDefs.length === 0) return;

    const customDefs = fieldDefs.filter((d) => !d.is_system);
    const customDefIds = customDefs.map((d) => d.id);
    if (customDefIds.length === 0) return;

    const { data: fvRows } = await supabase
        .from("field_values")
        .select("field_definition_id, value_text, value_number, value_boolean, value_date, value_json")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .in("field_definition_id", customDefIds);

    type FvRow = {
        field_definition_id: string;
        value_text?: string | null;
        value_number?: number | null;
        value_boolean?: boolean | null;
        value_date?: string | null;
        value_json?: unknown;
    };
    const rowByDefId = new Map(((fvRows ?? []) as FvRow[]).map((r) => [r.field_definition_id, r] as const));

    for (const d of customDefs) {
        const row = rowByDefId.get(d.id);
        const before = out[d.field_key];
        if (row) {
            const applied = displayFromFieldValueRow(d.field_type, row);
            const appliedEmpty = applied === "" || (typeof applied === "string" && applied.trim() === "");
            if (!appliedEmpty) {
                (out as Record<string, unknown>)[d.field_key] = applied;
            } else if (!hasMeaningfulNativeFieldValue(before)) {
                (out as Record<string, unknown>)[d.field_key] = applied;
            }
        } else if (!hasMeaningfulNativeFieldValue(before) && !(d.field_key in out)) {
            (out as Record<string, unknown>)[d.field_key] = "";
        }
    }
}
