/** §7 mounted verification — partial disclosure, household responsibility, inert policy withdrawal. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s7";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(290_000);
const F: Array<{ id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    F.push({ id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${id.padEnd(5)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const RESOLVED = "907d1b64-09d5-4926-bed0-63d044c15441";  // $75 Certb, $18 named + $57 unowned
const HOUSEHOLD = "2279460a-0b4e-4d31-9d86-3a00a4d4daf4"; // $75 household-grain

const ledger = (p: Page) => p.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    document.querySelectorAll(".alloy-os-billingdetail__row").forEach((r) => {
        if (r.className.includes("--head")) return;
        const resp = r.querySelector("[data-financials-responsibility]");
        out.push({
            chargeId: r.querySelector("[data-charge-id]")?.getAttribute("data-charge-id") ?? null,
            responsibility: resp?.getAttribute("data-financials-responsibility") ?? null,
            responsibilityText: (resp as HTMLElement | null)?.innerText?.trim().replace(/\s+/g, " ") ?? null,
            title: (resp as HTMLElement | null)?.getAttribute("title") ?? null,
            actions: Array.from(r.querySelectorAll("[data-financials-row-action]")).map((a) => a.getAttribute("data-financials-row-action")),
            cells: Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9),
        });
    });
    return out;
});

test("S7 · partial disclosure and household responsibility", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (!res.url().includes("/api/admin/actions/execute")) return;
        try { wire.push({ request: JSON.parse(res.request().postData() ?? "null"), response: await res.json() }); } catch { /* noop */ }
        writeFileSync(`${OUT}/s7-wire.json`, JSON.stringify(wire, null, 2));
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    const rows = await ledger(page);
    writeFileSync(`${OUT}/s7-ledger.json`, JSON.stringify(rows, null, 2));

    // §7A — the partially allocated obligation must no longer read as fully owned.
    const partial = rows.find((r) => r.chargeId === RESOLVED);
    log(`PARTIAL ROW: ${JSON.stringify(partial)}`);
    rec("7A", "a partially allocated obligation is marked PARTIAL and shows the unowned remainder",
        partial?.responsibility === "partial" && /unassigned/i.test(String(partial?.responsibilityText)),
        `state=${partial?.responsibility} text="${partial?.responsibilityText}" title="${partial?.title}"`);
    await page.screenshot({ path: `${OUT}/s7-partial.png` });

    // §7B — the household obligation can now be resolved at all.
    const hh = rows.find((r) => r.chargeId === HOUSEHOLD);
    log(`HOUSEHOLD ROW: ${JSON.stringify(hh)}`);
    rec("7B-1", "the household obligation offers Resolve", (hh?.actions as string[])?.includes("resolveResponsibility"),
        `child="${(hh?.cells as string[])?.[2]}" actions=${JSON.stringify(hh?.actions)}`);
    if ((hh?.actions as string[])?.includes("resolveResponsibility")) {
        await page.locator(`[data-financials-row-action="resolveResponsibility"][data-charge-id="${HOUSEHOLD}"]`).first().click();
        await page.waitForTimeout(4000);
        await page.getByTestId("responsibility-preview-button").click();
        await page.waitForTimeout(7000);
        await page.getByTestId("responsibility-confirm").click();
        await page.waitForTimeout(12_000);
        const after = await page.evaluate(() => ({
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            error: (document.querySelector('[data-testid="responsibility-error"]') as HTMLElement | null)?.innerText ?? null,
        }));
        const rr = wire.filter((w) => JSON.stringify(w.request).includes("resolve_responsibility") && (w.request as { mode?: string })?.mode === "execute");
        log(`HOUSEHOLD RESOLVE: ${JSON.stringify((rr[rr.length - 1] as { response?: unknown })?.response).slice(0, 420)}`);
        log(`shell after: ${JSON.stringify(after)}`);
        rec("7B-2", "the household obligation is no longer refused as un-allocatable",
            !/enrolment-backed/i.test(String(after.error)), `error=${after.error}`);
        if (after.overlay !== "detail") { await page.getByTestId("responsibility-cancel").click().catch(() => undefined); await page.waitForTimeout(2000); }
    }
    writeFileSync(`${OUT}/s7-findings.json`, JSON.stringify(F, null, 2));
});

test("S7 · inert policy types are no longer offered", async ({ page }) => {
    await page.goto("/settings/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    const text = await page.evaluate(() => document.body.innerText || "");
    const resolved = text.slice(text.indexOf("Resolved (org default)"), text.indexOf("Resolved (org default)") + 700);
    log(`RESOLVED PANEL:\n${resolved.replace(/\n+/g, " / ")}`);
    const inert = ["Late fee", "NSF fee", "Refund policy", "Deposit"].filter((t) => resolved.includes(t));
    const active = ["Proration", "Billing cadence", "Posting review", "Due date", "Vacation credit", "Grace period"].filter((t) => resolved.includes(t));
    rec("7F", "the four inert types are withdrawn and the consuming six remain",
        inert.length === 0 && active.length >= 5, `inertStillShown=${JSON.stringify(inert)} active=${JSON.stringify(active)}`);
    await page.screenshot({ path: `${OUT}/s7-policies.png` });
    writeFileSync(`${OUT}/s7-findings.json`, JSON.stringify(F, null, 2));
});
