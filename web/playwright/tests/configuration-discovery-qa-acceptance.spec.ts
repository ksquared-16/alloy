import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

/**
 * Product QA acceptance — the three operator blockers, run against the real UI.
 *
 * 1. Import completes and the UI transitions on its own (no stuck "Reading your document").
 * 2. Detailed Questions renders the SOURCE DOCUMENT with detected regions highlighted.
 * 3. The Review questions panel actually scrolls, and selection syncs both directions.
 *
 * Runs on the local certification stack. Screenshots land in `certification/evidence/qa/`.
 */

const HANDBOOK = process.env.QA_HANDBOOK_PDF ?? "";
const EVIDENCE = path.join(process.cwd(), "..", "certification", "evidence", "qa");
const ON_CERT_STACK = (process.env.PLAYWRIGHT_BASE_URL ?? "").includes("3018");

function shot(name: string) {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    return path.join(EVIDENCE, `${name}.png`);
}

test.describe("Configuration Discovery — product QA acceptance", () => {
    test.describe.configure({ mode: "serial", timeout: 900_000 });

    let page: import("@playwright/test").Page;
    let caseId = "";
    const timings: Record<string, number> = {};

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
        await ensureAdminPlaywrightSession(page);
    });

    test.afterAll(async () => {
        console.log(`QA TIMINGS ${JSON.stringify(timings)}`);
        await page?.close();
    });

    test("1-4. import completes and the UI transitions on its own", async () => {
        test.skip(!ON_CERT_STACK, "Runs only against the local certification stack");
        test.skip(!HANDBOOK || !fs.existsSync(HANDBOOK), "QA_HANDBOOK_PDF not provided");

        const bytes = fs.readFileSync(HANDBOOK);
        const stamp = `${Date.now()}`;

        // Upload through the supported API, then open the case in the real workspace UI — the
        // hang was in the client, so the UI must be the thing under test.
        const uploadStart = Date.now();
        const res = await page.request.post("/api/admin/documents/upload", {
            multipart: {
                file: { name: `parent-handbook-${stamp}.pdf`, mimeType: "application/pdf", buffer: bytes },
                open_processing_case: "true",
                processing_intent: "generate_form",
                title: `Parent Handbook QA ${stamp}`,
            },
            timeout: 180_000,
        });
        expect(res.ok(), `upload failed: ${res.status()}`).toBeTruthy();
        const body = await res.json();
        timings.backend_upload_ms = Date.now() - uploadStart;
        caseId = body.processing_case_id;
        expect(caseId, "upload opened no processing case").toBeTruthy();
        console.log(`QA caseId=${caseId} uploadMs=${timings.backend_upload_ms}`);

        // Open the case the way the product does: the Processing workspace is a modal driven by
        // window events (`dispatchOpenProcessingCase`), not a route.
        const uiStart = Date.now();
        await page.goto(`/adminV2/workspace`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
        // The modal registers its case listener in an effect gated on `open`, so the two events must
        // be sequenced — firing them together drops the case and lands on the overview.
        await page.evaluate(() => {
            window.dispatchEvent(new CustomEvent("adminv2:open-processing-modal", { detail: {} }));
        });
        await expect(page.getByTestId("digital-mailroom-shell")).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(500);
        await page.evaluate((id) => {
            window.dispatchEvent(new CustomEvent("adminv2:open-processing-case", { detail: { case_id: id } }));
        }, caseId);

        // The loading state must actually appear (proving we caught the real detect pass) and then
        // clear WITHOUT any further interaction.
        await expect(page.getByTestId("processing-native-form-creating-state")).toBeVisible({ timeout: 30_000 });
        await page.screenshot({ path: shot("00-import-reading") });

        // The acceptance bar: the loading state must CLEAR on its own and land in concept review.
        const conceptReview = page.getByTestId("concept-open-detailed");
        await expect(conceptReview, "UI never left the loading state after the backend completed").toBeVisible({
            timeout: 180_000,
        });
        timings.ui_ready_ms = Date.now() - uiStart;
        console.log(`QA ui_ready_ms=${timings.ui_ready_ms}`);

        await expect(page.getByTestId("processing-native-form-creating-state")).toBeHidden();
        await page.screenshot({ path: shot("01-concept-review"), fullPage: false });
    });

    test("5-8. Detailed Questions renders the document with highlighted regions", async () => {
        test.skip(!ON_CERT_STACK || !caseId, "requires the imported case");

        await page.getByTestId("concept-open-detailed").click();

        const canvas = page.getByTestId("pdf-canvas");
        await expect(canvas, "the source document did not render").toBeVisible({ timeout: 120_000 });
        await expect(canvas).toHaveAttribute("data-pdf-status", "ready", { timeout: 120_000 });

        // Multi-page: the document must expose every page, not just the first.
        const pageCount = await page.locator("[data-testid^='pdf-page-']").count();
        console.log(`QA pdf pages rendered=${pageCount}`);
        expect(pageCount, "multi-page document did not produce multiple pages").toBeGreaterThan(1);

        // Regions must exist — this is what "make it obvious what Alloy detected" means.
        const regions = page.locator("[data-testid^='pdf-region-']");
        const regionCount = await regions.count();
        console.log(`QA highlight regions=${regionCount}`);
        expect(regionCount, "no detected regions were drawn on the document").toBeGreaterThan(0);

        await page.screenshot({ path: shot("02-detailed-questions-with-pdf") });
    });

    test("9. selecting a question highlights the matching region (list -> document)", async () => {
        test.skip(!ON_CERT_STACK || !caseId, "requires the imported case");

        // Pick a question that is mapped to the document.
        const regionIds = await page.locator("[data-testid^='pdf-region-']").evaluateAll((els) =>
            els.map((e) => e.getAttribute("data-testid")!.replace("pdf-region-", ""))
        );
        expect(regionIds.length).toBeGreaterThan(0);

        // Choose one far enough down that it forces a page change.
        const targetId = regionIds[Math.min(regionIds.length - 1, Math.floor(regionIds.length * 0.75))]!;
        const questionRow = page.getByTestId(`review-question-${targetId}`);
        await questionRow.scrollIntoViewIfNeeded();
        await questionRow.locator("button").first().click();

        const region = page.getByTestId(`pdf-region-${targetId}`);
        await expect(region, "selecting a question did not mark its region").toHaveAttribute(
            "data-pdf-region-selected",
            "true",
            { timeout: 15_000 }
        );
        await expect(region).toBeInViewport({ timeout: 15_000 });
        await page.screenshot({ path: shot("03-highlighted-question") });
    });

    test("9b. clicking a region selects the question (document -> list)", async () => {
        test.skip(!ON_CERT_STACK || !caseId, "requires the imported case");

        const regionIds = await page.locator("[data-testid^='pdf-region-']").evaluateAll((els) =>
            els.map((e) => e.getAttribute("data-testid")!.replace("pdf-region-", ""))
        );
        const targetId = regionIds[0]!;
        await page.getByTestId(`pdf-region-${targetId}`).click();

        // The list must both select AND reveal it — that is the "stays visible" requirement.
        const row = page.getByTestId(`review-question-${targetId}`);
        await expect(row).toBeVisible({ timeout: 15_000 });
        await expect(row, "the selected question was not scrolled into view").toBeInViewport({ timeout: 15_000 });
    });

    test("10-11. the review panel scrolls, and keyboard navigation works", async () => {
        test.skip(!ON_CERT_STACK || !caseId, "requires the imported case");

        const list = page.getByTestId("review-questions-list");
        await expect(list).toBeVisible();

        // The panel must have a real scrolling ancestor — the clipping bug meant it had none.
        const scroll = await list.evaluate((el) => {
            let n: HTMLElement | null = el.parentElement;
            while (n) {
                const style = getComputedStyle(n);
                if (/(auto|scroll)/.test(style.overflowY)) {
                    return { found: true, clientHeight: n.clientHeight, scrollHeight: n.scrollHeight };
                }
                n = n.parentElement;
            }
            return { found: false, clientHeight: 0, scrollHeight: 0 };
        });
        console.log(`QA review scroll container=${JSON.stringify(scroll)}`);
        expect(scroll.found, "the review list has no scrollable ancestor — it is clipped").toBe(true);
        expect(
            scroll.scrollHeight,
            "content does not overflow, so scrolling cannot be verified on this document"
        ).toBeGreaterThan(scroll.clientHeight);

        // It must actually move.
        const moved = await list.evaluate((el) => {
            let n: HTMLElement | null = el.parentElement;
            while (n && !/(auto|scroll)/.test(getComputedStyle(n).overflowY)) n = n.parentElement;
            if (!n) return -1;
            n.scrollTop = 0;
            n.scrollTop = 240;
            return n.scrollTop;
        });
        expect(moved, "the review panel did not scroll").toBeGreaterThan(0);

        // Keyboard traversal.
        const firstRow = page.locator("[data-testid^='review-question-']").first();
        await firstRow.locator("button").first().click();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        const focused = await page.evaluate(() => {
            const el = document.activeElement?.closest("[data-testid^='review-question-']");
            return el?.getAttribute("data-testid") ?? null;
        });
        console.log(`QA keyboard focus=${focused}`);
        expect(focused, "arrow keys did not move through the list").toBeTruthy();

        await page.screenshot({ path: shot("04-review-panel-scrolled") });
    });
});
