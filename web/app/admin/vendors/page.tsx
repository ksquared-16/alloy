import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import VendorsClient from "./VendorsClient";

type SearchParams = { status_key?: string };

type VendorRow = {
    id: string;
    org_id?: string | null;
    created_at: string | null;
    updated_at: string | null;
    submitted_at: string | null;
    name: string | null;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    vendor_status_id: string | null;
    status_key: string | null;
    status?: string | null;
    primary_contact_id: string | null;
    primary_person_id: string | null;
    payout_percent: number | null;
    w9_received?: boolean | null;
    ach_verified?: boolean | null;
    service_area_zip_codes: string[] | null;
    days_available: string[] | null;
    [k: string]: unknown;
};

export default async function VendorsPage({ searchParams }: { searchParams: SearchParams }) {
    const supabase = createAdminClient();
    const statusKey = typeof searchParams?.status_key === "string" ? searchParams.status_key.trim() || null : null;

    const vendorCols = "id, created_at, updated_at, submitted_at, name, company_name, email, phone, vendor_status_id, status_key, org_id, primary_contact_id, primary_person_id, payout_percent, service_area_zip_codes, days_available";
    let q = supabase
        .from("vendors")
        .select(vendorCols)
        .order("created_at", { ascending: false })
        .limit(1000);
    if (statusKey) q = q.eq("status_key", statusKey);
    const { data: vendors, error: vendorsError } = await q;

    const vendorList = (vendors ?? []) as VendorRow[];

    const vendorOrgIds = [...new Set(vendorList.map((v) => v.org_id).filter(Boolean))] as string[];
    const vendorStatusLabelByOrg = new Map<string, Map<string, string>>();
    for (const oid of vendorOrgIds) {
        const defs = await fetchEffectiveStatusDefinitions(supabase, oid, "vendors", { activeOnly: true });
        vendorStatusLabelByOrg.set(
            oid,
            new Map(defs.map((d) => [d.status_key, (d.status_label?.trim() || d.status_key) as string]))
        );
    }

    const primaryContactIds = [...new Set(vendorList.map((v) => v.primary_contact_id).filter(Boolean))] as string[];
    const primaryPersonIds = [...new Set(vendorList.map((v) => v.primary_person_id).filter(Boolean))] as string[];
    let primaryContacts: Record<string, { name: string; email: string | null; phone: string | null }> = {};
    if (primaryContactIds.length > 0) {
        const { data: contacts } = await supabase
            .from("contacts")
            .select("id, first_name, last_name, email, phone")
            .in("id", primaryContactIds);
        for (const c of contacts ?? []) {
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "—";
            primaryContacts[c.id] = { name: name || "—", email: c.email ?? null, phone: c.phone ?? null };
        }
    }
    let primaryPersons: Record<string, { name: string; email: string | null; phone: string | null }> = {};
    if (primaryPersonIds.length > 0) {
        const { data: persons } = await supabase
            .from("persons")
            .select("id, first_name, last_name, email, phone")
            .in("id", primaryPersonIds);
        for (const p of persons ?? []) {
            const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "—";
            primaryPersons[p.id] = { name: name || "—", email: p.email ?? null, phone: p.phone ?? null };
        }
    }

    const { data: jobCountRows } = await supabase
        .from("jobs")
        .select("assigned_vendor_id")
        .not("assigned_vendor_id", "is", null);
    const jobsByVendor: Record<string, number> = {};
    for (const r of jobCountRows ?? []) {
        const vid = (r as { assigned_vendor_id: string }).assigned_vendor_id;
        if (vid) jobsByVendor[vid] = (jobsByVendor[vid] ?? 0) + 1;
    }

    const rows = vendorList.map((v) => {
        const pc = v.primary_contact_id ? primaryContacts[v.primary_contact_id] : null;
        const pp = v.primary_person_id ? primaryPersons[v.primary_person_id] : null;
        const oid = v.org_id ?? null;
        const vLabels = oid ? vendorStatusLabelByOrg.get(oid) : null;
        const sk = v.status_key ?? null;
        const _status_display =
            sk && vLabels ? (vLabels.get(sk) ?? sk) : sk ?? (v.status ?? null);
        const _updated = v.updated_at ?? v.created_at ?? null;
        return {
            ...v,
            _vendor_status_key: sk ?? "",
            _vendor_status_label: _status_display ?? "",
            _status_display: _status_display || null,
            _primary_person_name: pp?.name ?? null,
            _primary_contact_name: pc?.name ?? null,
            _vendor_email: pp?.email ?? pc?.email ?? v.email ?? null,
            _vendor_phone: pp?.phone ?? pc?.phone ?? v.phone ?? null,
            _jobs_count: jobsByVendor[v.id] ?? 0,
            _updated,
        };
    });

    if (vendorsError) {
        console.error("Error fetching vendors:", vendorsError);
    }

    return (
        <VendorsClient initialData={rows} error={vendorsError?.message} />
    );
}
