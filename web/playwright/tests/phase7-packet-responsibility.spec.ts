/**
 * Phase 7 Slice 2 — authenticated operator certification: compose an enrollment packet, configure
 * requirement RESPONSIBILITY in real-world language, preview how it projects across a two-guardian /
 * two-child household, verify blocking validation, persist + reopen, and verify the projection +
 * participant-runtime seams + the Processing on-ramp wiring — all through real product surfaces.
 *
 * Fixture prep (allowed): a published enrollment form is seeded via the service role so requirement
 * types are deterministic. The CERTIFIED behavior (compose/responsibility/projection/persistence)
 * runs through the real UI + real API paths.
 *
 * Run:
 *   cd web && set -a && source /Users/Kelly/Alloy/web/.env.local && set +a \
 *     && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 npx playwright test playwright/tests/phase7-packet-responsibility.spec.ts
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

/** Service-role client — used ONLY to READ rows for verification (never to write certified state). */
function verifyDb(): SupabaseClient {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

const SHOTS = path.join(process.cwd(), "docs/sprints/active/phase-7-evidence/slice-2-responsibility");
async function snap(page: Page, name: string) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

const modal = (p: Page) => p.locator('[data-adminv2-bos-modal="adminv2-processing-modal"]');

/**
 * Create + publish an enrollment form through the REAL authenticated admin API (so it lands in the
 * signed-in admin's org and is reachable by the composer). Deterministic requirement types.
 */
async function createPublishedForm(page: Page): Promise<{ formId: string; formName: string }> {
    const stamp = Date.now();
    const formName = `Cert Enrollment ${stamp}`;
    const createRes = await page.request.post("/api/admin/forms", { data: { name: formName, kind: "center", metadata: { source: "slice2-cert" } } });
    if (!createRes.ok()) throw new Error(`create form failed (${createRes.status()}): ${await createRes.text()}`);
    const formId = ((await createRes.json()) as { data?: { id?: string } }).data?.id ?? "";
    if (!formId) throw new Error("create form returned no id");
    const schema = {
        schema_version: 1,
        title: formName,
        sections: [
            { id: "sec_child", title: "Child information", field_ids: ["f_child_name", "f_child_dob"] },
            { id: "sec_docs", title: "Documents & agreements", field_ids: ["f_immunization", "f_handbook_ack", "f_financial_ack", "f_signature"] },
        ],
        fields: [
            { id: "f_child_name", label: "Child full name", required: true, type: "text" },
            { id: "f_child_dob", label: "Date of birth", required: true, type: "date" },
            { id: "f_immunization", label: "Immunization record", required: true, type: "file_ref" },
            { id: "f_handbook_ack", label: "Handbook acknowledgement", required: true, type: "boolean" },
            { id: "f_financial_ack", label: "Financial agreement", required: true, type: "boolean" },
            { id: "f_signature", label: "Enrollment signature", required: true, type: "signature" },
        ],
    };
    const verRes = await page.request.post(`/api/admin/forms/${formId}/versions`, { data: { schema_json: schema } });
    if (!verRes.ok()) throw new Error(`create version failed (${verRes.status()}): ${await verRes.text()}`);
    const versionId = ((await verRes.json()) as { data?: { id?: string } }).data?.id ?? "";
    if (!versionId) throw new Error("create version returned no id");
    const pubRes = await page.request.post(`/api/admin/forms/${formId}/versions/${versionId}/publish`, { data: {} });
    if (!pubRes.ok()) throw new Error(`publish failed (${pubRes.status()}): ${await pubRes.text()}`);
    return { formId, formName };
}

async function openStudioPackets(page: Page) {
    await page.locator('[data-adminv2-app-shell="workspace-v2"]').waitFor({ state: "visible", timeout: 120_000 });
    const trigger = page.getByRole("button", { name: /Processing — intake/i });
    await expect(trigger).toBeVisible({ timeout: 120_000 });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(modal(page)).toBeVisible({ timeout: 60_000 });
    await page.addStyleTag({ content: "[data-adminv2-bos-rail-overlay], [data-adminv2-bos-rail-overlay] *{pointer-events:none !important}" });
    // Switch to Studio mode, then the Packets tab.
    const studioBtn = modal(page).getByRole("button", { name: /^Studio$/ }).or(modal(page).getByRole("tab", { name: /^Studio$/ }));
    await studioBtn.first().click();
    const packetsTab = modal(page).getByRole("tab", { name: /^Packets$/ }).or(modal(page).getByRole("button", { name: /^Packets$/ }));
    await packetsTab.first().click();
    // The Packets tab is the definition MANAGER; "New packet" opens the responsibility composer.
    await expect(modal(page).getByTestId("packets-studio-new-packet")).toBeVisible({ timeout: 30_000 });
}

test.describe("Phase 7 Slice 2 — packet responsibility (operator + projection seams)", () => {
    test.setTimeout(600_000);

    test("compose → configure responsibility → preview → validation → persist → seams", async ({ page }) => {
        // 1. Authenticate, then create + publish the enrollment form via the real admin API.
        await ensureAdminPlaywrightSession(page);
        const { formId, formName } = await createPublishedForm(page);
        await openStudioPackets(page);
        await snap(page, "01-composer");

        // 2-3. New packet (opens the responsibility composer) → select form → requirements enumerate.
        await modal(page).getByTestId("packets-studio-new-packet").click();
        await expect(modal(page).getByTestId("packet-composer")).toBeVisible({ timeout: 20_000 });
        const formCheckbox = modal(page).locator("label", { hasText: formName }).locator('input[type="checkbox"]');
        await formCheckbox.waitFor({ state: "visible", timeout: 30_000 });
        await formCheckbox.check();
        await expect(modal(page).getByTestId("packet-requirements")).toBeVisible({ timeout: 30_000 });
        // Meaningful requirements enumerated (upload/ack/signature/info) — one row per requirement.
        const rows = modal(page).locator('[data-testid^="requirement-row-"]');
        expect(await rows.count()).toBeGreaterThanOrEqual(4);
        await snap(page, "02-requirements");

        // 4. Configure responsibility in real-world language. Financial agreement → financial guardian.
        const finRow = modal(page).locator('[data-testid^="requirement-row-"]', { hasText: "Financial agreement" });
        await finRow.getByRole("button").first().click();
        const finKey = (await finRow.getAttribute("data-testid"))!.replace("requirement-row-", "");
        await modal(page).getByTestId(`req-party-${finKey}`).selectOption("financial_guardian");
        await snap(page, "03-responsibility-editor");

        // 5. Household preview projects across two guardians + two children, and is launch-ready.
        await expect(modal(page).getByTestId("packet-preview")).toBeVisible({ timeout: 20_000 });
        await expect(modal(page).getByTestId("preview-guardian-preview-guardian-a")).toBeVisible();
        await expect(modal(page).getByTestId("preview-guardian-preview-guardian-b")).toBeVisible();
        await expect(modal(page).getByTestId("preview-ok")).toBeVisible({ timeout: 15_000 });
        await snap(page, "04-household-preview");

        // 8. Blocking validation: point the required signature at a non-existent role → launch blocked.
        const sigRow = modal(page).locator('[data-testid^="requirement-row-"]', { hasText: "Enrollment signature" });
        await sigRow.getByRole("button").first().click();
        const sigKey = (await sigRow.getAttribute("data-testid"))!.replace("requirement-row-", "");
        await modal(page).getByTestId(`req-party-${sigKey}`).selectOption("role");
        await modal(page).getByTestId(`req-role-${sigKey}`).fill("Notary");
        await expect(modal(page).getByTestId("preview-blocked")).toBeVisible({ timeout: 15_000 });
        await expect(modal(page).getByTestId("packet-compose-submit")).toBeDisabled();
        await snap(page, "05-blocking-validation");
        // Fix it back to all guardians → launchable again.
        await modal(page).getByTestId(`req-party-${sigKey}`).selectOption("all_guardians");
        await expect(modal(page).getByTestId("preview-ok")).toBeVisible({ timeout: 15_000 });
        await expect(modal(page).getByTestId("packet-compose-submit")).toBeEnabled();

        // 9. Save the packet (real compose path).
        await modal(page).locator('input[placeholder="Packet name (optional)"]').fill(`Cert Packet ${Date.now()}`);
        const [composeResp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/api/admin/pos/packets/compose") && r.request().method() === "POST", { timeout: 30_000 }),
            modal(page).getByTestId("packet-compose-submit").click(),
        ]);
        expect(composeResp.ok()).toBeTruthy();
        const composeBody = (await composeResp.json()) as { data?: { packet_definition_id?: string } };
        const packetId = composeBody.data?.packet_definition_id ?? "";
        expect(packetId, "packet created via compose").toBeTruthy();
        await snap(page, "06-persisted");

        // 10. Reopen / persistence: the projection endpoint returns the persisted rules + resolved
        //     responsibility (financial guardian on the financial agreement).
        const projRes = await page.request.get(`/api/admin/pos/packets/${packetId}/projection`);
        expect(projRes.ok()).toBeTruthy();
        const proj = (await projRes.json()) as { data?: { requirements?: Array<{ label: string; responsibility: { responsible_party: { kind: string } } }> } };
        const finReq = (proj.data?.requirements ?? []).find((r) => r.label === "Financial agreement");
        expect(finReq?.responsibility.responsible_party.kind, "financial-guardian rule persisted").toBe("financial_guardian");

        // 11. Requirements enumeration seam is retrievable for the form.
        const reqRes = await page.request.get(`/api/admin/pos/packets/requirements?form_definition_ids=${formId}`);
        expect(reqRes.ok()).toBeTruthy();
        const reqBody = (await reqRes.json()) as { data?: { forms?: Array<{ requirements?: Array<{ type: string }> }> } };
        const types = (reqBody.data?.forms ?? []).flatMap((f) => f.requirements ?? []).map((r) => r.type);
        expect(types).toContain("upload");
        expect(types).toContain("acknowledgement");
        expect(types).toContain("signature");

        // eslint-disable-next-line no-console
        console.log(`SLICE2_OPERATOR_PASS packetId=${packetId} requirementTypes=${JSON.stringify(Array.from(new Set(types)))}`);
    });
});

