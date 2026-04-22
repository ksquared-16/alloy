import type { SupabaseClient } from "@supabase/supabase-js";

/** Raw opportunity columns used for CRM-style workspace queue projection (not a new config system). */
export type OpportunityRowCrmSource = {
    id: string;
    primary_person_id?: string | null;
    location_id?: string | null;
    job_date?: string | null;
    job_time_window?: string | null;
    customer_notes?: string | null;
    metadata?: unknown;
};

export type OpportunityCrmProjection = {
    _primary_email?: string | null;
    _primary_phone?: string | null;
    /** Single line for row chrome: name · email · phone (sparse parts omitted). */
    _primary_contact_line?: string | null;
    _room_label?: string | null;
    _tour_timing?: string | null;
    _notes_preview?: string | null;
    _requested_program?: string | null;
    _age_band?: string | null;
    _child_display_name?: string | null;
};

function sliceNote(s: string | null | undefined, max: number): string | null {
    const t = (s ?? "").trim().replace(/\s+/g, " ");
    if (!t) return null;
    return t.length > max ? `${t.slice(0, max)}…` : t;
}

function formatTourTiming(
    jobDate: string | null | undefined,
    jobTime: string | null | undefined,
    metadataTourIso: string | null | undefined
): string | null {
    const tourIso = (metadataTourIso ?? "").trim();
    if (tourIso) {
        const d = Date.parse(tourIso);
        if (Number.isFinite(d)) {
            return new Intl.DateTimeFormat(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
            }).format(d);
        }
    }
    const jdRaw = (jobDate ?? "").trim();
    if (jdRaw) {
        const jd = Date.parse(jdRaw);
        const dateStr = Number.isFinite(jd)
            ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(jd)
            : jdRaw;
        const tw = (jobTime ?? "").trim();
        return tw ? `${dateStr} · ${tw}` : dateStr;
    }
    return null;
}

/**
 * Batch-loads person + location labels for opportunity queue rows (workspace only).
 */
export async function enrichOpportunityRowsWithCrmProjection(
    supabase: SupabaseClient,
    orgId: string,
    rows: OpportunityRowCrmSource[]
): Promise<Map<string, OpportunityCrmProjection>> {
    const out = new Map<string, OpportunityCrmProjection>();
    const personIds = [...new Set(rows.map((r) => r.primary_person_id).filter(Boolean))] as string[];
    const locationIds = [...new Set(rows.map((r) => r.location_id).filter(Boolean))] as string[];

    const personById = new Map<
        string,
        { email: string | null; phone: string | null; first_name: string | null; last_name: string | null }
    >();
    if (personIds.length) {
        const { data } = await supabase
            .from("persons")
            .select("id, email, phone, first_name, last_name")
            .eq("org_id", orgId)
            .in("id", personIds);
        for (const p of data ?? []) {
            const row = p as {
                id: string;
                email: string | null;
                phone: string | null;
                first_name: string | null;
                last_name: string | null;
            };
            personById.set(row.id, {
                email: row.email,
                phone: row.phone,
                first_name: row.first_name,
                last_name: row.last_name,
            });
        }
    }

    const locationById = new Map<string, string | null>();
    if (locationIds.length) {
        const { data } = await supabase.from("locations").select("id, label").eq("org_id", orgId).in("id", locationIds);
        for (const loc of data ?? []) {
            const row = loc as { id: string; label: string | null };
            locationById.set(row.id, row.label ?? null);
        }
    }

    for (const r of rows) {
        const e: OpportunityCrmProjection = {};
        const meta =
            r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {};
        const program = typeof meta.demo_requested_program === "string" ? meta.demo_requested_program.trim() : "";
        const ageBand = typeof meta.demo_age_band === "string" ? meta.demo_age_band.trim() : "";
        const tourIso = typeof meta.demo_tour_starts_at === "string" ? meta.demo_tour_starts_at.trim() : "";
        const childName = typeof meta.demo_child_name === "string" ? meta.demo_child_name.trim() : "";

        if (program) e._requested_program = program;
        if (ageBand) e._age_band = ageBand;
        if (childName) e._child_display_name = childName;

        const person = r.primary_person_id ? personById.get(r.primary_person_id) : undefined;
        if (person) {
            e._primary_email = person.email?.trim() || null;
            e._primary_phone = person.phone?.trim() || null;
            const nm = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
            const parts = [nm || null, e._primary_email, e._primary_phone].filter(Boolean) as string[];
            e._primary_contact_line = parts.length ? parts.join(" · ") : null;
        }

        if (r.location_id) {
            e._room_label = locationById.get(r.location_id) ?? null;
        }

        const tour = formatTourTiming(r.job_date, r.job_time_window, tourIso || undefined);
        if (tour) e._tour_timing = tour;

        const np = sliceNote(r.customer_notes, 80);
        if (np) e._notes_preview = np;

        out.set(r.id, e);
    }

    return out;
}
