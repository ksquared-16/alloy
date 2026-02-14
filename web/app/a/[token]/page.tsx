import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";

export default async function ActionLinkPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    if (!token) redirect("/");

    const supabase = createServiceRoleClient();
    const { data: row, error } = await supabase
        .from("action_links")
        .select("action_type, entity_type, entity_id, consumed_at, expires_at")
        .eq("token", token)
        .single();

    if (error || !row) redirect("/");
    if ((row as { consumed_at: string | null }).consumed_at) redirect("/a/used");
    const expiresAt = new Date((row as { expires_at: string }).expires_at);
    if (expiresAt <= new Date()) redirect("/a/expired");

    const actionType = (row as { action_type: string }).action_type;
    const entityType = (row as { entity_type: string }).entity_type;
    const entityId = (row as { entity_id: string }).entity_id;

    if (actionType === "vendor_accept_job" && entityType === "job") {
        redirect(`/a/accept-job?token=${encodeURIComponent(token)}`);
    }
    if (actionType === "customer_reschedule") {
        redirect(`/a/reschedule?token=${encodeURIComponent(token)}`);
    }
    if (actionType === "customer_cancel") {
        redirect(`/a/cancel?token=${encodeURIComponent(token)}`);
    }

    redirect("/");
}
