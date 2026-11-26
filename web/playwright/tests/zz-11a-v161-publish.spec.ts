/**
 * v161 — PLACE `billing_preview` IN THE LIST THE RUNTIME ACTUALLY READS.
 *
 * v159 added the card to `doc.sections`; v160 made it visible there. Neither touched
 * `doc.metadata.focusPanelLayout`, which is what `readFocusPanelPublishedLayout` returns and what
 * the runtime renders — so the published document said the card existed and the panel drew six.
 *
 * This publishes the SAME repair the root-cause note specified: the card added to both metadata
 * projections, at columns 1–6 of rows 8–9 (free — attendance holds columns 7–12 there), mirroring
 * the code composition's own placement. Nothing else moves; `scheduling` is not touched.
 *
 * APPEND-ONLY. A new draft is cloned from the current published document and published as the next
 * version. No historical row is edited.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-v161";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const PLACEMENT = { card: "billing_preview", colStart: 1, colSpan: 6, rowStart: 8, rowSpan: 2 };

test("publish v161", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const result = await page.evaluate(async (placement) => {
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
        type Area = { card: string; colStart: number; colSpan: number; rowStart: number; rowSpan: number };
        type Layout = { grid?: { columns: number; areas: Area[] }; rows?: { cells: { width: string; cards: string[] }[] }[] };
        type Doc = { sections: Array<Record<string, unknown>>; metadata?: Record<string, unknown> };

        const cur = await j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
        const published = (cur.body as { published?: { id?: string; version?: number; doc?: Doc } } | null)?.published;
        if (!published?.doc) return { step: "read_failed", cur };

        const before = JSON.parse(JSON.stringify(published.doc.metadata?.focusPanelLayout ?? null)) as Layout | null;
        const doc = JSON.parse(JSON.stringify(published.doc)) as Doc;
        const layout = (doc.metadata?.focusPanelLayout ?? null) as Layout | null;
        if (!layout?.grid) return { step: "no_metadata_layout", before };

        if (layout.grid.areas.some((a) => a.card === placement.card)) {
            return { step: "already_placed", version: published.version, before };
        }
        // BOTH projections. The grid is the source of truth; `rows` is the reading-order
        // projection older consumers and the responsive collapse read.
        layout.grid.areas.push({ ...placement });
        layout.rows = [...(layout.rows ?? []), { cells: [{ width: "full", cards: [placement.card] }] }];

        const created = await j(await fetch("/api/admin/entity-layouts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                entity_type: "opportunities",
                surface: "drawer",
                layout_key: "focus_panel_summary",
                name: "Focus Panel Summary — billing_preview placed in the published layout (v161)",
                doc,
            }),
        }));
        const id = (created.body as { id?: string; layout?: { id?: string }; record?: { id?: string } } | null)?.id
            ?? (created.body as { layout?: { id?: string } } | null)?.layout?.id
            ?? (created.body as { record?: { id?: string } } | null)?.record?.id;
        if (!id) return { step: "create_failed", created, before };

        const pubd = await j(await fetch(`/api/admin/entity-layouts/${id}/publish`, {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: "{}",
        }));

        const after = await j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
        const pub = (after.body as { published?: { id?: string; version?: number; doc?: Doc } } | null)?.published;
        const sections = (pub?.doc?.sections ?? []).map((s) => {
            const m = (s.metadata as { focusPanelCard?: { key?: string; visibility?: string } })?.focusPanelCard;
            return { card: m?.key, visibility: m?.visibility ?? "visible" };
        });
        const afterLayout = (pub?.doc?.metadata?.focusPanelLayout ?? null) as Layout | null;
        return {
            step: "done",
            fromVersion: published.version,
            fromId: published.id,
            newVersion: pub?.version,
            newId: pub?.id,
            createdStatus: created.status,
            publishStatus: pubd.status,
            publishBody: pubd.status >= 400 ? pubd.body : null,
            before,
            after: afterLayout,
            sections,
            gridAreaCards: (afterLayout?.grid?.areas ?? []).map((a) => a.card),
            rowsCards: (afterLayout?.rows ?? []).flatMap((r) => r.cells.flatMap((c) => c.cards)),
        };
    }, PLACEMENT);

    writeFileSync(`${OUT}/v161-publish.json`, JSON.stringify(result, null, 2));
    log(JSON.stringify(result, null, 2).slice(0, 4000));

    const r = result as Record<string, unknown>;
    expect(r.step, `publish result: ${JSON.stringify(r).slice(0, 600)}`).toBe("done");
    expect(r.publishStatus).toBe(200);
    expect(r.gridAreaCards as string[]).toContain("billing_preview");
    expect(r.rowsCards as string[]).toContain("billing_preview");
});
