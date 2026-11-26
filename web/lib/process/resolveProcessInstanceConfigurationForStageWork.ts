/**
 * D-96 — governing configuration for a Current Work slice, from a process-instance ID alone.
 *
 * `resolveOpportunityStageWorkSlice` holds `processInstanceId`, not the instance row. This is the
 * one read that turns the id into the identity the resolver needs, and then delegates: the
 * pinned-vs-live branch stays owned by {@link resolveProcessInstanceConfiguration} and is not
 * restated here.
 *
 * Failure is a NULL result, never a thrown error. A Focus Panel that cannot read one row must still
 * render the record; degrading to the live projection is the pre-D-96 behaviour and is strictly no
 * worse than the blank panel an exception would produce.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    resolveProcessInstanceConfiguration,
    type ProcessInstanceConfiguration,
} from "@/lib/process/resolveProcessInstanceConfiguration";
import { PROCESS_INSTANCES_TABLE } from "@/lib/process/processInstances";

type InstanceRow = {
    id: string;
    process_key: string;
    stage_key: string | null;
    business_process_revision_id: string | null;
};

export async function resolveProcessInstanceConfigurationForStageWork(input: {
    supabase: SupabaseClient;
    orgId: string;
    processInstanceId: string;
    /** Already loaded by the caller; used only if the instance turns out to be unpinned. */
    departmentMetadata?: unknown;
}): Promise<ProcessInstanceConfiguration | null> {
    const { data, error } = await input.supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("id, process_key, stage_key, business_process_revision_id")
        .eq("id", input.processInstanceId)
        .eq("org_id", input.orgId)
        .maybeSingle();
    if (error || !data) return null;

    const row = data as InstanceRow;
    return resolveProcessInstanceConfiguration({
        supabase: input.supabase,
        orgId: input.orgId,
        processInstance: row,
        departmentMetadata: input.departmentMetadata,
    });
}
