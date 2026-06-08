import type { SupabaseClient } from "@supabase/supabase-js";
import {
    lifecycleBuilderFromDepartmentMetadata,
    lifecycleWorkspaceTileDescription,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

/** Sync departments.description from active lifecycle process for workspace tiles. */
export async function syncLifecycleDepartmentDescription(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string
): Promise<string | null> {
    const { data, error } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    const metadata =
        data.metadata !== null && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {};
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process =
        builder.processes.find((p) => p.id === builder.active_process_id) ?? builder.processes[0] ?? null;
    const description = lifecycleWorkspaceTileDescription(process?.description, process?.name ?? "");

    const { error: upErr } = await supabase
        .from("departments")
        .update({ description, updated_at: new Date().toISOString() })
        .eq("id", departmentId)
        .eq("org_id", orgId);
    if (upErr) throw new Error(upErr.message);
    return description;
}
