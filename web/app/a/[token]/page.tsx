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
    const sel = "token, short_code, action_type, entity_type, entity_id, consumed_at, expires_at" as const;
    let row: Record<string, unknown> | null = null;
    const byToken = await supabase.from("action_links").select(sel).eq("token", token).maybeSingle();
    if (byToken.data && !byToken.error) {
        row = byToken.data as Record<string, unknown>;
    } else {
        const byShort = await supabase.from("action_links").select(sel).eq("short_code", token).maybeSingle();
        if (byShort.data && !byShort.error) {
            row = byShort.data as Record<string, unknown>;
        }
    }

    if (!row) redirect("/");
    if ((row as { consumed_at: string | null }).consumed_at) redirect("/a/used");
    const expiresAt = new Date((row as { expires_at: string }).expires_at);
    if (expiresAt <= new Date()) redirect("/a/expired");

    const resolvedToken = String((row as { token: string }).token ?? "");
    const matchedShort = String((row as { short_code?: string | null }).short_code ?? "") === token;
    if (matchedShort && resolvedToken) {
        redirect(`/action/${encodeURIComponent(resolvedToken)}`);
    }

    const actionType = (row as { action_type: string }).action_type;
    const entityType = (row as { entity_type: string }).entity_type;
    const entityId = (row as { entity_id: string }).entity_id;

    if (actionType === "vendor_accept_job" && entityType === "job") {
        redirect(`/a/accept-job?token=${encodeURIComponent(resolvedToken)}`);
    }
    if (actionType === "customer_reschedule" || actionType === "reschedule_schedule") {
        redirect(`/book-v2?reschedule_token=${encodeURIComponent(resolvedToken)}`);
    }
    if (actionType === "customer_cancel") {
        redirect(`/a/cancel?token=${encodeURIComponent(resolvedToken)}`);
    }

    redirect("/");
}
