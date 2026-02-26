import { createAdminClient } from "@/lib/supabaseAdmin";
import MessagingClient from "./MessagingClient";

export default async function AdminMessagingPage() {
    const supabase = createAdminClient();

    const { data: rows, error } = await supabase
        .from("messages_outbox")
        .select("id, created_at, org_id, workflow_run_id, channel, to_contact_id, to_phone, to_email, body, status, dedupe_key, sent_at, error")
        .order("created_at", { ascending: false })
        .limit(50);

    return (
        <MessagingClient
            initialOutboxData={rows ?? []}
            outboxError={error?.message}
        />
    );
}
