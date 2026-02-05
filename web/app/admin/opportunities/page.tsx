import { createAdminClient } from "@/lib/supabaseAdmin";
import OpportunitiesClient from "./OpportunitiesClient";

export default async function OpportunitiesPage() {
    const supabase = createAdminClient();

    const { data: opportunities, error } = await supabase
        .from("opportunities")
        .select(
            "id, created_at, name, status, job_date, job_time_window, quote_total, customer_id, primary_contact_id, external_id, vertical_id"
        )
        .order("created_at", { ascending: false })
        .limit(1000);

    if (error) {
        console.error("Error fetching opportunities:", error);
    }

    return (
        <OpportunitiesClient
            initialData={opportunities || []}
            error={error?.message}
        />
    );
}

