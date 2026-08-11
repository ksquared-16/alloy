import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { adminPerfEnabled, adminPerfNow, logAdminPerf } from "@/lib/admin/perfTrace";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { formatRecurrenceLabel } from "@/lib/adminFormatters";
import { attachDirectFkRelationshipDisplays } from "@/lib/admin/relationshipDisplayAttach";
import { computeScheduleHydratedDisplay } from "@/lib/admin/scheduleRecordSnapshot";
import { attachFieldDefinitionsAndValues } from "@/lib/admin/entityFieldRegistryAttach";
import { attachPersonDrawerVisibility } from "@/lib/admin/person/attachPersonDrawerVisibility";
import { computeJobDisplayTotalCents, type JobPriceInput } from "@/lib/admin/jobDisplayPrice";
import {
    fetchEffectiveStatusDefinitions,
    inferDocumentStatusFromStored,
    resolveStatusLabel,
} from "@/lib/admin/statusDefinitionsResolve";
import { normalizeDocumentRow } from "@/lib/admin/normalizeDocumentRow";
import { formatFrequencyLabel } from "@/lib/adminFormatters";
import { getPaymentAllocationRollup } from "@/lib/admin/jobPaymentBalances";
import { optionItemLabelForOrg } from "@/lib/admin/optionItemLabelForOrg";
import { hydrateVendorDisplayStub } from "@/lib/admin/hydrateVendorDisplayStub";
import { resolveJobRecord } from "@/lib/rrs/entities/job";
import { resolveRecordSurfaceParam } from "@/lib/rrs/surfaces";
import { respondOpportunityEntityGet } from "@/lib/admin/opportunityEntityRecord";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertEntityDrawerRecordReadable, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { documentActorFromAdminParts } from "@/lib/documents/projectPersonProfilePhotos";
import { apiError, apiOk } from "@/lib/api/apiResponse";

/**
 * Phase 2D contract (fully migrated): every response uses the standard envelope.
 * - Success: `{ ok: true, data: { entity }, correlation_id }` — the entity payload
 *   shape is preserved verbatim inside `data.entity` (including the `{ _create: true }`
 *   new-record sentinel). Active consumers unwrap `json.data.entity`.
 * - Failure: `{ ok: false, error: { code, message }, correlation_id }` — HTTP status
 *   codes are preserved exactly.
 * @see docs/api/api-response-contract.md
 * @see docs/api/api-contract-migration-status.md
 */
function entityNotFound(message = "Not found") {
    return apiError("NOT_FOUND", message, 404);
}
function entityBadRequest(message: string) {
    return apiError("BAD_REQUEST", message, 400);
}
function entityServerError(message = "Failed to fetch entity") {
    return apiError("INTERNAL", message, 500);
}
/** Standard success envelope for entity reads: `{ ok, data: { entity }, correlation_id }`. */
function entityOk(entity: unknown, request: NextRequest) {
    return apiOk({ entity }, { request });
}
/** Map a Supabase error to the prior status semantics (PGRST116 = no rows → 404, else 500). */
function entitySupabaseError(
    err: { code?: string | null; message?: string | null } | null | undefined,
    fallback = "Not found"
) {
    const message = err?.message || fallback;
    return err?.code === "PGRST116" ? entityNotFound(message) : entityServerError(message);
}
/** Preserve a precomputed status while emitting the standard failure envelope. */
function entityStatusError(message: string, status: number) {
    const code = status === 404 ? "NOT_FOUND" : status >= 500 ? "INTERNAL" : "BAD_REQUEST";
    return apiError(code, message, status);
}

/**
 * Drawer entity org model:
 * - **Tenant-scoped** (primary row has `org_id` or access is verified via FKs): jobs, opportunities, contacts, customers, schedules, locations, workflows, vendors, subscriptions, documents, payments, customer_members, persons, service_offerings, service_plan_templates, discount_redemptions (no `org_id` on row — allowed when any linked customer/job/opportunity/contact is in the caller org).
 * - **Global / catalog** (no org on primary table): `verticals`, `discount_codes`, `assignment_statuses`, `job_statuses`, `location_types` (read in joins only). **`addons`** maps to `pricing_addons` (vertical-scoped, no `org_id`); any authenticated admin may open a row by id.
 */
const ENTITY_TYPES = ["jobs", "opportunities", "contacts", "customers", "customer_members", "persons", "schedules", "discount_redemptions", "workflows", "vendors", "subscriptions", "locations", "payments", "service_offerings", "service_plan_templates", "addons", "documents"] as const;

async function assertDiscountRedemptionInOrg(
    supabase: ReturnType<typeof createAdminClient>,
    redemptionId: string,
    orgId: string
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false }> {
    const { data, error } = await supabase.from("discount_redemptions").select("*").eq("id", redemptionId).maybeSingle();
    if (error || !data) return { ok: false };
    const r = data as {
        customer_id?: string | null;
        job_id?: string | null;
        opportunity_id?: string | null;
        contact_id?: string | null;
    };
    const paths: Promise<{ ok: boolean }>[] = [];
    if (r.customer_id) paths.push(assertRowOrg(supabase, "customers", r.customer_id, orgId));
    if (r.job_id) paths.push(assertRowOrg(supabase, "jobs", r.job_id, orgId));
    if (r.opportunity_id) paths.push(assertRowOrg(supabase, "opportunities", r.opportunity_id, orgId));
    if (r.contact_id) paths.push(assertRowOrg(supabase, "contacts", r.contact_id, orgId));
    if (paths.length === 0) return { ok: false };
    const results = await Promise.all(paths);
    if (!results.some((x) => x.ok)) return { ok: false };
    return { ok: true, row: data as Record<string, unknown> };
}

type ContactRow = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; person_id?: string | null };

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

// ---------------------------------------------------------------------------
// Person payload build timing
// ---------------------------------------------------------------------------
const PERSON_PAYLOAD_TIMING_LOG =
    process.env.NODE_ENV === "development" || process.env.PERSON_PAYLOAD_TIMING === "1";

function logPersonPayloadBuildTiming(
    personId: string,
    timing: Map<string, number>,
    totalMs: number
): void {
    if (!PERSON_PAYLOAD_TIMING_LOG) return;
    const W = 16;
    const pad = (s: string) => s + ".".repeat(Math.max(1, W - s.length));
    const fmt = (v: number) => `${Math.round(v)}ms`;
    const sum = (...keys: string[]) =>
        keys.reduce((a, k) => a + (timing.get(k) ?? 0), 0);
    const rows: Array<[string, string[]]> = [
        ["summary",       ["summary"]],
        ["household",     ["customer_persons", "household_links"]],
        ["address",       ["household_address"]],
        ["employee",      []],
        ["medical",       []],
        ["relationships", ["person_relationships", "contacts_members", "locations", "opportunities"]],
        ["BOS",           ["enrollment_mirror", "enrollment_opportunities", "sibling_links"]],
        ["permissions",   ["field_defs", "fk_displays"]],
    ];
    console.info(
        `[person-payload] ${personId.slice(0, 8)}…\n` +
        rows.map(([label, keys]) => `  ${pad(label)}${fmt(sum(...keys))}`).join("\n") +
        `\n  ${pad("TOTAL")}${fmt(totalMs)}`
    );
}

