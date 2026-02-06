import { createAdminClient } from "@/lib/supabaseAdmin";
import SchedulesClient from "./SchedulesClient";

export default async function AdminSchedulesPage() {
    const supabase = createAdminClient();
    const { data: schedules, error } = await supabase
        .from("schedules")
        .select("id, job_id, start_at, end_at, timezone")
        .order("start_at", { ascending: false })
        .limit(500);

    return (
        <SchedulesClient
            initialData={schedules ?? []}
            error={error?.message}
        />
    );
}
