/**
 * §1(b) correction — the section I published inherited `scheduling`'s LINKED visibility.
 *
 * `scheduling` is deliberately authored linked: navigable-only, never occupying initial settle
 * geometry. Cloning it carried that intent onto a card that is meant to be visible, which is why
 * billing_preview sat in the published doc and never rendered. Republished with visibility explicit.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cfz";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("republish billing_preview as visible", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const result = await page.evaluate(async () => {
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
        const cur = await j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
        const published = (cur.body as { published?: { version?: number; doc?: { sections?: Array<Record<string, unknown>> } } } | null)?.published;
        if (!published?.doc) return { step: "read", cur };
        const doc = JSON.parse(JSON.stringify(published.doc)) as { sections: Array<Record<string, unknown>> };
        const before = doc.sections.map((s) => ({
            card: (s.metadata as { focusPanelCard?: { key?: string } })?.focusPanelCard?.key,
            visibility: (s.metadata as { focusPanelCard?: { visibility?: string } })?.focusPanelCard?.visibility
                ?? (s.metadata as { visibility?: string })?.visibility ?? null,
        }));
        const target = doc.sections.find((s) => (s.metadata as { focusPanelCard?: { key?: string } })?.focusPanelCard?.key === "billing_preview");
        if (!target) return { step: "missing", before };
        const meta = target.metadata as Record<string, unknown> & { focusPanelCard: Record<string, unknown> };
        meta.focusPanelCard.visibility = "visible";
        meta.visibility = "visible";
        const created = await j(await fetch("/api/admin/entity-layouts", {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
            body: JSON.stringify({
                entity_type: "opportunities", surface: "drawer", layout_key: "focus_panel_summary",
                name: "Focus Panel Summary — Billing Preview visible (not linked)", doc,
            }),
        }));
        const id = (created.body as { id?: string } | null)?.id;
        if (!id) return { step: "create", created, before };
        const pubd = await j(await fetch(`/api/admin/entity-layouts/${id}/publish`, {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: "{}",
        }));
        const after = await j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
        const sections = ((after.body as { published?: { doc?: { sections?: Array<Record<string, unknown>> } } } | null)?.published?.doc?.sections ?? []);
        return {
            step: "done", before,
            newVersion: (after.body as { published?: { version?: number } } | null)?.published?.version,
            publishStatus: pubd.status,
            after: sections.map((s) => ({
                card: (s.metadata as { focusPanelCard?: { key?: string } })?.focusPanelCard?.key,
                visibility: (s.metadata as { focusPanelCard?: { visibility?: string } })?.focusPanelCard?.visibility ?? null,
            })),
        };
    });
    writeFileSync(`${OUT}/fixvis.json`, JSON.stringify(result, null, 2));
    log(JSON.stringify(result, null, 2).slice(0, 1800));
    expect((result as { step?: string }).step).toBe("done");
});
