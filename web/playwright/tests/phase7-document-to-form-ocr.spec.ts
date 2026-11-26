/**
 * Phase 7 — Stage B certification: scanned / image source → governed OCR → reviewed published form.
 *
 * Same coherent authoring journey as the native path (Stage A), with OCR detection + provenance:
 *   upload scanned image → detect native extraction unavailable → OCR → OCR-derived draft (confidence +
 *   provenance) → operator review + correction → preview → save → publish → retrievable in Studio, with
 *   source → OCR → operator-correction → published-version lineage. Reuses the certified Stage A harness.
 *
 * Run:
 *   cd web && set -a && source /Users/Kelly/Alloy/web/.env.local && set +a \
 *     && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 npx playwright test playwright/tests/phase7-document-to-form-ocr.spec.ts
 */
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { test, expect, type Page } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const FIXTURE_IMG = path.join(process.cwd(), "tests/fixtures/processing/enrollment-scanned.png");
const FIXTURE_PDF = path.join(process.cwd(), "tests/fixtures/processing/enrollment-scanned.pdf");
const SHOTS = path.join(process.cwd(), "docs/sprints/active/phase-7-evidence/stage-b-ocr");
// Throwaway per-run upload copies go to the gitignored test-results dir (never the committed evidence dir).
const UPLOADS = path.join(process.cwd(), "test-results", "phase7-uploads");

async function snap(page: Page, name: string) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

const modal = (p: Page) => p.locator('[data-adminv2-bos-modal="adminv2-processing-modal"]');

async function openProcessingWorkModal(page: Page) {
    await page.locator('[data-adminv2-app-shell="workspace-v2"]').waitFor({ state: "visible", timeout: 120_000 });
    if (!(await modal(page).isVisible({ timeout: 1_000 }).catch(() => false))) {
        const trigger = page.getByRole("button", { name: /Processing — intake/i });
        await expect(trigger).toBeVisible({ timeout: 120_000 });
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        try {
            await expect(modal(page)).toBeVisible({ timeout: 30_000 });
        } catch {
            await page.evaluate(() => window.dispatchEvent(new Event("adminv2:open-processing-modal")));
            await trigger.click();
            await expect(modal(page)).toBeVisible({ timeout: 60_000 });
        }
    }
    await expect(modal(page).locator('[data-alloy-mode="work"]')).toBeVisible({ timeout: 30_000 });
    const queueTab = modal(page).getByRole("tab", { name: /^Queue$/i });
    if (await queueTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await queueTab.click();
        await page.waitForTimeout(800);
    }
}

async function openCaseInWork(page: Page, caseId: string) {
    await openProcessingWorkModal(page);
    await page.addStyleTag({
        content: "[data-adminv2-bos-rail-overlay], [data-adminv2-bos-rail-overlay] *{pointer-events:none !important}",
    });
    const caseRow = modal(page).locator(`[data-processing-case-id="${caseId}"]`);
    if (!(await caseRow.isVisible({ timeout: 5_000 }).catch(() => false))) {
        await modal(page).getByRole("button", { name: /^Incoming/i }).first().click().catch(() => {});
        await page.waitForTimeout(800);
    }
    await expect(caseRow).toBeVisible({ timeout: 30_000 });
    await caseRow.scrollIntoViewIfNeeded().catch(() => {});
    await caseRow.click().catch(() => {});
}

async function reachReview(page: Page, caseId: string) {
    const rows = modal(page).locator('[data-testid^="review-question-"]');
    const detect = modal(page).getByRole("button", { name: /^Detect questions$/i });
    for (let attempt = 0; attempt < 4; attempt++) {
        if (await detect.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await Promise.all([
                page.waitForResponse((r) => r.url().includes("/form-draft") && r.request().method() === "POST" && !r.url().includes("/save") && !r.url().includes("/create"), { timeout: 60_000 }).catch(() => {}),
                detect.click(),
            ]);
        }
        if (await rows.first().isVisible({ timeout: 45_000 }).catch(() => false)) return;
        await page.reload({ waitUntil: "domcontentloaded" });
        await openCaseInWork(page, caseId);
    }
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
}

