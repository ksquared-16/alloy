/**
 * RESTORE THE APPROVED FINANCIALS PRESENTATION through the canonical publication path.
 *
 * The published doc carries TWO density records on section `fp-card-financials`:
 *
 *   metadata.focusPanelCard.density           "standard"   ← base metadata (already correct)
 *   metadata.focusPanelCardConfig.appearance.density  "compact"  ← appearance override, WINS
 *
 * `applyFocusPanelCardConfig` resolves `density: appearance.density ?? baseModel.density`, so the
 * override is the authoritative runtime value and the only one that needs changing. The card then
 * receives `span="row"` and renders the approved two-column anatomy.
 *
 * Append-only: this POSTs a NEW draft from the current published doc and publishes it. Nothing is
 * edited in place and no history is rewritten.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-regression";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("republish Financials onto the Summary variant", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const result = await page.evaluate(async () => {
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });

        const cur = await j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
        const published = cur.body?.published;
        if (!published?.doc) return { step: "read", cur };

        // Clone and correct ONLY the authoritative runtime value.
        const doc = JSON.parse(JSON.stringify(published.doc));
        let touched = 0;
        const before: unknown[] = [];
        for (const s of doc.sections ?? []) {
            const meta = s?.metadata;
            if (meta?.focusPanelCard?.key === "financials") {
                before.push(JSON.parse(JSON.stringify(meta)));
                meta.focusPanelCardConfig = meta.focusPanelCardConfig ?? {};
                meta.focusPanelCardConfig.appearance = meta.focusPanelCardConfig.appearance ?? {};
                meta.focusPanelCardConfig.appearance.density = "standard";
                touched += 1;
            }
        }
        if (!touched) return { step: "locate", sections: (doc.sections ?? []).length };

        const created = await j(await fetch("/api/admin/entity-layouts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                entity_type: "opportunities",
                surface: "drawer",
                layout_key: "focus_panel_summary",
                name: "Focus Panel Summary — Financials restored to Summary variant",
                doc,
            }),
        }));
        const id = created.body?.id ?? created.body?.layout?.id ?? created.body?.record?.id;
        if (!id) return { step: "create", created };

        const pubd = await j(await fetch(`/api/admin/entity-layouts/${id}/publish`, {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: "{}",
        }));

        const after = await j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
        const afterSec = (after.body?.published?.doc?.sections ?? []).find(
            (s: { metadata?: { focusPanelCard?: { key?: string } } }) => s?.metadata?.focusPanelCard?.key === "financials",
        );
        return {
            step: "done", touched, before, newId: id, createdStatus: created.status, publishStatus: pubd.status,
            publishBody: pubd.body,
            newVersion: after.body?.published?.version,
            afterMetadata: afterSec?.metadata ?? null,
        };
    });

    writeFileSync(`${OUT}/republish.json`, JSON.stringify(result, null, 2));
    /* eslint-disable no-console */
    log(JSON.stringify(result, null, 2).slice(0, 2500));
    /* eslint-enable no-console */
    expect(result.step, "republish reached the end").toBe("done");
});
