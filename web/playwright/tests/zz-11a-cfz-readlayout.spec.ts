/** §1 — read the authoritative published Focus Panel layout and report every card placement. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cfz";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("published layout — card placements", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const data = await page.evaluate(async () => {
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
        return j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
    });
    writeFileSync(`${OUT}/published-layout.json`, JSON.stringify(data, null, 2));
    const pub = (data.body as { published?: { version?: number; doc?: { sections?: Array<Record<string, unknown>> } } } | null)?.published;
    log(`status=${data.status} version=${pub?.version}`);
    const sections = pub?.doc?.sections ?? [];
    log(`sections=${sections.length}`);
    for (const s of sections) {
        const meta = (s as { metadata?: { focusPanelCard?: Record<string, unknown> } }).metadata?.focusPanelCard;
        log(`  key=${(s as { key?: string }).key} card=${meta?.key} tier=${meta?.tier} span=${meta?.span} gridRow=${meta?.gridRow} density=${meta?.density}`);
    }
});
