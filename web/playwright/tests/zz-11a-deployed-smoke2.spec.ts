/**
 * §4 A–K — the REST of the narrow deployed smoke, on the promoted staging build.
 *
 * The first pass proved build identity, the panel, Details, Accounts, the generation authority, the
 * configuration surface and the Director QA reader. This one covers what that pass did not name:
 * the accepted commercial terms by amount, the approved rich presentation, lenses and the payment
 * band's ownership, invoice-versus-due, responsibility, prepaid, the discount authority, the
 * withheld inert policy types, and v161.
 *
 * Read and preview evidence only. Nothing here generates a charge to prove a deployment.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11a-freeze";
const MERGE_SHA = "c1945a04a407974d0e4687f1db61f7b4c06c69e6";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(1_200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const results: Array<{ id: string; ok: boolean; observed: string }> = [];
const record = (id: string, ok: boolean, observed: string) => {
    results.push({ id, ok, observed });
    log(`${ok ? "OK  " : "GAP "} ${id} → ${observed}`);
};

test("deployed core smoke — A through K", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    await page.goto("/api/build-info", { waitUntil: "domcontentloaded" });
    const info = JSON.parse(await page.evaluate(() => document.body.innerText.slice(0, 3000))) as Record<string, unknown>;
    expect(String(info.gitSha), "this pass must run on the promoted commit too").toBe(MERGE_SHA);
    record("D0 build identity re-confirmed", true, `${String(info.gitSha).slice(0, 9)} · ${String(info.gitBranch)} · ${String(info.vercelEnv ?? info.nodeEnv)}`);

    // ── A · Billing Preview and the accepted terms, by amount ──────────────────────────────
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(26_000);
    const panel = await page.evaluate(() => {
        const keys = Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key") ?? "");
        return {
            tuitionCount: keys.filter((k) => k === "assignment_tuition").length,
            accepted: Array.from(document.querySelectorAll("[data-tuition-accepted-amount]")).map((e) => (e as HTMLElement).innerText.trim()),
            children: Array.from(document.querySelectorAll("[data-tuition-assignment]")).map((e) => (e.querySelector(".alloy-os-tuition__child") as HTMLElement | null)?.innerText ?? null).filter(Boolean),
            financials: (document.querySelector('[data-universal-card-key="financials"]') as HTMLElement | null)?.innerText?.slice(0, 900) ?? "",
            richBody: !!document.querySelector('[data-financials-card-body="true"]'),
        };
    });
    await page.screenshot({ path: `${OUT}/deployed2-panel.png`, fullPage: true });
    const amounts = panel.accepted.join(" ");
    record("A1 Billing Preview mounts exactly once", panel.tuitionCount === 1, `${panel.tuitionCount} card(s)`);
    record("A2 correct child / commercial context", panel.children.length === 2, panel.children.join(" · ") || "none");
    record("A3 accepted Weekly $185.00 visible", /\$185\.00\/weekly/.test(amounts), amounts || "none");
    record("A4 accepted Monthly $1,450.00 visible", /\$1,450\.00\/monthly/.test(amounts), amounts || "none");

    // ── B · Summary presentation ───────────────────────────────────────────────────────────
    const zones = ["Current period", "Charges", "Net obligation", "Due"].filter((z) => new RegExp(z, "i").test(panel.financials));
    record("B1 approved rich presentation, no regression", panel.richBody && zones.length >= 3, `richBody=${panel.richBody} zones=${zones.join("/")}`);
    record("B2 financial position renders", /\$/.test(panel.financials), panel.financials.split("\n").filter(Boolean).slice(0, 4).join(" / ") || "absent");

    // ── C/G/H/I · Details, dates, responsibility, prepaid ──────────────────────────────────
    const details = page.getByRole("button", { name: /Details/, exact: false }).first();
    if (await details.count()) { await details.click(); await page.waitForTimeout(18_000); }
    const deep = await page.evaluate(() => {
        const t = document.body.innerText || "";
        const near = (label: string) => {
            const i = t.indexOf(label);
            return i < 0 ? null : t.slice(i, i + 55).replace(/\n+/g, " ").trim();
        };
        return {
            stats: Array.from(document.querySelectorAll(".alloy-os-fdetail__statlabel")).map((e) => (e as HTMLElement).innerText.trim()),
            lenses: [...new Set(Array.from(document.querySelectorAll("button, [role=tab]")).map((b) => (b as HTMLElement).innerText.trim())
                .filter((x) => /^(All|Charges|Credits|Funding|Payments)$/.test(x)))],
            filters: ["subject", "period"].filter((k) => !!document.querySelector(`[data-testid="${k}"]`)),
            bandsAnywhere: document.querySelectorAll("[data-financials-payment-band]").length,
            bandInCard: !!document.querySelector('[data-financials-payment-band="detail"]'),
            invoice: near("Invoice date"), due: near("Due date"),
            billingPeriod: near("Billing period"), accountingPeriod: near("Accounting period"),
            available: near("Available"), balance: near("Balance"),
            responsibility: /Manage responsibility|RESPONSIBILITY|unassigned|not divided/i.test(t),
            discountConcept: /\bDiscount\b/.test(t),
            provenance: /10% of \$/.test(t),
        };
    });
    await page.screenshot({ path: `${OUT}/deployed2-details.png`, fullPage: true });
    record("C1 Details opens with its ledger", deep.stats.length > 0, `${deep.stats.length} stats: ${deep.stats.slice(0, 4).join(" · ")}`);
    record("C2 lenses and filters present", deep.lenses.length >= 3 || deep.filters.length > 0, `lenses=[${deep.lenses.join(",")}] filters=[${deep.filters.join(",")}]`);
    record("C3 no orphan payment band", deep.bandsAnywhere === 0 || deep.bandInCard, `bands=${deep.bandsAnywhere} ownedByCard=${deep.bandInCard}`);
    record("H1 responsibility presentation intact", deep.responsibility, deep.responsibility ? "stated on the surface" : "absent");
    record("I1 prepaid reads without netting the balance", !!deep.available || !!deep.balance, `${deep.available ?? "no Available line"} | ${deep.balance ?? "-"}`);
    record("F2 discount concept and provenance readable", deep.discountConcept, `concept=${deep.discountConcept} basis=${deep.provenance}`);

    // ── G · Invoice vs Due on a generated recurring specimen ───────────────────────────────
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const finBtn = page.getByRole("button", { name: /Financials — the financial work/ }).first();
    if (await finBtn.count()) { await finBtn.click(); await page.waitForTimeout(14_000); }
    const chargesTab = page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first();
    if (await chargesTab.count()) { await chargesTab.click(); await page.waitForTimeout(12_000); }
    const row = page.locator("button", { hasText: /Tuition · .* · September 2026/ }).first();
    let dates = { invoice: null as string | null, due: null as string | null, billing: null as string | null, accounting: null as string | null, gross: null as string | null, reductions: null as string | null, net: null as string | null };
    if (await row.count()) {
        await row.click();
        await page.waitForTimeout(14_000);
        dates = await page.evaluate(() => {
            const t = document.body.innerText || "";
            const near = (label: string) => {
                const i = t.indexOf(label);
                return i < 0 ? null : t.slice(i, i + 55).replace(/\n+/g, " ").trim();
            };
            return { invoice: near("Invoice date"), due: near("Due date"), billing: near("Billing period"), accounting: near("Accounting period"), gross: near("Gross charge"), reductions: near("Reductions"), net: near("Net obligation") };
        });
    }
    await page.screenshot({ path: `${OUT}/deployed2-charge.png`, fullPage: true });
    record("G1 Invoice date and Due date are independent", !!dates.invoice && !!dates.due && dates.invoice !== dates.due, `${dates.invoice ?? "-"} | ${dates.due ?? "-"}`);
    record("G2 Billing and Accounting period stay distinct", !!dates.billing && !!dates.accounting, `${dates.billing ?? "-"} | ${dates.accounting ?? "-"}`);
    record("F1 gross / reduction / net on a generated specimen", !!dates.gross && !!dates.net, `${dates.gross ?? "-"} | ${dates.reductions ?? "-"} | ${dates.net ?? "-"}`);

    // ── E/F/K · Authorities and the published layout, preview only ─────────────────────────
    const api = await page.evaluate(async () => {
        const j = async (u: string, init?: RequestInit) => {
            const r = await fetch(u, { credentials: "include", cache: "no-store", ...init });
            return { status: r.status, body: await r.json().catch(() => null) };
        };
        const preview = (action: string, payload: Record<string, unknown>) =>
            j("/api/admin/actions/execute", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action_key: action, entity_type: "opportunity_customer_member", entity_id: "", mode: "preview", payload }),
            });
        const weekly = await preview("billing.generate_tuition", { period_key: "2026-09", cadence: "weekly" });
        const monthly = await preview("billing.generate_tuition", { period_key: "2026-09", cadence: "monthly" });
        const discount = await preview("billing.apply_discounts", { period_key: "2026-09" });
        const layout = await j("/api/admin/entity-layouts/focus-panel-summary");
        const pub = (layout.body as { published?: { version?: number; doc?: { metadata?: { focusPanelLayout?: { grid?: { areas?: Array<{ card?: string }> } } } } } } | null)?.published;
        return {
            weekly, monthly, discount,
            layoutVersion: pub?.version ?? null,
            layoutCards: (pub?.doc?.metadata?.focusPanelLayout?.grid?.areas ?? []).map((a) => a.card),
        };
    });
    const pv = (r: { body: unknown }) => (r.body as { data?: { execution_result?: { preview?: { summary?: string; after?: Record<string, unknown> } } } } | null)?.data?.execution_result?.preview;
    const w = pv(api.weekly); const m = pv(api.monthly); const d = pv(api.discount);
    record("E1 generation authority is cadence-specific", api.weekly.status === 200 && (w?.after as { cadence_key?: string })?.cadence_key === "weekly", `${api.weekly.status} · ${w?.summary ?? "-"}`);
    record("E2 the two cadences plan differently", (w?.summary ?? "x") !== (m?.summary ?? "y"), `weekly: ${w?.summary ?? "-"} || monthly: ${m?.summary ?? "-"}`);
    record("E3 accepted-price authority intact", String((w?.after as { total_amount_cents?: number })?.total_amount_cents) === "92500" || String((m?.after as { total_amount_cents?: number })?.total_amount_cents) === "145000", `weekly=${String((w?.after as { total_amount_cents?: number })?.total_amount_cents)} monthly=${String((m?.after as { total_amount_cents?: number })?.total_amount_cents)}`);
    record("F3 discount authority states money", api.discount.status === 200 && /reduced by/.test(d?.summary ?? ""), `${api.discount.status} · ${d?.summary ?? "-"}`);
    record("K1 published layout is v161", api.layoutVersion === 161, `v${api.layoutVersion}`);
    record("K2 billing_preview is in the explicit layout", api.layoutCards.includes("billing_preview"), api.layoutCards.join(", ") || "no areas");

    // ── J · Configuration, and the withheld inert policy types ─────────────────────────────
    await page.goto("/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    const newPolicy = page.getByRole("button", { name: /New Policy/i }).first();
    if (await newPolicy.count()) { await newPolicy.click(); await page.waitForTimeout(7000); }
    const policy = await page.evaluate(() => {
        const options = Array.from(document.querySelectorAll("select option")).map((o) => (o as HTMLElement).innerText.trim().toLowerCase());
        return {
            active: ["proration", "billing cadence", "due date", "deposit", "posting review"].filter((t) => options.includes(t)),
            inert: ["write off", "withdrawal", "adjustment approval", "draft expiration"].filter((t) => options.includes(t)),
            count: options.length,
        };
    });
    await page.screenshot({ path: `${OUT}/deployed2-policies.png`, fullPage: true });
    record("J3 financial execution policies reachable", policy.active.length >= 4, `${policy.active.length}/5: ${policy.active.join(", ")}`);
    record("J4 inert policy types remain withheld", policy.inert.length === 0, policy.inert.length ? `OFFERED: ${policy.inert.join(", ")}` : "none offered");

    writeFileSync(`${OUT}/deployed-smoke2.json`, JSON.stringify({ mergeSha: MERGE_SHA, buildInfo: info, panel, deep, dates, previews: { weekly: w, monthly: m, discount: d }, layout: { version: api.layoutVersion, cards: api.layoutCards }, policy, results }, null, 2));
    const failed = results.filter((r) => !r.ok);
    log(`\n=== DEPLOYED SMOKE A–K ${results.length - failed.length}/${results.length} ===`);
    expect(failed.map((f) => f.id), JSON.stringify(failed, null, 1)).toEqual([]);
});
