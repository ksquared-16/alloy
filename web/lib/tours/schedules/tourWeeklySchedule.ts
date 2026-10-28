/**
 * Weekly tour schedules (S3 — T02, T04, T05, D-T6).
 *
 * ## Representation: a schedule is a GROUP of ordinary rules
 *
 * The slot engine reads `tour_availability_rules`, one row per weekday × window, and stays the only
 * slot authority. A schedule ("Weekday tours: Mon–Fri, 8:30–10:30 AM and 2:30–3:30 PM, 45 minutes,
 * 2 families") is those ten rows tagged with one `metadata.tour_schedule = { id, name }`. Nothing
 * here generates slots, and no booking references a schedule — bookings keep their own
 * `metadata.rule_id`, so authoring never touches a booking.
 *
 * ## Editing reconciles, it does not replace
 *
 * Saving a schedule diffs the desired weekday × window pairs against the group's current members:
 * an unchanged pair keeps its row (and its id — a family holding slots from that rule can still
 * book), a new pair is inserted, a dropped pair is deleted, and shared settings are one UPDATE over
 * the kept ids. Only rows carrying THIS schedule id in THIS scope are ever touched.
 *
 * ## Scope
 *
 * `location_id = null` is organization-wide and contributes slots at every site. A location view
 * shows those rows as inherited and read-only; they are edited at organization scope.
 *
 * Pure. The routes own I/O.
 */

import { isValidTourTimeZone, wallTimeToMinutes } from "@/lib/tours/schedules/tourTimeFormat";

export const TOUR_SCHEDULE_METADATA_KEY = "tour_schedule";
/**
 * Where organization-wide tour schedules (and the organization's booking brand) are configured —
 * the browser route for the existing `/adminV2/settings/tours/availability` surface (P1-A).
 */
export const TOUR_ORGANIZATION_DEFAULTS_HREF = "/organization/tours";
export const TOUR_SCHEDULE_NAME_MAX = 80;
export const TOUR_WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const TOUR_WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Monday-first, the order operators read a week in. */
export const TOUR_WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type TourScheduleWindow = { start_time: string; end_time: string };

export type TourScheduleDraft = {
    name: string;
    /** 0 = Sunday … 6 = Saturday (the rule column's convention). Any subset, consecutive or not. */
    days: number[];
    windows: TourScheduleWindow[];
    timezone: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_bookings_per_slot: number;
    approval_required: boolean;
    is_active: boolean;
};

/** The rule columns a schedule owns. Never ids, bookings, tokens, history or runtime state. */
export type TourScheduleRuleValues = {
    org_id: string;
    location_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_bookings_per_slot: number;
    approval_required: boolean;
    is_active: boolean;
    metadata: Record<string, unknown>;
};

/** What the authoring surface reads per rule (the rules endpoint returns these columns). */
export type TourRuleForAuthoring = {
    id: string;
    location_id: string | null;
    user_id?: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_bookings_per_slot: number;
    approval_required: boolean;
    is_active: boolean;
    metadata?: Record<string, unknown> | null;
};

export type TourScheduleIdentity = { id: string; name: string };

export function readTourScheduleIdentity(metadata: unknown): TourScheduleIdentity | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>)[TOUR_SCHEDULE_METADATA_KEY];
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const id = (raw as Record<string, unknown>).id;
    const name = (raw as Record<string, unknown>).name;
    if (typeof id !== "string" || !id.trim()) return null;
    return { id: id.trim(), name: typeof name === "string" && name.trim() ? name.trim() : "Tour schedule" };
}

