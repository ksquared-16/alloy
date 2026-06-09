import type { SupabaseClient } from "@supabase/supabase-js";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

/** Resolve category FK from site + stable program key (active row). */
export async function resolveDesiredProgramCategoryId(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        locationId: string | null | undefined;
        programKey: string | null | undefined;
    }
): Promise<string | null> {
    const locationId = trimOrNull(args.locationId);
    const programKey = trimOrNull(args.programKey);
    if (!locationId || !programKey) return null;

    const { data, error } = await supabase
        .from("location_program_categories")
        .select("id")
        .eq("org_id", args.orgId)
        .eq("location_id", locationId)
        .eq("key", programKey)
        .eq("is_active", true)
        .maybeSingle();

    if (error || !data?.id) return null;
    return String(data.id);
}

/** Sync desired_program_category_id when program key or site changes. */
export async function enrichOcmProgramCategoryFields(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        locationId: string | null | undefined;
        desiredProgramType: string | null | undefined;
        desiredProgramCategoryId?: string | null | undefined;
    }
): Promise<{ desired_program_type: string | null; desired_program_category_id: string | null }> {
    const desired_program_type = trimOrNull(args.desiredProgramType);
    if (!desired_program_type) {
        return { desired_program_type: null, desired_program_category_id: null };
    }

    const resolvedId = await resolveDesiredProgramCategoryId(supabase, {
        orgId: args.orgId,
        locationId: args.locationId,
        programKey: desired_program_type,
    });

    return {
        desired_program_type,
        desired_program_category_id: resolvedId ?? trimOrNull(args.desiredProgramCategoryId),
    };
}
