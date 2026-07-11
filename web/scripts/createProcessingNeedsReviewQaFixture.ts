/**
 * Dev-only: create a Processing case that projects to Work Items (needs_review lane).
 * Upload only — stops before form-draft/create (which advances to ready_publish).
 *
 * Run: cd web && node --import tsx scripts/createProcessingNeedsReviewQaFixture.ts
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const FIXTURE = path.join(process.cwd(), "tests/fixtures/processing/mo500-3313-school-age-child-health-report.pdf");

async function mintSessionCookie(): Promise<string> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const preferredOrgId = process.env.DEV_QUEUE_ORG_ID?.trim() || "93667019-bd28-49b5-a688-acc9bb1e0a19";
    let rolesRes = await admin
        .from("user_roles")
        .select("user_id")
        .eq("org_id", preferredOrgId)
        .in("role", ["admin", "ops"])
        .limit(1)
        .maybeSingle();
    if (!rolesRes.data?.user_id) {
        rolesRes = await admin.from("user_roles").select("user_id").in("role", ["admin", "ops"]).limit(1).maybeSingle();
    }
    if (!rolesRes.data?.user_id) throw new Error("No admin user for QA fixture");
    const userRes = await admin.auth.admin.getUserById(rolesRes.data.user_id);
    const email = userRes.data.user?.email;
    if (!email) throw new Error("Admin user missing email");
    const linkRes = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = linkRes.data.properties?.hashed_token;
    if (!tokenHash) throw new Error("generateLink failed");
    const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const otp = await anon.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (!otp.data.session) throw new Error("verifyOtp failed");
    const host = new URL(supabaseUrl).hostname;
    const projectRef = host.split(".")[0];
    const cookieName = `sb-${projectRef}-auth-token`;
    const value = encodeURIComponent(JSON.stringify(otp.data.session));
    return `${cookieName}=${value}`;
}

if (process.env.NODE_ENV === "production") {
    console.error("Dev QA fixture scripts cannot run in production.");
    process.exit(1);
}

async function main() {
    if (!fs.existsSync(FIXTURE)) throw new Error(`Missing fixture: ${FIXTURE}`);
    const base = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000";
    const pdfBuffer = fs.readFileSync(FIXTURE);
    const cookie = await mintSessionCookie();
    const form = new FormData();
    form.append(
        "file",
        new Blob([pdfBuffer], { type: "application/pdf" }),
        `wi3-slice5c-qa-${Date.now()}-needs-review.pdf`,
    );
    form.append("open_processing_case", "true");

    const res = await fetch(`${base}/api/admin/documents/upload`, { method: "POST", body: form, headers: { cookie } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        console.error("Upload failed", res.status, json);
        process.exit(1);
    }
    const caseId = (json as { processing_case_id?: string }).processing_case_id;
    if (!caseId) {
        console.error("No processing_case_id in response", json);
        process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, caseId, workItemId: `processing:${caseId}`, lane: "needs_review" }, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