/** `08:30` / `08:30:00` → `08:30:00` (the column's canonical text); null when not a wall time. */
export function normalizeWallTime(value: unknown): string | null {
    const minutes = wallTimeToMinutes(String(value ?? ""));
    if (minutes == null) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export type TourScheduleValidation =
    | { ok: true; draft: TourScheduleDraft }
    | { ok: false; error: string };

/** Server-side truth for a submitted schedule. Unknown keys are refused, values normalized. */
export function validateTourScheduleDraft(input: unknown): TourScheduleValidation {
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
        return { ok: false, error: "Invalid schedule payload" };
    }
    const o = input as Record<string, unknown>;
    const allowed = new Set([
        "name",
        "days",
        "windows",
        "timezone",
        "slot_duration_minutes",
        "buffer_minutes",
        "max_bookings_per_slot",
        "approval_required",
        "is_active",
    ]);
    const unknown = Object.keys(o).find((k) => !allowed.has(k));
    if (unknown) return { ok: false, error: `Unsupported schedule field: ${unknown}` };

    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) return { ok: false, error: "Give the schedule a name" };
    if (name.length > TOUR_SCHEDULE_NAME_MAX) return { ok: false, error: `Schedule name is limited to ${TOUR_SCHEDULE_NAME_MAX} characters` };

    if (!Array.isArray(o.days) || o.days.length === 0) return { ok: false, error: "Choose at least one weekday" };
    const days: number[] = [];
    for (const d of o.days) {
        if (!Number.isInteger(d) || (d as number) < 0 || (d as number) > 6) return { ok: false, error: "Weekdays must be 0 (Sunday) through 6 (Saturday)" };
        if (days.includes(d as number)) return { ok: false, error: "A weekday is listed twice" };
        days.push(d as number);
    }
    days.sort((a, b) => a - b);

    if (!Array.isArray(o.windows) || o.windows.length === 0) return { ok: false, error: "Add at least one time window" };
    const windows: TourScheduleWindow[] = [];
    for (const w of o.windows) {
        if (w == null || typeof w !== "object") return { ok: false, error: "Invalid time window" };
        const start = normalizeWallTime((w as Record<string, unknown>).start_time);
        const end = normalizeWallTime((w as Record<string, unknown>).end_time);
        if (!start || !end) return { ok: false, error: "Each window needs a start and an end time" };
        if (wallTimeToMinutes(end)! <= wallTimeToMinutes(start)!) return { ok: false, error: "Each window must end after it starts" };
        windows.push({ start_time: start, end_time: end });
    }
    windows.sort((a, b) => wallTimeToMinutes(a.start_time)! - wallTimeToMinutes(b.start_time)!);
    for (let i = 1; i < windows.length; i++) {
        if (wallTimeToMinutes(windows[i]!.start_time)! < wallTimeToMinutes(windows[i - 1]!.end_time)!) {
            return { ok: false, error: "Time windows in one schedule cannot overlap" };
        }
    }

    const timezone = typeof o.timezone === "string" ? o.timezone.trim() : "";
    if (!timezone || !isValidTourTimeZone(timezone)) return { ok: false, error: "Choose a valid time zone" };

    const int = (key: string, min: number): number | string => {
        const v = o[key];
        if (!Number.isInteger(v) || (v as number) < min) return `${key} must be a whole number of at least ${min}`;
        return v as number;
    };
    const duration = int("slot_duration_minutes", 1);
    if (typeof duration === "string") return { ok: false, error: duration };
    const buffer = o.buffer_minutes === undefined ? 0 : int("buffer_minutes", 0);
    if (typeof buffer === "string") return { ok: false, error: buffer };
    const capacity = o.max_bookings_per_slot === undefined ? 1 : int("max_bookings_per_slot", 1);
    if (typeof capacity === "string") return { ok: false, error: capacity };

    for (const w of windows) {
        const span = wallTimeToMinutes(w.end_time)! - wallTimeToMinutes(w.start_time)!;
        if (span < duration) return { ok: false, error: "A window is shorter than one tour — it would offer no times" };
    }

    if (o.approval_required !== undefined && typeof o.approval_required !== "boolean") return { ok: false, error: "approval_required must be true or false" };
    if (o.is_active !== undefined && typeof o.is_active !== "boolean") return { ok: false, error: "is_active must be true or false" };

    return {
        ok: true,
        draft: {
            name,
            days,
            windows,
            timezone,
            slot_duration_minutes: duration,
            buffer_minutes: buffer,
            max_bookings_per_slot: capacity,
            approval_required: o.approval_required === true,
            is_active: o.is_active !== false,
        },
    };
}

/** One rule row per weekday × window. */
export function expandTourScheduleToRuleValues(
    draft: TourScheduleDraft,
    scope: { orgId: string; locationId: string | null; scheduleId: string }
): TourScheduleRuleValues[] {
    const rows: TourScheduleRuleValues[] = [];
    for (const day of draft.days) {
        for (const w of draft.windows) {
            rows.push({
                org_id: scope.orgId,
                location_id: scope.locationId,
                day_of_week: day,
                start_time: w.start_time,
                end_time: w.end_time,
                timezone: draft.timezone,
                slot_duration_minutes: draft.slot_duration_minutes,
                buffer_minutes: draft.buffer_minutes,
                max_bookings_per_slot: draft.max_bookings_per_slot,
                approval_required: draft.approval_required,
                is_active: draft.is_active,
                metadata: { [TOUR_SCHEDULE_METADATA_KEY]: { id: scope.scheduleId, name: draft.name } },
            });
        }
    }
    return rows;
}

function pairKey(day: number, start: string, end: string): string {
    return `${day}|${normalizeWallTime(start)}|${normalizeWallTime(end)}`;
}

export type TourScheduleReconcilePlan = {
    insert: TourScheduleRuleValues[];
    /** Kept members — one UPDATE applies `sharedPatch` to all of them. */
    keepIds: string[];
    deleteIds: string[];
    sharedPatch: Pick<
        TourScheduleRuleValues,
        "timezone" | "slot_duration_minutes" | "buffer_minutes" | "max_bookings_per_slot" | "approval_required" | "is_active" | "metadata"
    >;
};

