/**
 * Idempotent org provisioning for Person ↔ Child relationship platform config.
 *
 * Mirrors migration 20260711153100 — safe to call on org creation or repair.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    PERSON_CHILD_RELATIONSHIP_CONFIG_FIELD_MANIFEST,
    PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
    PERSON_CHILD_RELATIONSHIP_NATIVE_FIELD_MANIFEST,
} from "./personChildRelationshipFieldRegistry";
import { PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY } from "./personChildRelationshipEntity";

export type ProvisionPersonChildRelationshipResult = {
    section_upserted: boolean;
    option_set_upserted: boolean;
    option_items_upserted: number;
    field_definitions_upserted: number;
};

const RELATIONSHIP_TYPE_OPTIONS = [
    { item_key: "mother", label: "Mother", sort_order: 10 },
    { item_key: "father", label: "Father", sort_order: 20 },
    { item_key: "stepparent", label: "Stepparent", sort_order: 30 },
    { item_key: "grandparent", label: "Grandparent", sort_order: 40 },
    { item_key: "aunt", label: "Aunt", sort_order: 50 },
    { item_key: "uncle", label: "Uncle", sort_order: 60 },
    { item_key: "sibling", label: "Sibling", sort_order: 70 },
    { item_key: "foster_parent", label: "Foster Parent", sort_order: 80 },
    { item_key: "family_friend", label: "Family Friend", sort_order: 90 },
    { item_key: "other", label: "Other", sort_order: 100 },
] as const;

export async function provisionPersonChildRelationshipPlatformConfig(
    supabase: SupabaseClient,
    orgId: string,
): Promise<ProvisionPersonChildRelationshipResult> {
    const now = new Date().toISOString();
    let fieldDefinitionsUpserted = 0;

    const { error: sectionErr } = await supabase.from("field_section_definitions").upsert(
        {
            org_id: orgId,
            entity_type: PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
            section_key: "family_relationships",
            label: "Family relationships",
            description: "Person ↔ Child relationship fields (roles, kinship, edge attributes)",
            sort_order: 10,
            updated_at: now,
        },
        { onConflict: "org_id,entity_type,section_key" },
    );
    if (sectionErr) throw new Error(`field_section_definitions: ${sectionErr.message}`);

    const { data: optionSet, error: optionSetErr } = await supabase
        .from("option_sets")
        .upsert(
            {
                org_id: orgId,
                set_key: PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY,
                label: "Relationship to Child",
                sort_order: 55,
                updated_at: now,
            },
            { onConflict: "org_id,set_key" },
        )
        .select("id")
        .single();
    if (optionSetErr || !optionSet) {
        throw new Error(`option_sets: ${optionSetErr?.message ?? "upsert failed"}`);
    }
    const optionSetId = String((optionSet as { id: string }).id);

    let optionItemsUpserted = 0;
    for (const opt of RELATIONSHIP_TYPE_OPTIONS) {
        const { error } = await supabase.from("option_set_items").upsert(
            {
                option_set_id: optionSetId,
                item_key: opt.item_key,
                label: opt.label,
                sort_order: opt.sort_order,
                metadata: {},
                updated_at: now,
            },
            { onConflict: "option_set_id,item_key" },
        );
        if (error) throw new Error(`option_set_items[${opt.item_key}]: ${error.message}`);
        optionItemsUpserted += 1;
    }

    for (const row of PERSON_CHILD_RELATIONSHIP_NATIVE_FIELD_MANIFEST) {
        const config =
            row.field_key === "relationship_type"
                ? { option_set_key: PERSON_CHILD_RELATIONSHIP_TYPE_OPTION_SET_KEY }
                : {};
        const { error } = await supabase.from("field_definitions").upsert(
            {
                org_id: orgId,
                entity_type: PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
                field_key: row.field_key,
                label: row.label,
                description: row.field_key === "relationship_type"
                    ? "Kinship / relationship type for this Person ↔ Child relationship"
                    : row.field_key === "priority"
                        ? "Ordering priority within relationship sections for this child"
                        : "Active or inactive relationship instance",
                field_type: row.field_type,
                is_system: true,
                is_required: false,
                is_active: true,
                is_visible_in_form: row.field_key !== "status",
                is_visible_in_drawer: true,
                is_visible_in_table: row.field_key !== "priority",
                is_filterable: row.field_key !== "priority",
                is_sortable: row.field_key !== "status",
                section_key: row.section_key,
                sort_order: row.sort_order,
                config,
                updated_at: now,
            },
            { onConflict: "org_id,entity_type,field_key" },
        );
        if (error) throw new Error(`field_definitions[${row.field_key}]: ${error.message}`);
        fieldDefinitionsUpserted += 1;
    }

    for (const row of PERSON_CHILD_RELATIONSHIP_CONFIG_FIELD_MANIFEST) {
        const { data: existing } = await supabase
            .from("field_definitions")
            .select("id")
            .eq("org_id", orgId)
            .eq("entity_type", PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE)
            .eq("field_key", row.field_key)
            .maybeSingle();
        if (existing) continue;

        const { error } = await supabase.from("field_definitions").insert({
            org_id: orgId,
            entity_type: PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
            field_key: row.field_key,
            label: row.label,
            field_type: row.field_type,
            is_system: false,
            is_required: false,
            is_active: true,
            is_visible_in_form: false,
            is_visible_in_drawer: true,
            is_visible_in_table: false,
            is_filterable: false,
            is_sortable: false,
            section_key: row.section_key,
            sort_order: row.sort_order,
            config: {},
            updated_at: now,
        });
        if (error && error.code !== "23505") {
            throw new Error(`field_definitions[${row.field_key}]: ${error.message}`);
        }
        if (!error) fieldDefinitionsUpserted += 1;
    }

    return {
        section_upserted: true,
        option_set_upserted: true,
        option_items_upserted: optionItemsUpserted,
        field_definitions_upserted: fieldDefinitionsUpserted,
    };
}
