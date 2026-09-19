/**
 * §3/§5/§6 — accept weekly and monthly terms THROUGH THE MOUNTED CARD.
 *
 * Not through the action API directly: the whole point of v161 and the grain repair was that an
 * operator can reach this. So the gesture is the operator's — click Accept on each assignment — and
 * the action request and response are captured off the wire rather than asserted from the UI.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(420_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const OCM_A = "79f8011d-a236-4054-bee7-af10f1dbc632"; // Certa — weekly
const OCM_B = "cf044308-3ee4-47ab-a8fb-205eb172aa48"; // Certb — monthly

test("accept both, from the panel", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    const wire: Array<Record<string, unknown>> = [];
    page.on("request", (r) => {
        if (r.url().includes("/api/admin/actions/execute")) {
            try { wire.push({ dir: "request", body: JSON.parse(r.postData() ?? "{}") }); } catch { /* noop */ }
        }
    });
    page.on("response", async (res) => {
        if (!res.url().includes("/api/admin/actions/execute")) return;
        try { wire.push({ dir: "response", status: res.status(), body: await res.json() }); } catch { /* noop */ }
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(20_000);

    const before = await page.evaluate(() => ({
        mounted: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
        tuitionCount: document.querySelector("[data-assignment-tuition]")?.getAttribute("data-tuition-count") ?? null,
        assignments: Array.from(document.querySelectorAll("[data-tuition-assignment]")).map((e) => ({
            ocm: e.getAttribute("data-tuition-assignment"),
            member: e.getAttribute("data-tuition-member"),
            state: e.getAttribute("data-tuition-state"),
            accepted: e.getAttribute("data-tuition-accepted"),
            resolution: e.getAttribute("data-tuition-resolution"),
            child: (e.querySelector(".alloy-os-tuition__child") as HTMLElement | null)?.innerText ?? null,
            amount: (e.querySelector("[data-tuition-amount]") as HTMLElement | null)?.innerText ?? null,
            facts: Array.from(e.querySelectorAll("[data-tuition-fact]")).map((f) => (f as HTMLElement).innerText),
            why: Array.from(e.querySelectorAll("[data-tuition-explanation] li")).map((f) => (f as HTMLElement).innerText),
            controls: Array.from(e.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.trim()),
        })),
        text: (document.querySelector('[data-universal-card-key="assignment_tuition"]') as HTMLElement | null)?.innerText?.slice(0, 1500) ?? null,
    }));
    await page.screenshot({ path: `${OUT}/accept-before.png`, fullPage: true });
    log(`mounted: ${JSON.stringify(before.mounted)}`);
    log(`tuitionCount=${before.tuitionCount}`);
    log(`assignments before:\n${JSON.stringify(before.assignments, null, 1).slice(0, 2500)}`);

    expect(before.mounted, "the tuition card is mounted").toContain("assignment_tuition");

    for (const [label, ocm] of [["A · Certa · weekly", OCM_A], ["B · Certb · monthly", OCM_B]] as const) {
        const btn = page.locator(`[data-tuition-accept-assignment="${ocm}"]`);
        const n = await btn.count();
        log(`\n${label}: accept control count = ${n}`);
        if (!n) continue;
        await btn.first().click();
        await page.waitForTimeout(9000);
    }

    await page.waitForTimeout(4000);
    const after = await page.evaluate(() => ({
        assignments: Array.from(document.querySelectorAll("[data-tuition-assignment]")).map((e) => ({
            ocm: e.getAttribute("data-tuition-assignment"),
            state: e.getAttribute("data-tuition-state"),
            accepted: e.getAttribute("data-tuition-accepted"),
            stale: e.getAttribute("data-tuition-stale"),
            term: e.querySelector("[data-tuition-accepted-term]")?.getAttribute("data-tuition-accepted-term") ?? null,
            acceptedAmount: (e.querySelector("[data-tuition-accepted-amount]") as HTMLElement | null)?.innerText ?? null,
            acceptedLine: (e.querySelector(".alloy-os-tuition__accepted-line") as HTMLElement | null)?.innerText ?? null,
        })),
        error: (document.querySelector("[data-tuition-error]") as HTMLElement | null)?.innerText ?? null,
        text: (document.querySelector('[data-universal-card-key="assignment_tuition"]') as HTMLElement | null)?.innerText?.slice(0, 1500) ?? null,
    }));
    await page.screenshot({ path: `${OUT}/accept-after.png`, fullPage: true });

    writeFileSync(`${OUT}/accept.json`, JSON.stringify({ before, wire, after }, null, 2));
    log(`\n=== WIRE ===\n${JSON.stringify(wire, null, 1).slice(0, 4000)}`);
    log(`\n=== AFTER ===\n${JSON.stringify(after, null, 1).slice(0, 2500)}`);
});