async function getEntityImpl(
    request: NextRequest,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    const { type, id } = await params;
    if (!id || !ENTITY_TYPES.includes(type as (typeof ENTITY_TYPES)[number])) {
        return entityBadRequest("Invalid type or id");
    }

    try {
        const ctx = await getAdminContextCached();
        if (!ctx.ok) return adminContextFailureResponse(ctx);
        const orgId = ctx.orgId;

        const access = await getAdminAccessContextCached();
        if (!access.ok) return adminContextFailureResponse(access);
        const scopeDim = scopeDimensionsFromAccess(access);

        const supabase = createAdminClient();

        const skipDrawerScopeGate = id === "new" || type === "opportunities" || type === "addons";
        if (!skipDrawerScopeGate) {
            if (!(await assertEntityDrawerRecordReadable(supabase, orgId, scopeDim, type, id))) {
                return entityNotFound();
            }
        }

        if (type === "jobs") {
            if (id === "new") {
                return entityOk({ _create: true }, request);
            }
            const surface = resolveRecordSurfaceParam(request.nextUrl.searchParams.get("surface"), "full");
            const resolved = await resolveJobRecord(supabase, orgId, id, surface);
            if (!resolved.ok) {
                const status = resolved.notFound ? 404 : 500;
                return entityStatusError(resolved.message || "Not found", status);
            }
            return entityOk({ ...resolved.flat, _rrs: resolved.rrs }, request);
        }
        if (type === "opportunities") {
            return respondOpportunityEntityGet(
                supabase,
                orgId,
                id,
                request,
                scopeDim,
                documentActorFromAdminParts({
                    ok: true,
                    userId: ctx.userId,
                    orgId: ctx.orgId,
                    role: ctx.role,
                    roleKeys: access.roleKeys,
                    permissionKeys: access.permissionKeys,
                }),
            );
        }
        if (type === "contacts") {
            if (id === "new") {
                return entityOk({ _create: true }, request);
            }
            const { data, error } = await supabase.from("contacts").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return entitySupabaseError(error);
            const contact = data as { customer_id?: string | null; vendor_id?: string | null; person_id?: string | null };
            let _person: Record<string, unknown> | null = null;
            let _person_id: string | null = null;
            let _person_name: string | null = null;
            if (contact.person_id) {
                const { data: personRow } = await supabase
                    .from("persons")
                    .select(
                        "id, first_name, last_name, full_name, email, phone, is_employee, employee_id, employee_source, created_at, updated_at"
                    )
                    .eq("id", contact.person_id)
                    .eq("org_id", orgId)
                    .maybeSingle();
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
                const { data: cust } = await supabase.from("customers").select("name").eq("id", contact.customer_id).eq("org_id", orgId).maybeSingle();
                _linked_customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            }
            if (contact.vendor_id) {
                const { data: vend } = await supabase.from("vendors").select("name").eq("id", contact.vendor_id).eq("org_id", orgId).maybeSingle();
                _linked_vendor_name = (vend as { name?: string | null } | null)?.name ?? null;
            }
            const [custPrimary, vendPrimary] = await Promise.all([
                supabase.from("customers").select("id").eq("primary_contact_id", id).eq("org_id", orgId).limit(1).maybeSingle(),
                supabase.from("vendors").select("id").eq("primary_contact_id", id).eq("org_id", orgId).limit(1).maybeSingle(),
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
                    .eq("org_id", orgId)
                    .single();
                if (vendor) _contact_vendor = { id: vendor.id, name: vendor.name ?? null, vendor_status_id: vendor.vendor_status_id ?? null, created_at: vendor.created_at };
            }
            return entityOk({
                ...data,
                _contact_vendor,
                _linked_customer_name,
                _linked_vendor_name,
                _primary_contact_for,
                _person: _person ?? null,
                _person_id,
                _person_name,
            }, request);
        }
        if (type === "customers") {
            const { data, error } = await supabase.from("customers").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return entitySupabaseError(error);
            const out: Record<string, unknown> = { ...data };
            const primaryContactId = (data as { primary_contact_id?: string | null }).primary_contact_id;
            const verticalId = (data as { vertical_id?: string | null }).vertical_id;
            const metadata = (data as { metadata?: Record<string, unknown> | null }).metadata;
            if (primaryContactId) {
                const { data: contact } = await supabase
                    .from("contacts")
                    .select("id, first_name, last_name, email, phone, person_id")
                    .eq("id", primaryContactId)
                    .eq("org_id", orgId)
                    .maybeSingle();
                out._primary_contact = contact ?? null;
                const c = contact as ContactRow | null;
                out._primary_contact_name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null : null;
                out._primary_contact_email = c?.email ?? null;
                out._primary_contact_phone = c?.phone ?? null;
                if (c?.person_id) {
                    const { data: person } = await supabase
                        .from("persons")
                        .select("id, first_name, last_name, email, phone")
                        .eq("id", c.person_id)
                        .eq("org_id", orgId)
                        .maybeSingle();
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
            {
                const [
                    { count: contactsCount },
                    { count: oppCount },
                    { count: jobsCount },
                    { count: locsCount },
                ] = await Promise.all([
                    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("customer_id", id).eq("org_id", orgId),
                    supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("customer_id", id).eq("org_id", orgId),
                    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("customer_id", id).eq("org_id", orgId),
                    supabase.from("locations").select("id", { count: "exact", head: true }).eq("customer_id", id).eq("org_id", orgId),
                ]);
                const { data: jobRows } = await supabase.from("jobs").select("id").eq("customer_id", id).eq("org_id", orgId);
                const jobIds = (jobRows ?? []).map((j: { id: string }) => j.id);
                let schedulesCount = 0;
                if (jobIds.length > 0) {
                    const { count } = await supabase
                        .from("schedules")
                        .select("id", { count: "exact", head: true })
                        .in("job_id", jobIds)
                        .eq("org_id", orgId);
                    schedulesCount = count ?? 0;
                }
                out._counts = {
                    contacts: contactsCount ?? 0,
                    opportunities: oppCount ?? 0,
                    jobs: jobsCount ?? 0,
                    schedules: schedulesCount,
                    locations: locsCount ?? 0,
                };
            }
            await attachFieldDefinitionsAndValues(supabase, out, "customers", id);
            await attachDirectFkRelationshipDisplays(supabase, orgId, "customers", out);
            return entityOk(out, request);
        }
        if (type === "schedules") {
            if (id === "new") {
                return entityOk({ _create: true }, request);
            }
            const { data: schedule, error } = await supabase.from("schedules").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !schedule) return entitySupabaseError(error);
            const out: Record<string, unknown> = { ...schedule };
            const scheduleLocationId = (schedule as { location_id?: string | null }).location_id;
            const jobId = (schedule as { job_id?: string }).job_id;
            if (jobId) {
                const { data: job } = await supabase
                    .from("jobs")
                    .select(
                        "id, title, customer_id, primary_contact_id, primary_person_id, opportunity_id, vertical_id, job_status_id, assigned_vendor_id, location_id, service_key, job_type, gross_price_cents, estimated_total_cents"
                    )
                    .eq("id", jobId)
                    .eq("org_id", orgId)
                    .single();
                out._job = job ?? null;
                if (job) {
                    if ((job as { customer_id?: string }).customer_id) {
                        const { data: cust } = await supabase
                            .from("customers")
                            .select("id, name")
                            .eq("id", (job as { customer_id: string }).customer_id)
                            .eq("org_id", orgId)
                            .single();
                        out._customer = cust ?? null;
                    } else out._customer = null;
                    const jobPrimaryPersonId = (job as { primary_person_id?: string | null }).primary_person_id;
                    const jobPrimaryContactId = (job as { primary_contact_id?: string }).primary_contact_id;
                    if (jobPrimaryPersonId) {
                        const { data: person } = await supabase
                            .from("persons")
                            .select("id, first_name, last_name, email, phone")
                            .eq("id", jobPrimaryPersonId)
                            .eq("org_id", orgId)
                            .maybeSingle();
                        const p = person as { id: string; first_name?: string | null; last_name?: string | null } | null;
                        out._primary_person_id = p?.id ?? null;
                        out._primary_person_name = p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null : null;
                        out._contact = p ? { id: p.id, first_name: p.first_name, last_name: p.last_name, email: (person as { email?: string | null }).email, phone: (person as { phone?: string | null }).phone, person_id: p.id } : null;
                    } else if (jobPrimaryContactId) {
                        const { data: contact } = await supabase
                            .from("contacts")
                            .select("id, first_name, last_name, email, phone, person_id")
                            .eq("id", jobPrimaryContactId)
                            .eq("org_id", orgId)
                            .single();
                        out._contact = contact ?? null;
                        const contactWithPerson = contact as { person_id?: string | null } | null;
                        if (contactWithPerson?.person_id) {
                            const { data: person } = await supabase
                                .from("persons")
                                .select("id, first_name, last_name")
                                .eq("id", contactWithPerson.person_id)
                                .eq("org_id", orgId)
                                .maybeSingle();
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
                        const { data: opp } = await supabase
                            .from("opportunities")
                            .select("id, name")
                            .eq("id", (job as { opportunity_id: string }).opportunity_id)
                            .eq("org_id", orgId)
                            .single();
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
            const { data: assignment } = await supabase
                .from("assignments")
                .select("id, schedule_id, job_id, vendor_id, assignment_status_id, created_at")
                .eq("schedule_id", id)
                .eq("org_id", orgId)
                .maybeSingle();
            out._assignment = assignment ?? null;
            if (assignment) {
                out._vendor = await hydrateVendorDisplayStub(supabase, (assignment as { vendor_id: string }).vendor_id, orgId);
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
                    out._job_assigned_vendor = await hydrateVendorDisplayStub(supabase, jobVendorId, orgId);
                } else {
                    out._job_assigned_vendor = null;
                }
            } else {
                out._job_assigned_vendor = null;
            }
            const effectiveLocationId = scheduleLocationId ?? (out._job as { location_id?: string | null } | null)?.location_id ?? null;
            out._location_id = effectiveLocationId ?? null;
            if (effectiveLocationId) {
                const { data: loc } = await supabase
                    .from("locations")
                    .select("id, label, address1, city, state, postal_code")
                    .eq("id", effectiveLocationId)
                    .eq("org_id", orgId)
                    .maybeSingle();
                if (loc) {
                    const l = loc as { label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null };
                    out._location_label = l.label ?? ([l.address1, l.city, l.postal_code].filter(Boolean).join(", ") || null);
                    out._location_name = out._location_label;
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
            const sched = schedule as { start_at?: string | null; end_at?: string | null };
            const jobRef = out._job as { title?: string | null } | null;
            const vertRef = out._vertical as { name?: string | null } | null;
            const jobTitle = jobRef?.title?.trim() || null;
            const vertName = vertRef?.name?.trim() || null;
            const startRaw = sched.start_at ? String(sched.start_at) : "";
            const endRaw = sched.end_at ? String(sched.end_at) : "";
            const timePart =
                startRaw && endRaw
                    ? `${startRaw.slice(0, 10)} ${startRaw.slice(11, 16)}–${endRaw.slice(11, 16)}`
                    : startRaw
                      ? `${startRaw.slice(0, 10)} ${startRaw.slice(11, 16)}`
                      : null;
            const titleParts = [jobTitle, vertName, timePart].filter(Boolean) as string[];
            out._schedule_display_title = titleParts.length > 0 ? titleParts.join(" · ") : "Schedule";

            let schedStatusKey = (schedule as { status_key?: string | null }).status_key;
            const schedStatusFk = (schedule as { schedule_status_id?: string | null }).schedule_status_id;
            if ((!schedStatusKey || !String(schedStatusKey).trim()) && schedStatusFk) {
                const { data: sst } = await supabase
                    .from("schedule_statuses")
                    .select("key, label")
                    .eq("id", schedStatusFk)
                    .maybeSingle();
                const row = sst as { key?: string | null; label?: string | null } | null;
                if (row?.key && String(row.key).trim()) {
                    schedStatusKey = String(row.key).trim();
                    out.status_key = schedStatusKey;
                }
                if (row?.label && String(row.label).trim()) {
                    out._schedule_status_label = String(row.label).trim();
                }
            }
            const schedOrgId = (schedule as { org_id?: string }).org_id;
            out._status_display = schedOrgId
                ? await resolveStatusLabel(supabase, schedOrgId, "schedules", schedStatusKey)
                : (typeof schedStatusKey === "string" && schedStatusKey.trim() ? schedStatusKey.trim() : null);

            const jt = jobRef?.title?.trim() || null;
            out._job_title = jt;
            const subId = (schedule as { customer_subscription_id?: string | null }).customer_subscription_id;
            if (subId) {
                const { data: subRow } = await supabase
                    .from("customer_subscriptions")
                    .select("id, customer_id, vertical_id, cadence, interval")
                    .eq("id", subId)
                    .eq("org_id", orgId)
                    .maybeSingle();
                const sr = subRow as {
                    customer_id?: string;
                    vertical_id?: string | null;
                    cadence?: string | null;
                    interval?: number | null;
                } | null;
                if (sr?.customer_id) {
                    const freq = formatFrequencyLabel(sr.cadence ?? "month", Math.max(1, Number(sr.interval) || 1));
                    const parts: string[] = [];
                    const { data: custRow } = await supabase.from("customers").select("name").eq("id", sr.customer_id).eq("org_id", orgId).maybeSingle();
                    const custName = (custRow as { name?: string | null } | null)?.name?.trim();
                    if (custName) parts.push(custName);
                    if (sr.vertical_id) {
                        const { data: vertRow } = await supabase.from("verticals").select("name").eq("id", sr.vertical_id).maybeSingle();
                        const vertName = (vertRow as { name?: string | null } | null)?.name?.trim();
                        if (vertName) parts.push(vertName);
                    }
                    parts.push(freq);
                    out._customer_subscription_label = parts.join(" · ");
                } else {
                    out._customer_subscription_label = `Subscription ${subId.slice(0, 8)}…`;
                }
            } else {
                out._customer_subscription_label = null;
            }

            const vStub = out._vendor as { name?: string; id?: string } | null;
            const jvStub = out._job_assigned_vendor as { name?: string; id?: string } | null;
            let assignedVendorName = vStub?.name ?? jvStub?.name ?? null;
            const scheduleRowVendorId = (schedule as { assigned_vendor_id?: string | null }).assigned_vendor_id ?? null;
            if (!assignedVendorName && scheduleRowVendorId) {
                const rowStub = await hydrateVendorDisplayStub(supabase, scheduleRowVendorId, orgId);
                assignedVendorName = rowStub?.name ?? null;
            }
            out._assigned_vendor_name = assignedVendorName;
            const assignVid = (assignment as { vendor_id?: string } | null)?.vendor_id ?? null;
            if (!(out.assigned_vendor_id as string | null | undefined) && assignVid) {
                out.assigned_vendor_id = assignVid;
            }

            out._service_home_type_label = null;
            out._service_square_footage_display = null;
            out._service_bedrooms = null;
            out._service_bathrooms = null;
            if (jobId) {
                const { data: cjdSched } = await supabase.from("cleaning_job_details").select("*").eq("job_id", jobId).maybeSingle();
                const sd = cjdSched as {
                    home_type_key?: string | null;
                    square_footage_tier_key?: string | null;
                    beds?: number | null;
                    baths?: number | null;
                } | null;
                if (sd) {
                    out._service_bedrooms = sd.beds ?? null;
                    out._service_bathrooms = sd.baths ?? null;
                    if (sd.home_type_key) {
                        out._service_home_type_label = await optionItemLabelForOrg(supabase, orgId, "home_type", sd.home_type_key);
                    }
                    let bandLabel = "";
                    if (sd.square_footage_tier_key) {
                        bandLabel =
                            (await optionItemLabelForOrg(
                                supabase,
                                orgId,
                                "square_footage_tier",
                                sd.square_footage_tier_key
                            )) ?? "";
                    }
                    out._service_square_footage_display = bandLabel.trim() || null;
                }
            }

            await attachFieldDefinitionsAndValues(supabase, out, "schedules", id);
            await attachDirectFkRelationshipDisplays(supabase, orgId, "schedules", out);
            computeScheduleHydratedDisplay(out);
            return entityOk(out, request);
        }
        if (type === "locations") {
            const { data: location, error } = await supabase
                .from("locations")
                .select("*")
                .eq("id", id)
                .eq("org_id", orgId)
                .single();
            if (error || !location) {
                return entityNotFound(error?.code === "PGRST116" ? "Not found" : error?.message ?? "Not found");
            }
            const out: Record<string, unknown> = { ...location };
            const locSk = (location as { status_key?: string | null }).status_key;
            out._status_display = await resolveStatusLabel(supabase, orgId, "locations", locSk);
            const locationTypeId = (location as { location_type_id?: string | null }).location_type_id;
            if (locationTypeId) {
                const { data: typeRow } = await supabase.from("location_types").select("label").eq("id", locationTypeId).maybeSingle();
                out._location_type_label = (typeRow as { label?: string } | null)?.label ?? null;
            } else {
                out._location_type_label = null;
            }
            const customerId = (location as { customer_id: string }).customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("id, name").eq("id", customerId).eq("org_id", orgId).maybeSingle();
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
                .eq("org_id", orgId);
            const plList = plRows ?? [];
            const personIdsFromPl = [...new Set(plList.map((r: { person_id: string }) => r.person_id))];
            const { data: personRowsForLoc } =
                personIdsFromPl.length > 0
                    ? await supabase
                          .from("persons")
                          .select("id, first_name, last_name, full_name, email")
                          .eq("org_id", orgId)
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

            const accessMethodKey = (location as { access_method_key?: string | null }).access_method_key;
            const accessMethodId = (location as { access_method_id?: string | null }).access_method_id;
            if (accessMethodKey) {
                out._access_method_label = await optionItemLabelForOrg(supabase, orgId, "access_method", accessMethodKey);
            } else if (accessMethodId) {
                const { data: amRow } = await supabase.from("access_methods").select("label").eq("id", accessMethodId).maybeSingle();
                out._access_method_label = (amRow as { label?: string } | null)?.label ?? null;
            } else {
                out._access_method_label = null;
            }

            out._service_home_type_label = null;
            out._service_sqft_band_label = null;
            out._service_square_footage = null;
            out._service_square_footage_display = null;
            out._service_bedrooms = null;
            out._service_bathrooms = null;
            out._service_details_job_id = null;

            const { data: latestJob } = await supabase
                .from("jobs")
                .select("id")
                .eq("location_id", id)
                .eq("org_id", orgId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            const latestJobId = (latestJob as { id?: string } | null)?.id ?? null;
            if (latestJobId) {
                const { data: cjd } = await supabase.from("cleaning_job_details").select("*").eq("job_id", latestJobId).maybeSingle();
                const details = cjd as {
                    home_type_key?: string | null;
                    square_footage_tier_key?: string | null;
                    beds?: number | null;
                    baths?: number | null;
                } | null;
                if (details) {
                    out._service_details_job_id = latestJobId;
                    out._service_bedrooms = details.beds ?? null;
                    out._service_bathrooms = details.baths ?? null;
                    out._service_square_footage = null;
                    if (details.home_type_key) {
                        out._service_home_type_label = await optionItemLabelForOrg(
                            supabase,
                            orgId,
                            "home_type",
                            details.home_type_key
                        );
                    }
                    if (details.square_footage_tier_key) {
                        out._service_sqft_band_label = await optionItemLabelForOrg(
                            supabase,
                            orgId,
                            "square_footage_tier",
                            details.square_footage_tier_key
                        );
                    }
                    const bandLabel = out._service_sqft_band_label != null ? String(out._service_sqft_band_label).trim() : "";
                    out._service_square_footage_display = bandLabel || null;
                }
            }

            await attachFieldDefinitionsAndValues(supabase, out, "locations", id);
            await attachDirectFkRelationshipDisplays(supabase, orgId, "locations", out);
            return entityOk(out, request);
        }
        if (type === "discount_redemptions") {
            const dr = await assertDiscountRedemptionInOrg(supabase, id, orgId);
            if (!dr.ok) return entityNotFound();
            const redemption = dr.row as Record<string, unknown> & {
                discount_code_id: string;
                customer_id?: string | null;
                contact_id?: string | null;
                opportunity_id?: string | null;
                job_id?: string | null;
            };
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
                const { data: cust } = await supabase.from("customers").select("name").eq("id", redemption.customer_id).eq("org_id", orgId).maybeSingle();
                out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            } else out._customer_name = null;
            if (redemption.contact_id) {
                const { data: contact } = await supabase
                    .from("contacts")
                    .select("first_name, last_name, person_id")
                    .eq("id", redemption.contact_id)
                    .eq("org_id", orgId)
                    .maybeSingle();
                const ct = contact as { first_name?: string | null; last_name?: string | null; person_id?: string | null } | null;
                out._contact_name = ct ? [ct.first_name, ct.last_name].filter(Boolean).join(" ") || null : null;
                if (ct?.person_id) {
                    const { data: person } = await supabase
                        .from("persons")
                        .select("id, first_name, last_name")
                        .eq("id", ct.person_id)
                        .eq("org_id", orgId)
                        .maybeSingle();
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
                const { data: opp } = await supabase
                    .from("opportunities")
                    .select("name")
                    .eq("id", redemption.opportunity_id)
                    .eq("org_id", orgId)
                    .maybeSingle();
                out._opportunity_name = (opp as { name?: string | null } | null)?.name ?? null;
            } else out._opportunity_name = null;
            if (redemption.job_id) {
                const { data: job } = await supabase
                    .from("jobs")
                    .select("id, title, service_key, job_number_for_customer")
                    .eq("id", redemption.job_id)
                    .eq("org_id", orgId)
                    .maybeSingle();
                const j = job as { title?: string | null; service_key?: string | null; job_number_for_customer?: string | null } | null;
                out._job_label = j ? ((j.title && String(j.title).trim()) || (j.service_key && String(j.service_key).trim()) || (j.job_number_for_customer && String(j.job_number_for_customer).trim()) || `Job #${(redemption.job_id as string).slice(-6)}`) : null;
            } else out._job_label = null;
            return entityOk(out, request);
        }
        if (type === "workflows") {
            if (id === "new") {
                return entityOk({ _create: true }, request);
            }
            const { data: wf, error: wErr } = await supabase.from("workflows").select("*").eq("id", id).eq("org_id", orgId).single();
            if (wErr || !wf) return entitySupabaseError(wErr);
            const { data: cond } = await supabase.from("workflow_conditions").select("*").eq("workflow_id", id);
            const { data: acts } = await supabase.from("workflow_actions").select("*").eq("workflow_id", id).order("action_order", { ascending: true });
            return entityOk({
                ...wf,
                _conditions: cond ?? [],
                _actions: acts ?? [],
            }, request);
        }
        if (type === "vendors") {
            const { data: vendor, error: vErr } = await supabase.from("vendors").select("*").eq("id", id).eq("org_id", orgId).single();
            if (vErr || !vendor) return entitySupabaseError(vErr);
            const v = vendor as Record<string, unknown> & {
                status_key?: string | null;
                status?: string | null;
                primary_contact_id?: string | null;
                primary_person_id?: string | null;
            };
            const out: Record<string, unknown> = { ...vendor };
            const vOrgId = orgId;
            out._vendor_status_label = null;
            out._status_display = vOrgId
                ? await resolveStatusLabel(supabase, vOrgId, "vendors", v.status_key ?? v.status ?? null)
                : (v.status_key ?? v.status ?? null);
            if (vOrgId) {
                try {
                    const vDefs = await fetchEffectiveStatusDefinitions(supabase, vOrgId, "vendors", { activeOnly: true });
                    out._vendor_status_options = vDefs.map((d) => ({
                        id: d.id,
                        key: d.status_key,
                        label: (d.status_label?.trim() || d.status_key) as string,
                    }));
                } catch {
                    out._vendor_status_options = [];
                }
            } else {
                out._vendor_status_options = [];
            }

            const directPersonId = v.primary_person_id ?? null;
            const primaryContactId = v.primary_contact_id ?? null;

            type PersonLite = { id: string; first_name?: string | null; last_name?: string | null } | null;
            let personLite: PersonLite = null;

            if (directPersonId) {
                const { data: pDirect } = await supabase
                    .from("persons")
                    .select("id, first_name, last_name")
                    .eq("id", directPersonId)
                    .eq("org_id", orgId)
                    .maybeSingle();
                personLite = (pDirect as PersonLite) ?? null;
            }

            if (primaryContactId) {
                const { data: pc } = await supabase
                    .from("contacts")
                    .select("id, first_name, last_name, email, phone, person_id")
                    .eq("id", primaryContactId)
                    .eq("org_id", orgId)
                    .single();
                const c = pc as { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; person_id?: string | null } | null;
                out._primary_contact = pc;
                out._primary_contact_name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null : null;
                out._primary_contact_email = c?.email ?? null;
                out._primary_contact_phone = c?.phone ?? null;
                if (!personLite && c?.person_id) {
                    const { data: pFromContact } = await supabase
                        .from("persons")
                        .select("id, first_name, last_name")
                        .eq("id", c.person_id)
                        .eq("org_id", orgId)
                        .maybeSingle();
                    personLite = (pFromContact as PersonLite) ?? null;
                }
            } else {
                out._primary_contact = null;
                out._primary_contact_name = null;
                out._primary_contact_email = null;
                out._primary_contact_phone = null;
            }

            if (personLite) {
                out._primary_person_id = personLite.id;
                out._primary_person_name = [personLite.first_name, personLite.last_name].filter(Boolean).join(" ").trim() || null;
            } else {
                out._primary_person_id = null;
                out._primary_person_name = null;
            }

            const { data: jobsCountRows } = await supabase
                .from("jobs")
                .select("id")
                .eq("assigned_vendor_id", id)
                .eq("org_id", orgId);
            out._jobs_count = (jobsCountRows ?? []).length;

            const JOBS_LIMIT = 25;
            const { data: vendorJobs } = await supabase
                .from("jobs")
                .select(
                    "id, created_at, title, scheduled_at, status_key, job_status_id, gross_price_cents, recurring_total_cents, opportunity_id, assigned_vendor_id, estimated_total_cents, discount_amount, discounted"
                )
                .eq("assigned_vendor_id", id)
                .eq("org_id", orgId)
                .order("created_at", { ascending: false })
                .limit(JOBS_LIMIT);
            let jobStatusLabelByKey = new Map<string, string>();
            if (vOrgId) {
                try {
                    const defs = await fetchEffectiveStatusDefinitions(supabase, vOrgId, "jobs", { activeOnly: true });
                    jobStatusLabelByKey = new Map(defs.map((d) => [d.status_key, (d.status_label && d.status_label.trim()) || d.status_key]));
                } catch {
                    jobStatusLabelByKey = new Map();
                }
            }
            out._vendor_jobs = (vendorJobs ?? []).map((row) => {
                const jsk = (row as { status_key?: string | null }).status_key;
                const jskTrim = jsk && String(jsk).trim() ? String(jsk).trim() : null;
                return {
                    ...row,
                    _job_status_label: jskTrim ? (jobStatusLabelByKey.get(jskTrim) ?? jskTrim) : null,
                    display_total_cents: computeJobDisplayTotalCents(row as JobPriceInput),
                };
            });
            const jobIds = (vendorJobs ?? []).map((j: { id: string }) => j.id);
            const { data: vendorSchedules } = jobIds.length > 0
                ? await supabase
                    .from("schedules")
                    .select("id, job_id, start_at, end_at, timezone")
                    .in("job_id", jobIds)
                    .eq("org_id", orgId)
                    .order("start_at", { ascending: false })
                : { data: [] as unknown[] };
            out._vendor_schedules = vendorSchedules ?? [];

            await attachFieldDefinitionsAndValues(supabase, out, "vendors", id);
            await attachDirectFkRelationshipDisplays(supabase, orgId, "vendors", out);
            return entityOk(out, request);
        }
        if (type === "subscriptions") {
            const { data: sub, error: subErr } = await supabase.from("customer_subscriptions").select("*").eq("id", id).eq("org_id", orgId).single();
            if (subErr || !sub) return entitySupabaseError(subErr);
            const out: Record<string, unknown> = { ...sub };
            const cadence = (sub as { cadence?: string }).cadence ?? "month";
            const interval = Math.max(1, Number((sub as { interval?: number }).interval) || 1);
            const { formatFrequencyLabel } = await import("@/lib/adminFormatters");
            out._frequency_label = formatFrequencyLabel(cadence, interval);
            out._cadence = cadence;
            out._interval = interval;
            const customerId = (sub as { customer_id?: string }).customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("name, org_id").eq("id", customerId).eq("org_id", orgId).maybeSingle();
                out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            } else {
                out._customer_name = null;
            }
            const subStatus = (sub as { status?: string | null }).status ?? null;
            out._status_display = await resolveStatusLabel(supabase, orgId, "subscriptions", subStatus);
            const { data: scheds } = await supabase
                .from("schedules")
                .select("id, job_id, start_at, end_at, timezone, subscription_sequence, rescheduled_from_schedule_id, canceled_at, canceled_by, cancel_reason")
                .eq("customer_subscription_id", id)
                .eq("org_id", orgId)
                .order("subscription_sequence", { ascending: true });
            out._schedules = scheds ?? [];
            out._ref = `SUB-${String(id).slice(-8)}`;
            const schedList = (scheds ?? []) as { start_at?: string | null; canceled_at?: string | null }[];
            const upcoming = schedList.find((s) => s.start_at && !s.canceled_at);
            out._scheduled_for = upcoming?.start_at ?? schedList[0]?.start_at ?? null;
            out.service_type =
                (sub as { service_type?: string | null }).service_type ??
                (sub as { service_key?: string | null }).service_key ??
                null;
            const subPcId = (sub as { primary_contact_id?: string | null }).primary_contact_id ?? null;
            if (subPcId) {
                const { data: sct } = await supabase.from("contacts").select("first_name, last_name").eq("id", subPcId).eq("org_id", orgId).maybeSingle();
                const sc = sct as { first_name?: string | null; last_name?: string | null } | null;
                out._primary_contact_name = sc ? [sc.first_name, sc.last_name].filter(Boolean).join(" ").trim() || null : null;
            } else {
                out._primary_contact_name = null;
            }
            const subVertId = (sub as { vertical_id?: string | null }).vertical_id ?? null;
            if (subVertId) {
                const { data: sv } = await supabase.from("verticals").select("name").eq("id", subVertId).maybeSingle();
                out._vertical_name = (sv as { name?: string | null } | null)?.name ?? null;
            } else {
                out._vertical_name = null;
            }
            return entityOk(out, request);
        }

        if (type === "documents") {
            const { data: doc, error: docErr } = await supabase
                .from("documents")
                .select("*")
                .eq("id", id)
                .eq("org_id", orgId)
                .maybeSingle();
            if (docErr || !doc) {
                return entitySupabaseError(docErr);
            }
            const row = doc as Record<string, unknown>;
            const out: Record<string, unknown> = { ...row };
            const n = normalizeDocumentRow(row);
            out.name = n.name;
            out.original_filename = n.original_filename;
            out.document_type = n.document_type;
            out.uploaded_at = n.uploaded_at;
            out.status = n.status;
            const docDefsForRow = await fetchEffectiveStatusDefinitions(supabase, orgId, "documents", { activeOnly: true });
            const docUi = inferDocumentStatusFromStored(docDefsForRow, n.status);
            out.status_key = docUi.inferredKey;
            out._status_display = docUi.display;
            out._ref = `DOC-${String(id).slice(-8)}`;
            const et = (row.entity_type as string | null)?.trim() ?? null;
            const eid = (row.entity_id as string | null)?.trim() ?? null;
            out._linked_record_type = et;
            if (et && eid) {
                const labelKey = `${et}:${eid}`;
                const labelMap = new Map<string, string>();
                if (et === "customer") {
                    const { data: c } = await supabase.from("customers").select("id, name").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (c) labelMap.set(labelKey, (c as { name?: string | null }).name?.trim() || `Customer ${eid.slice(0, 8)}…`);
                } else if (et === "vendor") {
                    const { data: v } = await supabase.from("vendors").select("id, name").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (v) labelMap.set(labelKey, (v as { name?: string | null }).name?.trim() || `Vendor ${eid.slice(0, 8)}…`);
                } else if (et === "job") {
                    const { data: j } = await supabase.from("jobs").select("id, title").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (j) labelMap.set(labelKey, (j as { title?: string | null }).title?.trim() || `Job ${eid.slice(0, 8)}…`);
                } else if (et === "schedule") {
                    const { data: s } = await supabase.from("schedules").select("id, start_at").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (s) {
                        const st = (s as { start_at?: string | null }).start_at;
                        labelMap.set(labelKey, st ? `Visit ${new Date(st).toLocaleString()}` : `Schedule ${eid.slice(0, 8)}…`);
                    }
                } else if (et === "opportunity") {
                    const { data: o } = await supabase.from("opportunities").select("id, name").eq("id", eid).eq("org_id", orgId).maybeSingle();
                    if (o) labelMap.set(labelKey, (o as { name?: string | null }).name?.trim() || `Opportunity ${eid.slice(0, 8)}…`);
                } else if (et === "contact") {
                    const { data: c } = await supabase
                        .from("contacts")
                        .select("id, first_name, last_name, email")
                        .eq("id", eid)
                        .eq("org_id", orgId)
                        .maybeSingle();
                    if (c) {
                        const cr = c as { first_name?: string | null; last_name?: string | null; email?: string | null };
                        const nm = [cr.first_name, cr.last_name].filter(Boolean).join(" ").trim() || cr.email?.trim() || null;
                        labelMap.set(labelKey, nm || `Contact ${eid.slice(0, 8)}…`);
                    }
                } else if (et === "person") {
                    const { data: p } = await supabase
                        .from("persons")
                        .select("id, first_name, last_name, email, full_name")
                        .eq("id", eid)
                        .eq("org_id", orgId)
                        .maybeSingle();
                    if (p) {
                        const pr = p as {
                            first_name?: string | null;
                            last_name?: string | null;
                            email?: string | null;
                            full_name?: string | null;
                        };
                        const nm =
                            (pr.full_name && String(pr.full_name).trim()) ||
                            [pr.first_name, pr.last_name].filter(Boolean).join(" ").trim() ||
                            pr.email?.trim() ||
                            null;
                        labelMap.set(labelKey, nm || `Person ${eid.slice(0, 8)}…`);
                    }
                }
                out._linked_record_label = labelMap.get(labelKey) ?? null;
            } else {
                out._linked_record_label = null;
            }
            const exStatus = (row.extraction_status as string | null) ?? (row.ai_extraction_status as string | null) ?? null;
            out._ai_extraction_status = exStatus;
            out._uploaded_by = (row.uploaded_by as string | null) ?? null;
            return entityOk(out, request);
        }

        if (type === "payments") {
            const { data, error } = await supabase.from("payments").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return entitySupabaseError(error);
            const payment = data as Record<string, unknown> & {
                customer_id?: string | null;
                job_id?: string | null;
                status_key?: string | null;
                payment_status_id?: string | null;
                provider_payment_id?: string | null;
                processor_transaction_id?: string | null;
                status?: string | null;
                amount_cents?: unknown;
            };
            const out: Record<string, unknown> = { ...payment };
            const procRef =
                (payment.processor_transaction_id && String(payment.processor_transaction_id).trim()) ||
                (payment.provider_payment_id && String(payment.provider_payment_id).trim());
            out._payment_label = procRef || `Payment #${(payment.id as string).slice(-6)}`;

            const amountCents =
                typeof payment.amount_cents === "bigint"
                    ? Number(payment.amount_cents)
                    : Math.round(Number(payment.amount_cents) || 0);
            const rollup = await getPaymentAllocationRollup(supabase, orgId, id, amountCents);
            out._allocation_summary = {
                allocated_amount_cents: rollup.allocated_amount_cents,
                unallocated_amount_cents: rollup.unallocated_amount_cents,
                allocation_state: rollup.allocation_state,
            };

            const { data: allocRows } = await supabase
                .from("payment_allocations")
                .select(
                    "id, target_entity_type, target_entity_id, allocated_amount_cents, status, allocation_type, allocated_at, reversed_at"
                )
                .eq("org_id", orgId)
                .eq("payment_id", id)
                .order("allocated_at", { ascending: false });
            out._allocations = allocRows ?? [];

            if (payment.customer_id) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", payment.customer_id).eq("org_id", orgId).maybeSingle();
                out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            } else {
                out._customer_name = null;
            }

            let primaryJobId: string | null = payment.job_id ?? null;
            if (!primaryJobId && allocRows && allocRows.length > 0) {
                const jobAlloc = (allocRows as { target_entity_type?: string; target_entity_id?: string }[]).find(
                    (a) => String(a.target_entity_type ?? "").toLowerCase() === "job"
                );
                if (jobAlloc?.target_entity_id) primaryJobId = String(jobAlloc.target_entity_id);
            }

            if (primaryJobId) {
                const { data: job } = await supabase
                    .from("jobs")
                    .select("id, title, service_key, job_number_for_customer")
                    .eq("id", primaryJobId)
                    .eq("org_id", orgId)
                    .maybeSingle();
                const j = job as { title?: string | null; service_key?: string | null; job_number_for_customer?: string | null } | null;
                out._job_label = j
                    ? (j.title && String(j.title).trim()) ||
                      (j.service_key && String(j.service_key).trim()) ||
                      (j.job_number_for_customer && String(j.job_number_for_customer).trim()) ||
                      `Job #${primaryJobId.slice(-6)}`
                    : null;
            } else {
                out._job_label = null;
            }

            const canon = payment.status != null && String(payment.status).trim() !== "" ? String(payment.status).trim().toLowerCase() : "";
            const canonicalLabels: Record<string, string> = {
                pending: "Pending",
                posted: "Posted",
                failed: "Failed",
                voided: "Voided",
            };
            const paySk = payment.status_key ?? null;
            const legacyDisplay = await resolveStatusLabel(supabase, orgId, "payments", paySk);
            out._status_display = (canon && canonicalLabels[canon]) || legacyDisplay || canon || paySk || null;
            return entityOk(out, request);
        }
        if (type === "customer_members") {
            if (id === "new") {
                return entityOk({ _create: true }, request);
            }
            const { data: row, error: rowErr } = await supabase
                .from("customer_members")
                .select("*")
                .eq("id", id)
                .eq("org_id", orgId)
                .maybeSingle();
            if (rowErr || !row) {
                return entityNotFound(rowErr?.code === "PGRST116" ? "Not found" : rowErr?.message ?? "Not found");
            }
            const out: Record<string, unknown> = { ...row };
            const personId = (row as { person_id?: string | null }).person_id ?? null;
            if (personId) {
                const { data: personRow } = await supabase
                    .from("persons")
                    .select("id, first_name, last_name, email, phone, created_at, updated_at")
                    .eq("id", personId)
                    .eq("org_id", orgId)
                    .maybeSingle();
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
                const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).eq("org_id", orgId).maybeSingle();
                out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            } else {
                out._customer_name = null;
            }
            const relationshipKey = (row as { relationship?: string | null }).relationship ?? null;
            if (relationshipKey) {
                const { data: relRow } = await supabase
                    .from("customer_member_relationship_types")
                    .select("label")
                    .eq("org_id", orgId)
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
                .eq("org_id", orgId)
                .eq("customer_member_id", id);
            const roleKeys = [...new Set((linkRows ?? []).map((l: Record<string, unknown>) => l.role_key as string).filter(Boolean))];
            const { data: roleRows } = roleKeys.length
                ? await supabase.from("customer_member_contact_roles").select("role_key, label").eq("org_id", orgId).in("role_key", roleKeys)
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
            return entityOk(out, request);
        }

        if (type === "persons") {
            if (id === "new") {
                return entityOk({ _create: true }, request);
            }
            const _buildStart = Date.now();
            const _pt = new Map<string, number>();

            // ── summary: base row + status label ─────────────────────────────
            let _ts = Date.now();
            const { data: personRow, error: personErr } = await supabase
                .from("persons")
                .select("*")
                .eq("id", id)
                .eq("org_id", orgId)
                .maybeSingle();
            if (personErr || !personRow) {
                return entityNotFound(personErr?.code === "PGRST116" ? "Not found" : personErr?.message ?? "Not found");
            }
            const out: Record<string, unknown> = { ...personRow };
            const p = personRow as { full_name?: string | null; first_name?: string | null; last_name?: string | null };
            out._person_name =
                (p.full_name && p.full_name.trim()) ||
                [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
                null;
            const psk = (personRow as { status_key?: string | null }).status_key ?? null;
            out._status_display = await resolveStatusLabel(supabase, orgId, "persons", psk);
            _pt.set("summary", Date.now() - _ts);

            const PERSON_LIMIT = 25;

            // ── Phase 2: all person-level lookups in parallel ─────────────────
            // customer_persons, relationships, contacts/members, locations, and opportunities
            // are fully independent — run them concurrently to eliminate sequential round-trips.
            const [cpResult, relResult, cmResult, locResult, oppResult] = await Promise.all([
                // ── customer_persons ─────────────────────────────────────────
                (async () => {
                    const ts = Date.now();
                    const { data: cpRows } = await supabase
                        .from("customer_persons")
                        .select("id, customer_id, person_id, role_type, is_primary, created_at")
                        .eq("person_id", id)
                        .eq("org_id", orgId);
                    const customerIds = [...new Set((cpRows ?? []).map((r: { customer_id: string }) => r.customer_id))];
                    const roleKeys = [...new Set((cpRows ?? []).map((r: { role_type?: string | null }) => r.role_type).filter(Boolean))] as string[];
                    const [customerRowsRes, roleTypesRes] = await Promise.all([
                        customerIds.length > 0
                            ? supabase.from("customers").select("id, name").in("id", customerIds).eq("org_id", orgId)
                            : { data: [] as { id: string; name: string | null }[] },
                        roleKeys.length > 0
                            ? supabase.from("customer_person_role_types").select("key, label").eq("org_id", orgId).in("key", roleKeys)
                            : { data: [] as { key: string; label: string | null }[] },
                    ]);
                    const customerMap = new Map((customerRowsRes.data ?? []).map((c) => [c.id, c.name ?? null]));
                    const roleLabelMap = new Map((roleTypesRes.data ?? []).map((r) => [r.key, r.label ?? r.key]));
                    return {
                        ms: Date.now() - ts,
                        rows: (cpRows ?? []).map((r: { id: string; customer_id: string; person_id: string; role_type?: string | null; is_primary?: boolean | null; created_at?: string }) => ({
                            ...r,
                            is_primary: Boolean(r.is_primary),
                            _customer_name: customerMap.get(r.customer_id) ?? null,
                            _role_label: r.role_type ? (roleLabelMap.get(r.role_type) ?? r.role_type) : null,
                        })),
                    };
                })(),

                // ── person_relationships ─────────────────────────────────────
                (async () => {
                    const ts = Date.now();
                    const { data: relRows } = await supabase
                        .from("person_relationships")
                        .select("id, from_person_id, to_person_id, relationship_type, created_at")
                        .eq("org_id", orgId)
                        .or(`from_person_id.eq.${id},to_person_id.eq.${id}`);
                    const relTypeKeys = [...new Set((relRows ?? []).map((r: { relationship_type?: string | null }) => r.relationship_type).filter(Boolean))] as string[];
                    const otherPersonIds = [...new Set((relRows ?? []).flatMap((r: { from_person_id: string; to_person_id: string }) => (r.from_person_id === id ? [r.to_person_id] : [r.from_person_id])))];
                    // rel-type labels and related person names are independent — fetch in parallel
                    const [relTypeRes, otherPersonsRes] = await Promise.all([
                        relTypeKeys.length > 0
                            ? supabase.from("person_relationship_type_settings").select("key, label").eq("org_id", orgId).in("key", relTypeKeys)
                            : { data: [] as { key: string; label: string | null }[] },
                        otherPersonIds.length > 0
                            ? supabase.from("persons").select("id, first_name, last_name").in("id", otherPersonIds).eq("org_id", orgId)
                            : { data: [] as { id: string; first_name?: string | null; last_name?: string | null }[] },
                    ]);
                    const relTypeLabelMap = new Map((relTypeRes.data ?? []).map((r) => [r.key, r.label ?? r.key]));
                    const personNameMap = new Map((otherPersonsRes.data ?? []).map((p: { id: string; first_name?: string | null; last_name?: string | null }) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null]));
                    return {
                        ms: Date.now() - ts,
                        rows: (relRows ?? []).map((r: { id: string; from_person_id: string; to_person_id: string; relationship_type?: string | null; created_at?: string }) => ({
                            ...r,
                            _other_person_id: r.from_person_id === id ? r.to_person_id : r.from_person_id,
                            _other_person_name: personNameMap.get(r.from_person_id === id ? r.to_person_id : r.from_person_id) ?? null,
                            _relationship_type_label: r.relationship_type ? (relTypeLabelMap.get(r.relationship_type) ?? r.relationship_type) : null,
                        })),
                    };
                })(),

                // ── contacts + members (parallel within group) ───────────────
                (async () => {
                    const ts = Date.now();
                    const [contactsRes, membersRes] = await Promise.all([
                        supabase.from("contacts").select("id, first_name, last_name, email, phone, customer_id").eq("person_id", id).eq("org_id", orgId).limit(PERSON_LIMIT),
                        supabase.from("customer_members").select("id, display_name, relationship, customer_id").eq("person_id", id).eq("org_id", orgId).limit(PERSON_LIMIT),
                    ]);
                    return { ms: Date.now() - ts, contacts: contactsRes.data ?? [], members: membersRes.data ?? [] };
                })(),

                // ── person locations (two sequential queries, second depends on first) ──
                (async () => {
                    const ts = Date.now();
                    const { data: plLocRows } = await supabase
                        .from("person_locations")
                        .select("location_id, is_primary, relationship_type")
                        .eq("person_id", id)
                        .eq("org_id", orgId)
                        .limit(PERSON_LIMIT);
                    const locLinkList = plLocRows ?? [];
                    const locIdsFromPl = [...new Set(locLinkList.map((r: { location_id: string }) => r.location_id))];
                    const { data: locRowsForPerson } = locIdsFromPl.length > 0
                        ? await supabase.from("locations").select("id, label, postal_code, city, address1").eq("org_id", orgId).in("id", locIdsFromPl)
                        : { data: [] as { id: string; label?: string | null; postal_code?: string | null; city?: string | null; address1?: string | null }[] };
                    const locLabelById = new Map(
                        (locRowsForPerson ?? []).map((l) => {
                            const lbl = (l.label && String(l.label).trim()) || [l.address1, l.city, l.postal_code].filter(Boolean).join(", ") || null;
                            return [l.id, lbl] as const;
                        })
                    );
                    return {
                        ms: Date.now() - ts,
                        rows: locLinkList.map((row: { location_id: string; is_primary?: boolean | null; relationship_type?: string | null }) => ({
                            location_id: row.location_id,
                            _location_label: locLabelById.get(row.location_id) ?? null,
                            is_primary: !!row.is_primary,
                            relationship_type: row.relationship_type ?? null,
                        })),
                    };
                })(),

                // ── linked opportunities ─────────────────────────────────────
                (async () => {
                    const ts = Date.now();
                    const { data: oppRows } = await supabase
                        .from("opportunities")
                        .select("id, name, status_key, job_date, quote_total, created_at")
                        .eq("primary_person_id", id)
                        .eq("org_id", orgId)
                        .order("created_at", { ascending: false })
                        .limit(PERSON_LIMIT);
                    return { ms: Date.now() - ts, rows: oppRows ?? [] };
                })(),
            ]);

            // Apply phase-2 results to out
            out._customer_persons = cpResult.rows;          _pt.set("customer_persons", cpResult.ms);
            out._person_relationships = relResult.rows;     _pt.set("person_relationships", relResult.ms);
            out._compatibility_contacts = cmResult.contacts; _pt.set("contacts_members", cmResult.ms);
            out._compatibility_members = cmResult.members;
            out._linked_locations = locResult.rows;          _pt.set("locations", locResult.ms);
            out._linked_opportunities = oppResult.rows;      _pt.set("opportunities", oppResult.ms);

            // ── Phase 3: visibility + field defs + FK displays in parallel ────
            // attachPersonDrawerVisibility reads _customer_persons and _compatibility_members (set above).
            // field_defs and fk_displays operate on base person columns from phase 1 and are
            // independent of visibility data — safe to run concurrently.
            await Promise.all([
                attachPersonDrawerVisibility(supabase, orgId, id, out, { siteScope: scopeDim, payloadTiming: _pt }),
                (async () => {
                    const ts = Date.now();
                    await attachFieldDefinitionsAndValues(supabase, out, "persons", id);
                    _pt.set("field_defs", Date.now() - ts);
                })(),
                (async () => {
                    const ts = Date.now();
                    await attachDirectFkRelationshipDisplays(supabase, orgId, "persons", out);
                    _pt.set("fk_displays", Date.now() - ts);
                })(),
            ]);

            logPersonPayloadBuildTiming(id, _pt, Date.now() - _buildStart);
            return entityOk(out, request);
        }

        if (type === "service_offerings") {
            const { data, error } = await supabase.from("service_offerings").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return entitySupabaseError(error);
            const row = data as Record<string, unknown> & { vertical_id?: string | null };
            const out: Record<string, unknown> = { ...row };
            out._updated = (row.updated_at as string) ?? (row.created_at as string) ?? null;
            if (row.vertical_id) {
                const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", row.vertical_id).maybeSingle();
                out._vertical_name = (vert as { name?: string | null; slug?: string | null } | null)?.name ?? (vert as { slug?: string | null } | null)?.slug ?? null;
            } else {
                out._vertical_name = null;
            }
            return entityOk(out, request);
        }

        if (type === "service_plan_templates") {
            const { data, error } = await supabase.from("service_plan_templates").select("*").eq("id", id).eq("org_id", orgId).single();
            if (error || !data) return entitySupabaseError(error);
            const row = data as Record<string, unknown> & { recurrence_unit?: string | null; recurrence_interval?: number | null };
            const out: Record<string, unknown> = { ...row };
            out._updated = (row.updated_at as string) ?? (row.created_at as string) ?? null;
            out._recurrence_label = formatRecurrenceLabel(
                (row.recurrence_unit as string) ?? null,
                row.recurrence_interval != null ? Math.max(1, Number(row.recurrence_interval) || 1) : null
            );
            const tplOrgId = (row as { org_id?: string }).org_id;
            const tplSk = (row as { status_key?: string | null }).status_key ?? null;
            out._status_display = tplOrgId
                ? await resolveStatusLabel(supabase, tplOrgId, "service_plan_templates", tplSk)
                : tplSk;
            return entityOk(out, request);
        }

        if (type === "addons") {
            const { data, error } = await supabase.from("pricing_addons").select("*").eq("id", id).single();
            if (error || !data) return entitySupabaseError(error);
            const row = data as Record<string, unknown> & { vertical_id?: string | null };
            const out: Record<string, unknown> = { ...row };
            out._updated = (row.updated_at as string) ?? (row.created_at as string) ?? null;
            if (row.vertical_id) {
                const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", row.vertical_id).maybeSingle();
                out._vertical_name = (vert as { name?: string | null; slug?: string | null } | null)?.name ?? (vert as { slug?: string | null } | null)?.slug ?? null;
            } else {
                out._vertical_name = null;
            }
            return entityOk(out, request);
        }

        return entityBadRequest("Invalid type");
    } catch (e: unknown) {
        console.error("[ADMIN_ENTITY]", e);
        return entityServerError();
    }
}

/** Phase 0 perf wrapper (Card 0.1): times the handler when ADMIN_PERF_TRACE=1; otherwise a passthrough. */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ type: string; id: string }> }
) {
    if (!adminPerfEnabled()) return getEntityImpl(request, context);
    const t0 = adminPerfNow();
    const res = await getEntityImpl(request, context);
    const { type, id } = await context.params;
    logAdminPerf({ route: "entity", type, id, status: res.status, t0 });
    return res;
}
