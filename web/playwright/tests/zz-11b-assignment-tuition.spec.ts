/**
 * 11B §2 — the BEFORE state of Assignment Tuition, measured on the mounted product.
 *
 * Claim under test: selecting a tuition option in the Assignment surface and saving does NOT
 * establish a canonical accepted term. Read-back goes through the product's own canonical path
 * (`/api/admin/financial-config/opportunity/<id>` → `assignments[].accepted`), which is the same
 * `buildAssignmentTuitionView` that AssignmentTuitionCard and recurring generation consume — so a
 * difference here is a difference the whole platform would see.
 *
 * NAVIGATION, measured not guessed: the work unit opens the HOUSEHOLD panel (six cards, no
 * scheduling). The children card's ROW ACTION opens the child's own panel, which is where
 * `scheduling` — and the Tuition section inside it — actually lives.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("assignment tuition before-state", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const artifact: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/assignment-tuition-before.json`, JSON.stringify(artifact, null, 2));
    const reqs: Array<{ call: string; status?: number; body?: unknown }> = [];
    let opportunityId = "";
    page.on("request", (r) => {
        const u = r.url().replace(/^https?:\/\/[^/]+/, "");
        if (!/assignment-quote|financial-config|scheduling|actions\/|pricing/.test(u)) return;
        reqs.push({ call: `${r.method()} ${u}` });
        const m = /financial-config\/opportunity\/([0-9a-f-]{36})/.exec(u);
        if (m) opportunityId = m[1];
    });
    page.on("response", async (res) => {
        const u = res.url().replace(/^https?:\/\/[^/]+/, "");
        if (!/assignment-quote/.test(u)) return;
        reqs.push({ call: `RESPONSE ${u}`, status: res.status(), body: await res.json().catch(() => null) });
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    await page.getByRole("button", { name: /^custom/ }).first().click();
    await page.waitForTimeout(13_000);

    const readTerms = async () =>
        page.evaluate(async (oid) => {
            if (!oid) return { status: 0 };
            const r = await fetch(`/api/admin/financial-config/opportunity/${oid}`, { credentials: "include" });
            if (!r.ok) return { status: r.status };
            const b = (await r.json()) as { assignments?: Array<Record<string, unknown>> };
            return {
                status: r.status,
                assignments: (b.assignments ?? []).map((v) => ({
                    child: v.childLabel,
                    ocm: v.opportunityCustomerMemberId,
                    state: v.state,
                    recommended: (v.recommended as { amountLabel?: string } | null)?.amountLabel ?? null,
                    applicable: (v.applicable as Array<{ amountLabel?: string }> | undefined)?.map((o) => o.amountLabel) ?? null,
                    accepted: v.accepted,
                    acceptedIsStale: v.acceptedIsStale,
                })),
            };
        }, opportunityId);

    const state = await page.evaluate(() => {
        const s = document.querySelector("select[data-assignment-tuition-embed='true']") as HTMLSelectElement | null;
        return {
            selectPresent: Boolean(s),
            pricedChild: s?.getAttribute("data-assignment-tuition-plan") ?? null,
            tag: s?.tagName ?? null,
            /* Not `s.options` — read the option elements directly, so a wrapper cannot break the probe. */
            options: s
                ? Array.from(s.querySelectorAll("option")).map((o) => ({
                      value: (o as HTMLOptionElement).value,
                      text: (o as HTMLOptionElement).textContent?.trim() ?? "",
                  }))
                : [],
            selected: s?.value ?? null,
            cards: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
        };
    });
    log(`select=${state.selectPresent} pricedChild=${state.pricedChild}`);
    log(`OPTIONS: ${JSON.stringify(state.options, null, 1)}`);
    log(`CARDS: ${JSON.stringify(state.cards)}`);
    log(`opportunityId: ${opportunityId || "(none)"}`);

    const before = await readTerms();
    log(`\nBEFORE:\n${JSON.stringify(before, null, 1)}`);

    // Select the recommended option and save the assignment, exactly as an operator would.
    let saved = "not attempted";
    if (state.options.length > 1) {
        /*
         * A new schedule will not commit without days and a start, so the tuition selection alone
         * can never be saved. Complete the form the way an operator would, then save.
         */
        for (const wd of [1, 3, 5]) {
            const pill = page.locator(`button[data-day="${wd}"]`).first();
            if (await pill.count()) await pill.click().catch(() => {});
        }
        const startInput = page.locator('input[type="date"]').first();
        if (await startInput.count()) await startInput.fill("2026-10-05").catch(() => {});
        await page.waitForTimeout(1200);
        // A room is required before the assignment commits; the picker is its own sub-surface.
        const roomBtn = page.locator("[data-room-change]").first();
        if (await roomBtn.count()) {
            await roomBtn.click().catch(() => {});
            await page.waitForTimeout(9000);
            const opt = page.locator("[data-room-option]:not([disabled])").first();
            log(`room options: ${await page.locator("[data-room-option]").count()} · enabled: ${await opt.count()}`);
            if (await opt.count()) { await opt.click().catch(() => {}); await page.waitForTimeout(6000); }
        }
        await page.selectOption("select[data-assignment-tuition-embed='true']", state.options[1].value).catch((e) => log(`select failed: ${e}`));
        await page.waitForTimeout(1500);
        const commit = page.locator("[data-schedule-commit]").first();
        const enabled = (await commit.count()) ? await commit.isEnabled() : false;
        log(`commit present=${await commit.count()} enabled=${enabled}`);
        if (enabled) { await commit.click(); await page.waitForTimeout(14_000); saved = "clicked"; }
        else saved = `commit disabled — ${await page.locator("[data-schedule-surface]").first().innerText().catch(() => "")}`.slice(0, 300);
    }
    log(`save: ${saved}`);

    const after = await readTerms();
    log(`\nAFTER:\n${JSON.stringify(after, null, 1)}`);
    log(`\nREQUESTS:\n${reqs.map((r) => r.call).join("\n")}`);
    const quote = reqs.find((r) => r.call.startsWith("RESPONSE"));
    log(`\nQUOTE RESPONSE: ${JSON.stringify(quote?.body ?? null).slice(0, 700)}`);
    await page.screenshot({ path: `${OUT}/assignment-tuition-before.png`, fullPage: true });
    Object.assign(artifact, { state, opportunityId, before, saved, after, requests: reqs });
    flush();

    /* THE CLAIM: the save moved no canonical truth. */
    const term = (r: typeof before) =>
        (r as { assignments?: Array<{ child: string; accepted: { termId?: string; acceptedAt?: string } | null }> })
            .assignments?.map((a) => `${a.child}: ${a.accepted?.termId ?? "none"} @ ${a.accepted?.acceptedAt ?? "-"}`) ?? [];
    log(`\nACCEPTED TERM BEFORE: ${JSON.stringify(term(before))}`);
    log(`ACCEPTED TERM AFTER:  ${JSON.stringify(term(after))}`);
    log(`UNCHANGED BY THE SAVE: ${JSON.stringify(term(before)) === JSON.stringify(term(after))}`);
});
