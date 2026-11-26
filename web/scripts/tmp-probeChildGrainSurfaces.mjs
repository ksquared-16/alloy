/**
 * PRECISE version. The first pass conflated two things and must not be trusted:
 *   - it read answers[0], which on the lead surface was a SIBLING work-view prewarm, not the initial
 *     answer — so "grain_ambiguous" was attributed to the wrong request;
 *   - it recorded "no answer" for three slugs without establishing whether those slugs even resolve
 *     to a work-unit surface.
 *
 * So: record EVERY provisioning answer with its query (lens + subject), read the operator sidebar's
 * real destinations, and read the surface's lens set. Then the claim can be exact.
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";

const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");
const BASE = "http://127.0.0.1:3013";

const browser = await chromium.launch({ headless: true });

// ── 1. What does the operator sidebar actually offer? ────────────────────────────────────────────
{
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForTimeout(15000);
    const nav = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a[href]"))
            .map((a) => ({ href: a.getAttribute("href"), label: (a.textContent || "").trim().slice(0, 40) }))
            .filter((l) => l.href?.includes("/work-unit/") || l.href === "/workspace");
        const buttons = Array.from(document.querySelectorAll("nav button, aside button"))
            .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 30))
            .filter(Boolean);
        return { links, buttons: [...new Set(buttons)] };
    });
    console.log("=== OPERATOR NAVIGATION (rendered) ===");
    console.log(`work-unit destinations offered: ${nav.links.length}`);
    for (const l of nav.links) console.log(`   ${l.href}   "${l.label}"`);
    console.log(`sidebar buttons: ${JSON.stringify(nav.buttons)}`);
    await ctx.close();
}

// ── 2. Per slug: every provisioning answer, keyed by its request ─────────────────────────────────
const SLUGS = ["lifecycle_wu_lead", "lifecycle_wu_waitlist", "lifecycle_wu_enrolling", "lifecycle_wu_enrolled"];

for (const slug of SLUGS) {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
    const page = await ctx.newPage();
    const seen = [];
    page.on("response", async (r) => {
        const u = r.url();
        if (!u.includes("/provisioning-answer")) return;
        const q = new URL(u).searchParams;
        try {
            const j = await r.json();
            seen.push({
                lens: q.get("work_view_id"),
                subjectQ: q.get("subject_id"),
                status: r.status(),
                terminal: j?.terminal ?? null,
                code: j?.code ?? null,
                message: j?.message ?? null,
                rowGrain: j?.rowGrain ?? null,
                rows: Array.isArray(j?.rows) ? j.rows.length : null,
                view: j?.activeWorkView?.label ?? null,
                lensSet: Array.isArray(j?.lensSet) ? j.lensSet.map((l) => l.label) : null,
                truthType: j?.recordOfTruth?.entityType ?? null,
            });
        } catch {}
    });

    let dom = {};
    try {
        const resp = await page.goto(`${BASE}/workspace/work-unit/${slug}`, {
            waitUntil: "domcontentloaded",
            timeout: 180000,
        });
        dom.httpStatus = resp?.status() ?? null;
        dom.landedUrl = page.url();
        await page.waitForTimeout(20000);
        Object.assign(
            dom,
            await page.evaluate(() => {
                const panel = document.querySelector("[data-inline-focus-panel]");
                return {
                    hasQueueRegion: !!document.querySelector("[data-queue-region], [data-queue-row]"),
                    panelPresent: !!panel,
                    visibleSubject: panel?.getAttribute("data-inline-focus-panel-subject") ?? null,
                    cards: Array.from(document.querySelectorAll("[data-card-role]")).map((c) =>
                        (c.textContent || "").trim().slice(0, 20).replace(/\s+/g, " "),
                    ),
                    lensPills: Array.from(document.querySelectorAll("[data-work-view-pill], [role='tab']")).map((p) =>
                        (p.textContent || "").trim().slice(0, 26),
                    ),
                    alert: document.querySelector('[role="alert"]')?.textContent?.trim().slice(0, 180) ?? null,
                    h1: document.querySelector("h1,h2")?.textContent?.trim().slice(0, 50) ?? null,
                };
            }),
        );
    } catch (e) {
        dom.error = String(e).slice(0, 140);
    }

    console.log(`\n=== ${slug}`);
    console.log(`  http=${dom.httpStatus} landed=${dom.landedUrl}`);
    console.log(`  h1="${dom.h1}" panel=${dom.panelPresent} queue=${dom.hasQueueRegion} subject=${String(dom.visibleSubject ?? "-").slice(0, 8)}`);
    console.log(`  cards=${JSON.stringify(dom.cards ?? [])}`);
    console.log(`  lensPills=${JSON.stringify(dom.lensPills ?? [])}`);
    if (dom.alert) console.log(`  ALERT: ${dom.alert}`);
    if (dom.error) console.log(`  ERROR: ${dom.error}`);
    console.log(`  provisioning answers: ${seen.length}`);
    seen.forEach((s, i) =>
        console.log(
            `    [${i}] lens=${s.lens ?? "(none)"} subjQ=${s.subjectQ ? s.subjectQ.slice(0, 8) : "-"} http=${s.status} ` +
                `terminal=${s.terminal} code=${s.code ?? "-"} grain=${s.rowGrain ?? "-"} rows=${s.rows ?? "-"} ` +
                `view="${s.view ?? "-"}" truth=${s.truthType ?? "-"}` +
                (s.message ? `\n          msg: ${s.message.slice(0, 160)}` : "") +
                (i === 0 && s.lensSet ? `\n          lensSet: ${JSON.stringify(s.lensSet)}` : ""),
        ),
    );
    await ctx.close();
}

await browser.close();
