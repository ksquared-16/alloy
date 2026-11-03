import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    expandTourScheduleToRuleValues,
    findTourScheduleOverlaps,
    planTourScheduleReconcile,
    readTourScheduleIdentity,
    TOUR_SCHEDULE_METADATA_KEY,
    type TourRuleForAuthoring,
    type TourScheduleDraft,
    type TourScheduleOverlap,
} from "@/lib/tours/schedules/tourWeeklySchedule";

/**
 * Writes for weekly tour schedules. Every statement is bounded by org, by the EXACT scope
 * (`location_id = X`, or `location_id IS NULL` for organization-wide) and — for edits — by the
 * schedule id, so a location request can never reach an inherited organization rule and an edit
 * can never reach a rule outside its schedule.
 *
 * Rules only. Bookings, reminders, invitations and tokens are not read or written here.
 */

const RULE_COLUMNS =
    "id, org_id, location_id, user_id, day_of_week, start_time, end_time, timezone, slot_duration_minutes, buffer_minutes, max_bookings_per_slot, approval_required, is_active, metadata";

export type TourScheduleScope = { orgId: string; locationId: string | null };

export type TourScheduleWriteResult =
    | { ok: true; scheduleId: string; rules: TourRuleForAuthoring[]; overlaps: TourScheduleOverlap[] }
    | { ok: false; status: number; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builder generics
function inScope<Q extends { eq: any; is: any }>(query: Q, scope: TourScheduleScope): Q {
    return scope.locationId ? query.eq("location_id", scope.locationId) : query.is("location_id", null);
}

/**
 * Active rules that contribute slots alongside this scope — the location's own (legacy
 * organization-wide rules no longer offer times at a location, so they are never an overlap there).
 */
async function loadContributingRules(supabase: SupabaseClient, scope: TourScheduleScope): Promise<TourRuleForAuthoring[]> {
    let q = supabase.from("tour_availability_rules").select(RULE_COLUMNS).eq("org_id", scope.orgId).eq("is_active", true);
    q = inScope(q, scope);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as TourRuleForAuthoring[];
}

async function loadMembers(supabase: SupabaseClient, scope: TourScheduleScope, scheduleId: string): Promise<TourRuleForAuthoring[]> {
    const q = supabase
        .from("tour_availability_rules")
        .select(RULE_COLUMNS)
        .eq("org_id", scope.orgId)
        .eq(`metadata->${TOUR_SCHEDULE_METADATA_KEY}->>id`, scheduleId);
    const { data, error } = await inScope(q, scope);
    if (error) throw new Error(error.message);
    // Belt and braces: the JSON filter is the query, the parsed identity is the proof.
    return ((data ?? []) as unknown as TourRuleForAuthoring[]).filter(
        (r) => readTourScheduleIdentity(r.metadata)?.id === scheduleId
    );
}

export async function assertLocationInOrg(supabase: SupabaseClient, orgId: string, locationId: string): Promise<boolean> {
    const { data } = await supabase.from("locations").select("id").eq("id", locationId).eq("org_id", orgId).maybeSingle();
    return Boolean(data);
}

export async function createTourSchedule(
    supabase: SupabaseClient,
    scope: TourScheduleScope,
    draft: TourScheduleDraft
): Promise<TourScheduleWriteResult> {
    const scheduleId = randomUUID();
    const rows = expandTourScheduleToRuleValues(draft, { ...scope, scheduleId });
    const others = await loadContributingRules(supabase, scope);
    const { data, error } = await supabase.from("tour_availability_rules").insert(rows).select(RULE_COLUMNS);
    if (error) return { ok: false, status: 400, error: error.message };
    return {
        ok: true,
        scheduleId,
        rules: (data ?? []) as unknown as TourRuleForAuthoring[],
        overlaps: findTourScheduleOverlaps(rows, others),
    };
}

export async function updateTourSchedule(
    supabase: SupabaseClient,
    scope: TourScheduleScope,
    scheduleId: string,
    draft: TourScheduleDraft
): Promise<TourScheduleWriteResult> {
    const members = await loadMembers(supabase, scope, scheduleId);
    if (members.length === 0) return { ok: false, status: 404, error: "Schedule not found at this scope" };

    const desired = expandTourScheduleToRuleValues(draft, { ...scope, scheduleId });
    const plan = planTourScheduleReconcile(members, desired);
    const memberIds = new Set(members.map((m) => m.id));
    const others = (await loadContributingRules(supabase, scope)).filter((r) => !memberIds.has(r.id));

    // 1. New weekday × window pairs.
    let insertedIds: string[] = [];
    if (plan.insert.length) {
        const { data, error } = await supabase.from("tour_availability_rules").insert(plan.insert).select("id");
        if (error) return { ok: false, status: 400, error: error.message };
        insertedIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    }

    // 2. Shared settings on the pairs that stay (ids unchanged: a family holding these slots can still book).
    if (plan.keepIds.length) {
        const { metadata, ...shared } = plan.sharedPatch;
        const byMeta = new Map<string, string[]>();
        for (const m of members.filter((x) => plan.keepIds.includes(x.id))) {
            const merged = JSON.stringify({ ...(m.metadata ?? {}), ...metadata });
            byMeta.set(merged, [...(byMeta.get(merged) ?? []), m.id]);
        }
        for (const [merged, ids] of byMeta) {
            const q = supabase
                .from("tour_availability_rules")
                .update({ ...shared, metadata: JSON.parse(merged) })
                .eq("org_id", scope.orgId)
                .in("id", ids);
            const { error } = await inScope(q, scope);
            if (error) {
                if (insertedIds.length) {
                    await supabase.from("tour_availability_rules").delete().eq("org_id", scope.orgId).in("id", insertedIds);
                }
                return { ok: false, status: 400, error: error.message };
            }
        }
    }

    // 3. Pairs the operator removed — only this schedule's rows in this scope.
    if (plan.deleteIds.length) {
        const q = supabase
            .from("tour_availability_rules")
            .delete()
            .eq("org_id", scope.orgId)
            .eq(`metadata->${TOUR_SCHEDULE_METADATA_KEY}->>id`, scheduleId)
            .in("id", plan.deleteIds);
        const { error } = await inScope(q, scope);
        if (error) {
            return {
                ok: false,
                status: 500,
                error: `Schedule partly saved: new windows were added but removed windows remain (${error.message}). Save again to finish.`,
            };
        }
    }

    const after = await loadMembers(supabase, scope, scheduleId);
    return { ok: true, scheduleId, rules: after, overlaps: findTourScheduleOverlaps(desired, others) };
}

export async function deleteTourSchedule(
    supabase: SupabaseClient,
    scope: TourScheduleScope,
    scheduleId: string
): Promise<{ ok: true; deleted: number } | { ok: false; status: number; error: string }> {
    const q = supabase
        .from("tour_availability_rules")
        .delete()
        .eq("org_id", scope.orgId)
        .eq(`metadata->${TOUR_SCHEDULE_METADATA_KEY}->>id`, scheduleId);
    const { data, error } = await inScope(q, scope).select("id");
    if (error) return { ok: false, status: 400, error: error.message };
    const deleted = ((data ?? []) as unknown[]).length;
    if (deleted === 0) return { ok: false, status: 404, error: "Schedule not found at this scope" };
    return { ok: true, deleted };
}
