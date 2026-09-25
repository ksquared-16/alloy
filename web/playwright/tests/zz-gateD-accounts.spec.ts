import { test } from "@playwright/test";

/**
 * GATE D — THE ACCOUNTS ROW-SWITCH TAIL.
 *
 * The operator reported that switching account row A to row B is sometimes excellent and sometimes
 * visibly delayed before B's Details become usable. The point is not the median; it is whether a
 * slow tail still exists after the pdx1 co-location and the Financials work, and what owns each miss.
 *
 * The surface states its own authority, so nothing here is inferred from appearance:
 *   data-financials-account-row        the row, carrying its customer id
 *   data-financials-account-selected   the row acknowledging the click
 *   data-financials-workspace-detail   the customer the DETAIL pane is rendering
 *   data-financials-detail-hydrated    whether that detail is usable rather than still loading
 *
 * The detail pane naming its own customer is what makes "no A truth under B" measurable: a hydrated
 * detail still declaring the PREVIOUS customer is stale content under the new selection, and is
 * recorded as such rather than counted as the new account becoming ready.
 *
 * Runs in batches because the host watchdog kills playwright runs longer than about two minutes.
 *
 * PRIVACY. Opaque customer ids, timings and counts. No names and no money leave the page.
 */
const SWITCHES = Number(process.env.GD_SWITCHES ?? "7");
const BATCH = process.env.GD_BATCH ?? "1";