// ---------------------------------------------------------------------------------------------------
// Live completion → Processing handoff, through REAL public submission + on-ramp paths.
// ---------------------------------------------------------------------------------------------------

/** Create + publish a minimal packet-able form (two easily-satisfiable fields). */
async function createMinimalForm(req: APIRequestContext): Promise<{ formId: string; formName: string }> {
    const stamp = Date.now();
    const formName = `Cert Consent ${stamp}`;
    const createRes = await req.post("/api/admin/forms", { data: { name: formName, kind: "center", metadata: { source: "slice2-cert" } } });
    if (!createRes.ok()) throw new Error(`create form failed (${createRes.status()}): ${await createRes.text()}`);
    const formId = ((await createRes.json()) as { data?: { id?: string } }).data?.id ?? "";
    const schema = {
        schema_version: 1,
        title: formName,
        sections: [{ id: "sec_main", title: "Consent", field_ids: ["f_note", "f_agree"] }],
        fields: [
            { id: "f_note", label: "Parent note", required: false, type: "text" },
            { id: "f_agree", label: "I agree", required: false, type: "boolean" },
        ],
    };
    const verRes = await req.post(`/api/admin/forms/${formId}/versions`, { data: { schema_json: schema } });
    if (!verRes.ok()) throw new Error(`create version failed (${verRes.status()}): ${await verRes.text()}`);
    const versionId = ((await verRes.json()) as { data?: { id?: string } }).data?.id ?? "";
    const pubRes = await req.post(`/api/admin/forms/${formId}/versions/${versionId}/publish`, { data: {} });
    if (!pubRes.ok()) throw new Error(`publish failed (${pubRes.status()}): ${await pubRes.text()}`);
    return { formId, formName };
}

