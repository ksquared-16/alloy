/**
 * The operator's OWN five destinations, by the hrefs the sidebar actually renders.
 *
 * Two of them ("Registration", "Waitlist") are described in nav as being about CHILDREN, and the
 * Runtime resolves their Row Grain as `child`. One ("Active Pipeline") returned `grain_ambiguous` when
 * it was prewarmed as a sibling. This asks what the OPERATOR sees when each is the ACTIVE destination —
 * the only question that decides whether that is a live defect or a harmless prewarm refusal.
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";

const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");
const BASE = "http://127.0.0.1:3013";
const SLUGS = ["new-leads", "active-pipeline", "registration", "waitlist", "tours"];

const browser = await chromium.launch({ headless: true });

for (const slug of SLUGS) {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
    const page = await ctx.newPage();
    const answers = [];
    page.on("response", async (r) => {
        if (!r.url().includes("/provisioning-answer")) return;
        const q = new URL(r.url()).searchParams;
        try {
            const j = await r.json();
            answers.push({
                lensQ: q.get("work_view_id"),
                terminal: j?.terminal ?? null,
                code: j?.code ?? null,
                message: j?.message ?? null,
                grain: j?.rowGrain ?? null,
                rows: Array.isArray(j?.rows) ? j.rows.length : null,
                view: j?.activeWorkView?.label ?? null,
            });
        } catch {}
    });

    let dom = {};
    try {
        await page.goto(`${BASE}/workspace/work-unit/${slug}`, { waitUntil: "domcontentloaded", timeout: 180000 });
        await page.waitForTimeout(24000);
        dom = await page.evaluate(() => {
            const panel = document.querySelector("[data-inline-focus-panel]");
            const activePill = Array.from(document.querySelectorAll("[aria-selected='true'],[data-active='true']"))
                .map((e) => (e.textContent || "").trim().slice(0, 24))
                .filter(Boolean);
            return {
                activePill,
                queueRows: document.querySelectorAll("[data-queue-row]").length,
                panelSubject: panel?.getAttribute("data-inline-focus-panel-subject") ?? null,
                cards: Array.from(document.querySelectorAll("[data-card-role]")).length,
                alerts: Array.from(document.querySelectorAll('[role="alert"]')).map((a) =>
                    (a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 170),
                ),
                emptyText: Array.from(document.querySelectorAll("*"))
                    .map((e) => (e.childElementCount === 0 ? (e.textContent || "").trim() : ""))
                    .filter((t) => /no records|no results|match your filters/i.test(t))
                    .slice(0, 2),
            };
        });
    } catch (e) {
        dom.error = String(e).slice(0, 130);
    }

    // The INITIAL answer is the one with no explicit work_view_id in the query (the route's own lens).
    const initial = answers.find((a) => !a.lensQ) ?? answers[0] ?? null;
    console.log(`\n=== /workspace/work-unit/${slug}`);
    console.log(`  activePill=${JSON.stringify(dom.activePill ?? [])}`);
    console.log(
        `  INITIAL answer: terminal=${initial?.terminal} code=${initial?.code ?? "-"} grain=${initial?.grain ?? "-"} rows=${initial?.rows ?? "-"} view="${initial?.view ?? "-"}"`,
    );
    if (initial?.message) console.log(`  message: ${initial.message.slice(0, 170)}`);
    console.log(`  DOM: queueRows=${dom.queueRows} cards=${dom.cards} subject=${String(dom.panelSubject ?? "-").slice(0, 8)}`);
    if (dom.alerts?.length) dom.alerts.forEach((a) => console.log(`  ALERT: ${a}`));
    if (dom.emptyText?.length) console.log(`  EMPTY: ${JSON.stringify(dom.emptyText)}`);
    if (dom.error) console.log(`  ERROR: ${dom.error}`);
    console.log(`  (total answers this load: ${answers.length})`);
    await ctx.close();
}

await browser.close();
