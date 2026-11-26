/**
 * RECORD → THE WORK UNIT THAT ACTUALLY HOLDS IT.
 *
 * One resolver, because there is one right answer and several tempting wrong ones.
 *
 * ── THE CATEGORY ERROR THIS EXISTS TO PREVENT ──
 *
 * A configured Business Process and a Work Unit are different identities in different namespaces.
 * `enrollment` is a process; `enrollment_pipeline` is a unit. `/workspace/work-unit/:slug` resolves
 * work-unit keys and Work View slugs — so navigating to a process key answers `work_unit_not_found`,
 * nothing composes, and the operator lands on an empty surface with no error at all. Search shipped
 * that defect and it was invisible until certification. Nothing may infer a Work Unit from a process.
 *
 * The authoritative answer is the HOST RECORD's own `work_unit_id`: a Focus Panel composes for a
 * subject only when that subject is on the active Work View's evaluated page, and page membership is
 * scoped by exactly that column.
 *
 * ── NULL IS AN ANSWER ──
 *
 * A record with no active work unit yields no entry. Callers must propagate that rather than guess:
 * "no queue holds this record" is true and safe, while inventing a unit commits the operator to a
 * queue the record is not in — and a queue whose page does not contain the record composes nothing.
 *
 * Ids are chunked because PostgREST serializes `.in(…)` into the request URI. An over-long filter is
 * rejected in a way that reads as an empty result rather than as an error (`search-v2-restricted-uri-too-long`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { chunkIds } from "@/lib/admin/opportunity/opportunityLeadDeletionDb";
import { primaryQueueKeyForLifecycleStage } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";

function uniqueIds(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.map((v) => (v == null ? "" : String(v).trim())).filter(Boolean))];
}

/**
 * `work_units.id` → `key`, ACTIVE units only.
 *
 * An inactive unit is not a destination: its route resolves, its queues do not evaluate, and the
 * operator arrives somewhere that can never compose their record.
 */
export async function fetchActiveWorkUnitKeys(
    supabase: SupabaseClient,
    orgId: string,
    workUnitIds: string[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ids = uniqueIds(workUnitIds);
    if (!ids.length) return out;
    for (const chunk of chunkIds(ids)) {
        const { data, error } = await supabase
            .from("work_units")
            .select("id, key, is_active")
            .eq("org_id", orgId)
            .in("id", chunk);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{ id: string; key?: string | null; is_active?: boolean | null }>) {
            if (row.is_active === false) continue;
            const key = typeof row.key === "string" ? row.key.trim() : "";
            if (key) out.set(String(row.id), key);
        }
    }
    return out;
}

/**
 * Opportunity (case) id → the key of the active Work Unit holding it.
 *
 * Absent from the map = no active unit holds it. That is a real answer, not a lookup failure.
 */
export async function fetchHostWorkUnitKeys(
    supabase: SupabaseClient,
    orgId: string,
    opportunityIds: string[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ids = uniqueIds(opportunityIds);
    if (!ids.length) return out;

    const workUnitIdByOpportunity = new Map<string, string>();
    for (const chunk of chunkIds(ids)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("id, work_unit_id")
            .eq("org_id", orgId)
            .in("id", chunk);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{ id: string; work_unit_id?: string | null }>) {
            const wuId = typeof row.work_unit_id === "string" ? row.work_unit_id.trim() : "";
            if (wuId) workUnitIdByOpportunity.set(String(row.id), wuId);
        }
    }
    if (!workUnitIdByOpportunity.size) return out;

    const keyByWorkUnitId = await fetchActiveWorkUnitKeys(
        supabase,
        orgId,
        [...workUnitIdByOpportunity.values()]
    );

    for (const [opportunityId, workUnitId] of workUnitIdByOpportunity) {
        const key = keyByWorkUnitId.get(workUnitId);
        if (key) out.set(opportunityId, key);
    }
    return out;
}

