import { createAdminClient } from "@/lib/supabaseAdmin";
import JobsClient from "./JobsClient";

/** Title-case known job status keys when no job_statuses table is used. */
function jobStatusDisplay(
  jobStatusId: string | null | undefined,
  statusMap: Map<string, string>
): string | null {
  if (jobStatusId == null || jobStatusId === "") return null;
  const fromMap = statusMap.get(jobStatusId);
  if (fromMap) return fromMap;
  // UUID-like: don't show raw id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobStatusId))
    return "—";
  // Known string keys used in codebase
  const key = String(jobStatusId).toLowerCase();
  const known: Record<string, string> = {
    scheduled: "Scheduled",
    assigned: "Assigned",
    completed: "Completed",
    cancelled: "Cancelled",
    canceled: "Cancelled",
  };
  return known[key] ?? (key.length <= 24 ? key.replace(/\b\w/g, (c) => c.toUpperCase()) : "—");
}

/** Derive location summary from job metadata (address, city, postal_code). */
function locationSummary(metadata: unknown): string | null {
  const m = metadata as Record<string, unknown> | null | undefined;
  if (!m) return null;
  const address = typeof m.address === "string" ? m.address.trim() : null;
  const city = typeof m.city === "string" ? m.city.trim() : null;
  const postal_code = typeof m.postal_code === "string" ? m.postal_code.trim() : null;
  if (address) return [address, city, postal_code].filter(Boolean).join(", ") || null;
  if (city) return postal_code ? `${city} ${postal_code}` : city;
  if (postal_code) return postal_code;
  return null;
}

export default async function JobsPage() {
  const supabase = createAdminClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(
      "id, created_at, title, is_recurring, scheduled_at, job_status_id, gross_price_cents, contractor_payout_cents, offer_code, external_id, opportunity_id, primary_contact_id, customer_id, vertical_id, assigned_vendor_id, metadata"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Error fetching jobs:", error);
    return <JobsClient initialData={[]} error={error?.message} />;
  }

  const list = jobs ?? [];

  // Job statuses: if job_statuses table exists, map id -> label; else we use jobStatusDisplay fallback
  const statusMap = new Map<string, string>();
  const { data: jobStatuses } = await supabase.from("job_statuses").select("id, label");
  if (jobStatuses?.length) {
    jobStatuses.forEach((s: { id: string; label: string }) => statusMap.set(s.id, s.label ?? s.id));
  }

  const vendorIds = [...new Set(list.map((j) => (j as { assigned_vendor_id?: string | null }).assigned_vendor_id).filter(Boolean))] as string[];
  const customerIds = [...new Set(list.map((j) => (j as { customer_id?: string | null }).customer_id).filter(Boolean))] as string[];
  const [vendorsRes, customersRes] = await Promise.all([
    vendorIds.length ? supabase.from("vendors").select("id, name").in("id", vendorIds) : { data: [] },
    customerIds.length ? supabase.from("customers").select("id, name").in("id", customerIds) : { data: [] },
  ]);
  const vendorMap = new Map((vendorsRes.data ?? []).map((v) => [v.id, v]));
  const customerMap = new Map((customersRes.data ?? []).map((c) => [c.id, c]));

  const rows = list.map((j) => {
    const vid = (j as { assigned_vendor_id?: string | null }).assigned_vendor_id;
    const cid = (j as { customer_id?: string | null }).customer_id;
    const vendor = vid ? vendorMap.get(vid) : undefined;
    const customer = cid ? customerMap.get(cid) : undefined;
    const meta = (j as { metadata?: unknown }).metadata;
    return {
      ...j,
      _status_label: jobStatusDisplay((j as { job_status_id?: string | null }).job_status_id, statusMap),
      _default_vendor_name: (vendor as { name?: string } | undefined)?.name ?? null,
      _customer_name: (customer as { name?: string } | undefined)?.name ?? null,
      _location_summary: locationSummary(meta) ?? null,
    };
  });

  return <JobsClient initialData={rows} error={undefined} />;
}

