/**
 * §26 — DEPLOYED CORE SMOKE, against the promoted staging build.
 *
 * Engineering smoke on the deployed SHA, not Human QA and not a second Section 7 run. It answers
 * one question: does the Core product this thread certified still answer on the build that was
 * actually promoted? The mounted matrix is not re-run unless this contradicts it.
 *
 * Build identity is checked FIRST and asserted, because every other line here is meaningless if the
 * host is serving a different commit — the exact failure the QA evidence guard exists to prevent
 * locally, and which a deployed target has no guard for.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const OUT = "../certification/financials/11a-freeze";
const MERGE_SHA = "c1945a04a407974d0e4687f1db61f7b4c06c69e6";

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const results: Array<{ id: string; ok: boolean; observed: string }> = [];
const record = (id: string, ok: boolean, observed: string) => {
    results.push({ id, ok, observed });
    log(`${ok ? "OK  " : "GAP "} ${id} → ${observed}`);
};

test("deployed core smoke", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    // ── D1 · Build identity, before anything else means anything ───────────────────────────
    await page.goto("/api/build-info", { waitUntil: "domcontentloaded" });
    let info: Record<string, unknown> = {};
    try { info = JSON.parse(await page.evaluate(() => document.body.innerText.slice(0, 3000))); } catch { /* recorded below */ }
    const sha = String(info.gitSha ?? "");
    record("D1 deployed build is the merge commit", sha === MERGE_SHA, `${sha.slice(0, 9)} on ${String(info.gitBranch)}`);
    expect(sha, "every other line here depends on serving the promoted commit").toBe(MERGE_SHA);

    // ── D2 · Authenticated? A deployed session is not assumed ───────────────────────────────
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const signedIn = await page.evaluate(() => !/sign in|log in/i.test((document.body.innerText || "").slice(0, 400)));
    record("D2 the deployed QA session is live", signedIn, signedIn ? "workspace rendered" : "sign-in wall");
    await page.screenshot({ path: `${OUT}/deployed-workspace.png`, fullPage: true });
    if (!signedIn) {
        writeFileSync(`${OUT}/deployed-smoke.json`, JSON.stringify({ mergeSha: MERGE_SHA, info, results }, null, 2));
        return;
    }

    // ── D3–D6 · The Focus Panel the whole thread was about ─────────────────────────────────
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(24_000);
    const panel = await page.evaluate(() => ({
        cards: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
        tuitionCount: Array.from(document.querySelectorAll("[data-universal-card-key]")).filter((e) => e.getAttribute("data-universal-card-key") === "assignment_tuition").length,
        financials: (document.querySelector('[data-universal-card-key="financials"]') as HTMLElement | null)?.innerText?.slice(0, 300) ?? null,
        tuition: (document.querySelector('[data-universal-card-key="assignment_tuition"]') as HTMLElement | null)?.innerText?.slice(0, 400) ?? null,
    }));
    await page.screenshot({ path: `${OUT}/deployed-panel.png`, fullPage: true });
    record("D3 Focus Panel Summary mounts", panel.cards.length >= 5, panel.cards.join(", "));
    record("D4 Billing Preview mounts exactly once", panel.tuitionCount === 1, `${panel.tuitionCount} card(s)`);
    record("D5 Financials card renders its position", /NET OBLIGATION|CURRENT PERIOD|FINANCIALS/i.test(panel.financials ?? ""), (panel.financials ?? "").split("\n").filter(Boolean).slice(0, 3).join(" / ") || "absent");

    const details = page.getByRole("button", { name: /Details/, exact: false }).first();
    if (await details.count()) { await details.click(); await page.waitForTimeout(14_000); }
    const ledger = await page.evaluate(() => ({
        stats: document.querySelectorAll(".alloy-os-fdetail__statlabel").length,
        text: (document.body.innerText || "").slice(0, 300),
    }));
    await page.screenshot({ path: `${OUT}/deployed-details.png`, fullPage: true });
    record("D6 Focus Panel Details opens", ledger.stats > 0, `${ledger.stats} stat labels`);

    // ── D7–D9 · Workspace, authorities, configuration ──────────────────────────────────────
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const fin = page.getByRole("button", { name: /Financials — the financial work/ }).first();
    if (await fin.count()) { await fin.click(); await page.waitForTimeout(12_000); }
    const ws = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('[role="tab"], button'))
            .map((b) => (b as HTMLElement).innerText.trim())
            .filter((t) => /^(Overview|Accounts|Charges|Payments|Subsidy|Activity)$/.test(t));
        return [...new Set(tabs)];
    });
    await page.screenshot({ path: `${OUT}/deployed-accounts.png`, fullPage: true });
    record("D7 Financials Workspace Accounts reachable", ws.includes("Accounts") && ws.includes("Charges"), ws.join(" · ") || "no tabs");

    const api = await page.evaluate(async () => {
        const j = async (u: string, init?: RequestInit) => {
            const r = await fetch(u, { credentials: "include", cache: "no-store", ...init });
            return { status: r.status, body: await r.json().catch(() => null) };
        };
        const gen = await j("/api/admin/actions/execute", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
                action_key: "billing.generate_tuition", entity_type: "opportunity_customer_member",
                entity_id: "", mode: "preview", payload: { period_key: "2026-09", cadence: "weekly" },
            }),
        });
        const qa = await j("/api/admin/qa/financials-director");
        return { gen, qaStatus: qa.status, qa: qa.body };
    });
    const genPreview = (api.gen.body as { data?: { execution_result?: { preview?: { summary?: string; after?: { cadence_key?: string } } } } } | null)?.data?.execution_result?.preview;
    record("D8 recurring generation authority reachable", api.gen.status === 200 && genPreview?.after?.cadence_key === "weekly", `${api.gen.status} · ${genPreview?.summary ?? "no preview"}`);

    await page.goto("/organization/financials?chapter=tuition", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    const org = await page.evaluate(() => document.body.innerText || "");
    await page.screenshot({ path: `${OUT}/deployed-config.png`, fullPage: true });
    record("D9 organization financial configuration reachable", /Tuition Plans|Billing Frequencies/.test(org), /Billing Frequencies/.test(org) ? "Tuition chapter with Billing Frequencies" : "chapter did not render");

    // ── D10 · The Director QA reader recognises this build ─────────────────────────────────
    const qaBody = api.qa as { catalogVersion?: string; suiteKey?: string; scenarios?: unknown[] } | null;
    record(
        "D10 Director QA reader recognises the deployed build",
        api.qaStatus === 200 && qaBody?.catalogVersion === "2026-09-19.1",
        `${api.qaStatus} · catalog ${qaBody?.catalogVersion ?? "?"} · ${qaBody?.scenarios?.length ?? 0} scenarios`,
    );

    writeFileSync(`${OUT}/deployed-smoke.json`, JSON.stringify({ mergeSha: MERGE_SHA, deployedSha: sha, info, panel, ws, results }, null, 2));
    const failed = results.filter((r) => !r.ok);
    log(`\n=== DEPLOYED CORE SMOKE ${results.length - failed.length}/${results.length} ===`);
    expect(failed.map((f) => f.id), JSON.stringify(failed, null, 1)).toEqual([]);
});