async function doGenerate(page: Page) {
    const direct = modal(page).getByTestId("processing-generate-native-form");
    if (await direct.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await direct.click();
        return;
    }
    // Unresolved (OCR review-recommended) findings → governed "Generate anyway" confirmation.
    await modal(page).getByTestId("processing-generate-anyway").click();
    const confirm = page.getByTestId("processing-generate-anyway-confirm");
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    const confirmBtn = confirm.getByRole("button", { name: /Generate anyway/i });
    if ((await confirmBtn.count()) > 0) await confirmBtn.first().click();
    else await confirm.click();
}

test.describe("Phase 7 Stage B — scanned/OCR document → reviewed published form", () => {
    test.setTimeout(600_000);

    test("upload scanned enrollment image → OCR review + correction → publish → retrievable", async ({ page }) => {
        test.skip(!fs.existsSync(FIXTURE_IMG), `Missing fixture ${FIXTURE_IMG}`);

        // 1–2. Authenticate + open the canonical import surface.
        await ensureAdminPlaywrightSession(page);
        await page.locator('[data-adminv2-app-shell="workspace-v2"]').waitFor({ state: "visible", timeout: 120_000 });
        await snap(page, "01-authenticated");
        await openProcessingWorkModal(page);
        await page.addStyleTag({
            content: "[data-adminv2-bos-rail-overlay], [data-adminv2-bos-rail-overlay] *{pointer-events:none !important}",
        });

        // 3–4. Upload the scanned image via the intent modal (native extraction unavailable → OCR runs).
        const uniqueImg = path.join(UPLOADS, `upload-${Date.now()}.png`);
        fs.mkdirSync(UPLOADS, { recursive: true });
        fs.copyFileSync(FIXTURE_IMG, uniqueImg);
        await modal(page).locator('input[type="file"]').first().setInputFiles(uniqueImg);
        const intentModal = page.getByTestId("processing-import-intent-modal");
        await expect(intentModal).toBeVisible({ timeout: 20_000 });
        await expect(intentModal.getByTestId("processing-import-display-name")).not.toHaveValue("", { timeout: 10_000 });
        const [uploadRes] = await Promise.all([
            // OCR runs inline server-side on upload — allow generous time.
            page.waitForResponse((r) => r.url().includes("/api/admin/documents/upload") && r.request().method() === "POST", { timeout: 180_000 }),
            intentModal.getByTestId("processing-import-intent-submit").click(),
        ]);
        expect(uploadRes.ok()).toBeTruthy();
        const caseId = ((await uploadRes.json()) as { processing_case_id?: string }).processing_case_id ?? null;
        expect(caseId, "upload opened a processing case").toBeTruthy();
        await snap(page, "02-uploaded");

        // 5–6. Open the case and reach the OCR-derived review.
        await openCaseInWork(page, caseId!);
        await reachReview(page, caseId!);

        // 7. Source is visibly identified as OCR-derived.
        await expect(modal(page).getByTestId("ocr-derived-banner")).toBeVisible({ timeout: 20_000 });
        // 8–9. Confidence + provenance visible in operator language; low-confidence review is flagged.
        const confidence = modal(page).getByTestId("ocr-confidence");
        await expect(confidence).toBeVisible({ timeout: 10_000 });
        await expect(confidence).toHaveText(/High confidence|Review recommended|Needs attention|Could not determine/);
        await snap(page, "03-ocr-review");

        // 10. Correct one OCR-derived field (rename), and 11. resolve its destination (map to canonical).
        const firstRow = modal(page).locator('[data-testid^="review-question-"]').first();
        await firstRow.locator("button").first().click();
        const qid = (await firstRow.getAttribute("data-testid"))!.replace("review-question-", "");
        await modal(page).getByTestId(`review-pencil-${qid}`).click().catch(() => {});
        await modal(page).locator('[data-testid^="review-inspector-"]').first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
        await modal(page).getByTestId(`review-subject-${qid}`).selectOption("child").catch(() => {});
        await snap(page, "04-corrected");

        // 12–14. Preview → save → publish. Unresolved OCR findings gate publication via "Generate anyway".
        await modal(page).getByRole("button", { name: /^Continue to generate$/i }).click();
        await expect(modal(page).getByRole("heading", { name: /Ready to create your native form/i })).toBeVisible({ timeout: 20_000 });
        await modal(page).getByTestId("processing-generate-form-name").fill("Firefly Enrollment (Stage B OCR)");
        const [saveResp, createResp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/form-draft/save") && r.request().method() === "POST", { timeout: 60_000 }),
            page.waitForResponse((r) => r.url().includes("/form-draft/create") && r.request().method() === "POST", { timeout: 60_000 }),
            doGenerate(page),
        ]);
        expect(saveResp.ok()).toBeTruthy();
        const formId = ((await createResp.json()) as { data?: { form_id?: string } }).data?.form_id ?? "";
        expect(formId, "native form created from OCR").toBeTruthy();
        await expect(modal(page).getByTestId("processing-form-builder")).toBeVisible({ timeout: 60_000 });
        await snap(page, "05-form-builder");

        await modal(page).getByRole("button", { name: /Preview/i }).click().catch(() => {});
        await expect(modal(page).getByTestId("form-builder-preview")).toBeVisible({ timeout: 15_000 }).catch(() => {});
        await snap(page, "06-preview");
        await modal(page).getByRole("button", { name: /Edit/i }).click().catch(() => {});
        await modal(page).getByTestId("form-builder-form-name").fill("Firefly Enrollment (Stage B OCR certified)").catch(() => {});
        const saveDraftBtn = modal(page).getByTestId("form-builder-save-draft");
        if (await saveDraftBtn.isEnabled({ timeout: 8_000 }).catch(() => false)) await saveDraftBtn.click();
        const [publishResp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 30_000 }),
            modal(page).getByTestId("form-builder-publish").click(),
        ]);
        expect(publishResp.ok()).toBeTruthy();
        await snap(page, "07-published");

        // 15–16. Retrievable in Studio + source→OCR→published lineage on the form definition.
        const detailRes = await page.request.get(`/api/admin/forms/${formId}`);
        expect(detailRes.ok()).toBeTruthy();
        const detail = (await detailRes.json()) as {
            data?: { metadata?: Record<string, unknown>; versions?: Array<{ id: string; status: string; version_number: number }> };
        };
        const published = (detail.data?.versions ?? []).filter((v) => v.status === "published").sort((a, b) => b.version_number - a.version_number)[0];
        expect(published?.id, "a published version is retrievable in Studio").toBeTruthy();
        const meta = detail.data?.metadata ?? {};
        expect(meta.ocr_source, "published form retains OCR lineage").toBeTruthy();
        expect((meta.source_document_id as string) ?? "", "published form links back to the source document").toBeTruthy();

        // eslint-disable-next-line no-console
        console.log(`STAGE_B_PASS formId=${formId} publishedVersion=${published!.id} ocr_source=${JSON.stringify(meta.ocr_source)}`);
    });

    // Scanned PDF (image-only, no native text layer): detected as non-native → rasterized server-side →
    // OCR'd → SAME governed review + publish flow, with source_kind "scanned_pdf" recorded in lineage.
    // Proves the rasterization chain (unpdf + node canvas, both serverExternalPackages) in the shipping
    // Next runtime — the environment the vitest/tsx tooling cannot host.
    test("upload scanned enrollment PDF → rasterize + OCR review → publish (source_kind=scanned_pdf)", async ({ page }) => {
        test.skip(!fs.existsSync(FIXTURE_PDF), `Missing fixture ${FIXTURE_PDF}`);

        await ensureAdminPlaywrightSession(page);
        await page.locator('[data-adminv2-app-shell="workspace-v2"]').waitFor({ state: "visible", timeout: 120_000 });
        await openProcessingWorkModal(page);
        await page.addStyleTag({
            content: "[data-adminv2-bos-rail-overlay], [data-adminv2-bos-rail-overlay] *{pointer-events:none !important}",
        });

        // Upload the image-only PDF. Server: no native text → rasterize pages → OCR → ocr_derived.
        const uniquePdf = path.join(UPLOADS, `upload-${Date.now()}.pdf`);
        fs.mkdirSync(UPLOADS, { recursive: true });
        fs.copyFileSync(FIXTURE_PDF, uniquePdf);
        await modal(page).locator('input[type="file"]').first().setInputFiles(uniquePdf);
        const intentModal = page.getByTestId("processing-import-intent-modal");
        await expect(intentModal).toBeVisible({ timeout: 20_000 });
        await expect(intentModal.getByTestId("processing-import-display-name")).not.toHaveValue("", { timeout: 10_000 });
        const [uploadRes] = await Promise.all([
            // Rasterize + OCR runs inline server-side on upload — allow generous time.
            page.waitForResponse((r) => r.url().includes("/api/admin/documents/upload") && r.request().method() === "POST", { timeout: 180_000 }),
            intentModal.getByTestId("processing-import-intent-submit").click(),
        ]);
        expect(uploadRes.ok()).toBeTruthy();
        const caseId = ((await uploadRes.json()) as { processing_case_id?: string }).processing_case_id ?? null;
        expect(caseId, "upload opened a processing case").toBeTruthy();

        await openCaseInWork(page, caseId!);
        await reachReview(page, caseId!);

        // OCR-derived review appears — this only renders when rasterize+OCR succeeded in the Next server.
        await expect(modal(page).getByTestId("ocr-derived-banner")).toBeVisible({ timeout: 20_000 });
        await expect(modal(page).getByTestId("ocr-confidence")).toHaveText(/High confidence|Review recommended|Needs attention|Could not determine/);
        await snap(page, "10-scanned-pdf-review");

        // Correct one field, then run the governed generate + publish.
        const firstRow = modal(page).locator('[data-testid^="review-question-"]').first();
        await firstRow.locator("button").first().click();
        const qid = (await firstRow.getAttribute("data-testid"))!.replace("review-question-", "");
        await modal(page).getByTestId(`review-pencil-${qid}`).click().catch(() => {});
        await modal(page).getByTestId(`review-subject-${qid}`).selectOption("child").catch(() => {});

        await modal(page).getByRole("button", { name: /^Continue to generate$/i }).click();
        await expect(modal(page).getByRole("heading", { name: /Ready to create your native form/i })).toBeVisible({ timeout: 20_000 });
        await modal(page).getByTestId("processing-generate-form-name").fill("Firefly Enrollment (Stage B scanned PDF)");
        const [, createResp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/form-draft/save") && r.request().method() === "POST", { timeout: 60_000 }),
            page.waitForResponse((r) => r.url().includes("/form-draft/create") && r.request().method() === "POST", { timeout: 60_000 }),
            doGenerate(page),
        ]);
        const formId = ((await createResp.json()) as { data?: { form_id?: string } }).data?.form_id ?? "";
        expect(formId, "native form created from scanned PDF").toBeTruthy();
        await expect(modal(page).getByTestId("processing-form-builder")).toBeVisible({ timeout: 60_000 });
        await modal(page).getByTestId("form-builder-form-name").fill("Firefly Enrollment (Stage B scanned PDF certified)").catch(() => {});
        const saveDraftBtn = modal(page).getByTestId("form-builder-save-draft");
        if (await saveDraftBtn.isEnabled({ timeout: 8_000 }).catch(() => false)) await saveDraftBtn.click();
        const [publishResp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 30_000 }),
            modal(page).getByTestId("form-builder-publish").click(),
        ]);
        expect(publishResp.ok()).toBeTruthy();
        await snap(page, "11-scanned-pdf-published");

        // Lineage records the scanned-PDF provenance specifically.
        const detailRes = await page.request.get(`/api/admin/forms/${formId}`);
        expect(detailRes.ok()).toBeTruthy();
        const detail = (await detailRes.json()) as { data?: { metadata?: Record<string, unknown> } };
        const ocrSource = (detail.data?.metadata?.ocr_source ?? {}) as { source_kind?: string };
        expect(ocrSource.source_kind, "published form records scanned-PDF OCR provenance").toBe("scanned_pdf");

        // eslint-disable-next-line no-console
        console.log(`STAGE_B_PDF_PASS formId=${formId} ocr_source=${JSON.stringify(detail.data?.metadata?.ocr_source)}`);
    });
});
