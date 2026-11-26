import { test } from "@playwright/test";
import * as fs from "fs";
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU = process.env.WU_SLUG_A || "new-leads";
const DIR = process.env.P2V_SHOT_DIR || "/tmp/p2v-shots";
if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 3 * 60 * 1000 });

test("P2-V provenance ground truth", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE });
    const page = await ctx.newPage();
    const out: Record<string, unknown> = {};

    // 1) The D1 provisioning answer — extract queue provenance + composition.
    const pa = await page.request.get(`${BASE}/api/admin/work-units/${WU}/provisioning-answer`);
    out.provisioningStatus = pa.status();
    let paJson: any = null;
    try { paJson = await pa.json(); } catch { out.provisioningParseError = true; }
    if (paJson) {
        const pres = paJson.presentation ?? paJson.answer?.presentation ?? null;
        out.hasPresentation = !!pres;
        out.provenance = pres?.provenance ?? null;
        out.queuePublished = pres?.queue?.published ?? null;
        out.queueRowVariant = pres?.queue?.rowVariant ?? null;
        out.queueFallbackSlots = pres?.queue?.fallbackSlots ?? null;
        out.rowSlotsKeys = pres?.queue?.rowSlots ? Object.keys(pres.queue.rowSlots) : null;
        out.rowSlotsSample = pres?.queue?.rowSlots ?? null;
        out.businessProcess = paJson.businessProcess ?? paJson.answer?.businessProcess ?? null;
        out.activeWorkView = paJson.activeWorkView ?? paJson.answer?.activeWorkView ?? null;
        // Dump the top-level keys so we can find where provenance actually lives.
        out.topKeys = Object.keys(paJson);
        if (pres) out.presKeys = Object.keys(pres);
    }

    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(`${DIR}/p2v-provenance.json`, JSON.stringify(paJson, null, 2).slice(0, 200000));
    console.log("@@PROV@@ " + JSON.stringify(out, null, 2));
    await ctx.close();
});