/**
 * Household id → its operational CASE and the unit holding that case.
 *
 * Only children participate in a process, so a parent or a household has no process context and
 * therefore no host Work Unit of its own. The household's own case is the destination: it is the
 * panel their children are worked in, and the one a parent's Household card lives on. Newest case
 * wins — a household with several cases is worked in the one most recently touched.
 */
export async function fetchHouseholdCaseHosts(
    supabase: SupabaseClient,
    orgId: string,
    householdIds: string[]
): Promise<Map<string, { opportunityId: string; workUnitKey: string | null }>> {
    const out = new Map<string, { opportunityId: string; workUnitKey: string | null }>();
    const ids = uniqueIds(householdIds);
    if (!ids.length) return out;

    const byHousehold = new Map<string, { opportunityId: string; workUnitId: string | null }>();
    for (const chunk of chunkIds(ids)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("id, customer_id, work_unit_id, updated_at")
            .eq("org_id", orgId)
            .in("customer_id", chunk)
            .order("updated_at", { ascending: false });
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{
            id: string;
            customer_id?: string | null;
            work_unit_id?: string | null;
        }>) {
            const household = typeof row.customer_id === "string" ? row.customer_id.trim() : "";
            if (!household || byHousehold.has(household)) continue; // newest wins
            byHousehold.set(household, {
                opportunityId: String(row.id),
                workUnitId: typeof row.work_unit_id === "string" ? row.work_unit_id.trim() || null : null,
            });
        }
    }
    if (!byHousehold.size) return out;

    const keyByWorkUnitId = await fetchActiveWorkUnitKeys(
        supabase,
        orgId,
        [...byHousehold.values()].map((v) => v.workUnitId).filter(Boolean) as string[]
    );

    for (const [household, v] of byHousehold) {
        out.set(household, {
            opportunityId: v.opportunityId,
            workUnitKey: v.workUnitId ? keyByWorkUnitId.get(v.workUnitId) ?? null : null,
        });
    }
    return out;
}

/**
 * SUBJECT'S EFFECTIVE POSITION → the configured Work View that holds it.
 *
 * ── THE GRAIN COLLAPSE THIS EXISTS TO PREVENT ──
 *
 * `fetchHostWorkUnitKeys` answers "which unit holds this RECORD" by reading the case's own
 * `work_unit_id`. For a family case that is family-grain truth, and for a family subject it is right.
 * For a CHILD it is wrong, and wrong in a way that looks convincing: the search result correctly
 * showed "Enrollment — Waitlist" (read from the child's own `process_instances.stage_key`) and the
 * destination still committed the FAMILY's lifecycle-stage unit, `lifecycle_wu_lead`. Two grains, and
 * only the family one reached attention — so a waitlisted child opened the Lead queue, which does not
 * contain them, and nothing composed.
 *
 * Siblings make it unambiguous: two children of one household can sit in different stages, so no
 * single family-level answer can be correct for both. Participant position must win over household
 * position for a participant-specific destination.
 *
 * ── WHY A WORK VIEW AND NOT THE STAGE'S WORK UNIT ──
 *
 * Every configured stage does own a `lifecycle_wu_<stage>` unit, but those are INTERNAL — other
 * operator-facing resolvers reject them as destinations on purpose. The operator-facing home for a
 * stage is the configured Work View bound to it, and a view slug is a first-class attention target
 * (`resolveWorkUnitByRouteSlug` resolves work_unit_key → work_view → queue_lane).
 *
 * Binding is by CONFIGURED KEY, never by label: a view holds a stage when its `compat_queue_key`
 * equals `primaryQueueKeyForLifecycleStage(stage)`. Labels are tenant-configurable and reorderable,
 * so a renamed or reordered "Waitlist" must keep resolving.
 *
 * Null is an answer. A stage with no configured view yields nothing and the caller falls back to the
 * record's own unit rather than inventing a destination.
 */
