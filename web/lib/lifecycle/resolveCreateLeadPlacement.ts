import type { SupabaseClient } from "@supabase/supabase-js";

import {
    fetchEffectiveStatusDefinitions,
    resolveConfiguredDefaultCreateStatusKey,
} from "@/lib/admin/statusDefinitionsResolve";
import { DEFAULT_LEAD_CASE_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { resolveLifecycleCreateLeadBinding } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import { resolveCreateLeadEntryDepartmentForOrg } from "@/lib/lifecycle/resolveCreateLeadEntryDepartment";

/**
 * WHERE A NEW ENROLLMENT LEAD BELONGS — one resolution for every entry source.
 *
 * BOS → Create Lead resolved this inline: the owning work unit from the operator's department binding,
 * or from the org's single configured Create Lead entry department, and the entry status from
 * configuration — failing closed when the entry is ambiguous or unconfigured, because a lead with no
 * owning work unit is invisible to every work-unit-scoped queue and to every location-scoped operator.
 *
 * A public form approved in Processing never ran it, so its lead committed with `work_unit_id` NULL:
 * the same lead, different downstream truth. Both paths now ask this one function.
 */
export type CreateLeadPlacement =
    | { readonly ok: true; readonly workUnitId: string; readonly statusKey: string }
    | { readonly ok: false; readonly reason: "ambiguous" | "unconfigured"; readonly message: string };

export const CREATE_LEAD_PLACEMENT_UNCONFIGURED_MESSAGE = "Create Lead is not configured for this process/location.";
export const CREATE_LEAD_PLACEMENT_AMBIGUOUS_MESSAGE = "More than one process can create leads. Choose a process, then create the lead.";

export async function resolveCreateLeadPlacement(
    supabase: SupabaseClient,
    orgId: string,
    input: {
        readonly departmentId?: string | null;
        readonly workUnitId?: string | null;
        readonly accessScope?: AdminAccessScopeDimensions | null;
    } = {},
): Promise<CreateLeadPlacement> {
    const departmentId = input.departmentId?.trim() || null;
    let workUnitId = input.workUnitId?.trim() || null;

    // The default create status is OWNED by the opportunity status configuration (a status_definitions
    // row flagged `metadata.default_on_create`). Defensive: a status-config read failure must not block
    // a valid create.
    let configuredDefaultStatus: string | null = null;
    try {
        const defs = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
        configuredDefaultStatus = resolveConfiguredDefaultCreateStatusKey(defs);
    } catch {
        configuredDefaultStatus = null;
    }
    let statusKey = (configuredDefaultStatus || DEFAULT_LEAD_CASE_STATUS_KEY).trim();

    if (departmentId) {
        const binding = await resolveLifecycleCreateLeadBinding(supabase, orgId, departmentId);
        if (!workUnitId && binding.work_unit_id) workUnitId = binding.work_unit_id;
        // Operator-configured entry-stage status wins when present (department-level ownership).
        if (binding.status_key?.trim()) statusKey = binding.status_key.trim();
    }

    // A surface that cannot name a department resolves the entry department from configuration before
    // failing closed; ambiguity is surfaced rather than guessed.
    if (!workUnitId) {
        const entry = await resolveCreateLeadEntryDepartmentForOrg(supabase, orgId, input.accessScope ?? null);
        if (entry.state === "ambiguous") {
            return { ok: false, reason: "ambiguous", message: CREATE_LEAD_PLACEMENT_AMBIGUOUS_MESSAGE };
        }
        if (entry.state === "resolved") {
            workUnitId = entry.workUnitId;
            const binding = await resolveLifecycleCreateLeadBinding(supabase, orgId, entry.departmentId);
            if (binding.status_key?.trim()) statusKey = binding.status_key.trim();
        }
    }

    if (!statusKey || !workUnitId) {
        return { ok: false, reason: "unconfigured", message: CREATE_LEAD_PLACEMENT_UNCONFIGURED_MESSAGE };
    }
    return { ok: true, workUnitId, statusKey };
}
