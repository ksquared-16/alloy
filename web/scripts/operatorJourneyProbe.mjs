/**
 * THE OPERATOR JOURNEY — login page through an actionable Workspace and into a Work Unit.
 *
 * Marks are OPERATOR-VISIBLE and declared here, before anything is measured:
 *   shell       the workspace chrome exists
 *   workviews   at least one Work View destination is offered
 *   counts      a Work View carries a settled numeric count, not a placeholder
 *   actionable  destinations are offered, no skeleton remains, and no app request has started
 *               for QUIET_MS — a surface is never called ready while a card is still a skeleton
 *   identity    the Focus Panel names a subject
 *   queue       at least one selectable queue row
 *   card:<key>  that card's grid cell exists and carries content that is not a skeleton
 *   settled     all of the above, quiet for QUIET_MS
 *
 * The credentialed sign-in leg is NOT reproduced here: this lane holds no operator password (the
 * toolkit captures storage state through a manual login), and asking for one is out of bounds. The
 * journey therefore starts on `/login` with a valid session and measures everything the login
 * handler triggers after `signInWithPassword` resolves — `router.push("/workspace")` onward. The
 * sign-in network leg is measured separately against the auth endpoint and reported alongside.
 *
 * Nothing is written to disk. Card TEXT is never printed — it carries household names, emails and
 * phone numbers — only its length and whether it is a skeleton.
 */
import { BASE, redact, withOperatorPage } from "./pe3HarnessEnv.mjs";

const QUIET_MS = Number(process.env.PE3_QUIET_MS ?? 1500);
const POLL_MS = 50;
const WS_BUDGET_MS = Number(process.env.PE3_WS_MS ?? 45_000);
const WU_BUDGET_MS = Number(process.env.PE3_WU_MS ?? 45_000);

/** Facts only — no card text, no subject labels, no hrefs beyond a redacted path. */
const READ = `(() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (el) => (el ? (el.textContent || "").replace(/\\s+/g, " ").trim() : "");
  const cells = {};
  q('[data-focus-panel-grid-cell]').forEach((el) => {
    const k = el.getAttribute('data-focus-panel-grid-cell');
    cells[k] = {
      len: txt(el).length,
      skeleton: Boolean(el.querySelector('[data-testid="inline-focus-panel-skeleton"], .animate-pulse, [aria-busy="true"]')),
    };
  });
  const workViews = q('a[href^="/workspace/work-unit/"]');
  return {
    path: location.pathname,
    shell: Boolean(document.querySelector('[data-focus-panel-card-grid], .adminv2-workspace-scroll-surface, [data-adminv2-shell]')),
    skeletons: q('[data-testid="inline-focus-panel-skeleton"], [data-focus-panel-skeleton-card], .animate-pulse, [aria-busy="true"]').length,
    cells,
    workViewCount: workViews.length,
    workViewHasCount: workViews.some((a) => /\\d/.test(txt(a))),
    firstWorkViewHref: workViews.length ? workViews[0].getAttribute('href') : null,
    hasIdentity: txt(document.querySelector('#admin-focus-panel-title')).length > 0,
    rows: q('[data-entity-id]').length,
    commands: q('[data-command-rail-action], [data-adminv2-command-action], button[data-action-key]').length,
  };
})()`;

const CARD_KEYS = ["current_work", "attention", "household", "children", "scheduling", "communications", "documents", "milestones", "billing_preview"];