/**
 * Diff a schedule's CURRENT members (already filtered to this schedule id and scope) against the
 * desired shape. A member whose metadata carries other keys keeps them.
 */
export function planTourScheduleReconcile(
    members: TourRuleForAuthoring[],
    desired: TourScheduleRuleValues[]
): TourScheduleReconcilePlan {
    const desiredByKey = new Map(desired.map((r) => [pairKey(r.day_of_week, r.start_time, r.end_time), r]));
    const keepIds: string[] = [];
    const deleteIds: string[] = [];
    const matched = new Set<string>();
    for (const m of members) {
        const key = pairKey(m.day_of_week, m.start_time, m.end_time);
        if (desiredByKey.has(key) && !matched.has(key)) {
            keepIds.push(m.id);
            matched.add(key);
        } else {
            deleteIds.push(m.id);
        }
    }
    const insert = desired.filter((r) => !matched.has(pairKey(r.day_of_week, r.start_time, r.end_time)));
    const first = desired[0]!;
    return {
        insert,
        keepIds,
        deleteIds,
        sharedPatch: {
            timezone: first.timezone,
            slot_duration_minutes: first.slot_duration_minutes,
            buffer_minutes: first.buffer_minutes,
            max_bookings_per_slot: first.max_bookings_per_slot,
            approval_required: first.approval_required,
            is_active: first.is_active,
            metadata: first.metadata,
        },
    };
}

export type TourScheduleGroup = {
    /** Schedule id, or `rule:<id>` for a standalone legacy window. */
    key: string;
    scheduleId: string | null;
    name: string;
    locationId: string | null;
    inherited: boolean;
    rules: TourRuleForAuthoring[];
    days: number[];
    windows: TourScheduleWindow[];
    timezone: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_bookings_per_slot: number;
    approval_required: boolean;
    is_active: boolean;
    /** Members disagree on a shared setting (hand-edited rows). Shown, never silently flattened. */
    mixedSettings: boolean;
};

/**
 * Group the rules an operator sees into schedules. `scopeLocationId` is the location being viewed
 * (null = organization scope); organization-wide rules seen from a location are `inherited`.
 */
