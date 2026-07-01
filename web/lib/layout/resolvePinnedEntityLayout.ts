/**
 * Pinned entity_layouts record for Work View / URL layout overrides.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getLayoutById } from "@/lib/layout/entityLayoutsRepo";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";

export async function resolvePinnedEntityLayoutRecord(
    supabase: SupabaseClient,
    entityLayoutId: string | null | undefined,
): Promise<EntityLayoutRecord | null> {
    const id = entityLayoutId?.trim();
    if (!id) return null;
    try {
        const record = await getLayoutById(supabase, id);
        if (!record || record.status !== "published") return null;
        return record;
    } catch {
        return null;
    }
}