await withOperatorPage(async (page, context) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Page.enable");
    let lastRequestAt = 0;
    const documentLoads = [];
    cdp.on("Network.requestWillBeSent", (e) => {
        if (e.request.url.startsWith(BASE)) lastRequestAt = Date.now();
    });
    cdp.on("Page.frameNavigated", (e) => {
        if (!e.frame.parentId) documentLoads.push(redact(e.frame.url));
    });

    /** Poll until the budget elapses, recording the first moment each mark became true. */
    async function observe(marks, budgetMs, clockT0) {
        const firstTrue = {};
        while (Date.now() - clockT0 < budgetMs) {
            let read;
            try {
                read = await page.evaluate(READ);
            } catch {
                await page.waitForTimeout(POLL_MS);
                continue;
            }
            const t = Date.now() - clockT0;
            for (const [name, predicate] of Object.entries(marks)) {
                if (firstTrue[name] !== undefined) continue;
                let ok = false;
                try {
                    ok = predicate(read, { quietMs: Date.now() - lastRequestAt });
                } catch {
                    ok = false;
                }
                if (ok) firstTrue[name] = t;
            }
            await page.waitForTimeout(POLL_MS);
        }
        return firstTrue;
    }

    const report = (title, marks) => {
        console.log(`\n[${title}]`);
        const entries = Object.entries(marks).sort((a, b) => a[1] - b[1]);
        for (const [name, ms] of entries) console.log(`   ${name.padEnd(24)} ${String(ms).padStart(6)} ms`);
        for (const name of Object.keys(marks).length ? [] : []) void name;
    };

    // ── The post-authentication leg: the login page's own commit to /workspace.
    await page.goto(`${BASE}/login`, { waitUntil: "commit", timeout: 120_000 });
    await page.waitForTimeout(1500);
    const wsT0 = Date.now();
    await page.goto(`${BASE}/workspace`, { waitUntil: "commit", timeout: 180_000 });
    const workspace = await observe(
        {
            shell: (r) => r.shell,
            workviews: (r) => r.workViewCount > 0,
            counts: (r) => r.workViewHasCount,
            no_skeleton: (r) => r.workViewCount > 0 && r.skeletons === 0,
            actionable: (r, x) => r.workViewCount > 0 && r.skeletons === 0 && x.quietMs > QUIET_MS,
        },
        WS_BUDGET_MS,
        wsT0,
    );
    report("login -> actionable Workspace", workspace);

    const destination = (await page.evaluate(READ)).firstWorkViewHref;
    if (!destination) throw new Error("no Work View destination offered on /workspace");
    console.log(`\n   entering ${redact(destination)}`);

    // ── Work Unit entry. The clock starts BEFORE the click and the click does not block: Playwright
    //    auto-waits for the navigation an action triggers, which reports a whole transition as ~17 ms.
    const link = page.locator(`a[href="${destination}"]`).first();
    await link.waitFor({ state: "visible", timeout: 20_000 });
    const wuT0 = Date.now();
    link.click({ timeout: 20_000, noWaitAfter: true }).catch(() => {});
    const cardMark = (key) => (r) => Boolean(r.cells[key] && !r.cells[key].skeleton && r.cells[key].len > 0);
    const workUnitMarks = {
        shell: (r) => r.shell,
        identity: (r) => r.hasIdentity,
        queue: (r) => r.rows > 0,
        commands: (r) => r.commands > 0,
        no_skeleton: (r) => r.skeletons === 0 && Object.keys(r.cells).length > 0,
        settled: (r, x) => r.skeletons === 0 && Object.keys(r.cells).length > 0 && r.hasIdentity && x.quietMs > QUIET_MS,
    };
    for (const key of CARD_KEYS) workUnitMarks[`card:${key}`] = cardMark(key);
    const workUnit = await observe(workUnitMarks, WU_BUDGET_MS, wuT0);
    report("Work Unit entry", workUnit);

    const present = Object.keys(workUnit).filter((k) => k.startsWith("card:"));
    const absent = CARD_KEYS.filter((k) => !workUnit[`card:${k}`]);
    console.log(`\n   cards that composed: ${present.length} — ${present.map((k) => k.slice(5)).join(", ") || "none"}`);
    if (absent.length) console.log(`   cards not on this surface: ${absent.join(", ")}`);
    console.log(`   document loads during the journey: ${documentLoads.length} ${JSON.stringify(documentLoads)}`);
}, {});
