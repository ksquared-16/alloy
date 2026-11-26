import { test } from "@playwright/test";

/**
 * WU-07 — THE UNDERLYING ROW FIELDS, FROM THE OWNER'S OWN ENDPOINT.
 *
 * The header's status chip is seeded from the queue row's CONFIGURED `status` display slot, which
 * this work unit binds to `queue_row.stage_label`. Deciding the fix needs the row's real fields:
 * if `row_status_label` already equals what the drawer VM later reports, seeding the chip from the
 * record-status field makes seed and owner agree and the correction disappears without the chip
 * ever going blank. If it does not, the disagreement is in the projection, not the header, and the
 * header fix would be cosmetic.
 *
 * Read from the app's own provisioning-answer endpoint in page context (same session, same origin)
 * rather than from the Flight payload, which is chunk-escaped and not reliably greppable.
 */
test("p077 row fields", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    test.setTimeout(180_000);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(10000);

    const out = await page.evaluate(async () => {
        const host = document.querySelector("[data-work-view-id], [data-work-unit-id]");
        const workUnitId =
            host?.getAttribute("data-work-unit-id") || host?.getAttribute("data-work-view-id") || null;
        // Walk the same route the surface used, so the answer is the one the seed was built from.
        const path = location.pathname.split("/").filter(Boolean);
        const key = path[path.length - 1];
        const tries = [workUnitId, key].filter(Boolean) as string[];
        for (const id of tries) {
            try {
                const r = await fetch(`/api/admin/work-units/${encodeURIComponent(id)}/provisioning-answer`, {
                    credentials: "include",
                });
                if (!r.ok) continue;
                const j = await r.json();
                const rows: unknown[] = (j?.rows as unknown[]) ?? (j?.queue?.rows as unknown[]) ?? [];
                const first = rows.slice(0, 3).map((r0) => {
                    const c = (r0 as { context?: Record<string, unknown> }).context ?? {};
                    return {
                        entityId: (r0 as { entityId?: string }).entityId ?? null,
                        row_status_label: c.row_status_label ?? null,
                        row_status_key: c.row_status_key ?? null,
                        row_stage: c.row_stage ?? null,
                        row_stage_key: (c as { row_stage_key?: unknown }).row_stage_key ?? null,
                    };
                });
                const roa = j?.recordOfAttention ?? null;
                const rot = j?.recordOfTruth ?? null;
                const pick = (o: Record<string, unknown> | null) =>
                    o ? {
                        id: o.id ?? null,
                        status_key: o.status_key ?? null,
                        status_label: (o as Record<string, unknown>).status_label ?? null,
                        _effective_stage_rollup_label: o._effective_stage_rollup_label ?? null,
                    } : null;
                return {
                    ok: true, usedId: id, rowCount: rows.length, first,
                    recordOfAttention: pick(roa), recordOfTruth: pick(rot),
                };
            } catch (e) {
                return { ok: false, usedId: id, error: String(e) };
            }
        }
        return { ok: false, tried: tries };
    });

    console.log(`[rf] ${JSON.stringify(out)}`);
});
