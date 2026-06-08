import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import { fromZonedTime } from "date-fns-tz";
import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

export type OperationalAttentionCalmState = {
    headline: string;
    subline: string;
};

function readMetadata(row: Record<string, unknown>): Record<string, unknown> | null {
    const md = row.metadata;
    if (!md || typeof md !== "object" || Array.isArray(md)) return null;
    return md as Record<string, unknown>;
}

function resolveTourTimezone(md: Record<string, unknown> | null): string {
    const raw =
        (md && typeof md.tour_timezone === "string" ? md.tour_timezone.trim() : "") ||
        (md && typeof md.timezone === "string" ? md.timezone.trim() : "");
    return raw && isValidIanaTimeZone(raw) ? raw : UTC_FALLBACK_IANA;
}

/** True when metadata mirror points to a tour start still in the future. */
export function isFutureTourScheduledInMetadata(row: Record<string, unknown>, nowMs: number): boolean {
    const md = readMetadata(row);
    if (!md) return false;
    const tourDate = typeof md.tour_date === "string" ? md.tour_date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tourDate)) return false;

    const tourTime = typeof md.tour_time === "string" && md.tour_time.trim() ? md.tour_time.trim() : "12:00";
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(tourTime);
    const hh = timeMatch ? Number(timeMatch[1]) : 12;
    const mm = timeMatch ? Number(timeMatch[2]) : 0;
    const tz = resolveTourTimezone(md);

    const [y, mo, d] = tourDate.split("-").map(Number);
    const wall = new Date(Date.UTC(y, mo - 1, d, hh, mm, 0));
    const instantMs = fromZonedTime(wall, tz).getTime();
    return Number.isFinite(instantMs) && instantMs > nowMs;
}

/**
 * Positive/neutral copy when operational attention has cleared but the drawer should not look empty.
 */
export function resolveOperationalAttentionCalmState(
    row: Record<string, unknown>,
    payload: OpportunityAttentionResult,
    nowMs: number = Date.now()
): OperationalAttentionCalmState | null {
    if (payload.needs_attention && payload.primary_reason) return null;

    const status = String(row.status_key ?? "").trim();
    if (status === "tour_scheduled" && isFutureTourScheduledInMetadata(row, nowMs)) {
        return {
            headline: "No urgent follow-up needed",
            subline: "Tour is scheduled. Next step: prepare for the upcoming tour.",
        };
    }

    return {
        headline: "No urgent follow-up needed",
        subline: "No operational exceptions right now.",
    };
}
