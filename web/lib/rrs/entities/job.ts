import { attachDirectFkRelationshipDisplays } from "@/lib/admin/relationshipDisplayAttach";
import { attachFieldDefinitionsAndValues } from "@/lib/admin/entityFieldRegistryAttach";
import { inferJobDiscountSelectionToken, buildJobDiscountDisplayLabel } from "@/lib/admin/jobDiscountSelection";
import {
    computeJobDisplayTotalCents,
    computeJobGrossBasisCents,
    normalizeJobDiscountAmountToCents,
    type JobPriceInput,
} from "@/lib/admin/jobDisplayPrice";
import { resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";
import { attachJobWorkUnitDisplay } from "@/lib/admin/attachJobWorkUnitDisplay";
import { fetchActiveJobLineItemsForAdmin } from "@/lib/admin/fetchActiveJobLineItems";
import { optionItemLabelForOrg } from "@/lib/admin/optionItemLabelForOrg";
import { hydrateVendorDisplayStub } from "@/lib/admin/hydrateVendorDisplayStub";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { RRS_VERSION } from "@/lib/rrs/version";
import type {
    RecordSurface,
    ResolvedFieldDescriptor,
    ResolvedRecordPayload,
    ResolvedRelationshipGroup,
} from "@/lib/rrs/types";
import {
    loadEffectiveOverviewLayoutConfig,
    orderAndFilterOverviewFields,
    type OverviewLayoutConfigV0,
} from "@/lib/rrs/overview/overviewLayoutV0";

type AdminSupabase = ReturnType<typeof createAdminClient>;

type PersonStub = { id: string; first_name?: string | null; last_name?: string | null };

function personDisplayName(p: PersonStub | null): string | null {
    if (!p) return null;
    return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null;
}

/**
 * Persons-first primary display for job (doctrine order):
 * 1) jobs.primary_person_id → persons
 * 2) customer_persons for job.customer_id (prefer is_primary + role_type primary_contact)
 * 3) jobs.primary_contact_id → contacts → optional persons via person_id
 */
async function resolveJobPrimaryPersonDisplay(
    supabase: AdminSupabase,
    orgId: string,
    data: {
        primary_person_id?: string | null;
        primary_contact_id?: string | null;
        customer_id?: string;
    }
): Promise<{ _primary_person_id: string | null; _primary_person_name: string | null; _contact_name: string | null }> {
    const jobPrimaryPersonId = data.primary_person_id;
    const jobPrimaryContactId = data.primary_contact_id;
    const customerId = data.customer_id;

    if (jobPrimaryPersonId) {
        const { data: person } = await supabase
            .from("persons")
            .select("id, first_name, last_name")
            .eq("id", jobPrimaryPersonId)
            .eq("org_id", orgId)
            .maybeSingle();
        const p = person as PersonStub | null;
        const name = personDisplayName(p);
        return { _primary_person_id: p?.id ?? null, _primary_person_name: name, _contact_name: name };
    }

    if (customerId) {
        const { data: cpRows } = await supabase
            .from("customer_persons")
            .select("person_id, is_primary, role_type, created_at")
            .eq("org_id", orgId)
            .eq("customer_id", customerId);
        const rows = (cpRows ?? []) as {
            person_id: string;
            is_primary: boolean;
            role_type: string;
            created_at?: string | null;
        }[];
        rows.sort((a, b) => {
            const score = (r: (typeof rows)[number]) => (r.is_primary ? 2 : 0) + (r.role_type === "primary_contact" ? 1 : 0);
            const d = score(b) - score(a);
            if (d !== 0) return d;
            const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
            return ta - tb;
        });
        for (const cp of rows) {
            const { data: person } = await supabase
                .from("persons")
                .select("id, first_name, last_name")
                .eq("id", cp.person_id)
                .eq("org_id", orgId)
                .maybeSingle();
            const p = person as PersonStub | null;
            if (p) {
                const name = personDisplayName(p);
                return { _primary_person_id: p.id, _primary_person_name: name, _contact_name: name };
            }
        }
    }

    if (jobPrimaryContactId) {
        const { data: c } = await supabase
            .from("contacts")
            .select("first_name, last_name, person_id")
            .eq("id", jobPrimaryContactId)
            .eq("org_id", orgId)
            .single();
        const contactRow = c as { first_name?: string | null; last_name?: string | null; person_id?: string | null } | null;
        const contactName = contactRow ? [contactRow.first_name, contactRow.last_name].filter(Boolean).join(" ") || null : null;
        if (contactRow?.person_id) {
            const { data: person } = await supabase
                .from("persons")
                .select("id, first_name, last_name")
                .eq("id", contactRow.person_id)
                .eq("org_id", orgId)
                .maybeSingle();
            const p = person as PersonStub | null;
            return {
                _primary_person_id: p?.id ?? null,
                _primary_person_name: personDisplayName(p),
                _contact_name: contactName,
            };
        }
        return { _primary_person_id: null, _primary_person_name: null, _contact_name: contactName };
    }

    return { _primary_person_id: null, _primary_person_name: null, _contact_name: null };
}

type JobSystemFieldSpec = {
    key: string;
    label: string;
    column: string;
    editable: boolean;
    /** Omit = all surfaces */
    surfaces?: RecordSurface[];
};

const JOB_SYSTEM_FIELD_SPECS: JobSystemFieldSpec[] = [
    { key: "title", label: "Title", column: "title", editable: true },
    { key: "description", label: "Description", column: "description", editable: true, surfaces: ["full"] },
    { key: "internal_notes", label: "Internal notes", column: "internal_notes", editable: true, surfaces: ["full"] },
    { key: "status_key", label: "Status", column: "status_key", editable: true },
    { key: "scheduled_at", label: "Scheduled at", column: "scheduled_at", editable: true },
    { key: "completed_at", label: "Completed at", column: "completed_at", editable: true },
    { key: "service_key", label: "Service", column: "service_key", editable: true, surfaces: ["overview", "full"] },
    { key: "service_frequency_key", label: "Service frequency", column: "service_frequency_key", editable: true },
    { key: "job_number", label: "Job number", column: "job_number", editable: false, surfaces: ["overview", "full"] },
    { key: "customer_id", label: "Customer", column: "customer_id", editable: true },
    { key: "location_id", label: "Location", column: "location_id", editable: true },
    { key: "work_unit_id", label: "Work unit", column: "work_unit_id", editable: true },
    { key: "assigned_vendor_id", label: "Assigned vendor", column: "assigned_vendor_id", editable: true },
    { key: "primary_person_id", label: "Primary person", column: "primary_person_id", editable: true },
    { key: "primary_contact_id", label: "Primary contact (legacy)", column: "primary_contact_id", editable: true, surfaces: ["full"] },
    { key: "estimated_total_cents", label: "Estimated total (cents)", column: "estimated_total_cents", editable: true, surfaces: ["full", "overview"] },
    { key: "recurring_total_cents", label: "Recurring total (cents)", column: "recurring_total_cents", editable: true, surfaces: ["full"] },
];

function specAllowedOnSurface(spec: JobSystemFieldSpec, surface: RecordSurface): boolean {
    if (!spec.surfaces) return true;
    return spec.surfaces.includes(surface);
}

function buildJobSystemFields(
    data: Record<string, unknown>,
    flat: Record<string, unknown>,
    surface: RecordSurface
): ResolvedFieldDescriptor[] {
    const out: ResolvedFieldDescriptor[] = [];
    for (const spec of JOB_SYSTEM_FIELD_SPECS) {
        if (!specAllowedOnSurface(spec, surface)) continue;
        const col = spec.column;
        const value = data[col] ?? flat[col] ?? null;
        out.push({
            key: spec.key,
            label: spec.label,
            value,
            source: "system",
            editable: spec.editable,
            editable_entity: spec.editable ? "jobs" : null,
            editable_key: spec.editable ? col : null,
            provenance: "Job",
        });
    }
    return out;
}

function buildJobComputedFields(flat: Record<string, unknown>, surface: RecordSurface): ResolvedFieldDescriptor[] {
    const keys: Array<{ key: string; label: string; surface?: RecordSurface[] }> = [
        { key: "_customer_name", label: "Customer name" },
        { key: "_status_display", label: "Status (display)" },
        { key: "_work_unit_label", label: "Work unit" },
        { key: "_location_label", label: "Location" },
        { key: "_next_schedule", label: "Next schedule" },
        { key: "display_total_cents", label: "Display total (cents)" },
        { key: "_price_display", label: "Price (display)" },
        { key: "_primary_person_name", label: "Primary person name" },
        { key: "_contact_name", label: "Contact name" },
        { key: "_vendor_name", label: "Vendor name" },
        { key: "_opportunity_name", label: "Opportunity" },
        { key: "_discount_applied", label: "Discount applied" },
        { key: "_discount_label", label: "Discount" },
        { key: "_service_home_type_label", label: "Home type" },
        { key: "_service_sqft_band_label", label: "Size band" },
        { key: "_service_bedrooms", label: "Bedrooms" },
        { key: "_service_bathrooms", label: "Bathrooms" },
    ];
    const rows: ResolvedFieldDescriptor[] = [];
    for (const k of keys) {
        if (k.surface && !k.surface.includes(surface)) continue;
        if (!(k.key in flat)) continue;
        rows.push({
            key: k.key,
            label: k.label,
            value: flat[k.key],
            source: "computed",
            editable: false,
            editable_entity: null,
            editable_key: null,
        });
    }
    return rows;
}

function buildJobCustomFields(flat: Record<string, unknown>, surface: RecordSurface): ResolvedFieldDescriptor[] {
    const defs = flat._field_definitions as
        | { id: string; field_key: string; label: string | null; is_system: boolean }[]
        | undefined;
    if (!defs?.length) return [];
    const rows: ResolvedFieldDescriptor[] = [];
    for (const d of defs) {
        if (d.is_system) continue;
        rows.push({
            key: `custom:${d.field_key}`,
            label: d.label || d.field_key,
            value: flat[d.field_key],
            source: "custom",
            editable: true,
            editable_entity: "field_values",
            editable_key: d.id,
        });
    }
    if (surface === "drawer") {
        return rows.slice(0, 12);
    }
    return rows;
}

function buildRelationshipGroups(flat: Record<string, unknown>): ResolvedRelationshipGroup[] {
    const groups: ResolvedRelationshipGroup[] = [];
    const personId = flat._primary_person_id;
    const personName = flat._primary_person_name;
    if (personId || personName) {
        groups.push({
            group_key: "primary_customer_person",
            label: "Primary person",
            items: [
                {
                    person_id: personId ?? null,
                    display_name: personName ?? null,
                    contact_name: flat._contact_name ?? null,
                },
            ],
        });
    }
    if (flat.customer_id || flat._customer_name) {
        groups.push({
            group_key: "customer_account",
            label: "Customer",
            items: [{ customer_id: flat.customer_id ?? null, name: flat._customer_name ?? null }],
        });
    }
    return groups;
}

function buildFinancialBlock(flat: Record<string, unknown>): Record<string, unknown> | null {
    if (flat.display_total_cents == null && flat._price_display == null && flat._discount_amount_cents == null) {
        return null;
    }
    return {
        display_total_cents: flat.display_total_cents ?? null,
        price_display: flat._price_display ?? null,
        discount_amount_cents: flat._discount_amount_cents ?? null,
        discount_applied: flat._discount_applied ?? null,
        discount_label: flat._discount_label ?? null,
    };
}

async function buildJobRrsPayload(
    supabase: AdminSupabase,
    orgId: string,
    jobId: string,
    surface: RecordSurface,
    data: Record<string, unknown>,
    flat: Record<string, unknown>
): Promise<ResolvedRecordPayload> {
    const { row: layoutRow, config: overviewConfig } = await loadEffectiveOverviewLayoutConfig(
        supabase,
        orgId,
        "jobs",
        "overview"
    );

    const systemFields = buildJobSystemFields(data, flat, surface);
    const computedFields = buildJobComputedFields(flat, surface);
    let customFields = buildJobCustomFields(flat, surface);

    let fields = [...systemFields, ...computedFields, ...customFields];
    if (surface === "overview") {
        fields = orderAndFilterOverviewFields(fields, overviewConfig);
    } else if (surface === "drawer") {
        fields = fields.filter((f) => !["description", "internal_notes"].includes(f.key) && !f.key.startsWith("custom:"));
        const drawerMax = 24;
        if (fields.length > drawerMax) {
            const priority = new Set(["title", "status_key", "_status_display", "_customer_name", "_primary_person_name", "_work_unit_label"]);
            const head = fields.filter((f) => priority.has(f.key));
            const tail = fields.filter((f) => !priority.has(f.key));
            fields = [...head, ...tail].slice(0, drawerMax);
        }
    }

    let relationship_groups = buildRelationshipGroups(flat);
    if (surface === "overview" && overviewConfig.relationship_group_keys?.length) {
        const allowRg = new Set(overviewConfig.relationship_group_keys);
        relationship_groups = relationship_groups.filter((g) => allowRg.has(g.group_key));
    } else if (surface === "drawer") {
        relationship_groups = relationship_groups.slice(0, 1);
    }

    return {
        meta: {
            rrs_version: RRS_VERSION,
            entity_type: "jobs",
            entity_id: jobId,
            surface,
        },
        fields,
        relationship_groups,
        financial: surface === "drawer" ? null : buildFinancialBlock(flat),
        overview_layout: layoutRow,
        actions: [],
        signals: [],
    };
}

export type ResolveJobRecordResult =
    | { ok: true; flat: Record<string, unknown>; rrs: ResolvedRecordPayload }
    | { ok: false; notFound: boolean; message?: string };

/**
 * Assembles the legacy flat admin job payload (stable for existing UI) plus RRS v0 payload.
 */
export async function resolveJobRecord(
    supabase: AdminSupabase,
    orgId: string,
    jobId: string,
    surface: RecordSurface
): Promise<ResolveJobRecordResult> {
    const { data, error } = await supabase.from("jobs").select("*").eq("id", jobId).eq("org_id", orgId).single();
    if (error || !data) {
        const notFound = error?.code === "PGRST116";
        return { ok: false, notFound, message: error?.message };
    }

    const out: Record<string, unknown> = { ...data };

    if ((data as { opportunity_id?: string }).opportunity_id) {
        const opp = await supabase
            .from("opportunities")
            .select("name")
            .eq("id", (data as { opportunity_id: string }).opportunity_id)
            .eq("org_id", orgId)
            .single();
        out._opportunity_name = opp.data?.name ?? null;
    } else {
        out._opportunity_name = null;
    }

    const primary = await resolveJobPrimaryPersonDisplay(supabase, orgId, {
        primary_person_id: (data as { primary_person_id?: string | null }).primary_person_id,
        primary_contact_id: (data as { primary_contact_id?: string }).primary_contact_id,
        customer_id: (data as { customer_id?: string }).customer_id,
    });
    out._primary_person_id = primary._primary_person_id;
    out._primary_person_name = primary._primary_person_name;
    out._contact_name = primary._contact_name;
    if (typeof out._primary_person_id === "string" && out._primary_person_id.trim()) {
        out.primary_person_id = out._primary_person_id;
    }

    if ((data as { customer_id?: string }).customer_id) {
        const customer = await supabase
            .from("customers")
            .select("name")
            .eq("id", (data as { customer_id: string }).customer_id)
            .eq("org_id", orgId)
            .single();
        out._customer_name = customer.data?.name ?? null;
    } else {
        out._customer_name = null;
    }

    const assignedVendorId = (data as { assigned_vendor_id?: string | null }).assigned_vendor_id;
    if (assignedVendorId) {
        const stub = await hydrateVendorDisplayStub(supabase, assignedVendorId, orgId);
        out._assigned_vendor = stub;
        out._vendor_name = stub?.name ?? null;
    } else {
        out._assigned_vendor = null;
        out._vendor_name = null;
    }

    const jobLocationId = (data as { location_id?: string | null }).location_id;
    if (jobLocationId) {
        const { data: loc } = await supabase
            .from("locations")
            .select("id, label, address1, city, state, postal_code")
            .eq("id", jobLocationId)
            .eq("org_id", orgId)
            .maybeSingle();
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
        const { data: vert } = await supabase.from("verticals").select("slug, name").eq("id", verticalId).maybeSingle();
        const vr = vert as { slug?: string | null; name?: string | null } | null;
        out._vertical_slug = vr?.slug ?? null;
        out._vertical_name = vr?.name ?? null;
    } else {
        out._vertical_slug = null;
        out._vertical_name = null;
    }

    const orgIdJob = (data as { org_id?: string }).org_id;
    let statusKey = (data as { status_key?: string | null }).status_key;
    const jobStatusFk = (data as { job_status_id?: string | null }).job_status_id;
    if ((!statusKey || !String(statusKey).trim()) && jobStatusFk) {
        const { data: jst } = await supabase.from("job_statuses").select("key").eq("id", jobStatusFk).maybeSingle();
        const k = (jst as { key?: string | null } | null)?.key;
        if (k && String(k).trim()) {
            statusKey = String(k).trim();
            out.status_key = statusKey;
        }
    }
    out._status_display = orgIdJob
        ? await resolveStatusLabel(supabase, orgIdJob, "jobs", statusKey)
        : typeof statusKey === "string" && statusKey.trim()
          ? statusKey.trim()
          : null;

    const grossBasis = computeJobGrossBasisCents(data as JobPriceInput) ?? 0;
    out._discount_amount_cents = normalizeJobDiscountAmountToCents(
        (data as { discount_amount?: number | string | null }).discount_amount,
        grossBasis
    );
    const display_total_cents = computeJobDisplayTotalCents(data as JobPriceInput);
    out.display_total_cents = display_total_cents;
    out._price_display = display_total_cents != null ? display_total_cents / 100 : null;
    const codeStr = String((data as { discount_code?: string | null }).discount_code ?? "").trim();
    out._discount_applied =
        Number(out._discount_amount_cents ?? 0) > 0 ||
        !!codeStr ||
        !!(data as { discount_code_id?: string | null }).discount_code_id ||
        !!(data as { discount_program_id?: string | null }).discount_program_id;

    const { data: nextSched } = await supabase
        .from("schedules")
        .select("start_at")
        .eq("job_id", jobId)
        .eq("org_id", orgId)
        .is("canceled_at", null)
        .gte("start_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(1)
        .maybeSingle();
    out._next_schedule = (nextSched as { start_at?: string } | null)?.start_at ?? null;

    out._discount_selection = await inferJobDiscountSelectionToken(supabase, {
        discount_program_id: (data as { discount_program_id?: string | null }).discount_program_id ?? null,
        discount_code_id: (data as { discount_code_id?: string | null }).discount_code_id ?? null,
    });
    out._discount_label = await buildJobDiscountDisplayLabel(supabase, {
        discount_program_id: (data as { discount_program_id?: string | null }).discount_program_id ?? null,
        discount_code_id: (data as { discount_code_id?: string | null }).discount_code_id ?? null,
        discount_code: (data as { discount_code?: string | null }).discount_code ?? null,
    });

    out._service_home_type_label = null;
    out._service_sqft_band_label = null;
    out._service_square_footage = null;
    out._service_square_footage_display = null;
    out._service_bedrooms = null;
    out._service_bathrooms = null;
    const { data: cjdJob } = await supabase.from("cleaning_job_details").select("*").eq("job_id", jobId).maybeSingle();
    const jd = cjdJob as {
        home_type_key?: string | null;
        square_footage_tier_key?: string | null;
        beds?: number | null;
        baths?: number | null;
    } | null;
    if (jd) {
        out._service_bedrooms = jd.beds ?? null;
        out._service_bathrooms = jd.baths ?? null;
        out._service_square_footage = null;
        if (jd.home_type_key) {
            out._service_home_type_label = await optionItemLabelForOrg(supabase, orgId, "home_type", jd.home_type_key);
        }
        if (jd.square_footage_tier_key) {
            out._service_sqft_band_label = await optionItemLabelForOrg(supabase, orgId, "square_footage_tier", jd.square_footage_tier_key);
        }
        const bandLabel = out._service_sqft_band_label != null ? String(out._service_sqft_band_label).trim() : "";
        out._service_square_footage_display = bandLabel || null;
    }

    const jobDprogId = (data as { discount_program_id?: string | null }).discount_program_id ?? null;
    if (jobDprogId) {
        const { data: dpr } = await supabase.from("discount_programs").select("name").eq("id", jobDprogId).maybeSingle();
        out._discount_program_label = (dpr as { name?: string | null } | null)?.name ?? null;
    } else {
        out._discount_program_label = null;
    }

    const withWu = await attachJobWorkUnitDisplay(supabase, orgId, out);
    out._work_unit_name = withWu._work_unit_name;
    out._work_unit_department_name = withWu._work_unit_department_name;
    out._work_unit_label = withWu._work_unit_label;

    out._job_line_items = await fetchActiveJobLineItemsForAdmin(supabase, orgId, jobId);

    await attachFieldDefinitionsAndValues(supabase, out, "jobs", jobId);
    await attachDirectFkRelationshipDisplays(supabase, orgId, "jobs", out);

    const rrs = await buildJobRrsPayload(supabase, orgId, jobId, surface, data as Record<string, unknown>, out);

    return { ok: true, flat: out, rrs };
}
