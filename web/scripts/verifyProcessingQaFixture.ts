/**
 * Dev-only verification for Slice 5C Processing QA fixture.
 * Run: cd web && node --import tsx scripts/verifyProcessingQaFixture.ts [caseId] [--archive]
 */
import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
    mapProcessingQueueToWorkItemRows,
    processingWorkItemId,
} from "../lib/workItems/mapProcessingCaseToWorkItemRow";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const caseId = process.argv[2]?.trim();
const shouldArchive = process.argv.includes("--archive");
if (!caseId) {
    console.error("Usage: verifyProcessingQaFixture.ts <caseId> [--archive]");
    process.exit(1);
}

async function mintSessionCookie(): Promise<string> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const preferredOrgId = process.env.DEV_QUEUE_ORG_ID?.trim() || "93667019-bd28-49b5-a688-acc9bb1e0a19";
    let rolesRes = await admin.from("user_roles").select("user_id").eq("org_id", preferredOrgId).in("role", ["admin", "ops"]).limit(1).maybeSingle();
    if (!rolesRes.data?.user_id) rolesRes = await admin.from("user_roles").select("user_id").in("role", ["admin", "ops"]).limit(1).maybeSingle();
    if (!rolesRes.data?.user_id) throw new Error("No admin user");
    const userRes = await admin.auth.admin.getUserById(rolesRes.data.user_id);
    const email = userRes.data.user?.email;
    if (!email) throw new Error("Missing email");
    const linkRes = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = linkRes.data.properties?.hashed_token;
    if (!tokenHash) throw new Error("generateLink failed");
    const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const otp = await anon.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (!otp.data.session) throw new Error("verifyOtp failed");
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    return `sb-${projectRef}-auth-token=${encodeURIComponent(JSON.stringify(otp.data.session))}`;
}

async function api(cookie: string, pathname: string, init?: RequestInit) {
    const base = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000";
    const res = await fetch(`${base}${pathname}`, { ...init, headers: { ...(init?.headers ?? {}), cookie } });
    return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
    const cookie = await mintSessionCookie();
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const queue = await api(cookie, "/api/admin/processing/queue");
    const rows = (queue.json as { data?: { rows?: unknown[] } }).data?.rows ?? [];
    const target = rows.find((r) => (r as { id?: string }).id === caseId) as
        | { id: string; status: string; formDraftSummary?: { generatedFormId?: string | null } }
        | undefined;

    const projected = mapProcessingQueueToWorkItemRows(rows as never);
    const wi = projected.find((r) => r.id === processingWorkItemId(caseId));

    const ot = await admin.from("operational_tasks").select("id").eq("processing_case_id", caseId);

    console.log(
        JSON.stringify(
            {
                phase: "before",
                inQueue: Boolean(target),
                status: target?.status ?? null,
                generatedFormId: target?.formDraftSummary?.generatedFormId ?? null,
                projected: Boolean(wi),
                workItemId: wi?.id ?? null,
                processingLane: (wi as { processing_lane?: string } | undefined)?.processing_lane ?? null,
                operationalTasksForCase: ot.data?.length ?? 0,
            },
            null,
            2,
        ),
    );

    if (shouldArchive) {
        const archive = await api(cookie, `/api/admin/processing/cases/${caseId}/archive`, { method: "POST" });
        const queue2 = await api(cookie, "/api/admin/processing/queue");
        const rows2 = (queue2.json as { data?: { rows?: unknown[] } }).data?.rows ?? [];
        const projected2 = mapProcessingQueueToWorkItemRows(rows2 as never);
        console.log(
            JSON.stringify(
                {
                    phase: "after_archive",
                    archiveStatus: archive.status,
                    inQueue: rows2.some((r) => (r as { id?: string }).id === caseId),
                    projected: projected2.some((r) => r.id === processingWorkItemId(caseId)),
                },
                null,
                2,
            ),
        );
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
