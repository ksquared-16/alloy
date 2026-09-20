import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("composition truth, measured with the rendered identity", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(17_000);
    expect(page.url()).not.toContain("/login");

    /* The card's RENDERED key is assignment_tuition; the registry key is billing_preview. */
    const read = () => page.evaluate(() => ({
        renderedKeys: Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")),
        retiredCardByRenderedIdentity: Boolean(document.querySelector("[data-universal-card-key='assignment_tuition']")),
        retiredCardByRegistryKey: Boolean(document.querySelector("[data-universal-card-key='billing_preview']")),
        schedulingPresent: Boolean(document.querySelector("[data-universal-card-key='scheduling']")),
        /* What the card actually says, so "is it the retired one" is answerable by reading it. */
        retiredCardTitle: (document.querySelector("[data-universal-card-key='assignment_tuition']") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").slice(0, 120) ?? null,
    }));
    R.householdEntry = await read();
    log(`ENTRY: ${JSON.stringify(R.householdEntry)}`);

    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(14_000);
    R.childPanel = await read();
    log(`CHILD: ${JSON.stringify(R.childPanel)}`);

    /* Is the retired placement in the PUBLISHED tenant document, or only in code defaults? */
    R.publishedLayout = await page.evaluate(async () => {
        const r = await fetch("/api/admin/entity-layouts?entity_type=opportunities", { credentials: "include" });
        if (!r.ok) return { status: r.status, note: "layout listing not readable from here" };
        const b = await r.json().catch(() => null);
        const docs = (b?.layouts ?? b?.data ?? []) as Array<Record<string, unknown>>;
        return { status: r.status, count: docs.length,
                 mentionsBillingPreview: JSON.stringify(b ?? {}).includes("billing_preview"),
                 mentionsScheduling: JSON.stringify(b ?? {}).includes("scheduling") };
    });
    log(`PUBLISHED: ${JSON.stringify(R.publishedLayout)}`);
    writeFileSync("../certification/financials/11b-audit/composition-truth.json", JSON.stringify(R, null, 2));
});
