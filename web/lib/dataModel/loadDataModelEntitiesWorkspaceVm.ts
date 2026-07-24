/**
 * Server-only composer for the Data Model → Entity workspace VM.
 *
 * The Entity workspace resolves fields, categories, relationships, statuses, and
 * option sets in place, so all of that has to arrive with the initial route
 * payload — there is no category rail to fan out into, and no client waterfall
 * before the operator can read the selected Entity.
 *
 * One pass loads: entity labels (industry defaults + org overrides), custom
 * `field_definitions`, org `field_section_definitions` (real configured
 * categories), effective `status_definitions` for each entity's status domain,
 * and the `option_sets` referenced by option-backed fields.
 */

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { entityLabelsMapFromEffective } from "@/lib/admin/entityLabelsServer";
import { resolveEntityLabelsForOrgCached } from "@/lib/admin/entityLabelsResolve";
import { getOptionSetKeyFromConfig } from "@/lib/admin/fieldDefinitionOptionSetConfig";
import { getOrgConfigLocked } from "@/lib/admin/getOrgConfigLocked";
import type { FieldSectionRegistryRow } from "@/lib/admin/fieldSectionSelectOptions";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { configurationPrimaryHubEntities } from "@/lib/adminV2/configuration/configurationEntityCatalog";
import { statusEntityTypesForHubEntities } from "@/lib/dataModel/dataModelEntityStatusDomain";
import { hubEntityApiTypes } from "@/lib/fields/fieldCatalogForSettings";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    buildDataModelEntitiesWorkspaceVm,
    type DataModelEntitiesWorkspaceVm,
    type EntityOptionSetInput,
    type EntityOptionSetValueVm,
    type EntityStatusDefinitionInput,
} from "@/lib/dataModel/dataModelWorkspaceVm";

export type DataModelIndustryOption = { id: string; key: string; label: string };

export type DataModelEntitiesWorkspaceLoadResult =
    | {
          ok: true;
          orgId: string;
          configLocked: boolean;
          industries: DataModelIndustryOption[];
          orgIndustryId: string | null;
          vm: DataModelEntitiesWorkspaceVm;
      }
    | { ok: false };

function toFieldDefRow(row: Record<string, unknown>): FieldDef {
    return {
        id: String(row.id),
        org_id: String(row.org_id),
        entity_type: String(row.entity_type),
        field_key: String(row.field_key),
        field_type: String(row.field_type),
        label: row.label != null ? String(row.label) : null,
        description: row.description != null ? String(row.description) : null,
        is_system: Boolean(row.is_system),
        is_required: Boolean(row.is_required),
        is_active: row.is_active !== false,
        is_visible_in_form: row.is_visible_in_form !== false,
        is_visible_in_drawer: row.is_visible_in_drawer !== false,
        is_visible_in_table: row.is_visible_in_table !== false,
        is_visible_in_public_booking: Boolean(row.is_visible_in_public_booking),
        is_filterable: Boolean(row.is_filterable),
        is_sortable: Boolean(row.is_sortable),
        section_key: row.section_key != null ? String(row.section_key) : null,
        sort_order: typeof row.sort_order === "number" ? row.sort_order : Number(row.sort_order) || 0,
        placeholder: row.placeholder != null ? String(row.placeholder) : null,
        help_text: row.help_text != null ? String(row.help_text) : null,
        config: row.config != null && typeof row.config === "object" ? (row.config as Record<string, unknown>) : null,
        requirement_policy: row.requirement_policy ?? null,
        interaction_policy: row.interaction_policy ?? null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
    };
}

function toCategoryRegistryRow(row: Record<string, unknown>): FieldSectionRegistryRow | null {
    const sectionKey = row.section_key != null ? String(row.section_key).trim() : "";
    if (!sectionKey) return null;
    return {
        id: row.id != null ? String(row.id) : undefined,
        section_key: sectionKey,
        label: row.label != null ? String(row.label) : sectionKey,
        description: row.description != null ? String(row.description) : null,
        sort_order: typeof row.sort_order === "number" ? row.sort_order : Number(row.sort_order) || 0,
        is_archived: row.is_archived === true,
    };
}

/**
 * Option sets referenced by option-backed field configs, with their values.
 * Only the referenced keys are loaded — the full org option-set catalog is not
 * an Entity concern.
 */
