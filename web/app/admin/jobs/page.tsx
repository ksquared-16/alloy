import { createAdminClient } from "@/lib/supabaseAdmin";
import JobsClient from "./JobsClient";

export default async function JobsPage() {
  const supabase = createAdminClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(
      "id, created_at, title, is_recurring, scheduled_at, job_status_id, gross_price_cents, contractor_payout_cents, offer_code, external_id, opportunity_id, primary_contact_id, customer_id, vertical_id"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Error fetching jobs:", error);
  }

  return <JobsClient initialData={jobs || []} error={error?.message} />;
}

