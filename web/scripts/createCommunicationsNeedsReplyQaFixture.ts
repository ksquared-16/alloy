/**
 * Dev-only: mark an existing Communications thread as Needs Reply for Work Items QA.
 * Restores prior attention_state on cleanup.
 *
 * Run: cd web && node --import tsx scripts/createCommunicationsNeedsReplyQaFixture.ts
 * Cleanup: cd web && node --import tsx scripts/createCommunicationsNeedsReplyQaFixture.ts --cleanup
 */
import dotenv from "dotenv";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const ORG_ID = process.env.DEV_QUEUE_ORG_ID?.trim() || "93667019-bd28-49b5-a688-acc9bb1e0a19";
const MARKER = "wi3-slice6-comms-needs-reply-fixture";

async function adminClient(): Promise<SupabaseClient> {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

async function pickThreadId(admin: SupabaseClient) {
    const explicit = process.env.WI3_COMMS_QA_THREAD_ID?.trim();
    if (explicit) return explicit;
    const { data, error } = await admin
        .from("communication_threads")
        .select("id, attention_state, metadata")
        .eq("org_id", ORG_ID)
        .order("last_message_at", { ascending: false })
        .limit(10);
    if (error) throw error;
    type ThreadPick = { id: string; attention_state: string | null; metadata: unknown };
    const rows = (data ?? []) as ThreadPick[];
    const row = rows.find((t) => (t.attention_state ?? null) !== "resolved") ?? rows[0];
    if (!row?.id) throw new Error("No communication thread available for QA fixture");
    return row.id as string;
}

if (process.env.NODE_ENV === "production") {
    console.error("Dev QA fixture scripts cannot run in production.");
    process.exit(1);
}

async function main() {
    const cleanup = process.argv.includes("--cleanup");
    const admin = await adminClient();
    const threadId = await pickThreadId(admin);

    if (cleanup) {
        const { data } = await admin.from("communication_threads").select("metadata").eq("id", threadId).maybeSingle();
        const meta = (data?.metadata ?? {}) as Record<string, unknown>;
        const prior = typeof meta[`${MARKER}_prior_attention_state`] === "string" ? (meta[`${MARKER}_prior_attention_state`] as string) : null;
        await admin
            .from("communication_threads")
            .update({
                attention_state: prior,
                metadata: { ...meta, [`${MARKER}_prior_attention_state`]: null, [`${MARKER}_active`]: false },
            })
            .eq("id", threadId);
        console.log(JSON.stringify({ ok: true, cleaned: true, threadId }, null, 2));
        return;
    }

    const { data: existing } = await admin
        .from("communication_threads")
        .select("attention_state, metadata")
        .eq("id", threadId)
        .maybeSingle();
    const prior = existing?.attention_state ?? null;
    const meta = (existing?.metadata ?? {}) as Record<string, unknown>;
    await admin
        .from("communication_threads")
        .update({
            attention_state: "needs_response",
            metadata: {
                ...meta,
                [`${MARKER}_prior_attention_state`]: prior,
                [`${MARKER}_active`]: true,
            },
        })
        .eq("id", threadId);

    console.log(
        JSON.stringify(
            {
                ok: true,
                threadId,
                workItemId: `communications:${threadId}`,
                lane: "needs_reply",
                priorAttentionState: prior,
                cleanup: "node --import tsx scripts/createCommunicationsNeedsReplyQaFixture.ts --cleanup",
            },
            null,
            2,
        ),
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
