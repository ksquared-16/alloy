import { test } from "@playwright/test";

/**
 * OX J5 — PER-ACTION CENSUS OF THE MEASURED SURFACE.
 *
 * Part 1 forbids auditing from the action LIBRARY: what may appear in `displayVm.actions.header_menu`
 * is decided by published placement configuration, not by `ACTION_BUTTON_LIBRARY`. So this reads the
 * drawer view model off the wire on the real Opportunity / New Leads surface and reports, for every
 * header action, exactly the fields the client handler dispatches on — `action_type`, `key`,
 * `payload.intent`, `payload.form_key` — plus the canonical executor metadata.
 *
 * It switches rows several times so configuration that varies by status/stage is seen, rather than
 * certifying one specimen as if it were the whole surface.
 */
test("j5 action census", async ({ page }) => {
    test.setTimeout(300_000);

    const seen: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (!/\/api\/admin\/view-models\/drawer\/opportunity\//.test(res.url())) return;
        try {
            const vm = (await res.json()) as {
                entity?: { id?: string };
                actions?: { header_menu?: Array<Record<string, unknown>> };
            };
            const menu = vm?.actions?.header_menu;
            if (!Array.isArray(menu)) return;
            for (const a of menu) {
                const p = (a.payload ?? {}) as Record<string, unknown>;
                seen.push({
                    subject: vm.entity?.id ?? null,
                    key: a.key,
                    label: a.label,
                    action_type: a.action_type,
                    display_style: a.display_style,
                    intent: p.intent ?? null,
                    form_key: p.form_key ?? null,
                    href: p.href != null ? "(present)" : null,
                    payload_keys: Object.keys(p).sort().join(","),
                    canonical: a.canonical ?? null,
                });
            }
        } catch { /* not JSON / already consumed */ }
    });

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(18_000);

    // Walk several queue rows: header actions are status/stage conditioned, so one row is not a census.
    for (let i = 0; i < 6; i += 1) {
        const moved = await page.evaluate(`(() => {
            const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length < 2) return false;
            // Walk by index: neither aria-selected nor a --selected class marks selection on this
            // queue, so searching for the selected row answers -1 and re-clicks the same one. This
            // census returned 55 observations for a single subject before that was noticed.
            const next = rows[(window.__censusIdx = ((window.__censusIdx ?? 0) + 1) % rows.length)];
            next.click();
            return true;
        })()`);
        if (!moved) break;
        await page.waitForTimeout(9_000);
    }

    // De-duplicate by the tuple the handler actually dispatches on.
    const byKey = new Map<string, Record<string, unknown>>();
    for (const a of seen) {
        const id = `${a.key}|${a.action_type}|${a.intent}|${a.form_key}`;
        if (!byKey.has(id)) byKey.set(id, a);
    }
    console.log(`[census] distinct=${byKey.size} observations=${seen.length}`);
    for (const a of byKey.values()) console.log(`[census-row] ${JSON.stringify(a)}`);
});
