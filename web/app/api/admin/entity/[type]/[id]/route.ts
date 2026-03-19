import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { formatRecurrenceLabel } from "@/lib/adminFormatters";
import { displayFromFieldValueRow } from "@/lib/admin/typedFieldValues";

const ENTITY_TYPES = ["jobs", "opportunities", "contacts", "customers", "customer_members", "persons", "schedules", "discount_redemptions", "workflows", "vendors", "subscriptions", "locations", "payments", "service_offerings", "service_plan_templates", "addons"] as const;

const DRAWER_TYPE_TO_FIELD_ENTITY_TYPE: Record<string, string> = {
    customers: "customer",
    jobs: "job",
    opportunities: "opportunity",
    vendors: "vendor",
    schedules: "schedule",
    persons: "person",
    locations: "location",
};

type ContactRow = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; person_id?: string | null };

async function attachFieldDefinitionsAndValues(
    supabase: ReturnType<typeof createAdminClient>,
    out: Record<string, unknown>,
    drawerType: string,
    entityId: string
): Promise<void> {
    const entityType = DRAWER_TYPE_TO_FIELD_ENTITY_TYPE[drawerType];
    if (!entityType) return;
    let orgId: string | null = (out.org_id as string) ?? null;
    if (!orgId && drawerType === "schedules" && out._job) {
        orgId = (out._job as { org_id?: string }).org_id ?? null;
    }
    if (!orgId) return;
    const { data: defRows } = await supabase
        .from("field_definitions")
        .select("id, field_key, field_type, label, section_key, sort_order, is_system, is_visible_in_drawer")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .order("section_key", { ascending: true })
        .order("sort_order", { ascending: true });
    const fieldDefs = (defRows ?? []) as { id: string; field_key: string; field_type: string; label: string | null; section_key: string | null; sort_order: number; is_system: boolean; is_visible_in_drawer: boolean }[];
    out._field_definitions = fieldDefs;
    if (fieldDefs.length === 0) return;
    const defIds = fieldDefs.map((d) => d.id);
    const { data: fvRows } = await supabase
        .from("field_values")
        .select(
            "field_definition_id, value_text, value_number, value_boolean, value_date, value_json"
        )
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .in("field_definition_id", defIds);
    type FvRow = {
        field_definition_id: string;
        value_text?: string | null;
        value_number?: number | null;
        value_boolean?: boolean | null;
        value_date?: string | null;
        value_json?: unknown;
    };
    const rowByDefId = new Map(
        ((fvRows ?? []) as FvRow[]).map((r) => [r.field_definition_id, r] as const)
    );
    for (const d of fieldDefs) {
        if (!d.is_system) {
            const row = rowByDefId.get(d.id);
            (out as Record<string, unknown>)[d.field_key] = displayFromFieldValueRow(d.field_type, row ?? null);
        }
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    const { type, id } = await params;
    if (!id || !ENTITY_TYPES.includes(type as (typeof ENTITY_TYPES)[number])) {
        return NextResponse.json({ error: "Invalid type or id" }, { status: 400 });
    }

    try {
        const supabase = createAdminClient();

        if (type === "jobs") {
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data, error } = await supabase.from("jobs").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const out: Record<string, unknown> = { ...data };
            if ((data as { opportunity_id?: string }).opportunity_id) {
                const opp = await supabase.from("opportunities").select("name").eq("id", (data as { opportunity_id: string }).opportunity_id).single();
                out._opportunity_name = opp.data?.name ?? null;
            } else {
                out._opportunity_name = null;
            }
            const jobPrimaryPersonId = (data as { primary_person_id?: string | null }).primary_person_id;
            const jobPrimaryContactId = (data as { primary_contact_id?: string }).primary_contact_id;
            if (jobPrimaryPersonId) {
                const { data: person } = await supabase.from("persons").select("id, first_name, last_name").eq("id", jobPrimaryPersonId).maybeSingle();
                const p = person as { id: string; first_name?: string | null; last_name?: string | null } | null;
                out._primary_person_id = p?.id ?? null;
                out._primary_person_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null : null;
                out._contact_name = out._primary_person_name;
            } else if (jobPrimaryContactId) {
                const contact = await supabase.from("contacts").select("first_name, last_name, person_id").eq("id", jobPrimaryContactId).single();
                const c = contact.data as { first_name?: string | null; last_name?: string | null; person_id?: string | null } | null;
                out._contact_name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null : null;
                if (c?.person_id) {
                    const { data: person } = await supabase.from("persons").select("id, first_name, last_name").eq("id", c.person_id).maybeSingle();
                    const p = person as { id: string; first_name?: string | null; last_name?: string | null } | null;
                    out._primary_person_id = p?.id ?? null;
                    out._primary_person_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null : null;
                } else {
                    out._primary_person_id = null;
                    out._primary_person_name = null;
                }
            } else {
                out._contact_name = null;
                out._primary_person_id = null;
                out._primary_person_name = null;
            }
            if ((data as { customer_id?: string }).customer_id) {
                const customer = await supabase.from("customers").select("name").eq("id", (data as { customer_id: string }).customer_id).single();
                out._customer_name = customer.data?.name ?? null;
            } else {
                out._customer_name = null;
            }
            const assignedVendorId = (data as { assigned_vendor_id?: string | null }).assigned_vendor_id;
            if (assignedVendorId) {
                const { data: vendor } = await supabase.from("vendors").select("id, name").eq("id", assignedVendorId).single();
                out._assigned_vendor = vendor ?? null;
                out._vendor_name = (vendor as { name?: string | null } | null)?.name ?? null;
            } else {
                out._assigned_vendor = null;
                out._vendor_name = null;
            }
            const jobLocationId = (data as { location_id?: string | null }).location_id;
            if (jobLocationId) {
                const { data: loc } = await supabase.from("locations").select("id, label, address1, city, state, postal_code").eq("id", jobLocationId).maybeSingle();
                if (loc) {
                    const l = loc as { label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null };
                    const label = l.label ?? ([l.address1, l.city, l.postal_code].filter(Boolean).join(", ") || null);
                    out._location_label = label;
                    out._location_name = label;
                    out._location = loc;
                } else {
                    out._location_label = null;
                    out._location_name = null;
                    out._location = null;
                }
            } else {
                out._location_label = null;
                out._location_name = null;
                out._location = null;
            }
            const verticalId = (data as { vertical_id?: string | null }).vertical_id;
            if (verticalId) {
                const { data: vert } = await supabase.from("verticals").select("slug").eq("id", verticalId).maybeSingle();
                out._vertical_slug = (vert as { slug?: string | null } | null)?.slug ?? null;
            } else {
                out._vertical_slug = null;
            }
            const jobStatusId = (data as { job_status_id?: string | null }).job_status_id;
            const statusKey = (data as { status_key?: string | null }).status_key;
            if (statusKey) {
                out._status_display = statusKey;
            } else if (jobStatusId) {
                const { data: js } = await supabase.from("job_statuses").select("status_key, label").eq("id", jobStatusId).maybeSingle();
                out._status_display = (js as { status_key?: string | null; label?: string | null } | null)?.status_key ?? (js as { label?: string | null } | null)?.label ?? null;
            } else {
                out._status_display = null;
            }
            const gross = (data as { gross_price_cents?: number | null }).gross_price_cents;
            const estimated = (data as { estimated_total_cents?: number | null }).estimated_total_cents;
            out._price_display = gross != null ? gross / 100 : estimated != null ? estimated / 100 : null;
            const { data: nextSched } = await supabase
                .from("schedules")
                .select("start_at")
                .eq("job_id", id)
                .is("canceled_at", null)
                .gte("start_at", new Date().toISOString())
                .order("start_at", { ascending: true })
                .limit(1)
                .maybeSingle();
            out._next_schedule = (nextSched as { start_at?: string } | null)?.start_at ?? null;
            await attachFieldDefinitionsAndValues(supabase, out, "jobs", id);
            return NextResponse.json(out);
        }
        if (type === "opportunities") {
            const { data, error } = await supabase.from("opportunities").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const opp = data as Record<string, unknown> & { status_key?: string | null; status?: string | null; customer_id?: string | null; primary_contact_id?: string | null; primary_person_id?: string | null; location_id?: string | null; quote_total?: number | null; estimated_price_cents?: number | null; monetary_value_cents?: number | null };
            const out: Record<string, unknown> = { ...data };
            out._status_display = opp.status_key ?? opp.status ?? null;
            if (opp.customer_id) {
                const customer = await supabase.from("customers").select("name").eq("id", opp.customer_id).single();
                out._customer_name = customer.data?.name ?? null;
            } else {
                out._customer_name = null;
            }
            // Prefer primary_person_id for display; fallback to contact
            const personDisplayName = (p: { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null) =>
                p ? ((p.full_name && p.full_name.trim()) || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null) : null;
            if (opp.primary_person_id) {
                const { data: person } = await supabase.from("persons").select("id, first_name, last_name, full_name").eq("id", opp.primary_person_id).maybeSingle();
                const p = person as { id: string; first_name?: string | null; last_name?: string | null; full_name?: string | null } | null;
                out._primary_person_id = p?.id ?? null;
                out._primary_person_name = personDisplayName(p);
                out._contact_name = out._primary_person_name;
                out._primary_contact_name = out._primary_person_name;
            } else if (opp.primary_contact_id) {
                const contact = await supabase.from("contacts").select("first_name, last_name, person_id").eq("id", opp.primary_contact_id).single();
                const c = contact.data;
                const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null : null;
                out._contact_name = name;
                out._primary_contact_name = name;
                if (c && (c as { person_id?: string | null }).person_id) {
                    const { data: person } = await supabase.from("persons").select("id, first_name, last_name, full_name").eq("id", (c as { person_id: string }).person_id).maybeSingle();
                    const p = person as { id: string; first_name?: string | null; last_name?: string | null; full_name?: string | null } | null;
                    out._primary_person_id = p?.id ?? null;
                    out._primary_person_name = personDisplayName(p);
                } else {
                    out._primary_person_id = null;
                    out._primary_person_name = null;
                }
            } else {
                out._contact_name = null;
                out._primary_contact_name = null;
                out._primary_person_id = null;
                out._primary_person_name = null;
            }
            if (opp.pipeline_stage_id) {
                const stage = await supabase.from("pipeline_stages").select("name").eq("id", opp.pipeline_stage_id).single();
                out._stage_name = stage.data?.name ?? null;
                out._pipeline_stage_name = stage.data?.name ?? null;
            } else {
                out._stage_name = null;
                out._pipeline_stage_name = null;
            }
            if (opp.vertical_id) {
                const { data: vert } = await supabase.from("verticals").select("name").eq("id", opp.vertical_id).maybeSingle();
                out._vertical_name = (vert as { name?: string | null } | null)?.name ?? null;
            } else {
                out._vertical_name = null;
            }
            if (opp.location_id) {
                const loc = await supabase.from("locations").select("id, label, address1, city, state, postal_code").eq("id", opp.location_id).maybeSingle();
                const l = loc.data as { label?: string | null; address1?: string | null; city?: string | null; state?: string | null; postal_code?: string | null } | null;
                out._location_name = l ? (l.label || [l.address1, l.city, l.state, l.postal_code].filter(Boolean).join(", ") || null) : null;
                out._location_id = opp.location_id;
            } else {
                out._location_name = null;
                out._location_id = null;
            }
            out._status_display = (out._pipeline_stage_name as string) ?? opp.status_key ?? opp.status ?? null;
            const qt = opp.quote_total != null && !Number.isNaN(Number(opp.quote_total)) ? Number(opp.quote_total)
                : opp.estimated_price_cents != null && !Number.isNaN(Number(opp.estimated_price_cents)) ? Number(opp.estimated_price_cents) / 100
                : opp.monetary_value_cents != null && !Number.isNaN(Number(opp.monetary_value_cents)) ? Number(opp.monetary_value_cents) / 100
                : null;
            out._quote_total_display = qt;
            await attachFieldDefinitionsAndValues(supabase, out, "opportunities", id);
            return NextResponse.json(out);
        }
        if (type === "contacts") {
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data, error } = await supabase.from("contacts").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const contact = data as { customer_id?: string | null; vendor_id?: string | null; person_id?: string | null };
            let _person: Record<string, unknown> | null = null;
            let _person_id: string | null = null;
            let _person_name: string | null = null;
            if (contact.person_id) {
                const { data: personRow } = await supabase.from("persons").select("id, first_name, last_name, full_name, email, phone, created_at, updated_at").eq("id", contact.person_id).maybeSingle();
                if (personRow) {
                    _person = personRow as Record<string, unknown>;
                    _person_id = (personRow as { id: string }).id;
                    const p = personRow as { full_name?: string | null; first_name?: string | null; last_name?: string | null };
                    _person_name = (p.full_name && p.full_name.trim()) || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null;
                }
            }
            let _linked_customer_name: string | null = null;
            let _linked_vendor_name: string | null = null;
            if (contact.customer_id) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", contact.customer_id).maybeSingle();
                _linked_customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            }
            if (contact.vendor_id) {
                const { data: vend } = await supabase.from("vendors").select("name").eq("id", contact.vendor_id).maybeSingle();
                _linked_vendor_name = (vend as { name?: string | null } | null)?.name ?? null;
            }
            const [custPrimary, vendPrimary] = await Promise.all([
                supabase.from("customers").select("id").eq("primary_contact_id", id).limit(1).maybeSingle(),
                supabase.from("vendors").select("id").eq("primary_contact_id", id).limit(1).maybeSingle(),
            ]);
            const pc: string[] = [];
            if (custPrimary.data) pc.push("Customer");
            if (vendPrimary.data) pc.push("Vendor");
            const _primary_contact_for = pc.length > 0 ? pc.join(", ") : "—";
            let _contact_vendor: { id: string; name: string | null; vendor_status_id: string | null; created_at: string } | null = null;
            if (contact.vendor_id) {
                const { data: vendor } = await supabase
                    .from("vendors")
                    .select("id, name, vendor_status_id, created_at")
                    .eq("id", contact.vendor_id)
                    .single();
                if (vendor) _contact_vendor = { id: vendor.id, name: vendor.name ?? null, vendor_status_id: vendor.vendor_status_id ?? null, created_at: vendor.created_at };
            }
            return NextResponse.json({
                ...data,
                _contact_vendor,
                _linked_customer_name,
                _linked_vendor_name,
                _primary_contact_for,
                _person: _person ?? null,
                _person_id,
                _person_name,
            });
        }
        if (type === "customers") {
            const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const out: Record<string, unknown> = { ...data };
            const orgId = (data as { org_id?: string }).org_id;
            const primaryContactId = (data as { primary_contact_id?: string | null }).primary_contact_id;
            const verticalId = (data as { vertical_id?: string | null }).vertical_id;
            const metadata = (data as { metadata?: Record<string, unknown> | null }).metadata;
            if (primaryContactId) {
                const { data: contact } = await supabase.from("contacts").select("id, first_name, last_name, email, phone, person_id").eq("id", primaryContactId).maybeSingle();
                out._primary_contact = contact ?? null;
                const c = contact as ContactRow | null;
                out._primary_contact_name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null : null;
                out._primary_contact_email = c?.email ?? null;
                out._primary_contact_phone = c?.phone ?? null;
                if (c?.person_id) {
                    const { data: person } = await supabase.from("persons").select("id, first_name, last_name, email, phone").eq("id", c.person_id).maybeSingle();
                    const p = person as { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
                    out._primary_person_id = p?.id ?? null;
                    out._primary_person_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null : null;
                    out._primary_person_email = p?.email ?? null;
                    out._primary_person_phone = p?.phone ?? null;
                } else {
                    out._primary_person_id = null;
                    out._primary_person_name = null;
                    out._primary_person_email = null;
                    out._primary_person_phone = null;
                }
            } else {
                out._primary_contact = null;
                out._primary_contact_name = null;
                out._primary_contact_email = null;
                out._primary_contact_phone = null;
                out._primary_person_id = null;
                out._primary_person_name = null;
                out._primary_person_email = null;
                out._primary_person_phone = null;
            }
            const meta = metadata && typeof metadata === "object" ? metadata : {};
            out._metadata_email = (meta.email as string) ?? null;
            out._metadata_phone = (meta.phone as string) ?? null;
            out._metadata_source = (meta.source as string) ?? null;
            if (verticalId) {
                const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", verticalId).maybeSingle();
                const v = vert as { name?: string | null; slug?: string | null } | null;
                out._vertical_name = v ? (v.name ?? v.slug ?? null) : null;
            } else {
                out._vertical_name = null;
            }
            const { data: primaryLoc } = await supabase
                .from("locations")
                .select("id, label, address1, city, postal_code")
                .eq("customer_id", id)
                .eq("org_id", orgId)
                .eq("is_primary", true)
                .limit(1)
                .maybeSingle();
            out._primary_location = primaryLoc ?? null;
            if (orgId) {
                const [
                    { count: contactsCount },
                    { count: oppCount },
                    { count: jobsCount },
                    { count: locsCount },
                ] = await Promise.all([
                    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("customer_id", id),
                    supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("customer_id", id),
                    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("customer_id", id),
                    supabase.from("locations").select("id", { count: "exact", head: true }).eq("customer_id", id).eq("org_id", orgId),
                ]);
                const { data: jobRows } = await supabase.from("jobs").select("id").eq("customer_id", id);
                const jobIds = (jobRows ?? []).map((j: { id: string }) => j.id);
                let schedulesCount = 0;
                if (jobIds.length > 0) {
                    const { count } = await supabase.from("schedules").select("id", { count: "exact", head: true }).in("job_id", jobIds);
                    schedulesCount = count ?? 0;
                }
                out._counts = {
                    contacts: contactsCount ?? 0,
                    opportunities: oppCount ?? 0,
                    jobs: jobsCount ?? 0,
                    schedules: schedulesCount,
                    locations: locsCount ?? 0,
                };
            } else {
                out._counts = { contacts: 0, opportunities: 0, jobs: 0, schedules: 0, locations: 0 };
            }
            await attachFieldDefinitionsAndValues(supabase, out, "customers", id);
            return NextResponse.json(out);
        }
        if (type === "schedules") {
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data: schedule, error } = await supabase.from("schedules").select("*").eq("id", id).single();
            if (error || !schedule) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const out: Record<string, unknown> = { ...schedule };
            const scheduleLocationId = (schedule as { location_id?: string | null }).location_id;
            const jobId = (schedule as { job_id?: string }).job_id;
            if (jobId) {
                const { data: job } = await supabase.from("jobs").select("id, title, customer_id, primary_contact_id, primary_person_id, opportunity_id, vertical_id, job_status_id, assigned_vendor_id, location_id").eq("id", jobId).single();
                out._job = job ?? null;
                if (job) {
                    if ((job as { customer_id?: string }).customer_id) {
                        const { data: cust } = await supabase.from("customers").select("id, name").eq("id", (job as { customer_id: string }).customer_id).single();
                        out._customer = cust ?? null;
                    } else out._customer = null;
                    const jobPrimaryPersonId = (job as { primary_person_id?: string | null }).primary_person_id;
                    const jobPrimaryContactId = (job as { primary_contact_id?: string }).primary_contact_id;
                    if (jobPrimaryPersonId) {
                        const { data: person } = await supabase.from("persons").select("id, first_name, last_name, email, phone").eq("id", jobPrimaryPersonId).maybeSingle();
                        const p = person as { id: string; first_name?: string | null; last_name?: string | null } | null;
                        out._primary_person_id = p?.id ?? null;
                        out._primary_person_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null : null;
                        out._contact = p ? { id: p.id, first_name: p.first_name, last_name: p.last_name, email: (person as { email?: string | null }).email, phone: (person as { phone?: string | null }).phone, person_id: p.id } : null;
                    } else if (jobPrimaryContactId) {
                        const { data: contact } = await supabase.from("contacts").select("id, first_name, last_name, email, phone, person_id").eq("id", jobPrimaryContactId).single();
                        out._contact = contact ?? null;
                        const contactWithPerson = contact as { person_id?: string | null } | null;
                        if (contactWithPerson?.person_id) {
                            const { data: person } = await supabase.from("persons").select("id, first_name, last_name").eq("id", contactWithPerson.person_id).maybeSingle();
                            const p = person as { id: string; first_name?: string | null; last_name?: string | null } | null;
                            out._primary_person_id = p?.id ?? null;
                            out._primary_person_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null : null;
                        } else {
                            out._primary_person_id = null;
                            out._primary_person_name = null;
                        }
                    } else {
                        out._contact = null;
                        out._primary_person_id = null;
                        out._primary_person_name = null;
                    }
                    if ((job as { opportunity_id?: string }).opportunity_id) {
                        const { data: opp } = await supabase.from("opportunities").select("id, name").eq("id", (job as { opportunity_id: string }).opportunity_id).single();
                        out._opportunity = opp ?? null;
                    } else out._opportunity = null;
                    if ((job as { vertical_id?: string }).vertical_id) {
                        const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", (job as { vertical_id: string }).vertical_id).single();
                        out._vertical = vert ?? null;
                    } else out._vertical = null;
                }
            } else {
                out._job = null; out._customer = null; out._contact = null; out._opportunity = null; out._vertical = null;
            }
            const { data: assignment } = await supabase.from("assignments").select("id, schedule_id, job_id, vendor_id, assignment_status_id, created_at").eq("schedule_id", id).maybeSingle();
            out._assignment = assignment ?? null;
            if (assignment) {
                const { data: vendor } = await supabase.from("vendors").select("id, name").eq("id", (assignment as { vendor_id: string }).vendor_id).single();
                out._vendor = vendor ?? null;
                const statusId = (assignment as { assignment_status_id?: string }).assignment_status_id;
                if (statusId) {
                    const { data: st } = await supabase.from("assignment_statuses").select("id, key, label").eq("id", statusId).single();
                    out._assignment_status = st ?? null;
                } else out._assignment_status = null;
            } else {
                out._vendor = null; out._assignment_status = null;
            }
            if (!out._assignment && jobId) {
                const job = out._job as { assigned_vendor_id?: string | null } | null;
                const jobVendorId = job?.assigned_vendor_id ?? null;
                if (jobVendorId) {
                    const { data: jobVendor } = await supabase.from("vendors").select("id, name").eq("id", jobVendorId).single();
                    out._job_assigned_vendor = jobVendor ?? null;
                } else {
                    out._job_assigned_vendor = null;
                }
            } else {
                out._job_assigned_vendor = null;
            }
            const effectiveLocationId = scheduleLocationId ?? (out._job as { location_id?: string | null } | null)?.location_id ?? null;
            out._location_id = effectiveLocationId ?? null;
            if (effectiveLocationId) {
                const { data: loc } = await supabase.from("locations").select("id, label, address1, city, state, postal_code").eq("id", effectiveLocationId).maybeSingle();
                if (loc) {
                    const l = loc as { label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null };
                    out._location_label = l.label ?? ([l.address1, l.city, l.postal_code].filter(Boolean).join(", ") || null);
                    out._location = loc;
                } else {
                    out._location_label = null;
                    out._location = null;
                }
            } else {
                out._location_label = null;
                out._location = null;
            }
            await attachFieldDefinitionsAndValues(supabase, out, "schedules", id);
            return NextResponse.json(out);
        }
        if (type === "locations") {
            const ctx = await getAdminContext();
            if (!ctx.ok) {
                return NextResponse.json(ctx.status === 401 ? "Unauthorized" : "Forbidden", { status: ctx.status });
            }
            const { data: location, error } = await supabase
                .from("locations")
                .select("*")
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .single();
            if (error || !location) {
                return NextResponse.json(error?.code === "PGRST116" ? "Not found" : error?.message ?? "Not found", { status: 404 });
            }
            const out: Record<string, unknown> = { ...location };
            const locationTypeId = (location as { location_type_id?: string | null }).location_type_id;
            if (locationTypeId) {
                const { data: typeRow } = await supabase.from("location_types").select("label").eq("id", locationTypeId).maybeSingle();
                out._location_type_label = (typeRow as { label?: string } | null)?.label ?? null;
            } else {
                out._location_type_label = null;
            }
            const customerId = (location as { customer_id: string }).customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("id, name").eq("id", customerId).maybeSingle();
                out._customer = cust ?? null;
                out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            } else {
                out._customer = null;
                out._customer_name = null;
            }
            const { data: plRows } = await supabase
                .from("person_locations")
                .select("person_id, is_primary, relationship_type")
                .eq("location_id", id)
                .eq("org_id", ctx.orgId);
            const plList = plRows ?? [];
            const personIdsFromPl = [...new Set(plList.map((r: { person_id: string }) => r.person_id))];
            const { data: personRowsForLoc } =
                personIdsFromPl.length > 0
                    ? await supabase
                          .from("persons")
                          .select("id, first_name, last_name, full_name, email")
                          .eq("org_id", ctx.orgId)
                          .in("id", personIdsFromPl)
                    : { data: [] as { id: string; first_name?: string | null; last_name?: string | null; full_name?: string | null; email?: string | null }[] };
            const personNameById = new Map(
                (personRowsForLoc ?? []).map((p) => {
                    const nm =
                        (p.full_name && String(p.full_name).trim()) ||
                        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
                        (p.email && String(p.email).trim()) ||
                        null;
                    return [p.id, nm] as const;
                })
            );
            out._linked_persons = plList.map((row: { person_id: string; is_primary?: boolean | null; relationship_type?: string | null }) => ({
                person_id: row.person_id,
                _person_name: personNameById.get(row.person_id) ?? null,
                is_primary: !!row.is_primary,
                relationship_type: row.relationship_type ?? null,
            }));
            await attachFieldDefinitionsAndValues(supabase, out, "locations", id);
            return NextResponse.json(out);
        }
        if (type === "discount_redemptions") {
            const { data, error } = await supabase.from("discount_redemptions").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const redemption = data as Record<string, unknown> & { discount_code_id: string; customer_id?: string | null; contact_id?: string | null; opportunity_id?: string | null; job_id?: string | null };
            const out: Record<string, unknown> = { ...redemption };
            const codeId = redemption.discount_code_id;
            if (codeId) {
                const { data: dc } = await supabase.from("discount_codes").select("code, discount_type, discount_value, is_active, first_job_only").eq("id", codeId).maybeSingle();
                const c = dc as { code?: string | null; discount_type?: string | null; discount_value?: number | string | null; is_active?: boolean | null; first_job_only?: boolean | null } | null;
                out._code = c?.code ?? null;
                out._discount_type = c?.discount_type ?? null;
                const val = c?.discount_value;
                if (c?.discount_type === "percent" && val != null) out._discount_value = `${Number(val)}%`;
                else if (val != null) out._discount_value = typeof val === "number" ? `$${val.toFixed(2)}` : String(val);
                else out._discount_value = null;
            } else {
                out._code = null; out._discount_type = null; out._discount_value = null;
            }
            if (redemption.customer_id) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", redemption.customer_id).maybeSingle();
                out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            } else out._customer_name = null;
            if (redemption.contact_id) {
                const { data: contact } = await supabase.from("contacts").select("first_name, last_name, person_id").eq("id", redemption.contact_id).maybeSingle();
                const ct = contact as { first_name?: string | null; last_name?: string | null; person_id?: string | null } | null;
                out._contact_name = ct ? [ct.first_name, ct.last_name].filter(Boolean).join(" ") || null : null;
                if (ct?.person_id) {
                    const { data: person } = await supabase.from("persons").select("id, first_name, last_name").eq("id", ct.person_id).maybeSingle();
                    const p = person as { id: string; first_name?: string | null; last_name?: string | null } | null;
                    out._person_id = p?.id ?? null;
                    out._person_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null : null;
                } else {
                    out._person_id = null;
                    out._person_name = null;
                }
            } else {
                out._contact_name = null;
                out._person_id = null;
                out._person_name = null;
            }
            if (redemption.opportunity_id) {
                const { data: opp } = await supabase.from("opportunities").select("name").eq("id", redemption.opportunity_id).maybeSingle();
                out._opportunity_name = (opp as { name?: string | null } | null)?.name ?? null;
            } else out._opportunity_name = null;
            if (redemption.job_id) {
                const { data: job } = await supabase.from("jobs").select("id, title, service_key, job_number_for_customer").eq("id", redemption.job_id).maybeSingle();
                const j = job as { title?: string | null; service_key?: string | null; job_number_for_customer?: string | null } | null;
                out._job_label = j ? ((j.title && String(j.title).trim()) || (j.service_key && String(j.service_key).trim()) || (j.job_number_for_customer && String(j.job_number_for_customer).trim()) || `Job #${(redemption.job_id as string).slice(-6)}`) : null;
            } else out._job_label = null;
            return NextResponse.json(out);
        }
        if (type === "workflows") {
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data: wf, error: wErr } = await supabase.from("workflows").select("*").eq("id", id).single();
            if (wErr || !wf) return NextResponse.json(wErr?.message || "Not found", { status: wErr?.code === "PGRST116" ? 404 : 500 });
            const { data: cond } = await supabase.from("workflow_conditions").select("*").eq("workflow_id", id);
            const { data: acts } = await supabase.from("workflow_actions").select("*").eq("workflow_id", id).order("action_order", { ascending: true });
            return NextResponse.json({
                ...wf,
                _conditions: cond ?? [],
                _actions: acts ?? [],
            });
        }
        if (type === "vendors") {
            const { data: vendor, error: vErr } = await supabase.from("vendors").select("*").eq("id", id).single();
            if (vErr || !vendor) return NextResponse.json(vErr?.message || "Not found", { status: vErr?.code === "PGRST116" ? 404 : 500 });
            const v = vendor as Record<string, unknown> & { status_key?: string | null; status?: string | null; primary_contact_id?: string | null };
            const out: Record<string, unknown> = { ...vendor };
            out._status_display = v.status_key ?? v.status ?? null;

            const statusId = (vendor as { vendor_status_id?: string }).vendor_status_id;
            if (statusId) {
                const { data: statusRow } = await supabase.from("vendor_statuses").select("key, label").eq("id", statusId).single();
                out._vendor_status_label = statusRow?.label ?? null;
            } else {
                out._vendor_status_label = null;
            }
            const { data: statusOptions } = await supabase.from("vendor_statuses").select("id, key, label").eq("is_active", true).order("position", { ascending: true });
            out._vendor_status_options = statusOptions ?? [];

            const primaryContactId = v.primary_contact_id;
            if (primaryContactId) {
                const { data: pc } = await supabase
                    .from("contacts")
                    .select("id, first_name, last_name, email, phone, person_id")
                    .eq("id", primaryContactId)
                    .single();
                const c = pc as { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; person_id?: string | null } | null;
                out._primary_contact = pc;
                out._primary_contact_name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null : null;
                out._primary_contact_email = c?.email ?? null;
                out._primary_contact_phone = c?.phone ?? null;
                if (c?.person_id) {
                    const { data: person } = await supabase.from("persons").select("id, first_name, last_name").eq("id", c.person_id).maybeSingle();
                    const p = person as { id: string; first_name?: string | null; last_name?: string | null } | null;
                    out._primary_person_id = p?.id ?? null;
                    out._primary_person_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null : null;
                } else {
                    out._primary_person_id = null;
                    out._primary_person_name = null;
                }
            } else {
                out._primary_contact = null;
                out._primary_contact_name = null;
                out._primary_contact_email = null;
                out._primary_contact_phone = null;
                out._primary_person_id = null;
                out._primary_person_name = null;
            }

            const { data: jobsCountRows } = await supabase
                .from("jobs")
                .select("id")
                .eq("assigned_vendor_id", id);
            out._jobs_count = (jobsCountRows ?? []).length;

            const JOBS_LIMIT = 25;
            const { data: vendorJobs } = await supabase
                .from("jobs")
                .select("id, created_at, title, scheduled_at, job_status_id, gross_price_cents, recurring_total_cents, opportunity_id, assigned_vendor_id")
                .eq("assigned_vendor_id", id)
                .order("created_at", { ascending: false })
                .limit(JOBS_LIMIT);
            out._vendor_jobs = vendorJobs ?? [];
            const jobIds = (vendorJobs ?? []).map((j: { id: string }) => j.id);
            const { data: vendorSchedules } = jobIds.length > 0
                ? await supabase
                    .from("schedules")
                    .select("id, job_id, start_at, end_at, timezone")
                    .in("job_id", jobIds)
                    .order("start_at", { ascending: false })
                : { data: [] as unknown[] };
            out._vendor_schedules = vendorSchedules ?? [];

            const { data: vcRows } = await supabase.from("vendor_contacts").select("contact_id, role").eq("vendor_id", id);
            const contactIds = (vcRows ?? []).map((r: { contact_id: string }) => r.contact_id);
            const { data: vendorContactsData } = contactIds.length > 0
                ? await supabase.from("contacts").select("id, first_name, last_name, email, phone").in("id", contactIds)
                : { data: [] as unknown[] };
            type ContactRow = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null };
            const contactsWithRole = ((vendorContactsData ?? []) as ContactRow[]).map((c) => {
                const link = (vcRows ?? []).find((r: { contact_id: string }) => r.contact_id === c.id) as { role?: string } | undefined;
                return { ...c, _role: link?.role ?? null };
            });
            out._vendor_contacts = contactsWithRole;

            await attachFieldDefinitionsAndValues(supabase, out, "vendors", id);
            return NextResponse.json(out);
        }
        if (type === "subscriptions") {
            const { data: sub, error: subErr } = await supabase.from("customer_subscriptions").select("*").eq("id", id).single();
            if (subErr || !sub) return NextResponse.json(subErr?.message || "Not found", { status: subErr?.code === "PGRST116" ? 404 : 500 });
            const out: Record<string, unknown> = { ...sub };
            const cadence = (sub as { cadence?: string }).cadence ?? "month";
            const interval = Math.max(1, Number((sub as { interval?: number }).interval) || 1);
            const { formatFrequencyLabel } = await import("@/lib/adminFormatters");
            out._frequency_label = formatFrequencyLabel(cadence, interval);
            out._cadence = cadence;
            out._interval = interval;
            const customerId = (sub as { customer_id?: string }).customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).single();
                out._customer_name = cust?.name ?? null;
            }
            const { data: scheds } = await supabase
                .from("schedules")
                .select("id, job_id, start_at, end_at, timezone, subscription_sequence, rescheduled_from_schedule_id, canceled_at, canceled_by, cancel_reason")
                .eq("customer_subscription_id", id)
                .order("subscription_sequence", { ascending: true });
            out._schedules = scheds ?? [];
            return NextResponse.json(out);
        }

        if (type === "payments") {
            const { data, error } = await supabase.from("payments").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const payment = data as Record<string, unknown> & { customer_id?: string | null; job_id?: string | null; status_key?: string | null; payment_status_id?: string | null; provider_payment_id?: string | null };
            const out: Record<string, unknown> = { ...payment };
            out._payment_label = (payment.provider_payment_id && String(payment.provider_payment_id).trim()) ? payment.provider_payment_id : `Payment #${(payment.id as string).slice(-6)}`;
            if (payment.customer_id) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", payment.customer_id).maybeSingle();
                out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            } else {
                out._customer_name = null;
            }
            if (payment.job_id) {
                const { data: job } = await supabase.from("jobs").select("id, title, service_key, job_number_for_customer").eq("id", payment.job_id).maybeSingle();
                const j = job as { title?: string | null; service_key?: string | null; job_number_for_customer?: string | null } | null;
                out._job_label = j ? ((j.title && String(j.title).trim()) || (j.service_key && String(j.service_key).trim()) || (j.job_number_for_customer && String(j.job_number_for_customer).trim()) || `Job #${(payment.job_id as string).slice(-6)}`) : null;
            } else {
                out._job_label = null;
            }
            const statusKey = payment.status_key ?? null;
            if (statusKey) {
                out._status_display = statusKey;
            } else if (payment.payment_status_id) {
                const { data: ps } = await supabase.from("payment_statuses").select("key, label").eq("id", payment.payment_status_id).maybeSingle();
                out._status_display = (ps as { key?: string | null; label?: string | null } | null)?.label ?? (ps as { key?: string | null } | null)?.key ?? null;
            } else {
                out._status_display = null;
            }
            return NextResponse.json(out);
        }
        if (type === "customer_members") {
            const ctx = await getAdminContext();
            if (!ctx.ok) {
                return NextResponse.json(ctx.status === 401 ? "Unauthorized" : "Forbidden", { status: ctx.status });
            }
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data: row, error: rowErr } = await supabase
                .from("customer_members")
                .select("*")
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            if (rowErr || !row) {
                return NextResponse.json(rowErr?.code === "PGRST116" ? "Not found" : rowErr?.message ?? "Not found", { status: 404 });
            }
            const out: Record<string, unknown> = { ...row };
            const personId = (row as { person_id?: string | null }).person_id ?? null;
            if (personId) {
                const { data: personRow } = await supabase.from("persons").select("id, first_name, last_name, email, phone, created_at, updated_at").eq("id", personId).maybeSingle();
                if (personRow) {
                    out._person = personRow as Record<string, unknown>;
                    out._person_id = (personRow as { id: string }).id;
                    const p = personRow as { first_name?: string | null; last_name?: string | null };
                    out._person_name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null;
                } else {
                    out._person = null;
                    out._person_id = null;
                    out._person_name = null;
                }
            } else {
                out._person = null;
                out._person_id = null;
                out._person_name = null;
            }
            const customerId = (row as { customer_id: string }).customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
                out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            } else {
                out._customer_name = null;
            }
            const relationshipKey = (row as { relationship?: string | null }).relationship ?? null;
            if (relationshipKey) {
                const { data: relRow } = await supabase
                    .from("customer_member_relationship_types")
                    .select("label")
                    .eq("org_id", ctx.orgId)
                    .eq("key", relationshipKey)
                    .maybeSingle();
                out._relationship_label = (relRow as { label?: string | null } | null)?.label ?? relationshipKey;
            } else {
                out._relationship_label = null;
            }
            const dob = (row as { dob?: string | null }).dob ?? null;
            if (dob && dob.trim()) {
                const d = new Date(dob);
                if (!Number.isNaN(d.getTime())) {
                    const today = new Date();
                    let age = today.getFullYear() - d.getFullYear();
                    if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
                    out._age = age >= 0 ? age : null;
                } else {
                    out._age = null;
                }
            } else {
                out._age = null;
            }
            const { data: linkRows } = await supabase
                .from("customer_member_contacts")
                .select("id, contact_id, role_key, is_active, contact:contacts(id, first_name, last_name, email, phone)")
                .eq("org_id", ctx.orgId)
                .eq("customer_member_id", id);
            const roleKeys = [...new Set((linkRows ?? []).map((l: Record<string, unknown>) => l.role_key as string).filter(Boolean))];
            const { data: roleRows } = roleKeys.length
                ? await supabase.from("customer_member_contact_roles").select("role_key, label").eq("org_id", ctx.orgId).in("role_key", roleKeys)
                : { data: [] as { role_key: string; label: string | null }[] };
            const roleLabelMap = new Map((roleRows ?? []).map((r: { role_key: string; label: string | null }) => [r.role_key, r.label ?? r.role_key]));
            out._linked_contacts = (linkRows ?? []).map((l: Record<string, unknown>) => {
                const contact = (l.contact ?? l.contacts) as { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
                const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || contact.phone || null : null;
                return {
                    contact_id: l.contact_id,
                    contact_name: name,
                    email: contact?.email ?? null,
                    phone: contact?.phone ?? null,
                    role_key: l.role_key ?? null,
                    role_label: l.role_key ? (roleLabelMap.get(l.role_key as string) ?? l.role_key) : null,
                    is_active: l.is_active ?? true,
                };
            });
            return NextResponse.json(out);
        }

        if (type === "persons") {
            const ctx = await getAdminContext();
            if (!ctx.ok) {
                return NextResponse.json(ctx.status === 401 ? "Unauthorized" : "Forbidden", { status: ctx.status });
            }
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data: personRow, error: personErr } = await supabase
                .from("persons")
                .select("*")
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            if (personErr || !personRow) {
                return NextResponse.json(personErr?.code === "PGRST116" ? "Not found" : personErr?.message ?? "Not found", { status: 404 });
            }
            const out: Record<string, unknown> = { ...personRow };
            const p = personRow as { full_name?: string | null; first_name?: string | null; last_name?: string | null };
            out._person_name =
                (p.full_name && p.full_name.trim()) ||
                [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
                null;

            const { data: cpRows } = await supabase
                .from("customer_persons")
                .select("id, customer_id, person_id, role, created_at")
                .eq("person_id", id)
                .eq("org_id", ctx.orgId);
            const customerIds = [...new Set((cpRows ?? []).map((r: { customer_id: string }) => r.customer_id))];
            const roleKeys = [...new Set((cpRows ?? []).map((r: { role?: string | null }) => r.role).filter(Boolean))] as string[];
            const [customerRowsRes, roleTypesRes] = await Promise.all([
                customerIds.length > 0 ? supabase.from("customers").select("id, name").in("id", customerIds) : { data: [] as { id: string; name: string | null }[] },
                roleKeys.length > 0 ? supabase.from("customer_person_role_types").select("key, label").eq("org_id", ctx.orgId).in("key", roleKeys) : { data: [] as { key: string; label: string | null }[] },
            ]);
            const customerMap = new Map((customerRowsRes.data ?? []).map((c) => [c.id, c.name ?? null]));
            const roleLabelMap = new Map((roleTypesRes.data ?? []).map((r) => [r.key, r.label ?? r.key]));
            out._customer_persons = (cpRows ?? []).map((r: { id: string; customer_id: string; person_id: string; role?: string | null; created_at?: string }) => ({
                ...r,
                _customer_name: customerMap.get(r.customer_id) ?? null,
                _role_label: r.role ? (roleLabelMap.get(r.role) ?? r.role) : null,
            }));

            const { data: relRows } = await supabase
                .from("person_relationships")
                .select("id, from_person_id, to_person_id, relationship_type, created_at")
                .or(`from_person_id.eq.${id},to_person_id.eq.${id}`);
            const relTypeKeys = [...new Set((relRows ?? []).map((r: { relationship_type?: string | null }) => r.relationship_type).filter(Boolean))] as string[];
            const { data: relTypeRows } = relTypeKeys.length > 0
                ? await supabase.from("person_relationship_type_settings").select("key, label").eq("org_id", ctx.orgId).in("key", relTypeKeys)
                : { data: [] as { key: string; label: string | null }[] };
            const relTypeLabelMap = new Map((relTypeRows ?? []).map((r) => [r.key, r.label ?? r.key]));
            const otherPersonIds = [...new Set((relRows ?? []).flatMap((r: { from_person_id: string; to_person_id: string }) => (r.from_person_id === id ? [r.to_person_id] : [r.from_person_id])))];
            const { data: otherPersons } = otherPersonIds.length > 0
                ? await supabase.from("persons").select("id, first_name, last_name").in("id", otherPersonIds)
                : { data: [] as { id: string; first_name?: string | null; last_name?: string | null }[] };
            const personNameMap = new Map((otherPersons ?? []).map((p: { id: string; first_name?: string | null; last_name?: string | null }) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null]));
            out._person_relationships = (relRows ?? []).map((r: { id: string; from_person_id: string; to_person_id: string; relationship_type?: string | null; created_at?: string }) => ({
                ...r,
                _other_person_id: r.from_person_id === id ? r.to_person_id : r.from_person_id,
                _other_person_name: personNameMap.get(r.from_person_id === id ? r.to_person_id : r.from_person_id) ?? null,
                _relationship_type_label: r.relationship_type ? (relTypeLabelMap.get(r.relationship_type) ?? r.relationship_type) : null,
            }));

            const PERSON_LIMIT = 25;
            const { data: contactRows } = await supabase.from("contacts").select("id, first_name, last_name, email, phone, customer_id").eq("person_id", id).eq("org_id", ctx.orgId).limit(PERSON_LIMIT);
            const { data: memberRows } = await supabase.from("customer_members").select("id, display_name, relationship, customer_id").eq("person_id", id).eq("org_id", ctx.orgId).limit(PERSON_LIMIT);
            out._compatibility_contacts = contactRows ?? [];
            out._compatibility_members = memberRows ?? [];

            const { data: plLocRows } = await supabase
                .from("person_locations")
                .select("location_id, is_primary, relationship_type")
                .eq("person_id", id)
                .eq("org_id", ctx.orgId)
                .limit(PERSON_LIMIT);
            const locLinkList = plLocRows ?? [];
            const locIdsFromPl = [...new Set(locLinkList.map((r: { location_id: string }) => r.location_id))];
            const { data: locRowsForPerson } =
                locIdsFromPl.length > 0
                    ? await supabase
                          .from("locations")
                          .select("id, label, postal_code, city, address1")
                          .eq("org_id", ctx.orgId)
                          .in("id", locIdsFromPl)
                    : { data: [] as { id: string; label?: string | null; postal_code?: string | null; city?: string | null; address1?: string | null }[] };
            const locLabelById = new Map(
                (locRowsForPerson ?? []).map((l) => {
                    const lbl =
                        (l.label && String(l.label).trim()) ||
                        [l.address1, l.city, l.postal_code].filter(Boolean).join(", ") ||
                        null;
                    return [l.id, lbl] as const;
                })
            );
            out._linked_locations = locLinkList.map((row: { location_id: string; is_primary?: boolean | null; relationship_type?: string | null }) => ({
                location_id: row.location_id,
                _location_label: locLabelById.get(row.location_id) ?? null,
                is_primary: !!row.is_primary,
                relationship_type: row.relationship_type ?? null,
            }));

            const { data: oppRows } = await supabase
                .from("opportunities")
                .select("id, name, status_key, job_date, quote_total, created_at")
                .eq("primary_person_id", id)
                .eq("org_id", ctx.orgId)
                .order("created_at", { ascending: false })
                .limit(PERSON_LIMIT);
            out._linked_opportunities = oppRows ?? [];

            await attachFieldDefinitionsAndValues(supabase, out, "persons", id);
            return NextResponse.json(out);
        }

        if (type === "service_offerings") {
            const { data, error } = await supabase.from("service_offerings").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const row = data as Record<string, unknown> & { vertical_id?: string | null };
            const out: Record<string, unknown> = { ...row };
            out._updated = (row.updated_at as string) ?? (row.created_at as string) ?? null;
            if (row.vertical_id) {
                const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", row.vertical_id).maybeSingle();
                out._vertical_name = (vert as { name?: string | null; slug?: string | null } | null)?.name ?? (vert as { slug?: string | null } | null)?.slug ?? null;
            } else {
                out._vertical_name = null;
            }
            return NextResponse.json(out);
        }

        if (type === "service_plan_templates") {
            const { data, error } = await supabase.from("service_plan_templates").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const row = data as Record<string, unknown> & { recurrence_unit?: string | null; recurrence_interval?: number | null };
            const out: Record<string, unknown> = { ...row };
            out._updated = (row.updated_at as string) ?? (row.created_at as string) ?? null;
            out._recurrence_label = formatRecurrenceLabel(
                (row.recurrence_unit as string) ?? null,
                row.recurrence_interval != null ? Math.max(1, Number(row.recurrence_interval) || 1) : null
            );
            return NextResponse.json(out);
        }

        if (type === "addons") {
            const { data, error } = await supabase.from("pricing_addons").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const row = data as Record<string, unknown> & { vertical_id?: string | null };
            const out: Record<string, unknown> = { ...row };
            out._updated = (row.updated_at as string) ?? (row.created_at as string) ?? null;
            if (row.vertical_id) {
                const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", row.vertical_id).maybeSingle();
                out._vertical_name = (vert as { name?: string | null; slug?: string | null } | null)?.name ?? (vert as { slug?: string | null } | null)?.slug ?? null;
            } else {
                out._vertical_name = null;
            }
            return NextResponse.json(out);
        }

        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    } catch (e: unknown) {
        console.error("[ADMIN_ENTITY]", e);
        return NextResponse.json({ error: "Failed to fetch entity" }, { status: 500 });
    }
}
