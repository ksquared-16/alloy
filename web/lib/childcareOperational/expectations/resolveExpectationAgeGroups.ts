/**
 * Canonical age-group resolution for Schedule-derived Expectations (L3).
 *
 * Source of truth (no hardcoded month bands):
 *  - Per child: the committed placement's `program_category_id` ->
 *    `location_program_categories.key` (infant/toddler/preschool/pre_k/school_age).
 *    The child is a `customer_members` row reached via the enrollment agreement;
 *    its operational age band is the program category it is placed into.
 *  - Per room (fallback): the classroom's configured program/age band stored on
 *    location `field_values` (`classroom_age_group` / `childcare_program_type`).
 *
 * Returns the two maps the expectations assembler consumes. Missing values are
 * simply absent (the assembler surfaces a `missing_age_group` warning rather than
 * crashing).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { UNIT_PROGRAM_CATEGORY_FIELD_KEYS } from "@/lib/admin/location/enrichHierarchyUnitProgramCategories";

export type ExpectationAgeGroupMaps = {
    ageGroupByProgramCategoryId: Record<string, string | null>;
    ageGroupByRoomLocationId: Record<string, string | null>;
};

export type LoadExpectationAgeGroupsInput = {
    programCategoryIds: readonly string[];
    roomLocationIds: readonly string[];
};

function uniqueNonEmpty(ids: readonly string[]): string[] {
    return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function loadExpectationAgeGroups(
    supabase: SupabaseClient,
    orgId: string,
    input: LoadExpectationAgeGroupsInput
): Promise<ExpectationAgeGroupMaps> {
    const programCategoryIds = uniqueNonEmpty(input.programCategoryIds);
    const roomLocationIds = uniqueNonEmpty(input.roomLocationIds);

    const ageGroupByProgramCategoryId: Record<string, string | null> = {};
    const ageGroupByRoomLocationId: Record<string, string | null> = {};

    // 1) Program category -> stable key (child placement-derived; canonical).
    if (programCategoryIds.length > 0) {
        const { data, error } = await supabase
            .from("location_program_categories")
            .select("id, key")
            .eq("org_id", orgId)
            .in("id", programCategoryIds);
        if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
        for (const row of (data ?? []) as Array<{ id: string; key: string | null }>) {
            const key = (row.key ?? "").trim();
            ageGroupByProgramCategoryId[row.id] = key || null;
        }
    }

    // 2) Room (classroom) configured program/age band from location field_values.
    if (roomLocationIds.length > 0) {
        const { data: defs, error: defsError } = await supabase
            .from("field_definitions")
            .select("id, field_key")
            .eq("org_id", orgId)
            .eq("entity_type", "location")
            .in("field_key", UNIT_PROGRAM_CATEGORY_FIELD_KEYS as unknown as string[]);
        if (defsError) throw new OperationalEnrollmentServiceError("db_error", defsError.message);

        const defRows = (defs ?? []) as Array<{ id: string; field_key: string }>;
        if (defRows.length > 0) {
            // prefer classroom_age_group over childcare_program_type when both present
            const priority = new Map(
                UNIT_PROGRAM_CATEGORY_FIELD_KEYS.map((k, i) => [k, i] as const)
            );
            const defPriorityById = new Map(
                defRows.map((d) => [d.id, priority.get(d.field_key as never) ?? 99] as const)
            );

            const { data: values, error: valuesError } = await supabase
                .from("field_values")
                .select("entity_id, field_definition_id, value_text")
                .eq("org_id", orgId)
                .eq("entity_type", "location")
                .in("field_definition_id", defRows.map((d) => d.id))
                .in("entity_id", roomLocationIds);
            if (valuesError) throw new OperationalEnrollmentServiceError("db_error", valuesError.message);

            const bestPriorityByRoom = new Map<string, number>();
            for (const raw of (values ?? []) as Array<{
                entity_id: string;
                field_definition_id: string;
                value_text: string | null;
            }>) {
                const value = (raw.value_text ?? "").trim();
                if (!value) continue;
                const p = defPriorityById.get(raw.field_definition_id) ?? 99;
                const prev = bestPriorityByRoom.get(raw.entity_id);
                if (prev == null || p < prev) {
                    bestPriorityByRoom.set(raw.entity_id, p);
                    ageGroupByRoomLocationId[raw.entity_id] = value;
                }
            }
        }
    }

    return { ageGroupByProgramCategoryId, ageGroupByRoomLocationId };
}
