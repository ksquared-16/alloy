/**
 * RETIRE THE STANDALONE TUITION CARD — through the canonical append-only publication path.
 *
 * The tenant renders from published `entity_layouts` v163, and that document is the reason the
 * card survived a code-level retirement. v163 is NOT edited: the service forks the published row
 * to a draft, the draft is patched, and publishing creates a NEW version. History stays.
 *
 * Both authoritative projections must lose the placement together:
 *   • `sections`                    — the card list
 *   • `metadata.focusPanelLayout`   — the grid areas AND the row/cell reading order
 *
 * A section left visible with no placement, or a placement with no visible section, is exactly
 * what the publication-integrity guard refuses — and rightly, because a card authored visible and
 * absent from the layout would be drawn by nothing.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-audit";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("retire billing_preview from the published tenant layout", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");

    const result = await page.evaluate(async () => {
        const RETIRE = "billing_preview";
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });

        const cur = await j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
        const published = (cur.body as { published?: Record<string, unknown> } | null)?.published;
        if (!published) return { stage: "read", error: "no published row" };
        const beforeVersion = published.version;
        const doc = JSON.parse(JSON.stringify(published.doc)) as Record<string, unknown>;

        const keyOf = (s: Record<string, unknown>) =>
            String(((s.metadata as Record<string, unknown> | undefined)?.cardKey) ?? s.key ?? "");

        /* 1 · the section list */
        const sectionsBefore = (doc.sections as Array<Record<string, unknown>>).map(keyOf);
        doc.sections = (doc.sections as Array<Record<string, unknown>>).filter((s) => keyOf(s) !== RETIRE);

        /* 2 · the layout metadata — grid areas AND reading order, or the two disagree */
        const meta = doc.metadata as Record<string, unknown>;
        const fpl = meta.focusPanelLayout as Record<string, unknown> | undefined;
        let areasBefore: string[] = [];
        if (fpl) {
            const grid = fpl.grid as Record<string, unknown> | undefined;
            if (grid && Array.isArray(grid.areas)) {
                areasBefore = (grid.areas as Array<Record<string, unknown>>).map((a) => String(a.card));
                grid.areas = (grid.areas as Array<Record<string, unknown>>).filter((a) => String(a.card) !== RETIRE);
            }
            if (Array.isArray(fpl.rows)) {
                fpl.rows = (fpl.rows as Array<Record<string, unknown>>)
                    .map((row) => ({
                        ...row,
                        cells: ((row.cells ?? []) as Array<Record<string, unknown>>)
                            .map((c) => ({ ...c, cards: ((c.cards ?? []) as string[]).filter((k) => k !== RETIRE) }))
                            .filter((c) => ((c.cards ?? []) as string[]).length > 0),
                    }))
                    .filter((row) => ((row.cells ?? []) as unknown[]).length > 0);
            }
        }

        /* 3 · fork the published row to a draft — v163 is never edited */
        const dup = await j(await fetch(`/api/admin/entity-layouts/${published.id}/duplicate`, {
            method: "POST", credentials: "include", headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Focus Panel Summary" }),
        }));
        const draft = dup.body as { id?: string; updatedAt?: string; updated_at?: string } | null;
        if (!draft?.id) return { stage: "duplicate", dup, beforeVersion };

        /* 4 · patch the draft with the retired doc */
        const patch = await j(await fetch(`/api/admin/entity-layouts/${draft.id}`, {
            method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Focus Panel Summary", doc, expectedUpdatedAt: draft.updatedAt ?? draft.updated_at ?? null }),
        }));

        /* 5 · publish — a NEW version */
        const pub = await j(await fetch(`/api/admin/entity-layouts/${draft.id}/publish`, {
            method: "POST", credentials: "include",
        }));

        const after = await j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
        const ap = (after.body as { published?: Record<string, unknown> } | null)?.published;
        const adoc = (ap?.doc ?? {}) as Record<string, unknown>;
        const afterSections = ((adoc.sections ?? []) as Array<Record<string, unknown>>).map(keyOf);
        const afterAreas = ((((adoc.metadata as Record<string, unknown>)?.focusPanelLayout as Record<string, unknown>)?.grid as Record<string, unknown>)?.areas ?? []) as Array<Record<string, unknown>>;

        return {
            stage: "done", beforeVersion, afterVersion: ap?.version ?? null,
            sectionsBefore, sectionsAfter: afterSections,
            areasBefore, areasAfter: afterAreas.map((a) => String(a.card)),
            patchStatus: patch.status, publishStatus: pub.status,
            publishError: (pub.body as { error?: string } | null)?.error ?? null,
            /* The integrity rule, checked on the published result itself. */
            visibleSectionsWithoutPlacement: afterSections.filter((k) => {
                const s = ((adoc.sections ?? []) as Array<Record<string, unknown>>).find((x) => keyOf(x) === k);
                const vis = String(((s?.metadata as Record<string, unknown>)?.visibility) ?? "");
                return vis === "visible" && !afterAreas.some((a) => String(a.card) === k);
            }),
            placementsWithoutSection: afterAreas.map((a) => String(a.card)).filter((k) => !afterSections.includes(k)),
        };
    });

    log(JSON.stringify(result, null, 1).slice(0, 2200));
    writeFileSync(`${OUT}/layout-retirement.json`, JSON.stringify(result, null, 2));
});
