/**
 * Roster read-model — room × weekday occupancy, capacity, and required staffing
 * for a site's operating week.
 *
 * This is a THIN read-shaping adapter, not a new calculation. It composes the
 * existing operational engine (the SAME `buildScheduleExpectations` that placement
 * options and the expectation runtime use) with the canonical room provider and the
 * config-scoped capacity/ratio resolvers. It owns NO occupancy, capacity, or ratio
 * policy — it enumerates the week, reads each room·day fact from the engine, and
 * returns raw numbers + flags. Presentation (tones, health labels) lives in the
 * surface, never here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildScheduleExpectations } from "@/lib/childcareOperational/expectations/buildScheduleExpectations";
import { loadOperationalExpectationInputs } from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { loadExpectationAgeGroups } from "@/lib/childcareOperational/expectations/resolveExpectationAgeGroups";
import { buildRoomConfigResolvers } from "@/lib/childcareOperational/config/roomConfigResolvers";
import { resolveRoomsForLocation } from "@/lib/location/canonicalRoomProvider";
import { readLocationSchedulingConfig } from "@/lib/locations/locationSchedulingConfig";

export type RosterDayFact = {
    date: string;
    /** 0 = Sun … 6 = Sat. */
    weekday: number;
    occupancy: number;
    capacity: number | null;
    requiredStaff: number | null;
    /** Occupancy exceeds the binding capacity for the room on this date. */
    capacityExceeded: boolean;
    /** Occupancy exceeds the highest configured ratio tier. */
    ratioBreach: boolean;
};

export type RosterRoomFact = {
    roomId: string;
    roomName: string;
    /** e.g. "Toddler · holds 11" — age-group hint + binding capacity, when known. */
    ageGroupCompat: string | null;
    /** Binding capacity when stable across the week (else null). */
    capacity: number | null;
    ageBandLabel: string | null;
    cells: RosterDayFact[];
};

export type RosterReadModel = {
    siteLocationId: string;
    weekStart: string;
    weekEnd: string;
    /** Operating weekdays as ordered columns. */
    days: { date: string; weekday: number }[];
    todayYmd: string;
    rooms: RosterRoomFact[];
};

const WEEKDAY_MON_FIRST = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

function addDaysYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

