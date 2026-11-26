/**
 * §24 — FIXED-CANDIDATE CORE SMOKE, on the reconciled tree, before promotion.
 *
 * Engineering smoke, NOT Human QA: it proves the high-value Core surfaces still answer on the
 * candidate that will be promoted, after a merge that brought 49 files of another thread's work in.
 * It does not re-run the Section 7 matrix and does not mark anything PASS.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-freeze";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const results: Array<{ id: string; ok: boolean; observed: string }> = [];
const record = (id: string, ok: boolean, observed: string) => {
    results.push({ id, ok, observed });
    log(`${ok ? "OK  " : "GAP "} ${id} → ${observed}`);
};

test("core surfaces on the reconciled candidate", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    // ── The panel: Billing Preview, accepted terms, Financials, Process ────────────────────
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(20_000);
    const panel = await page.evaluate(() => ({
        cards: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
        tuition: (document.querySelector('[data-universal-card-key="assignment_tuition"]') as HTMLElement | null)?.innerText?.slice(0, 700) ?? null,
        accepted: Array.from(document.querySelectorAll("[data-tuition-accepted-term]")).map((e) => ({
            term: e.getAttribute("data-tuition-accepted-term"),
            amount: (e.querySelector("[data-tuition-accepted-amount]") as HTMLElement | null)?.innerText ?? null,
        })),
        financials: (document.querySelector('[data-universal-card-key="financials"]') as HTMLElement | null)?.innerText?.slice(0, 400) ?? null,
    }));
    await page.screenshot({ path: `${OUT}/smoke-panel.png`, fullPage: true });
    record("S1 Focus Panel Summary mounts its cards", panel.cards.length >= 6, panel.cards.join(", "));
    record("S2 Billing Preview mounts exactly once", panel.cards.filter((c) => c === "assignment_tuition").length === 1, `${panel.cards.filter((c) => c === "assignment_tuition").length} card(s)`);
    record("S3 accepted recurring terms read back", panel.accepted.length === 2, panel.accepted.map((a) => a.amount).join(" · ") || "none");
    record("S4 Financials card renders its position", /NET OBLIGATION|CURRENT PERIOD/i.test(panel.financials ?? ""), (panel.financials ?? "").split("\n").slice(0, 3).join(" / "));

    // ── Details ───────────────────────────────────────────────────────────────────────────
    const details = page.getByRole("button", { name: /Details/, exact: false }).first();
    if (await details.count()) { await details.click(); await page.waitForTimeout(12_000); }
    const ledger = await page.evaluate(() => {
        const t = document.body.innerText || "";
        return {
            rows: document.querySelectorAll(".alloy-os-fdetail__statlabel").length,
            hasDiscount: /Discount/.test(t),
            hasProvenance: /10% of \$/.test(t),
            hasGl: /4060|4000/.test(t),
        };
    });
    await page.screenshot({ path: `${OUT}/smoke-details.png`, fullPage: true });
    record("S5 Focus Panel Details opens with its ledger", ledger.rows > 0, `${ledger.rows} stat labels`);
    record("S6 discount provenance survives", ledger.hasDiscount && ledger.hasProvenance, `discount=${ledger.hasDiscount} basis=${ledger.hasProvenance}`);
    record("S7 GL accounts render", ledger.hasGl, String(ledger.hasGl));

    // ── Authorities, read-only ────────────────────────────────────────────────────────────
    const api = await page.evaluate(async () => {
        const j = async (u: string, init?: RequestInit) => {
            const r = await fetch(u, { credentials: "include", cache: "no-store", ...init });
            return { status: r.status, body: await r.json().catch(() => null) };
        };
        const cfg = await j("/api/admin/financial-config/opportunity/e56e72d5-c7bc-41ff-8d34-f5d34fd4160a");
        const gen = await j("/api/admin/actions/execute", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
                action_key: "billing.generate_tuition", entity_type: "opportunity_customer_member",
                entity_id: "", mode: "preview", payload: { period_key: "2026-09", cadence: "weekly" },
            }),
        });
        const disc = await j("/api/admin/actions/execute", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
                action_key: "billing.apply_discounts", entity_type: "opportunity_customer_member",
                entity_id: "", mode: "preview", payload: { period_key: "2026-09" },
            }),
        });
        const layout = await j("/api/admin/entity-layouts/focus-panel-summary");
        return { cfg, gen, disc, layoutVersion: (layout.body as { published?: { version?: number } } | null)?.published?.version ?? null };
    });
    const genPreview = (api.gen.body as { data?: { execution_result?: { preview?: { summary?: string; after?: { cadence_key?: string } } } } } | null)?.data?.execution_result?.preview;
    const discPreview = (api.disc.body as { data?: { execution_result?: { preview?: { summary?: string } } } } | null)?.data?.execution_result?.preview;
    record("S8 assignment pricing reads", ((api.cfg.body as { assignments?: unknown[] } | null)?.assignments?.length ?? 0) === 2, `${(api.cfg.body as { assignments?: unknown[] } | null)?.assignments?.length ?? 0} assignments`);
    record("S9 recurring preview is cadence-specific", genPreview?.after?.cadence_key === "weekly", genPreview?.summary ?? "no preview");
    record("S10 discount preview states the money", /reduced by/.test(discPreview?.summary ?? ""), discPreview?.summary ?? "no preview");
    record("S11 published Focus Panel layout is v161", api.layoutVersion === 161, `v${api.layoutVersion}`);

    // ── Workspace Accounts + organization configuration ───────────────────────────────────
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    /*
     * SCOPED TO THE WORKSPACE, NOT THE PAGE. The first draft read the first 600 characters of
     * `document.body.innerText`, which is the SHELL — the command bar, the site filter, the
     * attention counters — and reported the workspace missing while it was open behind them. The
     * same mistake is recorded twice already in this thread; the tabs are what identifies it.
     */
    const ws = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('[role="tab"], button'))
            .map((b) => (b as HTMLElement).innerText.trim())
            .filter((t) => /^(Overview|Accounts|Charges|Payments|Subsidy|Activity)$/.test(t));
        return { tabs: [...new Set(tabs)], hasQueue: !!document.querySelector("[data-financials-bulk-open], [data-financials-card]") };
    });
    await page.screenshot({ path: `${OUT}/smoke-workspace.png`, fullPage: true });
    record(
        "S12 Financials Workspace opens Accounts",
        ws.tabs.includes("Accounts") && ws.tabs.includes("Charges"),
        ws.tabs.join(" · ") || "no workspace tabs",
    );

    await page.goto("/organization/financials?chapter=tuition", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11_000);
    const org = await page.evaluate(() => (document.body.innerText || ""));
    await page.screenshot({ path: `${OUT}/smoke-config.png`, fullPage: true });
    record("S13 organization financial configuration reachable", /Tuition Plans|Billing Frequencies/.test(org), /Billing Frequencies/.test(org) ? "Tuition chapter with Billing Frequencies" : "chapter did not render");

    writeFileSync(`${OUT}/smoke.json`, JSON.stringify({ candidate: "98e1367f8", panel, ledger, api: { layoutVersion: api.layoutVersion, gen: genPreview?.summary, disc: discPreview?.summary }, results }, null, 2));
    const failed = results.filter((r) => !r.ok);
    log(`\n=== CORE SMOKE ${results.length - failed.length}/${results.length} ===`);
    expect(failed.map((f) => f.id), JSON.stringify(failed, null, 1)).toEqual([]);
});
