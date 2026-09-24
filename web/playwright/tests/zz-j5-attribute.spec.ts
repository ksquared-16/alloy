import { test } from "@playwright/test";

/**
 * OX J5 — WHO ISSUES /api/admin/financials/card, AND DOES IT GATE OR MERELY CONTEND?
 *
 * Measured on 14be94ea: ~1,528ms of the 2,364ms actionable happens AFTER the provisioning answer is
 * fully available, and this request runs 1,180-1,717ms inside that window with a completion that
 * tracks T5. That is correlation. Attribution by URL is impossible here — BOTH producers emit
 * exactly `customer_id=<id>`:
 *
 *   FinancialsCard (Focus Panel)          fetch(..., { credentials: "include" })
 *   FinancialsAccountWorkspaceDetail      fetch(..., { cache: "no-store" })
 *
 * The fetch INIT is the discriminator, and unlike a stack trace it survives minification. The call
 * stack is captured too, for corroboration rather than as the primary evidence.
 *
 * It matters which one it is. If the active Focus Panel card is bootstrapping, the owner is
 * duplicate authority — the settlement already carries `cards.financials`. If an inactive workspace
 * tab is fetching the selected subject, the owner is mounted-surface work competing with the
 * operator's actual event, and the repair is a shared priority rule rather than anything Financials-
 * specific.
 */
test("j5 attribute post-answer requests", async ({ page }) => {
    test.setTimeout(240_000);

    await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        const calls: Array<Record<string, unknown>> = [];
        w.__J5_CALLS = calls;
        const orig = window.fetch.bind(window);
        window.fetch = async (...args: Parameters<typeof fetch>) => {
            let url = "";
            try { url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url ?? String(args[0]); } catch { /* ignore */ }
            if (url.includes("/api/admin/")) {
                const init = (args[1] ?? {}) as RequestInit;
                const started = performance.now();
                let stack = "";
                try { stack = (new Error().stack ?? "").split("\n").slice(2, 6).join(" | "); } catch { /* ignore */ }
                const rec: Record<string, unknown> = {
                    path: url.slice(0, 120),
                    at: Math.round(started),
                    // THE DISCRIMINATOR: the two producers pass different init.
                    credentials: init.credentials ?? null,
                    cache: init.cache ?? null,
                    stack: stack.slice(0, 400),
                    dur: null,
                };
                calls.push(rec);
                const res = await orig(...args);
                rec.dur = Math.round(performance.now() - started);
                /*
                 * The drawer VM answers with its own phase breakdown. Reading it here means the next
                 * repair is chosen from the endpoint's interior rather than from its total, which is
                 * the distinction that turned a straddling gap into a mis-named "prelude" once before.
                 */
                if (url.includes("view-models/drawer/opportunity")) {
                    res.clone().json().then((b: Record<string, unknown>) => {
                        const t = (b?.vm as { timing?: unknown })?.timing ?? (b as { timing?: unknown })?.timing;
                        rec.timing = t ?? null;
                    }).catch(() => { rec.timing = "unreadable"; });
                }
                return res;
            }
            return orig(...args);
        };
    });

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(15000);

    // PART 3 — what is mounted while the operator works the queue?
    const census = await page.evaluate(`(() => {
        const q = (s) => document.querySelectorAll(s).length;
        return {
            focus_panel: q('[data-alloy-os-focus-panel-header="true"]'),
            financials_cards: q('[data-financials-empty], .alloy-os-financials'),
            // An inactive tab that is mounted but not visible still runs effects.
            hidden_panels: q('[hidden] .alloy-os-ucard, [aria-hidden="true"] .alloy-os-ucard'),
            tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => ({
                label: (t.textContent || "").trim().slice(0, 24),
                selected: t.getAttribute("aria-selected"),
            })).slice(0, 12),
            queue_rows: q('.alloy-os-queue-row-card'),
        };
    })()`);

    await page.evaluate(`(() => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        const cur = rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected'));
        const t = rows[cur>=0?(cur+1)%rows.length:1];
        for (const e of ["pointerover","mouseover","pointerenter","mouseenter"]) t.dispatchEvent(new MouseEvent(e,{bubbles:true}));
        window.__t = t; return true;
    })()`);
    await page.waitForTimeout(800);
    await page.evaluate(`(() => { window.__clickAt = performance.now(); window.__t.click(); return true; })()`);
    await page.waitForTimeout(16000);

    const out = await page.evaluate<{ signedOut: boolean; calls: unknown[] }>(`(() => {
        const w = window;
        const clickAt = w.__clickAt || 0;
        return {
            signedOut: !!document.querySelector('input[type="password"]'),
            calls: (w.__J5_CALLS || [])
                .filter((c) => c.at >= clickAt - 1200)
                .map((c) => ({ ...c, rel: Math.round(c.at - clickAt) }))
                .sort((a,b) => a.rel - b.rel)
                .slice(0, 30),
        };
    })()`);
    console.log(`[attr] ${JSON.stringify({ census, signedOut: out.signedOut, calls: out.calls })}`);
});