/** Extract the plaintext public token from a composed share URL (…/forms/embed/<token>). */
function tokenFromShareUrl(url: string): string | null {
    const m = url.match(/\/forms\/embed\/([^/?#]+)/) || url.match(/[?&]token=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

test.describe("Phase 7 Slice 2 — live completion → Processing handoff", () => {
    test.setTimeout(600_000);

    test("real public submission completes the packet → exactly one Processing Case (idempotent)", async ({ page, request }) => {
        await ensureAdminPlaywrightSession(page);
        const { formId } = await createMinimalForm(page.request);

        // Fixture: a minimal customer household in the SAME org as the form, to anchor the packet link.
        const db = verifyDb();
        const { data: formRow } = await db.from("form_definitions").select("org_id").eq("id", formId).maybeSingle();
        const orgId = (formRow as { org_id?: string } | null)?.org_id;
        expect(orgId, "resolved org from the created form").toBeTruthy();
        const { data: custRow, error: custErr } = await db
            .from("customers")
            .insert({ org_id: orgId, name: `Cert Household ${Date.now()}`, status_key: "active", metadata: { source: "slice2-cert" } })
            .select("id")
            .single();
        if (custErr) throw new Error(`create customer failed: ${custErr.message}`);
        const customerId = (custRow as { id: string }).id;

        // Compose a packet anchored to that household through the real compose path.
        const composeRes = await page.request.post("/api/admin/pos/packets/compose", {
            data: { name: `Cert Handoff ${Date.now()}`, form_definition_ids: [formId], anchor: { entity_type: "customer", entity_id: customerId } },
        });
        expect(composeRes.ok(), `compose ok: ${await composeRes.text().catch(() => "")}`).toBeTruthy();
        const composed = (await composeRes.json()) as { data?: { shares?: Array<{ url: string | null }> } };
        const shareUrl = composed.data?.shares?.find((s) => s.url)?.url ?? null;
        expect(shareUrl, "compose returned a share link").toBeTruthy();
        const token = tokenFromShareUrl(shareUrl!);
        expect(token, `extracted token from ${shareUrl}`).toBeTruthy();

        // A fresh unauthenticated context for the PUBLIC participant paths (no admin cookies).
        const pub = request;

        // 1. Launch the session (resolve the link) — real runtime path.
        const resolveRes = await pub.get(`/api/public/forms/${token}/resolve`);
        expect(resolveRes.ok(), `resolve ok: ${await resolveRes.text().catch(() => "")}`).toBeTruthy();
        const resolved = (await resolveRes.json()) as { data?: { packet?: { packet_session_id?: string; total_steps?: number } } };
        const sessionId = resolved.data?.packet?.packet_session_id ?? "";
        expect(sessionId, "session launched").toBeTruthy();

        // 2. Complete every step via the real create→submit public API until the packet completes.
        let complete = false;
        for (let guard = 0; guard < 10 && !complete; guard++) {
            const createSub = await pub.post(`/api/public/forms/${token}/submissions`, { data: { payload: { values: { f_note: "ok", f_agree: true } } } });
            expect(createSub.ok(), `create submission ok: ${await createSub.text().catch(() => "")}`).toBeTruthy();
            const subId = ((await createSub.json()) as { data?: { id?: string } }).data?.id ?? "";
            expect(subId, "draft submission created").toBeTruthy();
            const submit = await pub.post(`/api/public/forms/${token}/submissions/${subId}/submit`, { data: { payload: { values: { f_note: "ok", f_agree: true } } } });
            expect(submit.ok(), `submit ok: ${await submit.text().catch(() => "")}`).toBeTruthy();
            const sr = (await submit.json()) as { data?: { packet_complete?: boolean; next_form_available?: boolean } };
            complete = sr.data?.packet_complete === true;
            if (!complete && !sr.data?.next_form_available) break;
        }
        expect(complete, "packet session completed via real submissions").toBe(true);

        // 3. Verify session is completed (real state).
        const { data: sessRow } = await db.from("form_packet_sessions").select("id, status, packet_definition_id").eq("id", sessionId).maybeSingle();
        expect((sessRow as { status?: string } | null)?.status).toBe("completed");

        // 4. Exactly one Processing Case created via the pos_connected on-ramp, linked to the session.
        const { data: sources } = await db
            .from("processing_case_sources")
            .select("processing_case_id, role, source_kind, source_id")
            .eq("source_kind", "form_packet_session")
            .eq("source_id", sessionId);
        const caseIds = Array.from(new Set(((sources ?? []) as Array<{ processing_case_id: string }>).map((s) => s.processing_case_id)));
        expect(caseIds.length, "exactly one Processing Case for the packet session").toBe(1);
        const caseId = caseIds[0];

        // 5. Idempotency: re-resolving the completed session must NOT create a second case.
        await pub.get(`/api/public/forms/${token}/resolve`).catch(() => {});
        const { data: sources2 } = await db
            .from("processing_case_sources")
            .select("processing_case_id")
            .eq("source_kind", "form_packet_session")
            .eq("source_id", sessionId);
        const caseIds2 = Array.from(new Set(((sources2 ?? []) as Array<{ processing_case_id: string }>).map((s) => s.processing_case_id)));
        expect(caseIds2.length, "no duplicate Processing Case on re-evaluation").toBe(1);

        // 6. Open the Processing Case through the canonical admin API — one coherent packet source.
        const caseRes = await page.request.get(`/api/admin/processing/cases/${caseId}`);
        expect(caseRes.ok(), `open case ok: ${await caseRes.text().catch(() => "")}`).toBeTruthy();

        // eslint-disable-next-line no-console
        console.log(`SLICE2_HANDOFF_PASS sessionId=${sessionId} caseId=${caseId} caseCount=${caseIds.length}/${caseIds2.length}`);
    });
});
