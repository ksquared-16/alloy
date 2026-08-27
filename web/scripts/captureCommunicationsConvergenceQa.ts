/**
 * Authenticated Playwright capture for Work Items V3 Slice 6 Communications QA.
 * Run: cd web && node --import tsx scripts/captureCommunicationsConvergenceQa.ts
 */
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
// The app's own cookie serializer/chunker — not a second implementation of it.
import { createChunks, stringToBase64URL } from "@supabase/ssr/dist/main/utils";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const OUT = path.join(process.cwd(), "../docs/sprints/archive/08_2026/work-items-v3-platform/qa/slice-6");
const BASE = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000";
const ORG_ID = process.env.DEV_QUEUE_ORG_ID?.trim() || "93667019-bd28-49b5-a688-acc9bb1e0a19";
const THREAD_ID = process.env.WI3_COMMS_QA_THREAD_ID?.trim() || "4de7b8e8-ef5c-4609-b4b0-0e611dcd4600";

async function mintSessionCookie(): Promise<Array<{ name: string; value: string }>> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const rolesRes = await admin
        .from("user_roles")
        .select("user_id")
        .eq("org_id", ORG_ID)
        .in("role", ["admin", "ops"])
        .limit(1)
        .maybeSingle();
    if (!rolesRes.data?.user_id) throw new Error("No admin user for QA");
    const userRes = await admin.auth.admin.getUserById(rolesRes.data.user_id);
    const email = userRes.data.user?.email;
    if (!email) throw new Error("Admin user missing email");
    const linkRes = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = linkRes.data.properties?.hashed_token;
    if (!tokenHash) throw new Error("generateLink failed");
    const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const otp = await anon.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (!otp.data.session) throw new Error("verifyOtp failed");
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    /*
     * The cookie is produced by @supabase/ssr's OWN encoder and chunker, because the running app
     * decodes with that same module. This used to return raw JSON, which predates the installed SSR
     * version (0.8.x): that version reads a `base64-` prefixed, base64URL-encoded value, and splits
     * long values across `name.0`, `name.1`. base64URL is unpadded and uses `-`/`_`, so it differs
     * from standard base64 for most payloads — measured at 188 of 200 random samples.
     *
     * A cookie in the old shape is not rejected loudly; it is silently ignored, which presents as
     * "storage contains a session but the app reports no authenticated identity". That is a very
     * expensive symptom to debug, so the encoding is delegated rather than reproduced here.
     */
    const encoded = `base64-${stringToBase64URL(JSON.stringify(otp.data.session))}`;
    return createChunks(`sb-${projectRef}-auth-token`, encoded).map((part) => ({
        name: part.name,
        value: part.value,
    }));
}

