import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSON_CANONICAL_IDENTITY_SELECT } from "@/lib/fields/canonicalEntitySelectColumns";

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

function formatBedBathDisplay(v: unknown): string | null {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) {
        return v % 1 === 0 ? String(Math.round(v)) : String(v);
    }
    const s = String(v).trim();
    return s || null;
}

function humanizeStableKey(key: unknown): string | null {
    if (key == null || String(key).trim() === "") return null;
    return String(key).replace(/_/g, " ");
}

/**
 * Canonical location row fields (beds, baths, *_key, access columns).
 * Prefer this over metadata-only snapshots for action links and summaries.
 */
export function houseDetailLinesFromLocationRow(loc: Record<string, unknown>): string[] {
    const lines: string[] = [];
    const bed = formatBedBathDisplay(loc.beds);
    const bath = formatBedBathDisplay(loc.baths);
    if (bed) lines.push(`${bed} bed${bed === "1" ? "" : "s"}`);
    if (bath) lines.push(`${bath} bath${bath === "1" ? "" : "s"}`);
    const hk = humanizeStableKey(loc.home_type_key);
    if (hk) lines.push(hk);
    const sq = humanizeStableKey(loc.square_footage_tier_key);
    if (sq) lines.push(`Sq ft tier: ${sq}`);
    const am = humanizeStableKey(loc.access_method_key);
    if (am) lines.push(`Access: ${am}`);
    const code = pickStr(loc.access_code);
    if (code) lines.push(`Code: ${code}`);
    const an = pickStr(loc.access_notes);
    if (an) lines.push(an);
    if (loc.has_pets === true) lines.push("Pets in home");
    return lines;
}

