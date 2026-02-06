import { createAdminClient } from "@/lib/supabaseAdmin";
import OpportunitiesClient from "./OpportunitiesClient";

export default async function OpportunitiesPage() {
    const supabase = createAdminClient();

    const { data: opportunities, error } = await supabase
        .from("opportunities")
        .select(
            "id, created_at, name, status, job_date, job_time_window, quote_total, customer_id, primary_contact_id, external_id, vertical_id, pipeline_stage_id"
        )
        .order("created_at", { ascending: false })
        .limit(1000);

    const { data: stages } = await supabase
        .from("pipeline_stages")
        .select("id, name, pipeline_id")
        .order("position", { ascending: true });

    if (error) {
        console.error("Error fetching opportunities:", error);
    }

    return (
        <OpportunitiesClient
            initialData={opportunities || []}
            stages={stages ?? []}
            error={error?.message}
        />
    );
}

