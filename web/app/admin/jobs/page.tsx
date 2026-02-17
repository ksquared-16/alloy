import { createAdminClient } from "@/lib/supabaseAdmin";
import JobsClient from "./JobsClient";

export default async function JobsPage() {
  const supabase = createAdminClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(
      "id, created_at, title, is_recurring, scheduled_at, job_status_id, gross_price_cents, contractor_payout_cents, offer_code, external_id, opportunity_id, primary_contact_id, customer_id, vertical_id, assigned_vendor_id"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Error fetching jobs:", error);
    return <JobsClient initialData={[]} error={error?.message} />;
  }

  const list = jobs ?? [];
  const vendorIds = [...new Set(list.map((j) => (j as { assigned_vendor_id?: string | null }).assigned_vendor_id).filter(Boolean))] as string[];
  const { data: vendors } = vendorIds.length ? await supabase.from("vendors").select("id, name").in("id", vendorIds) : { data: [] };
  const vendorMap = new Map((vendors ?? []).map((v) => [v.id, v]));

  const rows = list.map((j) => {
    const vid = (j as { assigned_vendor_id?: string | null }).assigned_vendor_id;
    const vendor = vid ? vendorMap.get(vid) : undefined;
    return {
      ...j,
      _status_label: (j as { job_status_id?: string | null }).job_status_id ?? null,
      _default_vendor_name: (vendor as { name?: string } | undefined)?.name ?? null,
    };
  });

  return <JobsClient initialData={rows} error={undefined} />;
}

