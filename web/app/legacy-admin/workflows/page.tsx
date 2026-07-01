import { createAdminClient } from "@/lib/supabaseAdmin";
import WorkflowsClient from "./WorkflowsClient";

export const dynamic = 'force-dynamic';

export default async function AdminWorkflowsPage() {
    const supabase = createAdminClient();
    const { data: workflows, error } = await supabase
        .from("workflows")
        .select("id, name, description, event_type, entity_type, enabled, created_at, updated_at")
        .order("updated_at", { ascending: false });

    return (
        <WorkflowsClient
            initialData={workflows ?? []}
            error={error?.message}
        />
    );
}