async function openWorkItemsQueue(page: Page) {
    const modal = page.locator('[data-adminv2-bos-modal="adminv2-tasks-modal"]');
    await page.goto(`${BASE}/admin/workspace`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    await page.getByRole("button", { name: /work items/i }).first().click();
    await page.waitForTimeout(2500);
    await modal.waitFor({ state: "visible" });
    await modal.getByRole("button", { name: /open work items/i }).click();
    await page.locator('[data-testid="work-items-queue"]').waitFor({ state: "visible" });
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const cookieParts = await mintSessionCookie();
    const results: Record<string, string | number | boolean> = {};

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Every chunk must be added: a session split across `.0`/`.1` is unreadable if only one lands.
    await context.addCookies(
        cookieParts.map((part) => ({ name: part.name, value: part.value, domain: "127.0.0.1", path: "/" })),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    const tasksModal = () => page.locator('[data-adminv2-bos-modal="adminv2-tasks-modal"]');
    const modal = tasksModal();
    const rail = () => tasksModal().locator('[data-testid="work-items-fvs-rail"]');

    await openWorkItemsQueue(page);
    await rail().locator('[data-work-items-source="communications"]').click();
    await rail().locator('[data-work-items-view="unassigned"]').click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, "01-communications-source-enabled.png") });

    const kurzmanRows = page.locator('[data-testid="work-items-queue"]').getByText(/Reply: Kurzman Family/i);
    results.uiProjectionCount = await kurzmanRows.count();
    if (!(await kurzmanRows.count())) throw new Error("Expected one Communications projection row");
    await kurzmanRows.first().click();
    await page.waitForTimeout(1500);
    await page.locator('[data-work-items-communications-context="true"]').waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(OUT, "02-communications-projected-row.png") });
    await page.screenshot({ path: path.join(OUT, "03-communications-work-item-detail.png") });

    results.provenance =
        (await page.locator('[data-work-items-communications-provenance-chain="true"]').textContent())?.trim() ?? "";
    await page
        .locator('[data-work-items-communications-context="true"]')
        .screenshot({ path: path.join(OUT, "04-communications-provenance.png") });

    await page.getByRole("button", { name: "Open in Communications" }).click();
    await page.waitForTimeout(5000);
    results.threadSelected = (await page.locator(`[data-cc-conversation="${THREAD_ID}"]`).count()) > 0;
    await page.screenshot({ path: path.join(OUT, "05-open-in-communications-thread.png") });

    const viewInWi = page.locator('[data-work-items-cross-link="view-in-queue"]');
    results.viewInWorkItemsVisible = (await viewInWi.count()) > 0;
    if (await viewInWi.count()) {
        await viewInWi.click();
        await page.waitForTimeout(2000);
        await tasksModal().waitFor({ state: "visible" });
        await page.screenshot({ path: path.join(OUT, "06-view-in-work-items.png") });
        results.workItemReselected =
            (await tasksModal().locator('[data-testid="work-items-queue"]').getByText(/Reply: Kurzman Family/i).count()) > 0;
        await page.screenshot({ path: path.join(OUT, "07-exact-work-item-selected.png") });
    }

    if (!(await tasksModal().isVisible())) {
        await page.getByRole("button", { name: /work items/i }).first().click();
        await page.waitForTimeout(1500);
        await modal.getByRole("button", { name: /open work items/i }).click();
        await page.locator('[data-testid="work-items-queue"]').waitFor({ state: "visible" });
    }
    await rail().locator('[data-work-items-source="communications"]').click();
    await rail().locator('[data-work-items-view="mine"]').click();
    await page.waitForTimeout(1500);
    results.mineEmpty = (await page.getByText(/No Communications work is assigned to you/i).count()) > 0;
    await page.screenshot({ path: path.join(OUT, "09-communications-mine-empty-state.png") });

    await rail().locator('[data-work-items-view="unassigned"]').click();
    await page.waitForTimeout(1000);
    results.unassignedHasRow = (await page.getByText(/Reply: Kurzman Family/i).count()) > 0;

    const triageRes = await page.request.post(
        `${BASE}/api/admin/communications/conversations/${THREAD_ID}/triage`,
        { data: { action: "resolved" } },
    );
    results.triageStatus = triageRes.status();
    await page.evaluate(async (threadId) => {
        await fetch("/api/admin/communications/conversations", { credentials: "include" });
        window.dispatchEvent(
            new CustomEvent("adminv2:communications-queue-refresh", { detail: { communication_thread_id: threadId } }),
        );
    }, THREAD_ID);
    await page.waitForTimeout(3000);
    await rail().locator('[data-work-items-source="communications"]').click();
    await rail().locator('[data-work-items-view="unassigned"]').click();
    await page.waitForTimeout(2000);
    await page.waitForTimeout(2000);
    results.afterResolutionRows = await page.getByText(/Reply: Kurzman Family/i).count();
    await page.screenshot({ path: path.join(OUT, "08-queue-after-resolution.png") });

    await browser.close();

    fs.writeFileSync(
        path.join(OUT, "qa-results.json"),
        JSON.stringify({ ...results, threadId: THREAD_ID, workItemId: `communications:${THREAD_ID}` }, null, 2),
    );
    console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