export function groupTourRulesIntoSchedules(
    rules: TourRuleForAuthoring[],
    scopeLocationId: string | null
): TourScheduleGroup[] {
    const groups = new Map<string, TourRuleForAuthoring[]>();
    for (const r of rules) {
        const identity = readTourScheduleIdentity(r.metadata);
        const key = identity ? `${identity.id}|${r.location_id ?? ""}` : `rule:${r.id}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const out: TourScheduleGroup[] = [];
    for (const [key, members] of groups) {
        const first = members[0]!;
        const identity = readTourScheduleIdentity(first.metadata);
        const days = [...new Set(members.map((m) => m.day_of_week))].sort((a, b) => a - b);
        const windowKeys = new Map<string, TourScheduleWindow>();
        for (const m of members) {
            const w = { start_time: normalizeWallTime(m.start_time) ?? m.start_time, end_time: normalizeWallTime(m.end_time) ?? m.end_time };
            windowKeys.set(`${w.start_time}|${w.end_time}`, w);
        }
        const windows = [...windowKeys.values()].sort(
            (a, b) => (wallTimeToMinutes(a.start_time) ?? 0) - (wallTimeToMinutes(b.start_time) ?? 0)
        );
        const shared = (m: TourRuleForAuthoring) =>
            [m.timezone, m.slot_duration_minutes, m.buffer_minutes, m.max_bookings_per_slot, m.approval_required, m.is_active].join("|");
        out.push({
            key: identity ? identity.id + (first.location_id ? `@${first.location_id}` : "@org") : key,
            scheduleId: identity?.id ?? null,
            name: identity?.name ?? `${TOUR_WEEKDAY_LABELS[first.day_of_week] ?? "Day"} window`,
            locationId: first.location_id ?? null,
            inherited: scopeLocationId != null && (first.location_id == null || first.location_id === ""),
            rules: members,
            days,
            windows,
            timezone: first.timezone,
            slot_duration_minutes: first.slot_duration_minutes,
            buffer_minutes: first.buffer_minutes,
            max_bookings_per_slot: first.max_bookings_per_slot,
            approval_required: first.approval_required,
            is_active: first.is_active,
            mixedSettings: new Set(members.map(shared)).size > 1,
        });
    }
    // Local schedules first, then inherited; named before standalone.
    return out.sort(
        (a, b) =>
            Number(a.inherited) - Number(b.inherited) ||
            Number(a.scheduleId == null) - Number(b.scheduleId == null) ||
            a.name.localeCompare(b.name)
    );
}

export type TourWeekdayEntry = {
    ruleId: string;
    groupKey: string;
    scheduleName: string;
    start_time: string;
    end_time: string;
    inherited: boolean;
    is_active: boolean;
    approval_required: boolean;
    max_bookings_per_slot: number;
};

/** The week, Monday first, each day's windows in time order — what actually contributes slots. */
export function buildTourWeekdayView(groups: TourScheduleGroup[]): { day: number; entries: TourWeekdayEntry[] }[] {
    return TOUR_WEEKDAY_DISPLAY_ORDER.map((day) => {
        const entries: TourWeekdayEntry[] = [];
        for (const g of groups) {
            for (const r of g.rules) {
                if (r.day_of_week !== day) continue;
                entries.push({
                    ruleId: r.id,
                    groupKey: g.key,
                    scheduleName: g.name,
                    start_time: r.start_time,
                    end_time: r.end_time,
                    inherited: g.inherited,
                    is_active: r.is_active,
                    approval_required: r.approval_required,
                    max_bookings_per_slot: r.max_bookings_per_slot,
                });
            }
        }
        entries.sort((a, b) => (wallTimeToMinutes(a.start_time) ?? 0) - (wallTimeToMinutes(b.start_time) ?? 0));
        return { day, entries };
    });
}

/** A group as an editable draft. */
export function tourScheduleGroupToDraft(group: TourScheduleGroup): TourScheduleDraft {
    return {
        name: group.name,
        days: [...group.days],
        windows: group.windows.map((w) => ({ ...w })),
        timezone: group.timezone,
        slot_duration_minutes: group.slot_duration_minutes,
        buffer_minutes: group.buffer_minutes,
        max_bookings_per_slot: group.max_bookings_per_slot,
        approval_required: group.approval_required,
        is_active: group.is_active,
    };
}

/**
 * Duplicate = the configuration, under a new name, as a NEW schedule. A draft has no id, no rule
 * ids, no bookings, no reminders, no tokens: saving it inserts fresh rows and nothing else.
 */
export function duplicateTourScheduleDraft(group: TourScheduleGroup): TourScheduleDraft {
    const draft = tourScheduleGroupToDraft(group);
    const name = `Copy of ${group.name}`;
    return { ...draft, name: name.slice(0, TOUR_SCHEDULE_NAME_MAX) };
}

export type TourScheduleOverlap = { day: number; window: TourScheduleWindow; otherRuleId: string; otherName: string };

/**
 * Windows in `desired` that overlap ACTIVE rules outside the schedule. Not an error: the slot engine
 * offers an identical time once and counts every overlapping booking against capacity, so an overlap
 * cannot double-offer or overbook — but the operator should know two schedules cover the same time.
 */
export function findTourScheduleOverlaps(
    desired: TourScheduleRuleValues[],
    others: TourRuleForAuthoring[]
): TourScheduleOverlap[] {
    const out: TourScheduleOverlap[] = [];
    for (const d of desired) {
        const ds = wallTimeToMinutes(d.start_time)!;
        const de = wallTimeToMinutes(d.end_time)!;
        for (const o of others) {
            if (!o.is_active || o.day_of_week !== d.day_of_week) continue;
            const os = wallTimeToMinutes(o.start_time);
            const oe = wallTimeToMinutes(o.end_time);
            if (os == null || oe == null) continue;
            if (ds < oe && os < de) {
                out.push({
                    day: d.day_of_week,
                    window: { start_time: d.start_time, end_time: d.end_time },
                    otherRuleId: o.id,
                    otherName: readTourScheduleIdentity(o.metadata)?.name ?? "another window",
                });
            }
        }
    }
    return out;
}

/**
 * Visible schedules that repeat each other exactly — same weekdays, same windows (P1-A). The usual
 * cause is a location copy of an organization-wide schedule: the copy ADDS to the original, which
 * keeps applying, so the operator sees the same Monday twice. Each repeated group maps to the name
 * of one schedule it repeats. Families are unaffected (the slot engine offers an identical time
 * once); this only makes the duplication visible.
 */
export function findRepeatedTourSchedules(groups: TourScheduleGroup[]): Map<string, string> {
    const shape = (g: TourScheduleGroup) =>
        `${[...g.days].sort((a, b) => a - b).join(",")}|${g.windows.map((w) => `${normalizeWallTime(w.start_time)}-${normalizeWallTime(w.end_time)}`).join(",")}`;
    const byShape = new Map<string, TourScheduleGroup[]>();
    for (const g of groups) {
        if (!g.is_active) continue;
        const k = shape(g);
        byShape.set(k, [...(byShape.get(k) ?? []), g]);
    }
    const out = new Map<string, string>();
    for (const same of byShape.values()) {
        if (same.length < 2) continue;
        for (const g of same) {
            const other = same.find((o) => o.key !== g.key)!;
            out.set(g.key, other.name);
        }
    }
    return out;
}
