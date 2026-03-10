import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

const LIMIT = 25;

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

            const [linkedCustomerRes, linkedVendorRes, oppRes, jobsRes, subsRes, cmcRes, vcRes, messagesRes, documentsRes, redemptionsRes] = await Promise.all([
                customerId ? supabase.from("customers").select("id, name").eq("id", customerId).maybeSingle() : Promise.resolve({ data: null }),
                vendorId ? supabase.from("vendors").select("id, name").eq("id", vendorId).maybeSingle() : Promise.resolve({ data: null }),
                supabase.from("opportunities").select("id, created_at, name, status, job_date, quote_total").eq("primary_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("jobs").select("id, created_at, title, scheduled_at, opportunity_id").eq("primary_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("customer_subscriptions").select("id, created_at, customer_id, status, start_date").eq("primary_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("customer_member_contacts").select("id, customer_member_id, contact_id").eq("contact_id", id).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("vendor_contacts").select("id, vendor_id, contact_id, role").eq("contact_id", id).limit(LIMIT),
                supabase.from("messages_outbox").select("id, created_at, to_phone, status").eq("to_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("documents").select("id, name, document_type, uploaded_at").eq("owner_contact_id", id).order("uploaded_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : { data: r.data ?? [] })),
                supabase.from("discount_redemptions").select("id, created_at, discount_code_id, customer_id").eq("contact_id", id).order("created_at", { ascending: false }).limit(LIMIT),
            ]);

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
                documents: documentsRes.data ?? [],
                discount_redemptions: redemptionsRes.data ?? [],
                contact_tags: [],
            });
        }

        if (entity === "customer") {
            const primaryContactId = await supabase.from("customers").select("primary_contact_id").eq("id", id).single().then((r) => (r.data as { primary_contact_id?: string | null } | null)?.primary_contact_id ?? null);
            const [contactsRes, oppRes, jobsRes, locationsRes, membersRes, paymentsRes, subsRes, redemptionsRes, documentsRes] = await Promise.all([
                supabase.from("contacts").select("id, created_at, first_name, last_name, email, phone, status_key").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("opportunities").select("id, created_at, name, status, job_date, quote_total, pipeline_stage_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("jobs").select("id, created_at, title, scheduled_at, opportunity_id, job_status_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("locations").select("id, label, address1, city, state, postal_code, is_primary, is_active, location_type").eq("customer_id", id).eq("org_id", ctx.orgId).order("is_primary", { ascending: false }).order("label", { ascending: true }).limit(LIMIT),
                supabase.from("customer_members").select("id, created_at, display_name, relationship, first_name, last_name, dob, is_active").eq("customer_id", id).eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("payments").select("id, created_at, amount_cents, paid_at, status_key, provider_payment_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("customer_subscriptions").select("id, created_at, status, start_date, primary_contact_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("discount_redemptions").select("id, created_at, discount_code_id, customer_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
                supabase.from("documents").select("id, name, document_type, uploaded_at, status").eq("entity_type", "customer").eq("entity_id", id).order("uploaded_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r)),
            ]);
            const jobIds = (jobsRes.data ?? []).map((j) => j.id);
            const schedulesRes = jobIds.length > 0
                ? await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").in("job_id", jobIds).order("start_at", { ascending: false }).limit(LIMIT)
                : { data: [] as { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[] };
            const contactIds = (contactsRes.data ?? []).map((c: { id: string }) => c.id);
            const messagesRes = contactIds.length > 0
                ? await supabase.from("messages_outbox").select("id, created_at, to_phone, status, body").in("to_contact_id", contactIds).order("created_at", { ascending: false }).limit(LIMIT).then((r) => (r.error ? { data: [] } : r))
                : { data: [] as { id: string; created_at: string; to_phone?: string; status?: string; body?: string }[] };
            return NextResponse.json({
                contacts: contactsRes.data ?? [],
                opportunities: oppRes.data ?? [],
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
                locations: locationsRes.data ?? [],
                customer_members: membersRes.data ?? [],
                payments: paymentsRes.data ?? [],
                customer_subscriptions: subsRes.data ?? [],
                discount_redemptions: redemptionsRes.data ?? [],
                documents: documentsRes.data ?? [],
                messages: messagesRes.data ?? [],
                customer_tags: [],
                _primary_contact_id: primaryContactId,
            });
        }

        if (entity === "opportunity") {
            const jobsRes = await supabase.from("jobs").select("id, created_at, title, scheduled_at").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(LIMIT);
            const jobIds = (jobsRes.data ?? []).map((j: { id: string }) => j.id);
            const schedulesRes = jobIds.length > 0
                ? await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").in("job_id", jobIds).order("start_at", { ascending: false }).limit(LIMIT)
                : { data: [] as { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[] };
            return NextResponse.json({
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
            });
        }

        if (entity === "job") {
            const { data: jobRow } = await supabase.from("jobs").select("location_id").eq("id", id).maybeSingle();
            const locationId = (jobRow as { location_id?: string | null } | null)?.location_id ?? null;
            let location: Record<string, unknown> | null = null;
            if (locationId) {
                const { data: loc } = await supabase.from("locations").select("id, label, address1, city, state, postal_code, customer_id, is_primary, is_active").eq("id", locationId).maybeSingle();
                if (loc) location = loc as Record<string, unknown>;
            }
            const schedulesRes = await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").eq("job_id", id).order("start_at", { ascending: false }).limit(LIMIT);
            return NextResponse.json({
                schedules: schedulesRes.data ?? [],
                location,
            });
        }

        if (entity === "vendor") {
            const [jobsRes, vcRes] = await Promise.all([
                supabase.from("jobs").select("id, created_at, title, scheduled_at, job_status_id, gross_price_cents, recurring_total_cents, opportunity_id").eq("vendor_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("vendor_contacts").select("id, contact_id, role").eq("vendor_id", id),
            ]);
            const jobIds = (jobsRes.data ?? []).map((j: { id: string }) => j.id);
            const schedulesRes = jobIds.length > 0
                ? await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").in("job_id", jobIds).order("start_at", { ascending: false })
                : { data: [] as { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[] };
            const contactIds = (vcRes.data ?? []).map((r: { contact_id: string }) => r.contact_id);
            const contactsRes = contactIds.length > 0
                ? await supabase.from("contacts").select("id, first_name, last_name, email, phone").in("id", contactIds)
                : { data: [] as { id: string; first_name: string; last_name: string; email: string; phone: string }[] };
            const contactsWithRole = (contactsRes.data ?? []).map((c) => {
                const link = (vcRes.data ?? []).find((r: { contact_id: string }) => r.contact_id === c.id) as { role?: string } | undefined;
                return { ...c, _role: link?.role ?? null };
            });
            return NextResponse.json({
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
                contacts: contactsWithRole,
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
            const [customerRes, jobsRes, schedulesRes] = await Promise.all([
                customerId ? supabase.from("customers").select("id, name").eq("id", customerId).maybeSingle() : { data: null },
                supabase.from("jobs").select("id, created_at, title, scheduled_at").eq("location_id", id).eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").eq("location_id", id).eq("org_id", ctx.orgId).order("start_at", { ascending: false }).limit(LIMIT),
            ]);
            return NextResponse.json({
                customer: customerRes.data ?? null,
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
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
                    .select("id, name, original_filename, document_type, status, uploaded_at, created_at")
                    .eq("entity_type", "customer_member")
                    .eq("entity_id", id)
                    .order("uploaded_at", { ascending: false })
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
                documents: documentsRes.data ?? [],
            });
        }

        return NextResponse.json({ error: "Invalid entity" }, { status: 400 });
    } catch (e: unknown) {
        console.error("[ADMIN_RELATED]", e);
        return NextResponse.json({ error: "Failed to fetch related" }, { status: 500 });
    }
}