function weekdayOf(ymd: string): number {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday (operating week start) of the week containing `ymd`. */
export function mondayOf(ymd: string): string {
    const wd = weekdayOf(ymd); // 0=Sun..6=Sat
    const backToMonday = (wd + 6) % 7; // Sun→6, Mon→0, ...
    return addDaysYmd(ymd, -backToMonday);
}

function numOrNull(v: unknown): number | null {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    return null;
}

/** Human age-band label from a room's metadata (age_range_from/to/unit). */
function ageBandLabel(metadata: Record<string, unknown> | null | undefined): string | null {
    if (!metadata) return null;
    const unit = typeof metadata.age_range_unit === "string" ? metadata.age_range_unit : null;
    const from = numOrNull(metadata.age_range_from);
    const to = numOrNull(metadata.age_range_to);
    if (from == null && to == null) return null;
    const u = (unit ?? "mo").toString().toLowerCase().startsWith("y") ? "yr" : "mo";
    if (from != null && to != null) return `${from}–${to} ${u}`;
    if (from != null) return `${from}+ ${u}`;
    return `≤${to} ${u}`;
}

export type BuildRosterInput = {
    orgId: string;
    siteLocationId: string;
    /** Any date within the target week (defaults handled by the caller). */
    weekOf: string;
    todayYmd: string;
};

/**
 * Assemble the week's roster from real committed schedules. Occupancy/staffing come
 * from the expectation engine; capacity from the config-scoped resolver; rooms from
 * the canonical provider. Rooms with no scheduled children still appear (occupancy 0).
 */
export async function buildRosterReadModel(
    supabase: SupabaseClient,
    input: BuildRosterInput
): Promise<RosterReadModel> {
    const weekStart = mondayOf(input.weekOf);
    const weekEnd = addDaysYmd(weekStart, 6);

    // Site scheduling config → operating weekdays (columns). Default Mon–Fri.
    const { data: siteRow } = await supabase
        .from("locations")
        .select("metadata")
        .eq("org_id", input.orgId)
        .eq("id", input.siteLocationId)
        .maybeSingle();
    const siteConfig = readLocationSchedulingConfig((siteRow as { metadata?: Record<string, unknown> } | null)?.metadata ?? null);
    const operatingDays = siteConfig.operatingDays.length > 0 ? siteConfig.operatingDays : [1, 2, 3, 4, 5];
    const orderedWeekdays = WEEKDAY_MON_FIRST.filter((w) => operatingDays.includes(w));

    const days = orderedWeekdays.map((weekday) => {
        const offset = (weekday + 6) % 7; // Mon→0 … Sun→6
        return { date: addDaysYmd(weekStart, offset), weekday };
    });

    const rooms = await resolveRoomsForLocation(supabase, input.orgId, input.siteLocationId);
    if (rooms.length === 0) {
        return { siteLocationId: input.siteLocationId, weekStart, weekEnd, days, todayYmd: input.todayYmd, rooms: [] };
    }

    const inputs = await loadOperationalExpectationInputs(supabase, {
        orgId: input.orgId,
        siteLocationId: input.siteLocationId,
    });

    // Resolve age groups for EVERY room (incl. empty ones) so capacity/ratio context
    // resolves even where no child is currently placed.
    const extraAgeGroups = await loadExpectationAgeGroups(supabase, input.orgId, {
        programCategoryIds: [],
        roomLocationIds: rooms.map((r) => r.id),
    });
    const inputsWithAgeGroups = {
        ...inputs,
        ageGroupByRoomLocationId: { ...(inputs.ageGroupByRoomLocationId ?? {}), ...extraAgeGroups.ageGroupByRoomLocationId },
        ageGroupByProgramCategoryId: { ...(inputs.ageGroupByProgramCategoryId ?? {}), ...extraAgeGroups.ageGroupByProgramCategoryId },
    };

    const expectations = buildScheduleExpectations({
        dateStart: weekStart,
        dateEnd: weekEnd,
        agreements: inputsWithAgeGroups.agreements,
        placements: inputsWithAgeGroups.placements,
        assignments: inputsWithAgeGroups.assignments,
        patternsById: inputsWithAgeGroups.patternsById,
        config: inputsWithAgeGroups.config,
        ageGroupByRoomLocationId: inputsWithAgeGroups.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: inputsWithAgeGroups.ageGroupByProgramCategoryId,
    });

    const { resolveCapacityBinding } = buildRoomConfigResolvers({
        agreements: inputsWithAgeGroups.agreements,
        placements: inputsWithAgeGroups.placements,
        config: inputsWithAgeGroups.config,
        ageGroupByRoomLocationId: inputsWithAgeGroups.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: inputsWithAgeGroups.ageGroupByProgramCategoryId,
    });

    // Index engine facts by room·date.
    const occByKey = new Map<string, number>();
    for (const o of expectations.expectedOccupancyByRoomDate) {
        occByKey.set(`${o.roomLocationId}|${o.date}`, o.childCount);
    }
    const staffByKey = new Map<string, { requiredStaff: number; exceedsDefinedTiers: boolean }>();
    for (const s of expectations.expectedStaffingByRoomDate) {
        staffByKey.set(`${s.roomLocationId}|${s.date}`, { requiredStaff: s.requiredStaff, exceedsDefinedTiers: s.exceedsDefinedTiers });
    }
    const capacityExceededKeys = new Set<string>();
    for (const w of expectations.warnings) {
        if (w.code === "capacity_exceeded" && w.roomLocationId && w.date) {
            capacityExceededKeys.add(`${w.roomLocationId}|${w.date}`);
        }
    }

    const roomFacts: RosterRoomFact[] = rooms.map((room) => {
        const capacities: number[] = [];
        const cells: RosterDayFact[] = days.map((day) => {
            const key = `${room.id}|${day.date}`;
            const occupancy = occByKey.get(key) ?? 0;
            const staff = staffByKey.get(key) ?? null;
            const capacity = resolveCapacityBinding(room.id, day.date);
            if (capacity != null) capacities.push(capacity);
            return {
                date: day.date,
                weekday: day.weekday,
                occupancy,
                capacity,
                requiredStaff: staff?.requiredStaff ?? null,
                capacityExceeded: capacityExceededKeys.has(key),
                ratioBreach: staff?.exceedsDefinedTiers ?? false,
            };
        });
        // Stable capacity across the week (the common case) → a single room-level label.
        const uniqueCaps = Array.from(new Set(capacities));
        const roomCapacity = uniqueCaps.length === 1 ? uniqueCaps[0] : uniqueCaps.length > 1 ? Math.max(...uniqueCaps) : null;
        return {
            roomId: room.id,
            roomName: room.name?.trim() || "Room",
            ageGroupCompat: room.ageGroupCompat ?? null,
            capacity: roomCapacity,
            ageBandLabel: ageBandLabel(room.metadata),
            cells,
        };
    });

    return { siteLocationId: input.siteLocationId, weekStart, weekEnd, days, todayYmd: input.todayYmd, rooms: roomFacts };
}
