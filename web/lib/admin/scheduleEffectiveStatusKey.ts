import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";

/** Resolve an active schedule_statuses row by canonical key (global table, no org). */
export async function resolveScheduleStatusRowByKey(
    supabase: SupabaseClient,
    statusKey: string
): Promise<{ id: string; key: string } | null> {
    const k = String(statusKey ?? "").trim();
    if (!k) return null;
    const { data, error } = await supabase
        .from("schedule_statuses")
        .select("id, key")
        .eq("key", k)
        .eq("is_active", true)
        .maybeSingle();
    if (error || !data) return null;
    const row = data as { id?: string; key?: string | null };
    if (!row.id || !row.key || !String(row.key).trim()) return null;
    return { id: row.id, key: String(row.key).trim() };
}

export async function fetchScheduleStatusKeyByFk(
    supabase: SupabaseClient,
    scheduleStatusIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
    const ids = [...new Set(scheduleStatusIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
    if (ids.length === 0) return new Map();
    const { data, error } = await supabase.from("schedule_statuses").select("id, key").in("id", ids);
    if (error || !data) return new Map();
    const m = new Map<string, string>();
    for (const row of data as { id: string; key?: string | null }[]) {
        if (row.key != null && String(row.key).trim()) m.set(row.id, String(row.key).trim());
    }
    return m;
}

export function effectiveScheduleStatusKey(
    row: { status_key?: string | null; schedule_status_id?: string | null },
    keyByFk: Map<string, string>
): string | null {
    const direct = row.status_key != null && String(row.status_key).trim() !== "" ? String(row.status_key).trim() : null;
    if (direct) return direct;
    const fk = row.schedule_status_id;
    if (fk && keyByFk.has(fk)) {
        const k = keyByFk.get(fk);
        return k && String(k).trim() ? String(k).trim() : null;
    }
    return null;
}

/**
 * Server-side schedule status for admin detail pages — matches entity GET semantics:
 * effective key from `status_key` or `schedule_status_id`, `_status_display` via status_definitions.
 */
export async function hydrateScheduleStatusForAdminDetail(
    supabase: SupabaseClient,
    orgId: string,
    schedule: { status_key?: string | null; schedule_status_id?: string | null }
): Promise<{ status_key: string | null; _status_display: string | null; _schedule_status_label: string | null }> {
    const fid = schedule.schedule_status_id;
    const keyByFk = new Map<string, string>();
    let _schedule_status_label: string | null = null;
    if (fid) {
        const { data: sst } = await supabase.from("schedule_statuses").select("key, label").eq("id", fid).maybeSingle();
        const row = sst as { key?: string | null; label?: string | null } | null;
        if (row?.key && String(row.key).trim()) keyByFk.set(fid, String(row.key).trim());
        if (row?.label && String(row.label).trim()) _schedule_status_label = String(row.label).trim();
    }
    const effective = effectiveScheduleStatusKey(
        { status_key: schedule.status_key, schedule_status_id: schedule.schedule_status_id },
        keyByFk
    );
    const _status_display = await resolveStatusLabel(supabase, orgId, "schedules", effective);
    return {
        status_key: effective,
        _status_display,
        _schedule_status_label,
    };
}
