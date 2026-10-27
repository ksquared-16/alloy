/**
 * What an entry WOULD change, before it is saved: which locations, which dates,
 * and what their operating hours become. Writes nothing.
 *
 * The preview resolves the calendar twice per affected site — as it stands, and
 * with the prepared act added as an unwritten row — through the same resolver
 * every consumer uses. What it reports is therefore what the commit will do.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpectationQueryRow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { loadSiteOperatingCalendar } from "@/lib/operatingCalendar/operatingCalendarServer";
import type { MinuteInterval, ResolvedCalendarDay } from "@/lib/operatingCalendar/resolveOperatingCalendar";
import { localDateOf } from "@/lib/operatingCalendar/operatingCalendarTime";
import { hypotheticalRowFor, type PreparedCalendarAct } from "@/lib/operatingCalendar/operatingCalendarAuthoring";

/** An organization entry previews at most this many sites; the rest are counted. */
export const IMPACT_PREVIEW_SITE_LIMIT = 50;

export type DayState = {
    status: ResolvedCalendarDay["status"];
    openIntervals: MinuteInterval[] | null;
};

export type DateImpact = {
    siteId: string;
    siteLabel: string;
    timezone: string;
    date: string;
    before: DayState;
    after: DayState;
    conflicts: string[];
};

export type CalendarImpactPreview = {
    sites: Array<{ siteId: string; siteLabel: string }>;
    sitesNotPreviewed: number;
    dates: DateImpact[];
    /** The date span the preview compared. */
    fromDate: string;
    toDate: string;
};

function sameState(a: DayState, b: DayState): boolean {
    if (a.status !== b.status) return false;
    const x = a.openIntervals;
    const y = b.openIntervals;
    if (x == null || y == null) return x === y;
    return x.length === y.length && x.every((iv, i) => iv.start === y[i]!.start && iv.end === y[i]!.end);
}

/** The sites an act reaches: its own site, or every active site for an organization entry. */
export async function sitesReachedBy(
    supabase: SupabaseClient,
    orgId: string,
    prepared: PreparedCalendarAct,
): Promise<Array<{ siteId: string; siteLabel: string }>> {
    let q = supabase
        .from("locations")
        .select("id, label")
        .eq("org_id", orgId)
        .eq("location_type", "site")
        .is("archived_at", null)
        .order("label", { ascending: true });
    if (prepared.draft.scope === "location") q = q.eq("id", String(prepared.siteId));
    const { data, error } = await q;
    if (error) throw new Error(`operating calendar preview: sites read failed: ${error.message}`);
    return ((data ?? []) as Array<{ id: string; label: string | null }>).map((r) => ({
        siteId: r.id,
        siteLabel: r.label ?? "Location",
    }));
}

/** The dates a prepared act can change: its frame, and the dates it covered before. */
export function impactDateSpan(prepared: PreparedCalendarAct): { fromDate: string; toDate: string } {
    const frameFrom = localDateOf(new Date(prepared.input.temporalFrame.validFrom), prepared.timezone);
    const candidatesFrom = [frameFrom, prepared.draft.fromDate, prepared.priorFromDate].filter(Boolean) as string[];
    const candidatesTo = [prepared.draft.toDate, prepared.priorToDate].filter(Boolean) as string[];
    return { fromDate: candidatesFrom.sort()[0]!, toDate: candidatesTo.sort().reverse()[0]! };
}

export async function previewCalendarDates(
    supabase: SupabaseClient,
    params: { orgId: string; prepared: PreparedCalendarAct },
): Promise<CalendarImpactPreview & { hypotheticalRow: ExpectationQueryRow }> {
    const { orgId, prepared } = params;
    const allSites = await sitesReachedBy(supabase, orgId, prepared);
    const sites = allSites.slice(0, IMPACT_PREVIEW_SITE_LIMIT);
    const span = impactDateSpan(prepared);
    const hypotheticalRow = hypotheticalRowFor(prepared, orgId);

    const dates: DateImpact[] = [];
    for (const site of sites) {
        const before = await loadSiteOperatingCalendar(supabase, { orgId, locationId: site.siteId, ...span });
        const after = await loadSiteOperatingCalendar(supabase, {
            orgId,
            locationId: site.siteId,
            ...span,
            hypotheticalRows: [hypotheticalRow],
        });
        for (const [date, a] of after.days) {
            const b = before.days.get(date);
            if (!b) continue;
            const bs = { status: b.status, openIntervals: b.openIntervals };
            const as = { status: a.status, openIntervals: a.openIntervals };
            if (sameState(bs, as) && a.conflicts.length === b.conflicts.length) continue;
            dates.push({
                siteId: site.siteId,
                siteLabel: site.siteLabel,
                timezone: after.timezone,
                date,
                before: bs,
                after: as,
                conflicts: a.conflicts,
            });
        }
    }
    return {
        sites,
        sitesNotPreviewed: Math.max(0, allSites.length - sites.length),
        dates,
        fromDate: span.fromDate,
        toDate: span.toDate,
        hypotheticalRow,
    };
}
