import type { SupabaseClient } from "@supabase/supabase-js";

/** Enriched booking/job context for public action-link pages (hydrated from DB + link metadata snapshot). */
export type ActionLinkDisplayDetails = {
    start_at: string | null;
    end_at: string | null;
    timezone: string | null;
    service_label: string | null;
    job_title: string | null;
    job_description: string | null;
    visit_type: string | null;
    /** Single block suitable for "Location" */
    location_summary: string | null;
    /** Extra lines (house / property notes) */
    house_detail_lines: string[];
    price_display: string | null;
    schedule_id: string | null;
    job_id: string | null;
};

function formatUsdFromCents(cents: number | null | undefined): string | null {
    if (cents == null || Number.isNaN(cents)) return null;
    if (cents < 0) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function asRecord(v: unknown): Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function pickStr(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Readable lines from locations.metadata / jobs.metadata (best-effort). */
export function houseDetailsFromMetadata(meta: unknown): string[] {
    const m = asRecord(meta);
    const lines: string[] = [];
    const bed = m.bedrooms ?? m.bedroom_count ?? m.num_bedrooms;
    const bath = m.bathrooms ?? m.bathroom_count ?? m.num_bathrooms;
    const sqft = m.square_footage ?? m.sqft ?? m.square_feet;
    const pets = m.has_pets;
    if (bed != null && String(bed).trim()) lines.push(`${bed} bed${String(bed) === "1" ? "" : "s"}`);
    if (bath != null && String(bath).trim()) lines.push(`${bath} bath${String(bath) === "1" ? "" : "s"}`);
    if (sqft != null && String(sqft).trim()) lines.push(`${sqft} sq ft`);
    if (pets === true) lines.push("Pets in home");
    const notes = pickStr(m.access_notes ?? m.property_notes ?? m.cleaning_notes);
    if (notes) lines.push(notes);
    return lines;
}

function buildLocationSummary(loc: {
    label?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
} | null): string | null {
    if (!loc) return null;
    const line1 = [loc.address1, loc.address2].filter(Boolean).join(", ").trim();
    const cityState = [loc.city, loc.state].filter(Boolean).join(", ").trim();
    const tail = [cityState, loc.postal_code].filter(Boolean).join(" ").trim();
    const core = [line1, tail].filter(Boolean).join(" · ").trim();
    const labeled = loc.label?.trim();
    if (labeled && core) return `${labeled} — ${core}`;
    if (labeled) return labeled;
    return core || null;
}

function overlayFromLinkMetadata(
    base: ActionLinkDisplayDetails,
    md: Record<string, unknown>
): ActionLinkDisplayDetails {
    const out = { ...base };
    const s = (k: string) => pickStr(md[k]);
    if (!out.start_at && s("start_at")) out.start_at = s("start_at");
    if (!out.end_at && s("end_at")) out.end_at = s("end_at");
    if (!out.timezone && s("timezone")) out.timezone = s("timezone");
    if (!out.service_label && s("service_label")) out.service_label = s("service_label");
    if (!out.job_title && s("job_title")) out.job_title = s("job_title");
    if (!out.visit_type && s("visit_type")) out.visit_type = s("visit_type");
    if (!out.location_summary && s("address")) {
        const addr = s("address");
        const city = s("city");
        const state = s("state");
        const zip = s("postal_code") ?? s("zip");
        const cityLine = [city, state].filter(Boolean).join(", ");
        const tail = [cityLine, zip].filter(Boolean).join(" ").trim();
        out.location_summary = [addr, tail].filter(Boolean).join(tail ? ", " : "").trim() || addr;
    }
    if (!out.price_display && md.price_cents != null) {
        const n = Number(md.price_cents);
        if (!Number.isNaN(n)) out.price_display = formatUsdFromCents(n);
    }
    return out;
}

export async function hydrateActionLinkDisplay(
    supabase: SupabaseClient,
    params: { entity_type: string; entity_id: string; link_metadata: unknown }
): Promise<ActionLinkDisplayDetails> {
    const md = asRecord(params.link_metadata);
    let details: ActionLinkDisplayDetails = {
        start_at: pickStr(md.start_at),
        end_at: pickStr(md.end_at),
        timezone: pickStr(md.timezone),
        service_label: pickStr(md.service_label),
        job_title: pickStr(md.job_title),
        job_description: pickStr(md.job_description ?? md.description),
        visit_type: pickStr(md.visit_type),
        location_summary: null,
        house_detail_lines: [],
        price_display:
            md.price_cents != null && !Number.isNaN(Number(md.price_cents))
                ? formatUsdFromCents(Number(md.price_cents))
                : pickStr(md.price_display),
        schedule_id: null,
        job_id: null,
    };

    try {
        if (params.entity_type === "schedule") {
            const { data: sch } = await supabase
                .from("schedules")
                .select(
                    "id, job_id, location_id, start_at, end_at, timezone, visit_type, price_cents, metadata"
                )
                .eq("id", params.entity_id)
                .maybeSingle();

            if (sch) {
                const s = sch as {
                    id: string;
                    job_id: string;
                    location_id?: string | null;
                    start_at?: string | null;
                    end_at?: string | null;
                    timezone?: string | null;
                    visit_type?: string | null;
                    price_cents?: number | null;
                    metadata?: unknown;
                };
                details.schedule_id = s.id;
                details.job_id = s.job_id;
                if (s.start_at) details.start_at = s.start_at;
                if (s.end_at) details.end_at = s.end_at;
                if (s.timezone) details.timezone = s.timezone;
                if (s.visit_type) details.visit_type = s.visit_type;
                if (s.price_cents != null) details.price_display = formatUsdFromCents(s.price_cents);

                const { data: job } = await supabase
                    .from("jobs")
                    .select(
                        "id, title, description, estimated_total_cents, gross_price_cents, service_key, service_frequency_key, location_id, metadata"
                    )
                    .eq("id", s.job_id)
                    .maybeSingle();

                if (job) {
                    const j = job as {
                        id: string;
                        title?: string | null;
                        description?: string | null;
                        estimated_total_cents?: number | null;
                        gross_price_cents?: number | null;
                        service_key?: string | null;
                        service_frequency_key?: string | null;
                        location_id?: string | null;
                        metadata?: unknown;
                    };
                    details.job_id = j.id;
                    if (!details.job_title && j.title) details.job_title = j.title;
                    if (!details.job_description && j.description) details.job_description = j.description;
                    if (!details.service_label && j.service_key) details.service_label = j.service_key.replace(/_/g, " ");
                    if (!details.price_display) {
                        details.price_display =
                            formatUsdFromCents(j.gross_price_cents) ??
                            formatUsdFromCents(j.estimated_total_cents);
                    }
                    const locId = s.location_id ?? j.location_id;
                    if (locId) {
                        const { data: loc } = await supabase
                            .from("locations")
                            .select("label, address1, address2, city, state, postal_code, metadata")
                            .eq("id", locId)
                            .maybeSingle();
                        if (loc) {
                            details.location_summary = buildLocationSummary(loc as Record<string, string | null>);
                            const hl = houseDetailsFromMetadata(
                                (loc as { metadata?: unknown }).metadata
                            );
                            if (hl.length) details.house_detail_lines = hl;
                        }
                    }
                    const jobHouse = houseDetailsFromMetadata(j.metadata);
                    if (jobHouse.length && !details.house_detail_lines.length) details.house_detail_lines = jobHouse;
                }
                const schHouse = houseDetailsFromMetadata(s.metadata);
                if (schHouse.length && !details.house_detail_lines.length) details.house_detail_lines = schHouse;
            }
        } else if (params.entity_type === "job") {
            const { data: job } = await supabase
                .from("jobs")
                .select(
                    "id, title, description, estimated_total_cents, gross_price_cents, service_key, service_frequency_key, location_id, metadata"
                )
                .eq("id", params.entity_id)
                .maybeSingle();

            if (job) {
                const j = job as {
                    id: string;
                    title?: string | null;
                    description?: string | null;
                    estimated_total_cents?: number | null;
                    gross_price_cents?: number | null;
                    service_key?: string | null;
                    service_frequency_key?: string | null;
                    location_id?: string | null;
                    metadata?: unknown;
                };
                details.job_id = j.id;
                if (j.title) details.job_title = j.title;
                if (j.description) details.job_description = j.description;
                if (j.service_key) details.service_label = j.service_key.replace(/_/g, " ");
                details.price_display =
                    formatUsdFromCents(j.gross_price_cents) ?? formatUsdFromCents(j.estimated_total_cents);

                const { data: schedules } = await supabase
                    .from("schedules")
                    .select("id, start_at, end_at, timezone, visit_type, price_cents, location_id, metadata")
                    .eq("job_id", j.id)
                    .order("start_at", { ascending: true });

                const list = (schedules ?? []) as Array<{
                    id: string;
                    start_at?: string | null;
                    end_at?: string | null;
                    timezone?: string | null;
                    visit_type?: string | null;
                    price_cents?: number | null;
                    location_id?: string | null;
                    metadata?: unknown;
                }>;

                const now = Date.now();
                const upcoming = list.find((row) => row.start_at && new Date(row.start_at).getTime() >= now);
                const sch = upcoming ?? list[0];

                if (sch) {
                    details.schedule_id = sch.id;
                    if (sch.start_at) details.start_at = sch.start_at;
                    if (sch.end_at) details.end_at = sch.end_at;
                    if (sch.timezone) details.timezone = sch.timezone;
                    if (sch.visit_type) details.visit_type = sch.visit_type;
                    if (sch.price_cents != null) {
                        const pc = formatUsdFromCents(sch.price_cents);
                        if (pc) details.price_display = pc;
                    }
                    const locId = sch.location_id ?? j.location_id;
                    if (locId) {
                        const { data: loc } = await supabase
                            .from("locations")
                            .select("label, address1, address2, city, state, postal_code, metadata")
                            .eq("id", locId)
                            .maybeSingle();
                        if (loc) {
                            details.location_summary = buildLocationSummary(loc as Record<string, string | null>);
                            const hl = houseDetailsFromMetadata(
                                (loc as { metadata?: unknown }).metadata
                            );
                            if (hl.length) details.house_detail_lines = hl;
                        }
                    }
                    const schHouse = houseDetailsFromMetadata(sch.metadata);
                    if (schHouse.length && !details.house_detail_lines.length) details.house_detail_lines = schHouse;
                } else if (j.location_id) {
                    const { data: loc } = await supabase
                        .from("locations")
                        .select("label, address1, address2, city, state, postal_code, metadata")
                        .eq("id", j.location_id)
                        .maybeSingle();
                    if (loc) {
                        details.location_summary = buildLocationSummary(loc as Record<string, string | null>);
                        details.house_detail_lines = houseDetailsFromMetadata(
                            (loc as { metadata?: unknown }).metadata
                        );
                    }
                }

                const jobHouse = houseDetailsFromMetadata(j.metadata);
                if (jobHouse.length && !details.house_detail_lines.length) details.house_detail_lines = jobHouse;
            }
        }
    } catch (e) {
        console.error("[actionLinkDisplayDetails] hydrate failed", e);
    }

    details = overlayFromLinkMetadata(details, md);
    return details;
}