export async function fetchStageWorkViewTargets(
    supabase: SupabaseClient,
    orgId: string,
    entries: ReadonlyArray<{ opportunityId: string; stageKey: string }>
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const wanted = entries
        .map((e) => ({
            opportunityId: (e.opportunityId ?? "").trim(),
            stageKey: (e.stageKey ?? "").trim(),
        }))
        .filter((e) => e.opportunityId && e.stageKey);
    if (!wanted.length) return out;

    // Case → department, via the unit that holds the case. The department carries the published
    // process configuration, so this is the only hop that can reach the configured Work Views.
    const departmentByOpportunity = await fetchOpportunityDepartments(
        supabase,
        orgId,
        uniqueIds(wanted.map((e) => e.opportunityId))
    );
    if (!departmentByOpportunity.size) return out;

    const viewsByDepartment = await fetchDepartmentStageWorkViews(
        supabase,
        orgId,
        uniqueIds([...departmentByOpportunity.values()])
    );

    for (const { opportunityId, stageKey } of wanted) {
        const departmentId = departmentByOpportunity.get(opportunityId);
        if (!departmentId) continue;
        const viewId = viewsByDepartment.get(departmentId)?.get(primaryQueueKeyForLifecycleStage(stageKey));
        if (viewId) out.set(stageWorkViewCacheKey(opportunityId, stageKey), viewId);
    }
    return out;
}

/** The key `fetchStageWorkViewTargets` returns its answers under. */
export function stageWorkViewCacheKey(opportunityId: string, stageKey: string): string {
    return `${opportunityId.trim()}:${stageKey.trim()}`;
}

async function fetchOpportunityDepartments(
    supabase: SupabaseClient,
    orgId: string,
    opportunityIds: string[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!opportunityIds.length) return out;

    const workUnitIdByOpportunity = new Map<string, string>();
    for (const chunk of chunkIds(opportunityIds)) {
        const { data, error } = await supabase
            .from("opportunities")
            .select("id, work_unit_id")
            .eq("org_id", orgId)
            .in("id", chunk);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{ id: string; work_unit_id?: string | null }>) {
            const wuId = typeof row.work_unit_id === "string" ? row.work_unit_id.trim() : "";
            if (wuId) workUnitIdByOpportunity.set(String(row.id), wuId);
        }
    }
    if (!workUnitIdByOpportunity.size) return out;

    const departmentByWorkUnit = new Map<string, string>();
    for (const chunk of chunkIds(uniqueIds([...workUnitIdByOpportunity.values()]))) {
        const { data, error } = await supabase
            .from("work_units")
            .select("id, department_id")
            .eq("org_id", orgId)
            .in("id", chunk);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{ id: string; department_id?: string | null }>) {
            const dept = typeof row.department_id === "string" ? row.department_id.trim() : "";
            if (dept) departmentByWorkUnit.set(String(row.id), dept);
        }
    }

    for (const [opportunityId, workUnitId] of workUnitIdByOpportunity) {
        const dept = departmentByWorkUnit.get(workUnitId);
        if (dept) out.set(opportunityId, dept);
    }
    return out;
}

/** department id → (lifecycle queue key → configured Work View id). */
async function fetchDepartmentStageWorkViews(
    supabase: SupabaseClient,
    orgId: string,
    departmentIds: string[]
): Promise<Map<string, Map<string, string>>> {
    const out = new Map<string, Map<string, string>>();
    if (!departmentIds.length) return out;

    for (const chunk of chunkIds(departmentIds)) {
        const { data, error } = await supabase
            .from("departments")
            .select("id, metadata")
            .eq("org_id", orgId)
            .in("id", chunk);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{ id: string; metadata?: unknown }>) {
            const byQueueKey = new Map<string, string>();
            // The SAME resolver the runtime reads, so a view Search targets is a view the surface
            // will actually offer — orphaned lifecycle views are already dropped here.
            for (const view of savedWorkViewsFromDepartmentMetadata(row.metadata)) {
                const compat = view.compat_queue_key?.trim();
                const id = view.id?.trim();
                if (!compat || !id) continue;
                if (view.visible_in_runtime === false) continue;
                if (!byQueueKey.has(compat)) byQueueKey.set(compat, id);
            }
            if (byQueueKey.size) out.set(String(row.id), byQueueKey);
        }
    }
    return out;
}
