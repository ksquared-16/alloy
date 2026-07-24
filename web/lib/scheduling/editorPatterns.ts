/**
 * Editor-shaped schedule patterns for a site — the shortcut catalog the schedule
 * editor applies to set an entire schedule (days + hours + type). Shared by the
 * `?view=overview` API and Focus Panel first-paint so the editor can PRELOAD them
 * (no "Loading patterns…" flash on the shortcut).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type EditorPattern = {
    id: string;
    label: string;
    weekdays: number[];
    scheduleTypeKey: string;
    defaultHours: { arrive: string; depart: string } | null;
    defaultOpenEnded: boolean;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function normTime(v: unknown): string | null {
    const s = typeof v === "string" ? v.trim() : "";
    return TIME_RE.test(s) ? s : null;
}
function normRange(v: unknown): { arrive: string; depart: string } | null {
    if (!v || typeof v !== "object") return null;
    const arrive = normTime((v as Record<string, unknown>).arrive);
    const depart = normTime((v as Record<string, unknown>).depart);
    if (!arrive || !depart || depart <= arrive) return null;
    return { arrive, depart };
}

/**
 * A pattern's configured default daily hours. Accepts `default_hours`/flat
 * `defaultArrive/defaultDepart`, and the Locations Schedule config v3 shape
 * `hours: { opens_at, closes_at }`. Null when unconfigured — never synthesized.
 */
export function readPatternDefaultHours(metadata: Record<string, unknown> | null): { arrive: string; depart: string } | null {
    if (!metadata) return null;
    const nested = normRange(metadata.default_hours ?? metadata.defaultHours);
    if (nested) return nested;
    const hoursObj = metadata.hours;
    if (hoursObj && typeof hoursObj === "object") {
        const h = hoursObj as Record<string, unknown>;
        const v3 = normRange({ arrive: h.opens_at ?? h.opensAt, depart: h.closes_at ?? h.closesAt });
        if (v3) return v3;
    }
    return normRange({ arrive: metadata.defaultArrive, depart: metadata.defaultDepart });
}

/** Whether schedules from this pattern default to open-ended (config, else simple case). */
export function readPatternDefaultOpenEnded(metadata: Record<string, unknown> | null): boolean {
    if (!metadata) return true;
    const raw = metadata.default_open_ended ?? metadata.openEndedDefault;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "string") return raw.trim().toLowerCase() !== "false";
    return true;
}

type SchedulePatternRow = {
    id: string;
    label: string | null;
    weekdays: number[] | null;
    schedule_type_key: string | null;
    metadata: Record<string, unknown> | null;
};

/** Load the site's active schedule patterns, mapped to the editor shape. Never throws. */
export async function loadEditorPatternsForSite(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
): Promise<EditorPattern[]> {
    if (!siteLocationId) return [];
    const { data } = await supabase
        .from("schedule_patterns")
        .select("id, label, weekdays, schedule_type_key, metadata")
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .eq("is_active", true)
        .order("sort_order");
    return ((data ?? []) as SchedulePatternRow[]).map((p) => ({
        id: p.id,
        label: p.label?.trim() || "Schedule",
        weekdays: p.weekdays ?? [],
        scheduleTypeKey: p.schedule_type_key ?? "",
        defaultHours: readPatternDefaultHours(p.metadata),
        defaultOpenEnded: readPatternDefaultOpenEnded(p.metadata),
    }));
}
