/** §5/§6/§9/§11/§12 — the review state, the override, and what must not move with it. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(560_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const ORG_DEFAULT = "5532489d-eed3-4080-9477-f47a94fde1c6"; // $185.00/weekly, the non-recommended option

test("override the recommendation", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};
    let oppId = "";
    page.on("request", (r) => { const m = /financial-config\/opportunity\/([0-9a-f-]{36})/.exec(r.url()); if (m) oppId = m[1]; });
    const actions: string[] = [];
    page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/actions/execute")) actions.push((r.postData() ?? "").slice(0, 300)); });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");

    const canonical = async (label: string) => {
        const snap = await page.evaluate(async (oid) => {
            const j = async (u: string) => { const r = await fetch(u, { credentials: "include", cache: "no-store" }); return r.ok ? r.json() : { error: r.status }; };
            const cfg = await j(`/api/admin/financial-config/opportunity/${oid}`);
            const certa = ((cfg.assignments ?? []) as Array<Record<string, any>>).find((v) => /Certa/.test(v.childLabel));
            const scopes = await j(`/api/admin/financials/responsibility-scopes?customer_member_id=${certa?.customerMemberId}`);
            const arr = await j(`/api/admin/financials/responsibility-arrangement?customer_id=${scopes.customerId}&customer_member_id=${certa?.customerMemberId}`);
            return {
                term: certa?.accepted ? {
                    id: certa.accepted.termId, amount: certa.accepted.amountCents, cadence: certa.accepted.cadenceKey,
                    state: certa.accepted.state, effective: certa.accepted.effectiveStart,
                    source: certa.accepted.source?.id, recommendedSource: certa.accepted.recommendedSourceId,
                    reason: certa.accepted.overrideReason, resolutionKey: certa.accepted.resolutionKey,
                } : null,
                stale: certa?.acceptedIsStale, resolverKey: certa?.resolutionKey,
                recommended: certa?.recommended?.sourceId, recommendedAmount: certa?.recommended?.amountCents,
                responsibility: arr?.arrangement ? {
                    id: arr.arrangement.id, grain: arr.arrangement.customerMemberId ? "child" : "household",
                    effective: arr.arrangement.effectiveStart,
                    shares: (arr.arrangement.shares ?? []).map((sh: Record<string, any>) => `${sh.name}:${sh.amountCents}`),
                } : null,
            };
        }, oppId);
        log(`\n--- ${label} ---\n${JSON.stringify(snap, null, 1)}`);
        return snap;
    };

    await page.getByRole("button", { name: /^custom/ }).first().click({ force: true, timeout: 15_000 });
    await page.waitForTimeout(14_000);
    const before = await canonical("BEFORE");
    out.before = before;

    // §9 — the review state must be showing, and nothing repriced on its own.
    out.reviewUi = await page.evaluate(() => ({
        review: Boolean(document.querySelector("[data-assignment-tuition-review]")),
        recommended: document.querySelector("[data-assignment-tuition-recommended]")?.textContent?.trim() ?? null,
        expand: document.querySelector("[data-assignment-tuition-expand]")?.textContent?.trim() ?? null,
        accepted: (document.querySelector("[data-assignment-accepted-term]") as HTMLElement | null)?.innerText ?? null,
        period: (document.querySelector("[data-assignment-billing-period]") as HTMLElement | null)?.innerText ?? null,
        selectHidden: (document.querySelector("select[data-assignment-tuition-embed]") as HTMLSelectElement | null)?.hidden ?? null,
    }));
    log(`\nREVIEW UI: ${JSON.stringify(out.reviewUi, null, 1)}`);
    await page.screenshot({ path: `${OUT}/sliceA-review.png`, fullPage: true });

    // §5 — expand, choose the non-recommended option, give the required reason.
    const expand = page.locator("[data-assignment-tuition-expand]");
    if (await expand.count()) { await expand.click({ force: true }); await page.waitForTimeout(2500); }
    await page.selectOption("select[data-assignment-tuition-embed]", ORG_DEFAULT).catch((e) => log(`select: ${e}`));
    await page.waitForTimeout(2500);
    const reasonBox = page.locator("[data-assignment-override-reason]");
    out.reasonRevealed = await reasonBox.count();
    log(`override reason field revealed: ${out.reasonRevealed}`);
    if (await reasonBox.count()) await reasonBox.fill("Family kept the organisation rate agreed at enrolment.");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/sliceA-override-form.png`, fullPage: true });

    /* Tuition has its own commit now: the schedule's stays disabled on an existing assignment. */
    const commit = page.locator("[data-assignment-tuition-commit]").first();
    out.commitKind = (await commit.count()) ? await commit.getAttribute("data-assignment-tuition-commit") : null;
    out.commitEnabled = (await commit.count()) ? await commit.isEnabled() : false;
    log(`tuition commit: ${out.commitKind} · enabled ${out.commitEnabled}`);
    if (out.commitEnabled) { await commit.click({ force: true }); await page.waitForTimeout(16_000); }

    out.outcomeUi = await page.evaluate(() => ({
        outcome: document.querySelector("[data-assignment-tuition-outcome]")?.getAttribute("data-assignment-tuition-outcome") ?? null,
        outcomeText: (document.querySelector("[data-assignment-tuition-outcome]") as HTMLElement | null)?.innerText ?? null,
    }));
    log(`OUTCOME: ${JSON.stringify(out.outcomeUi)}`);
    log(`ACTIONS POSTED: ${actions.length}`);
    for (const a of actions) log(`  ${a}`);
    out.actions = actions;

    const after = await canonical("AFTER");
    out.after = after;
    out.responsibilityUnchanged = JSON.stringify(before.responsibility) === JSON.stringify(after.responsibility);
    log(`\nRESPONSIBILITY UNCHANGED: ${out.responsibilityUnchanged}`);
    writeFileSync(`${OUT}/sliceA-override.json`, JSON.stringify(out, null, 2));
});