async function loadReferencedOptionSets(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    setKeys: readonly string[],
): Promise<Map<string, EntityOptionSetInput>> {
    const out = new Map<string, EntityOptionSetInput>();
    if (setKeys.length === 0) return out;

    const { data: sets } = await supabase
        .from("option_sets")
        .select("id, set_key, label")
        .eq("org_id", orgId)
        .in("set_key", setKeys);

    const setRows = (sets ?? []) as { id: string; set_key: string; label: string | null }[];
    if (setRows.length === 0) return out;

    const { data: items } = await supabase
        .from("option_set_items")
        .select("option_set_id, item_key, label, sort_order")
        .in(
            "option_set_id",
            setRows.map((row) => row.id),
        );

    const valuesBySetId = new Map<string, EntityOptionSetValueVm[]>();
    for (const raw of (items ?? []) as Record<string, unknown>[]) {
        const setId = String(raw.option_set_id);
        const list = valuesBySetId.get(setId) ?? [];
        list.push({
            key: String(raw.item_key ?? ""),
            label: raw.label != null ? String(raw.label) : String(raw.item_key ?? ""),
            sortOrder: typeof raw.sort_order === "number" ? raw.sort_order : Number(raw.sort_order) || 0,
        });
        valuesBySetId.set(setId, list);
    }

    for (const row of setRows) {
        const values = (valuesBySetId.get(row.id) ?? []).sort(
            (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
        );
        out.set(row.set_key, {
            setKey: row.set_key,
            label: row.label?.trim() || row.set_key,
            values,
        });
    }
    return out;
}

/** Server component loader — never throws; degrades to `{ ok: false }` on auth failure. */
export async function loadDataModelEntitiesWorkspaceVm(): Promise<DataModelEntitiesWorkspaceLoadResult> {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return { ok: false };

    const entities = configurationPrimaryHubEntities();
    const apiEntityTypes = Array.from(new Set(entities.flatMap((entity) => hubEntityApiTypes(entity.hubKey))));
    const statusEntityTypes = statusEntityTypesForHubEntities(entities.map((entity) => entity.hubKey));

    const supabase = createAdminClient();
    const [labelsPayload, configLocked, industriesResult, fieldDefsResult, sectionDefsResult, statusRows] =
        await Promise.all([
            resolveEntityLabelsForOrgCached(supabase, ctx.orgId),
            getOrgConfigLocked(ctx.orgId),
            supabase.from("industries").select("id, key, label").eq("is_active", true).order("label", { ascending: true }),
            supabase.from("field_definitions").select("*").eq("org_id", ctx.orgId).in("entity_type", apiEntityTypes),
            supabase
                .from("field_section_definitions")
                .select("id, entity_type, section_key, label, description, sort_order, is_archived")
                .eq("org_id", ctx.orgId)
                .in("entity_type", apiEntityTypes)
                .order("sort_order", { ascending: true }),
            Promise.all(
                statusEntityTypes.map(async (entityType) => {
                    try {
                        const rows = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, entityType, {
                            activeOnly: false,
                        });
                        return [entityType, rows] as const;
                    } catch {
                        // A single unavailable status domain must not blank the whole Entity workspace.
                        return [entityType, []] as const;
                    }
                }),
            ),
        ]);

    const labels = entityLabelsMapFromEffective(labelsPayload.effective);
    const defaultsByType = new Map(
        labelsPayload.defaults.map((row) => [row.entity_type, { singular: row.singular, plural: row.plural }] as const),
    );

    const customFieldsByEntityType = new Map<string, FieldDef[]>();
    const optionSetKeys = new Set<string>();
    for (const raw of (fieldDefsResult.data ?? []) as Record<string, unknown>[]) {
        const def = toFieldDefRow(raw);
        if (def.is_active === false) continue;
        const list = customFieldsByEntityType.get(def.entity_type) ?? [];
        list.push(def);
        customFieldsByEntityType.set(def.entity_type, list);
        const optionSetKey = getOptionSetKeyFromConfig(def.config);
        if (optionSetKey) optionSetKeys.add(optionSetKey);
    }

    const categoryRegistryByEntityType = new Map<string, FieldSectionRegistryRow[]>();
    for (const raw of (sectionDefsResult.data ?? []) as Record<string, unknown>[]) {
        const row = toCategoryRegistryRow(raw);
        if (!row) continue;
        const entityType = String(raw.entity_type ?? "");
        const list = categoryRegistryByEntityType.get(entityType) ?? [];
        list.push(row);
        categoryRegistryByEntityType.set(entityType, list);
    }

    const statusDefinitionsByEntityType = new Map<string, EntityStatusDefinitionInput[]>(
        statusRows.map(([entityType, rows]) => [
            entityType,
            rows.map((row) => ({
                id: row.id,
                org_id: row.org_id,
                entity_type: row.entity_type,
                status_key: row.status_key,
                status_label: row.status_label,
                sort_order: Number(row.sort_order) || 0,
                is_active: row.is_active !== false,
                is_system: row.is_system === true,
            })),
        ]),
    );

    const optionSetsByKey = await loadReferencedOptionSets(supabase, ctx.orgId, [...optionSetKeys]);

    const vm = buildDataModelEntitiesWorkspaceVm({
        entities,
        labels,
        defaultsByType,
        customFieldsByEntityType,
        categoryRegistryByEntityType,
        statusDefinitionsByEntityType,
        optionSetsByKey,
    });

    const industries = ((industriesResult.data ?? []) as DataModelIndustryOption[]).filter(
        (industry) => industry.key !== "generic",
    );

    return {
        ok: true,
        orgId: ctx.orgId,
        configLocked,
        industries,
        orgIndustryId: labelsPayload.org_industry_id,
        vm,
    };
}
