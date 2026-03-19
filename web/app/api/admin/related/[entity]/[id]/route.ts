import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { normalizeDocumentRows, type NormalizedDocumentRow } from "@/lib/admin/normalizeDocumentRow";

const LIMIT = 25;

const DOC_SELECT =
    "id, org_id, title, original_filename, doc_type, status, created_at, mime_type, bucket, storage_path, owner_contact_id, entity_type, entity_id";

function mergeDocumentLists(lists: (Record<string, unknown>[] | null | undefined)[]): NormalizedDocumentRow[] {
    const byId = new Map<string, NormalizedDocumentRow>();
    for (const list of lists) {
        for (const row of list ?? []) {
            if (!row?.id) continue;
            const n = normalizeDocumentRows([row])[0];
            if (n) byId.set(n.id, n);
        }
    }
    return [...byId.values()].sort((a, b) => {
        const ta = a.created_at || a.uploaded_at || "";
        const tb = b.created_at || b.uploaded_at || "";
        return tb.localeCompare(ta);
    }).slice(0, LIMIT);
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ entity: string; id: string }> }
) {
    const { entity, id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    try {
        const supabase = createAdminClient();

        if (entity === "contact") {
            const { data: contactRow } = await supabase.from("contacts").select("customer_id, vendor_id").eq("id", id).maybeSingle();
            const customerId = (contactRow as { customer_id?: string | null } | null)?.customer_id ?? null;
            const vendorId = (contactRow as { vendor_id?: string | null } | null)?.vendor_id ?? null;

            const [linkedCustomerRes, linkedVendorRes, oppRes, jobsRes, subsRes, cmcRes, vcRes, messagesRes, docByOwner, docByEntityContact, docByEntityContacts, redemptionsRes] = await Promise.all([
                customerId ? supabase.from("customers").select("id, name").eq("id", customerId).maybeSingle() : Promise.resolve({ data: null }),
                vendorId ? supabase.from("vendors").select("id, name").eq("id", vendorId).maybeSingle() : Promise.resolve({ data: null }),
                supabase.from("opportunities").select("id, created_at, name, status, job_date, quote_total").eq("primary_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("jobs").select("id, created_at, title, scheduled_at, opportunity_id").eq("primary_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("customer_subscriptions").select("id, created_at, customer_id, status, start_date").eq("primary_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("customer_member_contacts").select("id, customer_member_id, contact_id").eq("contact_id", id).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("vendor_contacts").select("id, vendor_id, contact_id, role").eq("contact_id", id).limit(LIMIT),
                supabase.from("messages_outbox").select("id, created_at, to_phone, status").eq("to_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("documents").select(DOC_SELECT).eq("org_id", ctx.orgId).eq("owner_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("documents").select(DOC_SELECT).eq("org_id", ctx.orgId).eq("entity_type", "contact").eq("entity_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("documents").select(DOC_SELECT).eq("org_id", ctx.orgId).eq("entity_type", "contacts").eq("entity_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("discount_redemptions").select("id, created_at, discount_code_id, customer_id").eq("contact_id", id).order("created_at", { ascending: false }).limit(LIMIT),
            ]);
            const documentsMerged = mergeDocumentLists([docByOwner.data, docByEntityContact.data, docByEntityContacts.data]);

            const linkedCustomer = linkedCustomerRes.data;
            const linkedVendor = linkedVendorRes.data;

            return NextResponse.json({
                linkedCustomer: linkedCustomer ?? null,
                linkedVendor: linkedVendor ?? null,
                opportunities: oppRes.data ?? [],
                jobs: jobsRes.data ?? [],
                customer_subscriptions: subsRes.data ?? [],
                customer_member_contacts: cmcRes.data ?? [],
                vendor_contacts: vcRes.data ?? [],
                messages: messagesRes.data ?? [],
                documents: documentsMerged,
                discount_redemptions: redemptionsRes.data ?? [],
                contact_tags: [],
            });
        }

        if (entity === "customer") {
            const primaryContactId = await supabase.from("customers").select("primary_contact_id").eq("id", id).single().then((r) => (r.data as { primary_contact_id?: string | null } | null)?.primary_contact_id ?? null);
            const [contactsRes, oppRes, jobsRes, locationsRes, membersRes, paymentsRes, subsRes, redemptionsRes, documentsRes, cpRes] = await Promise.all([
                supabase.from("contacts").select("id, created_at, first_name, last_name, email, phone, status_key").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("opportunities").select("id, created_at, name, status, job_date, quote_total, pipeline_stage_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("jobs").select("id, created_at, title, scheduled_at, opportunity_id, job_status_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("locations").select("id, label, address1, city, state, postal_code, is_primary, is_active, location_type").eq("customer_id", id).eq("org_id", ctx.orgId).order("is_primary", { ascending: false }).order("label", { ascending: true }).limit(LIMIT),
                supabase.from("customer_members").select("id, created_at, display_name, relationship, first_name, last_name, dob, is_active").eq("customer_id", id).eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("payments").select("id, created_at, amount_cents, paid_at, status_key, provider_payment_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("customer_subscriptions").select("id, created_at, status, start_date, primary_contact_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("discount_redemptions").select("id, created_at, discount_code_id, customer_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase
                    .from("documents")
                    .select(DOC_SELECT)
                    .eq("org_id", ctx.orgId)
                    .eq("entity_type", "customer")
                    .eq("entity_id", id)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT)
                    .then((r) => (r.error ? { data: [] } : r)),
                supabase.from("customer_persons").select("id, customer_id, person_id, role, created_at").eq("customer_id", id).eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(LIMIT),
            ]);
            const cpRows = cpRes.data ?? [];
            const personIds = [...new Set(cpRows.map((r: { person_id: string }) => r.person_id))];
            const { data: personRows } = personIds.length > 0
                ? await supabase.from("persons").select("id, first_name, last_name, email, phone").in("id", personIds)
                : { data: [] as { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }[] };
            const personMap = new Map((personRows ?? []).map((p) => [p.id, p]));
            const roleKeys = [...new Set(cpRows.map((r: { role?: string | null }) => r.role).filter(Boolean))] as string[];
            const { data: roleTypeRows } = roleKeys.length > 0
                ? await supabase.from("customer_person_role_types").select("key, label").eq("org_id", ctx.orgId).in("key", roleKeys)
                : { data: [] as { key: string; label: string | null }[] };
            const roleLabelMap = new Map((roleTypeRows ?? []).map((r) => [r.key, r.label ?? r.key]));
            const people = cpRows.map((r: { id: string; customer_id: string; person_id: string; role?: string | null; created_at?: string }) => {
                const person = personMap.get(r.person_id);
                const name = person ? [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || null : null;
                return {
                    id: r.id,
                    person_id: r.person_id,
                    customer_id: r.customer_id,
                    role: r.role ?? null,
                    role_label: r.role ? (roleLabelMap.get(r.role) ?? r.role) : null,
                    _person_name: name,
                    _person_email: person?.email ?? null,
                    _person_phone: person?.phone ?? null,
                    created_at: r.created_at,
                };
            });
            const jobIds = (jobsRes.data ?? []).map((j) => j.id);
            const schedulesRes = jobIds.length > 0
                ? await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").in("job_id", jobIds).order("start_at", { ascending: false }).limit(LIMIT)
                : { data: [] as { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[] };
            const contactIds = (contactsRes.data ?? []).map((c: { id: string }) => c.id);
            const messagesRes = contactIds.length > 0
                ? await supabase.from("messages_outbox").select("id, created_at, to_phone, status, body").in("to_contact_id", contactIds).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r))
                : { data: [] as { id: string; created_at: string; to_phone?: string; status?: string; body?: string }[] };
            return NextResponse.json({
                people,
                contacts: contactsRes.data ?? [],
                opportunities: oppRes.data ?? [],
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
                locations: locationsRes.data ?? [],
                customer_members: membersRes.data ?? [],
                payments: paymentsRes.data ?? [],
                customer_subscriptions: subsRes.data ?? [],
                discount_redemptions: redemptionsRes.data ?? [],
                documents: normalizeDocumentRows(documentsRes.data ?? []),
                messages: messagesRes.data ?? [],
                customer_tags: [],
                _primary_contact_id: primaryContactId,
            });
        }

        if (entity === "opportunity") {
            const [jobsRes, documentsRes] = await Promise.all([
                supabase.from("jobs").select("id, created_at, title, scheduled_at, job_status_id, customer_id, opportunity_id").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase
                    .from("documents")
                    .select(DOC_SELECT)
                    .eq("org_id", ctx.orgId)
                    .or("entity_type.eq.opportunity,entity_type.eq.opportunities")
                    .eq("entity_id", id)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT)
                    .then((r) => (r.error ? { data: [] } : r)),
            ]);
            const jobIds = (jobsRes.data ?? []).map((j: { id: string }) => j.id);
            let discountRedemptions: { id: string; created_at?: string; discount_code_id?: string; customer_id?: string; job_id?: string }[] = [];
            if (jobIds.length > 0) {
                const redRes = await supabase.from("discount_redemptions").select("id, created_at, discount_code_id, customer_id, job_id").in("job_id", jobIds).order("created_at", { ascending: false }).limit(LIMIT);
                discountRedemptions = redRes.data ?? [];
            }
            const schedulesRes = jobIds.length > 0
                ? await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").in("job_id", jobIds).order("start_at", { ascending: false }).limit(LIMIT)
                : { data: [] as { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[] };
            return NextResponse.json({
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
                documents: normalizeDocumentRows(documentsRes.data ?? []),
                discount_redemptions: discountRedemptions,
                quotes: [],
                messages: [],
                opportunity_tags: [],
            });
        }

        if (entity === "job") {
            const { data: jobRow } = await supabase.from("jobs").select("location_id, opportunity_id").eq("id", id).maybeSingle();
            const jr = jobRow as { location_id?: string | null; opportunity_id?: string | null } | null;
            const locationId = jr?.location_id ?? null;
            const opportunityId = jr?.opportunity_id ?? null;
            let location: Record<string, unknown> | null = null;
            if (locationId) {
                const { data: loc } = await supabase.from("locations").select("id, label, address1, city, state, postal_code, customer_id, is_primary, is_active").eq("id", locationId).maybeSingle();
                if (loc) location = loc as Record<string, unknown>;
            }
            const [schedulesRes, opportunityRes, discountRedemptionsRes, documentsRes] = await Promise.all([
                supabase.from("schedules").select("id, job_id, start_at, end_at, timezone, status_key, price_cents, canceled_at").eq("job_id", id).order("start_at", { ascending: true }).limit(LIMIT),
                opportunityId ? supabase.from("opportunities").select("id, name, created_at, status_key, quote_total").eq("id", opportunityId).maybeSingle() : Promise.resolve({ data: null }),
                supabase.from("discount_redemptions").select("id, created_at, discount_code_id, job_id").eq("job_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase
                    .from("documents")
                    .select(DOC_SELECT)
                    .eq("org_id", ctx.orgId)
                    .or("entity_type.eq.job,entity_type.eq.jobs")
                    .eq("entity_id", id)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT)
                    .then((r) => (r.error ? { data: [] } : r)),
            ]);
            const schedules = (schedulesRes.data ?? []) as { id: string; job_id?: string; start_at?: string; end_at?: string; timezone?: string; status_key?: string | null; price_cents?: number | null; canceled_at?: string | null }[];
            const scheduleIds = schedules.map((s) => s.id);
            let assignments: { schedule_id: string; vendor_id: string }[] = [];
            let vendorNames: Map<string, string> = new Map();
            if (scheduleIds.length > 0) {
                const assignRes = await supabase.from("assignments").select("schedule_id, vendor_id").in("schedule_id", scheduleIds);
                assignments = (assignRes.data ?? []) as { schedule_id: string; vendor_id: string }[];
                const vids = [...new Set(assignments.map((a) => a.vendor_id))];
                if (vids.length > 0) {
                    const vRes = await supabase.from("vendors").select("id, name").in("id", vids);
                    vendorNames = new Map((vRes.data ?? []).map((v) => [(v as { id: string }).id, (v as { name?: string | null }).name ?? ""]));
                }
            }
            const schedulesWithVendor = schedules.map((s, idx) => {
                const assign = assignments.find((a) => a.schedule_id === s.id);
                const vendorName = assign ? vendorNames.get(assign.vendor_id) ?? null : null;
                return {
                    ...s,
                    _visit_label: `Visit #${idx + 1}`,
                    _vendor_name: vendorName,
                };
            });
            const redemptionIds = (discountRedemptionsRes.data ?? []).map((r: { discount_code_id?: string }) => r.discount_code_id).filter(Boolean);
            let discountCodes: { id: string; code?: string | null; discount_type?: string | null; discount_value?: number | null }[] = [];
            if (redemptionIds.length > 0) {
                const dcRes = await supabase.from("discount_codes").select("id, code, discount_type, discount_value").in("id", redemptionIds);
                discountCodes = dcRes.data ?? [];
            }
            const discountCodeMap = new Map(discountCodes.map((dc) => [(dc as { id: string }).id, dc]));
            const discountsWithCode = (discountRedemptionsRes.data ?? []).map((r: { id: string; created_at?: string; discount_code_id?: string }) => ({
                ...r,
                _code: r.discount_code_id ? (discountCodeMap.get(r.discount_code_id) as { code?: string | null } | undefined)?.code ?? null : null,
            }));
            return NextResponse.json({
                schedules: schedulesWithVendor,
                location,
                opportunity: opportunityRes.data ?? null,
                messages: [],
                discounts: discountsWithCode,
                documents: normalizeDocumentRows(documentsRes.data ?? []),
            });
        }

        if (entity === "vendor") {
            const [jobsRes, vcRes, assignmentsRes, documentsRes] = await Promise.all([
                supabase.from("jobs").select("id, created_at, title, scheduled_at, job_status_id, gross_price_cents, recurring_total_cents, opportunity_id, assigned_vendor_id").eq("assigned_vendor_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("vendor_contacts").select("id, contact_id, role").eq("vendor_id", id),
                supabase.from("assignments").select("id, schedule_id, vendor_id, assignment_status_id, created_at").eq("vendor_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase
                    .from("documents")
                    .select(DOC_SELECT)
                    .eq("org_id", ctx.orgId)
                    .or("entity_type.eq.vendor,entity_type.eq.vendors")
                    .eq("entity_id", id)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT)
                    .then((r) => (r.error ? { data: [] } : r)),
            ]);
            const jobIds = (jobsRes.data ?? []).map((j: { id: string }) => j.id);
            const schedulesRes = jobIds.length > 0
                ? await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").in("job_id", jobIds).order("start_at", { ascending: false })
                : { data: [] as { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[] };
            const contactIds = (vcRes.data ?? []).map((r: { contact_id: string }) => r.contact_id);
            const contactsRes = contactIds.length > 0
                ? await supabase.from("contacts").select("id, first_name, last_name, email, phone, status_key").in("id", contactIds)
                : { data: [] as { id: string; first_name: string; last_name: string; email: string; phone: string; status_key?: string }[] };
            const primaryContactRes = await supabase.from("vendors").select("primary_contact_id").eq("id", id).maybeSingle();
            const primaryContactId = (primaryContactRes.data as { primary_contact_id?: string } | null)?.primary_contact_id ?? null;
            const contactsWithRole = (contactsRes.data ?? []).map((c) => {
                const link = (vcRes.data ?? []).find((r: { contact_id: string }) => r.contact_id === c.id) as { role?: string } | undefined;
                return { ...c, _role: link?.role ?? null, _is_primary: c.id === primaryContactId };
            });
            return NextResponse.json({
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
                contacts: contactsWithRole,
                assignments: assignmentsRes.data ?? [],
                documents: normalizeDocumentRows(documentsRes.data ?? []),
            });
        }

        if (entity === "schedule") {
            const { data: scheduleRow } = await supabase.from("schedules").select("location_id").eq("id", id).maybeSingle();
            const locationId = (scheduleRow as { location_id?: string | null } | null)?.location_id ?? null;
            let location: Record<string, unknown> | null = null;
            if (locationId) {
                const { data: loc } = await supabase.from("locations").select("id, label, address1, city, state, postal_code, customer_id, is_primary, is_active").eq("id", locationId).maybeSingle();
                if (loc) location = loc as Record<string, unknown>;
            }
            return NextResponse.json({
                location,
            });
        }

        if (entity === "location") {
            const { data: locRow } = await supabase.from("locations").select("id, customer_id, org_id").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
            if (!locRow) {
                return NextResponse.json({ error: "Location not found" }, { status: 404 });
            }
            const customerId = (locRow as { customer_id: string }).customer_id;
            const [customerRes, jobsRes, schedulesRes, plRes, documentsRes] = await Promise.all([
                customerId ? supabase.from("customers").select("id, name").eq("id", customerId).maybeSingle() : { data: null },
                supabase.from("jobs").select("id, created_at, title, scheduled_at").eq("location_id", id).eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").eq("location_id", id).eq("org_id", ctx.orgId).order("start_at", { ascending: false }).limit(LIMIT),
                supabase.from("person_locations").select("person_id, is_primary, relationship_type").eq("location_id", id).eq("org_id", ctx.orgId).limit(LIMIT),
                supabase
                    .from("documents")
                    .select(DOC_SELECT)
                    .eq("org_id", ctx.orgId)
                    .or("entity_type.eq.location,entity_type.eq.locations")
                    .eq("entity_id", id)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT)
                    .then((r) => (r.error ? { data: [] } : r)),
            ]);
            const plList = plRes.data ?? [];
            const pids = [...new Set(plList.map((r: { person_id: string }) => r.person_id))];
            const { data: personRows } =
                pids.length > 0
                    ? await supabase.from("persons").select("id, first_name, last_name, full_name, email").eq("org_id", ctx.orgId).in("id", pids)
                    : { data: [] as { id: string; first_name?: string | null; last_name?: string | null; full_name?: string | null; email?: string | null }[] };
            const pname = new Map(
                (personRows ?? []).map((p) => {
                    const nm =
                        (p.full_name && String(p.full_name).trim()) ||
                        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
                        (p.email && String(p.email).trim()) ||
                        null;
                    return [p.id, nm] as const;
                })
            );
            const linked_persons = plList.map((r: { person_id: string; is_primary?: boolean | null; relationship_type?: string | null }) => ({
                person_id: r.person_id,
                _person_name: pname.get(r.person_id) ?? null,
                is_primary: !!r.is_primary,
                relationship_type: r.relationship_type ?? null,
            }));
            return NextResponse.json({
                customer: customerRes.data ?? null,
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
                linked_persons,
                documents: normalizeDocumentRows(documentsRes.data ?? []),
            });
        }

        if (entity === "payment") {
            const { data: paymentRow } = await supabase.from("payments").select("id, customer_id, job_id, provider_payment_id, org_id").eq("id", id).maybeSingle();
            if (!paymentRow) {
                return NextResponse.json({ error: "Payment not found" }, { status: 404 });
            }
            const payment = paymentRow as { customer_id?: string | null; job_id?: string | null; provider_payment_id?: string | null; org_id?: string | null };
            const customerId = payment.customer_id ?? null;
            const jobId = payment.job_id ?? null;
            const providerRef = payment.provider_payment_id?.trim() || null;
            const orgId = payment.org_id ?? ctx.orgId;

            const [customerRes, jobRes, ledgerRes] = await Promise.all([
                customerId ? supabase.from("customers").select("id, name, created_at").eq("id", customerId).maybeSingle() : Promise.resolve({ data: null }),
                jobId ? supabase.from("jobs").select("id, title, service_key, job_number_for_customer, created_at, job_status_id").eq("id", jobId).maybeSingle() : Promise.resolve({ data: null }),
                providerRef && orgId
                    ? supabase
                        .from("ledger_transactions")
                        .select("id, occurred_at, type, direction, amount_cents, currency, provider, provider_ref, journal_entry_id")
                        .eq("org_id", orgId)
                        .eq("provider_ref", providerRef)
                        .order("occurred_at", { ascending: false })
                        .limit(LIMIT)
                    : { data: [] as { id: string; occurred_at?: string; type?: string; direction?: string; amount_cents?: number; currency?: string; provider?: string; provider_ref?: string; journal_entry_id?: string | null }[] },
            ]);

            const ledgerTransactions = (ledgerRes.data ?? []) as { id: string; occurred_at?: string; type?: string; direction?: string; amount_cents?: number; currency?: string; provider?: string; provider_ref?: string; journal_entry_id?: string | null }[];
            const entryIds = [...new Set(ledgerTransactions.map((lt) => lt.journal_entry_id).filter(Boolean))] as string[];
            let glJournalLines: { id: string; entry_id: string; line_no?: number; account_id?: string; amount_cents?: number; created_at?: string; [k: string]: unknown }[] = [];
            if (entryIds.length > 0) {
                const linesRes = await supabase
                    .from("gl_journal_lines")
                    .select("id, entry_id, line_no, amount_cents, created_at")
                    .in("entry_id", entryIds)
                    .order("entry_id")
                    .order("line_no", { ascending: true })
                    .limit(LIMIT * 5);
                glJournalLines = (linesRes.data ?? []) as { id: string; entry_id: string; line_no?: number; amount_cents?: number; created_at?: string }[];
            }

            const job = jobRes.data as { id: string; title?: string | null; service_key?: string | null; job_number_for_customer?: string | null } | null;
            const _job_label = job
                ? ((job.title && String(job.title).trim()) || (job.service_key && String(job.service_key).trim()) || (job.job_number_for_customer && String(job.job_number_for_customer).trim()) || `Job #${job.id.slice(-6)}`)
                : null;

            return NextResponse.json({
                customer: customerRes.data ?? null,
                job: jobRes.data ? { ...jobRes.data, _job_label } : null,
                ledger_transactions: ledgerTransactions,
                gl_journal_lines: glJournalLines,
            });
        }

        if (entity === "discount_redemption") {
            const { data: redemptionRow } = await supabase.from("discount_redemptions").select("id, discount_code_id, customer_id, contact_id, opportunity_id, job_id").eq("id", id).maybeSingle();
            if (!redemptionRow) {
                return NextResponse.json({ error: "Discount redemption not found" }, { status: 404 });
            }
            const r = redemptionRow as { discount_code_id: string; customer_id?: string | null; contact_id?: string | null; opportunity_id?: string | null; job_id?: string | null };
            const customerId = r.customer_id ?? null;
            const contactId = r.contact_id ?? null;
            const opportunityId = r.opportunity_id ?? null;
            const jobId = r.job_id ?? null;
            const codeId = r.discount_code_id;

            const [customerRes, contactRes, opportunityRes, jobRes, codeRes] = await Promise.all([
                customerId ? supabase.from("customers").select("id, name, created_at").eq("id", customerId).maybeSingle() : Promise.resolve({ data: null }),
                contactId ? supabase.from("contacts").select("id, first_name, last_name, email, phone, created_at").eq("id", contactId).maybeSingle() : Promise.resolve({ data: null }),
                opportunityId ? supabase.from("opportunities").select("id, name, created_at, status_key, quote_total").eq("id", opportunityId).maybeSingle() : Promise.resolve({ data: null }),
                jobId ? supabase.from("jobs").select("id, title, service_key, job_number_for_customer, created_at").eq("id", jobId).maybeSingle() : Promise.resolve({ data: null }),
                codeId ? supabase.from("discount_codes").select("id, code, is_active, discount_type, discount_value, first_job_only, starts_at, ends_at").eq("id", codeId).maybeSingle() : Promise.resolve({ data: null }),
            ]);

            const job = jobRes.data as { id: string; title?: string | null; service_key?: string | null; job_number_for_customer?: string | null } | null;
            const _job_label = job
                ? ((job.title && String(job.title).trim()) || (job.service_key && String(job.service_key).trim()) || (job.job_number_for_customer && String(job.job_number_for_customer).trim()) || `Job #${job.id.slice(-6)}`)
                : null;

            return NextResponse.json({
                customer: customerRes.data ?? null,
                contact: contactRes.data ?? null,
                opportunity: opportunityRes.data ?? null,
                job: jobRes.data ? { ...jobRes.data, _job_label } : null,
                discount_code: codeRes.data ?? null,
            });
        }

        if (entity === "customer_member") {
            const { data: memberRow } = await supabase
                .from("customer_members")
                .select("id, customer_id, org_id")
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            if (!memberRow) {
                return NextResponse.json({ error: "Member not found" }, { status: 404 });
            }
            const customerId = (memberRow as { customer_id: string | null }).customer_id;
            const [linkedContactsRes, customerRes, documentsRes] = await Promise.all([
                supabase
                    .from("customer_member_contacts")
                    .select("id, contact_id, role_key, is_active, contact:contacts(id, first_name, last_name, email, phone)")
                    .eq("org_id", ctx.orgId)
                    .eq("customer_member_id", id),
                customerId ? supabase.from("customers").select("id, name").eq("id", customerId).maybeSingle() : { data: null },
                supabase
                    .from("documents")
                    .select(DOC_SELECT)
                    .eq("org_id", ctx.orgId)
                    .eq("entity_type", "customer_member")
                    .eq("entity_id", id)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT)
                    .then((r) => (r.error ? { data: [] } : r)),
            ]);
            const linkRows = linkedContactsRes.data ?? [];
            const roleKeys = [...new Set(linkRows.map((l: Record<string, unknown>) => l.role_key as string).filter(Boolean))];
            const { data: roleRows } = roleKeys.length
                ? await supabase.from("customer_member_contact_roles").select("role_key, label").eq("org_id", ctx.orgId).in("role_key", roleKeys)
                : { data: [] as { role_key: string; label: string | null }[] };
            const roleLabelMap = new Map((roleRows ?? []).map((r: { role_key: string; label: string | null }) => [r.role_key, r.label ?? r.role_key]));
            const linkedContacts = linkRows.map((l: Record<string, unknown>) => {
                const contact = (l.contact ?? l.contacts) as { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
                return {
                    id: l.id,
                    contact_id: l.contact_id,
                    contact_name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null : null,
                    email: contact?.email ?? null,
                    phone: contact?.phone ?? null,
                    role_key: l.role_key ?? null,
                    role_label: l.role_key ? (roleLabelMap.get(l.role_key as string) ?? l.role_key) : null,
                    is_active: l.is_active ?? true,
                };
            });
            return NextResponse.json({
                linkedContacts,
                customer: customerRes.data ?? null,
                documents: normalizeDocumentRows(documentsRes.data ?? []),
            });
        }

        if (entity === "person") {
            const { data: personRow } = await supabase
                .from("persons")
                .select("id, org_id")
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            if (!personRow) {
                return NextResponse.json({ error: "Person not found" }, { status: 404 });
            }
            const [customerPersonsRes, relationshipsRes, contactsRes, membersRes, plRes, oppRes] = await Promise.all([
                supabase
                    .from("customer_persons")
                    .select("id, customer_id, person_id, role, created_at")
                    .eq("person_id", id)
                    .eq("org_id", ctx.orgId)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT),
                supabase
                    .from("person_relationships")
                    .select("id, from_person_id, to_person_id, relationship_type, created_at")
                    .or(`from_person_id.eq.${id},to_person_id.eq.${id}`)
                    .limit(LIMIT),
                supabase
                    .from("contacts")
                    .select("id, first_name, last_name, email, phone, customer_id, created_at")
                    .eq("person_id", id)
                    .eq("org_id", ctx.orgId)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT),
                supabase
                    .from("customer_members")
                    .select("id, display_name, relationship, customer_id, created_at")
                    .eq("person_id", id)
                    .eq("org_id", ctx.orgId)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT),
                supabase
                    .from("person_locations")
                    .select("location_id, is_primary, relationship_type")
                    .eq("person_id", id)
                    .eq("org_id", ctx.orgId)
                    .limit(LIMIT),
                supabase
                    .from("opportunities")
                    .select("id, name, status_key, job_date, quote_total, created_at")
                    .eq("primary_person_id", id)
                    .eq("org_id", ctx.orgId)
                    .order("created_at", { ascending: false })
                    .limit(LIMIT),
            ]);
            const cpRows = customerPersonsRes.data ?? [];
            const customerIds = [...new Set(cpRows.map((r: { customer_id: string }) => r.customer_id))];
            const roleKeys = [...new Set(cpRows.map((r: { role?: string | null }) => r.role).filter(Boolean))] as string[];
            const [customerRowsRes, roleTypesRes] = await Promise.all([
                customerIds.length > 0 ? supabase.from("customers").select("id, name").in("id", customerIds) : { data: [] as { id: string; name: string | null }[] },
                roleKeys.length > 0 ? supabase.from("customer_person_role_types").select("key, label").eq("org_id", ctx.orgId).in("key", roleKeys) : { data: [] as { key: string; label: string | null }[] },
            ]);
            const customerMap = new Map((customerRowsRes.data ?? []).map((c) => [c.id, c.name ?? null]));
            const roleLabelMap = new Map((roleTypesRes.data ?? []).map((r) => [r.key, r.label ?? r.key]));
            const customer_persons = cpRows.map((r: { id: string; customer_id: string; person_id: string; role?: string | null; created_at?: string }) => ({
                ...r,
                _customer_name: customerMap.get(r.customer_id) ?? null,
                _role_label: r.role ? (roleLabelMap.get(r.role) ?? r.role) : null,
            }));
            const relRows = relationshipsRes.data ?? [];
            const relTypeKeys = [...new Set(relRows.map((r: { relationship_type?: string | null }) => r.relationship_type).filter(Boolean))] as string[];
            const { data: relTypeRows } = relTypeKeys.length > 0
                ? await supabase.from("person_relationship_type_settings").select("key, label").eq("org_id", ctx.orgId).in("key", relTypeKeys)
                : { data: [] as { key: string; label: string | null }[] };
            const relTypeLabelMap = new Map((relTypeRows ?? []).map((r) => [r.key, r.label ?? r.key]));
            const otherIds = [...new Set(relRows.flatMap((r: { from_person_id: string; to_person_id: string }) => (r.from_person_id === id ? [r.to_person_id] : [r.from_person_id])))];
            const { data: otherPersons } = otherIds.length > 0
                ? await supabase.from("persons").select("id, first_name, last_name").in("id", otherIds)
                : { data: [] as { id: string; first_name?: string | null; last_name?: string | null }[] };
            const personNameMap = new Map((otherPersons ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null]));
            const person_relationships = relRows.map((r: { id: string; from_person_id: string; to_person_id: string; relationship_type?: string | null; created_at?: string }) => ({
                ...r,
                _other_person_id: r.from_person_id === id ? r.to_person_id : r.from_person_id,
                _other_person_name: personNameMap.get(r.from_person_id === id ? r.to_person_id : r.from_person_id) ?? null,
                _relationship_type_label: r.relationship_type ? (relTypeLabelMap.get(r.relationship_type) ?? r.relationship_type) : null,
            }));
            const plLocList = plRes.data ?? [];
            const locIds = [...new Set(plLocList.map((r: { location_id: string }) => r.location_id))];
            const { data: locRows } =
                locIds.length > 0
                    ? await supabase.from("locations").select("id, label, postal_code, city, address1").eq("org_id", ctx.orgId).in("id", locIds)
                    : { data: [] as { id: string; label?: string | null; postal_code?: string | null; city?: string | null; address1?: string | null }[] };
            const locLabelMap = new Map(
                (locRows ?? []).map((l) => {
                    const lbl =
                        (l.label && String(l.label).trim()) ||
                        [l.address1, l.city, l.postal_code].filter(Boolean).join(", ") ||
                        null;
                    return [l.id, lbl] as const;
                })
            );
            const linked_locations = plLocList.map((r: { location_id: string; is_primary?: boolean | null; relationship_type?: string | null }) => ({
                location_id: r.location_id,
                _location_label: locLabelMap.get(r.location_id) ?? null,
                is_primary: !!r.is_primary,
                relationship_type: r.relationship_type ?? null,
            }));
            return NextResponse.json({
                customer_persons,
                person_relationships,
                compatibility_contacts: contactsRes.data ?? [],
                compatibility_members: membersRes.data ?? [],
                linked_locations,
                opportunities: oppRes.data ?? [],
            });
        }

        if (entity === "service_offering") {
            const { data: pricingServices, error } = await supabase
                .from("pricing_services")
                .select("*")
                .eq("service_offering_id", id)
                .order("created_at", { ascending: false })
                .limit(LIMIT);
            if (error) return NextResponse.json({ pricing_services: [] });
            return NextResponse.json({ pricing_services: pricingServices ?? [] });
        }

        if (entity === "service_plan_template") {
            const { data: pricingFrequencies, error } = await supabase
                .from("pricing_frequencies")
                .select("*")
                .eq("service_plan_template_id", id)
                .order("created_at", { ascending: false })
                .limit(LIMIT);
            if (error) return NextResponse.json({ pricing_frequencies: [] });
            return NextResponse.json({ pricing_frequencies: pricingFrequencies ?? [] });
        }

        if (entity === "addon") {
            return NextResponse.json({ jobs: [], quotes: [] });
        }

        return NextResponse.json({ error: "Invalid entity" }, { status: 400 });
    } catch (e: unknown) {
        console.error("[ADMIN_RELATED]", e);
        return NextResponse.json({ error: "Failed to fetch related" }, { status: 500 });
    }
}
