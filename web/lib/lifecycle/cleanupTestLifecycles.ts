/**
 * Admin cleanup — remove builder-owned test/simulation lifecycle departments for an org.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteActivationLifecycleForDepartment } from "@/lib/lifecycle/lifecycleActivationOwned";
import { isRemovableTestLifecycleDepartment } from "@/lib/lifecycle/lifecycleTestLifecycleMarkers";

export type CleanupTestLifecycleRow = {
    department_id: string;
    name: string;
    key: string | null;
    deleted: boolean;
    error?: string;
};

export type CleanupTestLifecyclesResult = {
    dry_run: boolean;
    removed: CleanupTestLifecycleRow[];
    skipped_protected: number;
};

export async function cleanupTestLifecyclesForOrg(
    supabase: SupabaseClient,
    orgId: string,
    options?: { dry_run?: boolean }
): Promise<CleanupTestLifecyclesResult> {
    const dry_run = options?.dry_run === true;

    const { data: depts, error } = await supabase
        .from("departments")
        .select("id, key, name, description, metadata, is_active")
        .eq("org_id", orgId);
    if (error) throw new Error(error.message);

    const removed: CleanupTestLifecycleRow[] = [];
    let skipped_protected = 0;

    for (const row of depts ?? []) {
        const id = String((row as { id: string }).id);
        const name = String((row as { name?: string }).name ?? "");
        const key = (row as { key?: string }).key ?? null;

        if (!isRemovableTestLifecycleDepartment(row as { key: string; name: string; metadata: unknown })) {
            if ((key ?? "").trim()) skipped_protected += 1;
            continue;
        }

        if (dry_run) {
            removed.push({ department_id: id, name, key, deleted: false });
            continue;
        }

        const result = await deleteActivationLifecycleForDepartment(supabase, orgId, id);
        removed.push({
            department_id: id,
            name,
            key,
            deleted: result.ok,
            error: result.ok ? undefined : result.error,
        });
    }

    return { dry_run, removed, skipped_protected };
}
