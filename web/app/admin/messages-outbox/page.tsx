import { createAdminClient } from "@/lib/supabaseAdmin";
import MessagesOutboxClient from "./MessagesOutboxClient";

export default async function AdminMessagesOutboxPage() {
    const supabase = createAdminClient();

    const { data: rows, error } = await supabase
        .from("messages_outbox")
        .select("id, created_at, org_id, workflow_run_id, channel, to_contact_id, to_phone, to_email, body, status, dedupe_key, sent_at, error")
        .order("created_at", { ascending: false })
        .limit(50);

    return (
        <MessagesOutboxClient
            initialData={rows ?? []}
            error={error?.message}
        />
    );
}