test("gate D — accounts row switching", async ({ page }) => {
    test.setTimeout(1_800_000);

    await page.addInitScript(`(() => {
        const reqs = [];
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) {
                    if (e.name.indexOf('/api/admin/financials/') === -1) continue;
                    let p = e.name;
                    try { const u = new URL(e.name); p = u.pathname + u.search; } catch (x) { /* raw */ }
                    reqs.push({ at: Math.round(e.startTime), end: Math.round(e.responseEnd), path: p });
                }
            }).observe({ entryTypes: ['resource'] });
        } catch (e) { /* absence reported, never faked */ }
        window.__gd = { reqs: reqs };
    })()`);

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(13_000);

    const out = await page.evaluate(`(async (switches, batch) => {
        const sha = await (async () => {
            try { const r = await fetch('/api/build-info', { cache: 'no-store' }); return ((await r.json()) || {}).gitSha || null; }
            catch (e) { return null; }
        })();

        const open = document.querySelector('[data-adminv2-sidebar-modal-nav="financials"]');
        if (!open) return { skipped: 'no_financials_nav', sha };
        open.click();
        await new Promise((r) => setTimeout(r, 6000));

        const rows = () => [...document.querySelectorAll('[data-financials-account-row]')];
        if (rows().length < 2) {
            // The Accounts chapter may not be the landing section; find it by label and select it.
            const tab = [...document.querySelectorAll('button,a')].find((e) => /^accounts$/i.test((e.textContent || '').trim()));
            if (tab) { tab.click(); await new Promise((r) => setTimeout(r, 6000)); }
        }
        if (rows().length < 2) return { skipped: 'no_account_rows', sha, found: rows().length };

        /*
         * THE ACCOUNTS DETAIL, AS THIS SECTION ACTUALLY RENDERS IT.
         *
         * A first pass keyed on data-financials-workspace-detail and measured nothing: that attribute
         * belongs to FinancialsAccountWorkspaceDetail, which this section retired as a second ledger.
         * The Accounts pane renders FinancialsAccountDetail, whose account summary is a clean binary:
         * pending while it loads, true once the authoritative rollup is there.
         *
         * Identity is structural rather than an attribute here - the detail is keyed by the selected
         * customer, so it remounts per account. So account-correctness is proven the way Gate C proved
         * it: a digest of the rendered figures, which must never repeat under a different account.
         */
        /*
         * THE CONTRACT THE PANE ACTUALLY PUBLISHES, read off the deployed DOM after two source-derived
         * guesses measured nothing. data-financials-workspace-detail belongs to a retired second
         * ledger, and the account summary marker is not what this variant renders. What IS there:
         *   data-financials-account-detail   the customer the detail pane is rendering
         *   data-financials-card-skeleton    the detail is still a skeleton
         *   data-financials-empty=loading    the summary is still loading
         *   data-financials-account-truth    per row: known vs known_zero - the zero/unknown authority
         */
        const detail = () => {
            const d = document.querySelector('[data-financials-account-detail]');
            const host = document.querySelector('[data-financials-account-card="true"]');
            const skeletons = document.querySelectorAll('[data-financials-card-skeleton="true"]').length;
            const emptyEl = host ? host.querySelector('[data-financials-empty]') : null;
            const nums = host ? ((host.textContent || '').match(/[0-9][0-9,]*\.[0-9]{2}/g) || []) : [];
            let h = 0;
            for (const n of nums) for (let i = 0; i < n.length; i += 1) h = ((h << 5) - h + n.charCodeAt(i)) | 0;
            return {
                present: !!d,
                customer: d ? d.getAttribute('data-financials-account-detail') : null,
                skeletons,
                emptyClass: emptyEl ? emptyEl.getAttribute('data-financials-empty') : null,
                figs: nums.length,
                digest: nums.length ? String(h) : null,
                usable: !!d && skeletons === 0 && !emptyEl,
            };
        };
        const rowTruth = (id) => {
            const r = document.querySelector('[data-financials-account-row="' + id + '"]');
            return r ? r.getAttribute('data-financials-account-truth') : null;
        };
        const rowSelected = (id) => {
            const r = document.querySelector('[data-financials-account-row="' + id + '"]');
            return r ? r.getAttribute('data-financials-account-selected') === 'true' : false;
        };

        const ids = rows().map((r) => r.getAttribute('data-financials-account-row')).filter(Boolean);
        const samples = [];
        const visited = {};

        const switchTo = (id, kind) => (async () => {
            const before = detail();
            const reqBefore = window.__gd.reqs.length;
            const el = document.querySelector('[data-financials-account-row="' + id + '"]');
            if (!el) return { id, skipped: 'row_gone' };
            const t0 = performance.now();
            el.click();
            let T2 = null, T3 = null, T6 = null, staleHydratedFrames = 0;
            for (let i = 0; i < 200; i += 1) {
                await new Promise((r) => setTimeout(r, 100));
                const t = Math.round(performance.now() - t0);
                const d = detail();
                if (T2 == null && rowSelected(id)) T2 = t;
                if (T3 == null && d.present && d.customer === id) T3 = t;
                if (T6 == null && d.present && d.customer === id && d.usable) T6 = t;
                // The PREVIOUS account still named by the detail while presenting settled figures is
                // A's truth under B. A skeleton under B is honest and is not counted here.
                if (d.present && d.customer && d.customer !== id && d.usable && rowSelected(id)) staleHydratedFrames += 1;
                if (T6 != null) break;
            }
            const myReqs = window.__gd.reqs.slice(reqBefore).map((r) => ({
                rel: Math.round(r.at - t0), dur: r.end - r.at,
                kind: r.path.indexOf(id) !== -1 ? 'SELECTED_ACCOUNT_REQUIRED' : 'SHARED_OR_OTHER',
                path: r.path.split('?')[0].slice(-34),
            }));
            return {
                id, kind, warm: !!visited[id],
                T2, T3, T6,
                staleHydratedFrames,
                requests: myReqs.slice(0, 8),
                requestCount: myReqs.length,
                finalCustomer: detail().customer,
                finalSkeletons: detail().skeletons,
                finalEmptyClass: detail().emptyClass,
                finalDigest: detail().digest,
                rowTruth: rowTruth(id),
                CORRECT_ACCOUNT: detail().customer === id,
            };
        })();

        for (let i = 0; i < switches; i += 1) {
            const id = ids[(i + 1) % ids.length];
            const s = await switchTo(id, 'sequential');
            samples.push(s);
            visited[id] = true;
            await new Promise((r) => setTimeout(r, 400));
        }

        // RETURN TO VISITED, and RAPID A then C where enough rows exist.
        if (ids.length >= 2) { samples.push(await switchTo(ids[0], 'return_to_visited')); visited[ids[0]] = true; }
        if (ids.length >= 3) {
            const b = document.querySelector('[data-financials-account-row="' + ids[1] + '"]');
            if (b) b.click();
            await new Promise((r) => setTimeout(r, 120));
            samples.push(await switchTo(ids[2], 'rapid_after_B'));
        }

        return { sha, batch, accountCount: ids.length, samples };
    })(${SWITCHES}, ${JSON.stringify(BATCH)})`);

    console.log(`[GATED] ${JSON.stringify(out)}`);
});