/** Readable lines from locations.metadata / jobs.metadata (best-effort legacy). */
export function houseDetailsFromMetadata(meta: unknown): string[] {
    const m = asRecord(meta);
    const lines: string[] = [];
    const bed = m.beds ?? m.bedrooms ?? m.bedroom_count ?? m.num_bedrooms;
    const bath = m.baths ?? m.bathrooms ?? m.bathroom_count ?? m.num_bathrooms;
    if (bed != null && String(bed).trim()) lines.push(`${bed} bed${String(bed) === "1" ? "" : "s"}`);
    if (bath != null && String(bath).trim()) lines.push(`${bath} bath${String(bath) === "1" ? "" : "s"}`);
    const tierK = m.square_footage_tier_key ?? m.square_footage_tier;
    if (tierK != null && String(tierK).trim()) {
        const h = humanizeStableKey(tierK);
        if (h) lines.push(`Sq ft tier: ${h}`);
    }
    const sqftLabel = m.square_footage ?? m.sqft ?? m.square_feet;
    if (sqftLabel != null && String(sqftLabel).trim() && (tierK == null || String(tierK).trim() === "")) {
        lines.push(`${sqftLabel} sq ft`);
    }
    const pets = m.has_pets;
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

function uuidish(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Location columns for customer/vendor-facing summaries (canonical + legacy metadata fallback). */
const ACTION_LINK_LOCATION_SELECT =
    "label, address1, address2, city, state, postal_code, metadata, beds, baths, home_type_key, square_footage_tier_key, access_method_key, access_code, access_notes, has_pets";

/**
 * Same schedule + location resolution as the vendor-accept action-link UI (`hydrateActionLinkDisplay` job branch):
 * upcoming `start_at` if any, else earliest row; location from `schedule.location_id` then `job.location_id`.
 */
export async function loadJobScheduleAndLocationForActionLink(
    supabase: SupabaseClient,
    jobId: string
): Promise<{
    job: Record<string, unknown> | null;
    schedule: Record<string, unknown> | null;
    location: Record<string, unknown> | null;
}> {
    const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
    if (!job) {
        return { job: null, schedule: null, location: null };
    }
    const j = job as Record<string, unknown> & { id: string; location_id?: string | null };

    const { data: schedules } = await supabase
        .from("schedules")
        .select("*")
        .eq("job_id", j.id)
        .order("start_at", { ascending: true });

    const list = (schedules ?? []) as Array<Record<string, unknown> & { start_at?: string | null }>;
    const now = Date.now();
    const upcoming = list.find((row) => row.start_at && new Date(String(row.start_at)).getTime() >= now);
    const sch = (upcoming ?? list[0] ?? null) as Record<string, unknown> | null;

    const locId =
        (sch?.location_id != null ? String(sch.location_id).trim() : "") ||
        (j.location_id != null ? String(j.location_id).trim() : "") ||
        "";

    let location: Record<string, unknown> | null = null;
    if (locId) {
        const { data: loc } = await supabase
            .from("locations")
            .select(ACTION_LINK_LOCATION_SELECT)
            .eq("id", locId)
            .maybeSingle();
        location = (loc as Record<string, unknown>) ?? null;
    }

    return { job: j as Record<string, unknown>, schedule: sch, location };
}

/**
 * Resolve the customer-facing person for workflow templates (`person.phone`, `person.first_name`).
 * Order: job.primary_person_id → job.primary_contact.person → customer.primary_contact.person →
 * customer_persons (primary / primary_contact) → person-shaped fields from job/customer primary contact (non-vendor contacts only).
 */
export async function loadBookingPersonForJobWorkflow(
    supabase: SupabaseClient,
    job: Record<string, unknown>,
    customerId: string | null
): Promise<Record<string, unknown> | null> {
    const fetchPersonById = async (personId: string) => {
        const { data } = await supabase.from("persons").select(PERSON_CANONICAL_IDENTITY_SELECT).eq("id", personId).maybeSingle();
        return (data as Record<string, unknown>) ?? null;
    };

    const tryContactPerson = async (contactUuid: string) => {
        const { data: c } = await supabase.from("contacts").select("*").eq("id", contactUuid).maybeSingle();
        const cRow = c as Record<string, unknown> | null;
        if (!cRow) return null;
        const pp = uuidish(cRow.person_id);
        if (pp) {
            const p = await fetchPersonById(pp);
            if (p) return p;
        }
        return null;
    };

    const ppJob = uuidish(job.primary_person_id);
    if (ppJob) {
        const p = await fetchPersonById(ppJob);
        if (p) return p;
    }

    const jobContactId = uuidish(job.primary_contact_id);
    if (jobContactId) {
        const p = await tryContactPerson(jobContactId);
        if (p) return p;
    }

    let customerPrimaryContactId: string | null = null;
    if (customerId) {
        const { data: cust } = await supabase
            .from("customers")
            .select("primary_contact_id")
            .eq("id", customerId)
            .maybeSingle();
        customerPrimaryContactId = uuidish((cust as { primary_contact_id?: string | null } | null)?.primary_contact_id);
        if (customerPrimaryContactId && customerPrimaryContactId !== jobContactId) {
            const p = await tryContactPerson(customerPrimaryContactId);
            if (p) return p;
        }

        const { data: cpRows } = await supabase
            .from("customer_persons")
            .select("person_id, is_primary, role_type")
            .eq("customer_id", customerId);

        const rows = (cpRows ?? []) as { person_id?: string; is_primary?: boolean; role_type?: string }[];
        const sorted = rows.slice().sort((a, b) => {
            if (Boolean(b.is_primary) !== Boolean(a.is_primary)) return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
            const aPc = String(a.role_type ?? "") === "primary_contact" ? 1 : 0;
            const bPc = String(b.role_type ?? "") === "primary_contact" ? 1 : 0;
            return bPc - aPc;
        });
        for (const row of sorted) {
            const pId = uuidish(row.person_id);
            if (!pId) continue;
            const p = await fetchPersonById(pId);
            if (p) return p;
        }
    }

    if (jobContactId) {
        const { data: c } = await supabase.from("contacts").select("*").eq("id", jobContactId).maybeSingle();
        const syn = personShapedFromCustomerContact(c as Record<string, unknown> | null);
        if (syn) return syn;
    }
    if (customerPrimaryContactId && customerPrimaryContactId !== jobContactId) {
        const { data: c } = await supabase
            .from("contacts")
            .select("*")
            .eq("id", customerPrimaryContactId)
            .maybeSingle();
        const syn = personShapedFromCustomerContact(c as Record<string, unknown> | null);
        if (syn) return syn;
    }

    return null;
}

function personShapedFromCustomerContact(c: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!c) return null;
    if (c.vendor_id != null && String(c.vendor_id).trim() !== "") return null;
    const phone = String(c.phone ?? "").trim();
    const fn = String(c.first_name ?? "").trim();
    if (!phone && !fn) return null;
    return {
        id: uuidish(c.person_id),
        first_name: c.first_name ?? null,
        last_name: c.last_name ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
    };
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
                            .select(ACTION_LINK_LOCATION_SELECT)
                            .eq("id", locId)
                            .maybeSingle();
                        if (loc) {
                            const locRec = loc as Record<string, unknown>;
                            details.location_summary = buildLocationSummary(loc as Record<string, string | null>);
                            const fromRow = houseDetailLinesFromLocationRow(locRec);
                            const fromMeta = houseDetailsFromMetadata(locRec.metadata);
                            details.house_detail_lines =
                                fromRow.length > 0 ? fromRow : fromMeta.length > 0 ? fromMeta : [];
                        }
                    }
                    const jobHouse = houseDetailsFromMetadata(j.metadata);
                    if (jobHouse.length && !details.house_detail_lines.length) details.house_detail_lines = jobHouse;
                }
                const schHouse = houseDetailsFromMetadata(s.metadata);
                if (schHouse.length && !details.house_detail_lines.length) details.house_detail_lines = schHouse;
            }
        } else if (params.entity_type === "job") {
            const ctx = await loadJobScheduleAndLocationForActionLink(supabase, params.entity_id);
            if (ctx.job) {
                const j = ctx.job as {
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

                const sch = ctx.schedule as {
                    id?: string;
                    start_at?: string | null;
                    end_at?: string | null;
                    timezone?: string | null;
                    visit_type?: string | null;
                    price_cents?: number | null;
                    metadata?: unknown;
                } | null;

                if (sch && sch.id) {
                    details.schedule_id = sch.id;
                    if (sch.start_at) details.start_at = sch.start_at;
                    if (sch.end_at) details.end_at = sch.end_at;
                    if (sch.timezone) details.timezone = sch.timezone;
                    if (sch.visit_type) details.visit_type = sch.visit_type;
                    if (sch.price_cents != null) {
                        const pc = formatUsdFromCents(sch.price_cents);
                        if (pc) details.price_display = pc;
                    }
                }

                if (ctx.location) {
                    const locRec = ctx.location as Record<string, unknown>;
                    details.location_summary = buildLocationSummary(ctx.location as Record<string, string | null>);
                    const fromRow = houseDetailLinesFromLocationRow(locRec);
                    const fromMeta = houseDetailsFromMetadata(locRec.metadata);
                    details.house_detail_lines =
                        fromRow.length > 0 ? fromRow : fromMeta.length > 0 ? fromMeta : [];
                }

                if (sch) {
                    const schHouse = houseDetailsFromMetadata(sch.metadata);
                    if (schHouse.length && !details.house_detail_lines.length) details.house_detail_lines = schHouse;
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
