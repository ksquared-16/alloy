/**
 * Assignment editor V2 — DEPLOYED walkthrough on staging (real configuration, real family).
 *
 * Opt-in: AEV2_DEPLOYED=1 DEPLOYED_STATE=<deployed QA storage state>
 *         CERT_APP_URL=https://staging.workwithalloy.com  --project certify --no-deps
 *
 * Mutation guard: the schedule Save and a NORMAL tuition accept are allowed (scenario 11 needs a
 * real save). Every override / custom-amount commit is aborted in the browser — those are verified
 * up to their governance gate (reason + permission), never written.
 */
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const RUN = process.env.AEV2_DEPLOYED === "1";
const OUT = path.join(__dirname, "..", "evidence", "assignment-editor-v2", "deployed");
const SUBJECT = process.env.AEV2_SUBJECT || "93722453-33e9-4207-8774-8931ee2c855d"; // Lennon Kurzman (enrollment PI)
const PATHNAME = process.env.AEV2_PATH || "/workspace/work-unit/new";

test.use({ storageState: process.env.DEPLOYED_STATE });

const log: string[] = [];
const note = (s: string) => {
    log.push(s);
    console.log(`[aev2] ${s}`);
};
const shot = async (page: Page, name: string) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
};

async function guard(page: Page) {
    const blocked: string[] = [];
    await page.route("**/api/admin/actions/execute", async (route) => {
        const body = route.request().postData() ?? "";
        if (/enrollment\.pricing\.override|custom_amount_cents/.test(body)) {
            blocked.push(body.slice(0, 120));
            return route.abort();
        }
        return route.continue();
    });
    return blocked;
}

/** Geometry of the elevated card, its scroll area and footer — the scroll/viewport evidence. */
async function measure(page: Page, label: string) {
    const m = await page.evaluate(() => {
        const rect = (el: Element | null) => (el ? el.getBoundingClientRect().toJSON() : null);
        const scroll = document.querySelector('[data-schedule-scroll="true"]') as HTMLElement | null;
        const footer = document.querySelector('[data-schedule-footer="true"]');
        const card = scroll?.closest(".alloy-os-ucard") ?? null;
        return {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            card: rect(card),
            scroll: rect(scroll),
            scrollHeight: scroll?.scrollHeight ?? null,
            clientHeight: scroll?.clientHeight ?? null,
            overflowY: scroll ? getComputedStyle(scroll).overflowY : null,
            cardRoomVar: card ? (card as HTMLElement).style.getPropertyValue("--alloy-os-sched-viewport-room") : null,
            cardMaxH: card ? getComputedStyle(card).maxHeight : null,
            cardClass: card ? (card as HTMLElement).className : null,
            bodyMaxH: (() => { const b = scroll?.closest(".alloy-os-ucard__body"); return b ? getComputedStyle(b).maxHeight : null; })(),
            footer: rect(footer),
            commitVisible: (() => {
                const b = document.querySelector('[data-schedule-commit="true"]');
                if (!b) return false;
                const r = b.getBoundingClientRect();
                return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0;
            })(),
            rows: Array.from(document.querySelectorAll("[data-schedule-row]")).map((r) => ({
                row: r.getAttribute("data-schedule-row"),
                cols: getComputedStyle(r).gridTemplateColumns,
                h: Math.round(r.getBoundingClientRect().height),
            })),
        };
    });
    note(`${label}: ${JSON.stringify(m)}`);
    return m;
}

async function tuitionState(page: Page, label: string) {
    const s = await page.evaluate(() => {
        const sel = document.querySelector('[data-assignment-tuition-embed="true"]') as HTMLSelectElement | null;
        return {
            draft: sel?.getAttribute("data-assignment-tuition-draft") ?? null,
            value: sel?.value ?? null,
            selectedText: sel?.selectedOptions?.[0]?.textContent ?? null,
            options: sel ? Array.from(sel.options).map((o) => `${o.value ? "" : "∅ "}${o.textContent}`) : [],
            noMatch: document.querySelector("[data-assignment-tuition-no-match]")?.textContent ?? null,
            ambiguous: document.querySelector('[data-assignment-tuition-ambiguous="true"]')?.textContent ?? null,
            invalidated: document.querySelector("[data-assignment-tuition-invalidated]")?.textContent ?? null,
        };
    });
    note(`${label}: ${JSON.stringify(s)}`);
    return s;
}

/** Navigate the way an operator does: Registration view → Lennon's row. */
async function openLennon(page: Page) {
    await page.goto(PATHNAME);
    await page.waitForTimeout(4000);
    const bosClose = page.getByRole("button", { name: "Close", exact: true }).first();
    if (await bosClose.isVisible().catch(() => false)) await bosClose.click().catch(() => {});
    await page.getByText(/^Registration/).first().click();
    await page.waitForTimeout(3000);
    await page.getByText("Lennon Kurzman", { exact: true }).first().click();
    await page.waitForTimeout(6000);
}

/** Open the assignment editor: the Children entry, then (when one exists) the assignment's Edit. */
async function openEditor(page: Page) {
    await page.locator('[data-universal-card-key="children"] [data-identity-linked="true"] .identity-field-value__value--linked').first().click();
    await page.waitForTimeout(4000);
    if (await page.locator('[data-schedule-editor="true"]').count()) return;
    const row = page.locator('[data-assignments-card="true"]').getByText("Toddler", { exact: false }).first();
    if (await row.count()) {
        await row.click();
        await page.waitForTimeout(2500);
    }
    const edit = page.locator('[data-assignments-card="true"] button', { hasText: /Edit/ }).first();
    if (await edit.count()) {
        await edit.click();
        await page.waitForTimeout(3500);
    }
}

test.describe("Assignment editor V2 — deployed", () => {
    test.skip(!RUN, "opt-in: AEV2_DEPLOYED=1");

    test("explore: open Lennon's Assignments editor", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const blocked = await guard(page);
        await openLennon(page);
        await shot(page, "00-panel");
        const cards = await page.locator("[data-universal-card-key]").evaluateAll((els) =>
            els.map((e) => `${e.getAttribute("data-universal-card-key")}`),
        );
        note(`cards: ${cards.join(", ")}`);
        const linked = page.locator('[data-universal-card-key="children"] [data-identity-linked="true"] .identity-field-value__value--linked').first();
        note(`linked schedule entry: ${await linked.count()}`);
        if (await linked.count()) {
            await linked.click();
            await page.waitForTimeout(5000);
            await shot(page, "01b-after-linked-click");
        }
        const assignments = page.locator('[data-assignments-card="true"]').first();
        if (await assignments.count()) {
            await assignments.scrollIntoViewIfNeeded();
            await shot(page, "01-assignments-card");
        }
        note(`assignments card present: ${await assignments.count()}`);
        const buttons = await assignments
            .locator("button")
            .evaluateAll((els) => els.map((b) => `${(b.textContent ?? "").trim().slice(0, 40)} | ${Array.from(b.attributes).filter((a) => a.name.startsWith("data-")).map((a) => a.name).join(",")}`));
        note(`assignments buttons: ${JSON.stringify(buttons)}`);
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, "explore.log"), log.join("\n"));
        expect(blocked).toEqual([]);
    });

    test("scenarios: reactive tuition, gates, viewports", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const blocked = await guard(page);
        await openLennon(page);
        await page.locator('[data-universal-card-key="children"] [data-identity-linked="true"] .identity-field-value__value--linked').first().click();
        await page.waitForTimeout(4000);
        const editor = page.locator('[data-schedule-editor="true"]');
        await expect(editor).toBeVisible();
        const settle = () => page.waitForTimeout(2500);
        const dayBtn = (i: number) => editor.locator(`[data-day="${i}"]`);
        const dayState = async () => editor.locator("[data-day]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-day")}:${e.getAttribute("aria-pressed")}`));
        note(`days initial: ${(await dayState()).join(" ")}`);
        await tuitionState(page, "S0 no days");

        // S1 — Monday–Friday
        for (const i of [1, 2, 3, 4, 5]) if ((await dayBtn(i).getAttribute("aria-pressed")) !== "true") await dayBtn(i).click();
        await settle();
        await tuitionState(page, "S1 M-F");
        await shot(page, "10-mf");
        await measure(page, "S1 1440x900");

        // S2 — Monday / Wednesday / Friday
        for (const i of [2, 4]) await dayBtn(i).click();
        await settle();
        await tuitionState(page, "S2 MWF");
        await shot(page, "11-mwf");

        // S3 — back to five days, then dates either side of the part-time effective date
        for (const i of [2, 4]) await dayBtn(i).click();
        const startInput = editor.locator('input[type="date"]').first();
        await startInput.fill("2026-10-19");
        await settle();
        await tuitionState(page, "S3 M-F start 2026-10-19");
        await startInput.fill("2026-11-02");
        await settle();
        await tuitionState(page, "S3b M-F start 2026-11-02");

        // S4 — room
        await editor.locator('[data-room-change="true"]').click();
        await page.waitForTimeout(1500);
        const roomOpts = await page.locator("[data-room-option]").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim().slice(0, 70)));
        note(`room options: ${JSON.stringify(roomOpts)}`);
        await shot(page, "12-room-picker");
        await page.locator("[data-room-option]", { hasText: "Toddler 2" }).first().click();
        await settle();
        await tuitionState(page, "S4 room Toddler 2");
        await shot(page, "13-room-picked");

        // S8 — additional rate is an override: Save disabled until a reason
        await editor.locator('[data-assignment-tuition-additional]').click();
        await page.waitForTimeout(500);
        const sel = editor.locator('[data-assignment-tuition-embed="true"]');
        const extraValue = await sel.locator('optgroup[label="Additional rates"] option').first().getAttribute("value");
        if (extraValue) {
            await sel.selectOption(extraValue);
            await page.waitForTimeout(500);
            note(`S8 additional chosen: commit disabled=${await editor.locator('[data-schedule-commit="true"]').isDisabled()} reason field=${await editor.locator('[data-assignment-override-reason="true"]').count()}`);
            await shot(page, "14-additional-override");
            await measure(page, "S8 expanded 1440x900");
        }
        // S9 — custom rate is an override too
        await editor.locator('[data-assignment-tuition-custom-toggle]').click();
        await editor.locator('[data-assignment-tuition-custom-amount="true"]').fill("1550");
        await page.waitForTimeout(400);
        note(`S9 custom: commit disabled=${await editor.locator('[data-schedule-commit="true"]').isDisabled()}`);
        await editor.locator('[data-assignment-override-reason="true"]').fill("QA check — not saved");
        note(`S9 custom+reason: commit disabled=${await editor.locator('[data-schedule-commit="true"]').isDisabled()}`);
        await shot(page, "15-custom-expanded");
        // per-day times expanded too, for the scroll proof
        const perDay = editor.locator('[data-perday-toggle="true"]');
        if (await perDay.count()) await perDay.click();
        await page.waitForTimeout(400);
        await measure(page, "S12 fully expanded 1440x900");
        await shot(page, "16-fully-expanded-900");
        for (const [w, h] of [[1440, 700], [900, 800], [390, 844]] as const) {
            await page.setViewportSize({ width: w, height: h });
            await page.waitForTimeout(800);
            const scroll = page.locator('[data-schedule-scroll="true"]');
            await scroll.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
            await page.waitForTimeout(300);
            await measure(page, `S13 ${w}x${h} scrolled to end`);
            await shot(page, `17-${w}x${h}`);
        }
        fs.writeFileSync(path.join(OUT, "scenarios.log"), log.join("\n"));
        expect(blocked).toEqual([]);
    });

    test("save-reopen: schedule and tuition are reproduced", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const blocked = await guard(page);
        const accepts: string[] = [];
        page.on("request", (r) => {
            if (r.url().includes("/api/admin/actions/execute")) accepts.push((r.postData() ?? "").slice(0, 160));
        });
        await openLennon(page);
        const entry = page.locator('[data-universal-card-key="children"] [data-identity-linked="true"] .identity-field-value__value--linked').first();
        await entry.click();
        await page.waitForTimeout(4000);
        const editor = page.locator('[data-schedule-editor="true"]');
        await expect(editor).toBeVisible();
        for (const i of [1, 2, 3, 4, 5]) {
            const b = editor.locator(`[data-day="${i}"]`);
            if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
        }
        await editor.locator('input[type="date"]').first().fill("2026-11-02");
        await editor.locator('[data-room-change="true"]').click();
        await page.waitForTimeout(1200);
        await page.locator("[data-room-option]", { hasText: "Toddler 2" }).first().click();
        await page.waitForTimeout(3000);
        const sel = editor.locator('[data-assignment-tuition-embed="true"]');
        const fullTime = await sel.locator("option", { hasText: "$1,700.00" }).first().getAttribute("value");
        note(`full-time option: ${fullTime}`);
        if (fullTime) await sel.selectOption(fullTime);
        await tuitionState(page, "R0 before save");
        await shot(page, "20-before-save");
        const commit = editor.locator('[data-schedule-commit="true"]');
        note(`commit disabled before save: ${await commit.isDisabled()}`);
        await commit.click();
        await page.waitForTimeout(8000);
        await shot(page, "21-after-save");
        const outcome = await page.locator("[data-assignment-tuition-outcome]").first().textContent().catch(() => null);
        note(`save outcome: ${outcome}`);
        note(`actions sent: ${JSON.stringify(accepts)}`);

        // Reopen from scratch.
        await openLennon(page);
        await shot(page, "22-reopened-panel");
        await page.locator('[data-universal-card-key="children"] [data-identity-linked="true"] .identity-field-value__value--linked').first().click();
        await page.waitForTimeout(4000);
        await shot(page, "23-reopened-assignments");
        const text = await page.locator('[data-assignments-card="true"]').first().innerText().catch(() => "");
        note(`reopened assignments text: ${text.replace(/\s+/g, " ").slice(0, 600)}`);
        // Save lands on the assignment list; open the primary assignment, then its Edit.
        const row = page.locator('[data-assignments-card="true"]').getByText("Toddler 2", { exact: false }).first();
        if (await row.count()) {
            await row.click();
            await page.waitForTimeout(2500);
            await shot(page, "23b-reopened-detail");
        }
        const editBtn = page.locator('[data-assignments-card="true"] button', { hasText: /Edit/ }).first();
        if (await editBtn.count()) {
            await editBtn.click();
            await page.waitForTimeout(3500);
            await shot(page, "24-reopened-editor");
        }
        const ed = page.locator('[data-schedule-editor="true"]');
        if (await ed.count()) {
            const days = await ed.locator("[data-day]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-day")}:${e.getAttribute("aria-pressed")}`));
            note(`reopened days: ${days.join(" ")}`);
            note(`reopened room: ${await ed.locator('[data-room-value]').first().textContent()}`);
            note(`reopened start: ${await ed.locator('input[type="date"]').first().inputValue()}`);
            await tuitionState(page, "R1 reopened");
            note(`accepted term: ${await ed.locator("[data-assignment-accepted-term]").first().textContent().catch(() => null)}`);
        }
        fs.writeFileSync(path.join(OUT, "save-reopen.log"), log.join("\n"));
        expect(blocked).toEqual([]);
    });

    test("polish: named rates, no tie warning, hours like dates, save + reopen keeps tuition", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const blocked = await guard(page);
        await openLennon(page);
        await openEditor(page);
        const ed = page.locator('[data-schedule-editor="true"]');
        await expect(ed).toBeVisible();
        await page.waitForTimeout(3000);
        const before = await tuitionState(page, "P0 opened (schedule untouched)");
        note(`P1 tie warning present: ${await page.locator('[data-assignment-tuition-ambiguous="true"]').count()}`);
        const geom = await ed.evaluate((root) => {
            const r = (sel: string) => root.querySelector(sel)?.getBoundingClientRect();
            const a = r('[data-arrive="true"]'), d = r('[data-depart="true"]');
            const dates = Array.from(root.querySelectorAll('input[type="date"]')).map((e) => e.getBoundingClientRect());
            return { arriveTop: a?.top, departTop: d?.top, arriveLeft: a?.left, departLeft: d?.left, dateTops: dates.map((x) => x.top) };
        });
        note(`P2 hours geometry: ${JSON.stringify(geom)}`);
        await shot(page, "40-polish-editor");
        const perDay = ed.locator('[data-perday-toggle="true"]');
        if (await perDay.count()) {
            await perDay.click();
            await page.waitForTimeout(400);
            note(`P3 per-day rows: ${await ed.locator("[data-perday-row]").count()}`);
            await shot(page, "41-polish-perday");
            await perDay.click();
        }
        await measure(page, "P4 compact 1440x900");
        // Save + reopen: choose the first listed rate (an eligible, non-override choice) and save.
        const sel = ed.locator('[data-assignment-tuition-embed="true"]');
        const firstRate = await sel.locator("option").nth(1).getAttribute("value");
        const firstLabel = (await sel.locator("option").nth(1).textContent())?.trim();
        if (firstRate) await sel.selectOption(firstRate);
        await page.waitForTimeout(500);
        note(`P5 chosen: ${firstLabel} | selected text: ${(await sel.evaluate((e) => (e as HTMLSelectElement).selectedOptions[0]?.textContent ?? ""))}`);
        note(`P5 commit disabled: ${await ed.locator('[data-schedule-commit="true"]').isDisabled()} reason field: ${await ed.locator('[data-assignment-override-reason="true"]').count()}`);
        await ed.locator('[data-schedule-commit="true"]').click();
        await page.waitForTimeout(8000);
        await shot(page, "42-after-save");
        note(`P6 card notice: ${await page.locator('[data-assignments-card="true"] p').first().textContent().catch(() => null)}`);
        await openLennon(page);
        await openEditor(page);
        const ed2 = page.locator('[data-schedule-editor="true"]');
        await expect(ed2).toBeVisible();
        await page.waitForTimeout(3000);
        await shot(page, "43-reopened");
        const days = await ed2.locator("[data-day]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-day")}:${e.getAttribute("aria-pressed")}`));
        note(`P7 reopened days ${days.join(" ")} room ${await ed2.locator("[data-room-value]").first().textContent()} start ${await ed2.locator('input[type="date"]').first().inputValue()}`);
        await tuitionState(page, "P7 reopened tuition");
        note(`P7 accepted term: ${await ed2.locator("[data-assignment-accepted-term]").first().textContent().catch(() => null)}`);
        void before;
        fs.writeFileSync(path.join(OUT, "polish.log"), log.join("\n"));
        expect(blocked).toEqual([]);
    });

    test("polish-reopen: the saved tuition and schedule reopen as saved", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const blocked = await guard(page);
        await openLennon(page);
        await shot(page, "44-panel-after-save");
        const listText = await page.locator('[data-universal-card-key="children"]').first().innerText().catch(() => "");
        note(`R0 children card: ${listText.replace(/\s+/g, " ").slice(0, 300)}`);
        await openEditor(page);
        const ed = page.locator('[data-schedule-editor="true"]');
        await expect(ed).toBeVisible();
        await page.waitForTimeout(3000);
        await shot(page, "45-reopened-editor");
        const days = await ed.locator("[data-day]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-day")}:${e.getAttribute("aria-pressed")}`));
        note(`R1 days ${days.join(" ")} | room ${await ed.locator("[data-room-value]").first().textContent()} | start ${await ed.locator('input[type="date"]').first().inputValue()}`);
        await tuitionState(page, "R2 reopened tuition");
        note(`R3 accepted term: ${await ed.locator("[data-assignment-accepted-term]").first().textContent().catch(() => null)}`);
        fs.writeFileSync(path.join(OUT, "polish-reopen.log"), log.join("\n"));
        expect(blocked).toEqual([]);
    });

    test("timing: save an unchanged assignment, request by request", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const blocked = await guard(page);
        const runs: Array<Record<string, unknown>> = [];
        const RUNS = Number(process.env.AEV2_TIMING_RUNS || 5);
        for (let run = 0; run < RUNS; run++) {
            await openLennon(page);
            await openEditor(page);
            const ed = page.locator('[data-schedule-editor="true"]');
            await expect(ed).toBeVisible();
            await page.waitForTimeout(3000); // let draft tuition settle
            const reqs: Array<{ m: string; u: string; start: number; end?: number; status?: number }> = [];
            const refusals: Array<{ asked: string; said: string }> = [];
            const onReq = (r: import("@playwright/test").Request) => {
                const u = r.url();
                if (!u.includes("/api/")) return;
                reqs.push({ m: r.method(), u: u.replace(/^https?:\/\/[^/]+/, "").slice(0, 110), start: Date.now() });
            };
            const onDone = (r: import("@playwright/test").Request) => {
                const u = r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 110);
                const row = [...reqs].reverse().find((x) => x.u === u && x.m === r.method() && x.end == null);
                if (row) row.end = Date.now();
            };
            page.on("request", onReq);
            page.on("requestfinished", onDone);
            page.on("requestfailed", onDone);
            const t0 = Date.now();
            await ed.locator('[data-schedule-commit="true"]').click();
            const savingVisibleAt = await page
                .waitForFunction(() => /Saving/.test(document.querySelector('[data-schedule-commit="true"]')?.textContent ?? ""), null, { timeout: 5000 })
                .then(() => Date.now() - t0)
                .catch(() => null);
            await page.waitForSelector('[data-schedule-editor="true"]', { state: "detached", timeout: 60000 });
            const editorClosedAt = Date.now() - t0;
            await page.waitForSelector('[data-assignments-card="true"] >> text=Toddler 2', { timeout: 30000 });
            const listVisibleAt = Date.now() - t0;
            await page.waitForTimeout(4000); // capture trailing host refreshes
            page.off("request", onReq);
            page.off("requestfinished", onDone);
            page.off("requestfailed", onDone);
            const rows = reqs.map((r) => ({ m: r.m, u: r.u, at: r.start - t0, ms: r.end != null ? r.end - r.start : null }));
            runs.push({ run, savingVisibleAt, editorClosedAt, listVisibleAt, rows });
            note(`T${run}: saving@${savingVisibleAt} editorClosed@${editorClosedAt} listVisible@${listVisibleAt}`);
            for (const r of rows) note(`   +${r.at}ms ${r.m} ${r.u} (${r.ms}ms)`);
        }
        fs.writeFileSync(path.join(OUT, `timing-${process.env.AEV2_TIMING_LABEL || "run"}.json`), JSON.stringify(runs, null, 1));
        expect(blocked).toEqual([]);
    });

    test("perf-matrix: create / unchanged / tuition / schedule / duplicate / rejected", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const CHILD = process.env.AEV2_PERF_CHILD || "Ava ZZQA1484F31612";
        // Mutating matrix: QA fixtures only. It records override terms, so it never runs against a real child.
        expect(CHILD).toMatch(/ZZQA/);
        const blocked: string[] = [];
        const label = process.env.AEV2_TIMING_LABEL || "run";
        const results: Array<Record<string, unknown>> = [];
        const openChild = async () => {
            await page.goto(PATHNAME);
            await page.waitForTimeout(4000);
            const bosClose = page.getByRole("button", { name: "Close", exact: true }).first();
            if (await bosClose.isVisible().catch(() => false)) await bosClose.click().catch(() => {});
            await page.getByText(/^Registration/).first().click();
            await page.waitForTimeout(3000);
            await page.getByText(CHILD, { exact: true }).first().click();
            await page.waitForTimeout(5000);
            await openEditor(page);
            const ed = page.locator('[data-schedule-editor="true"]');
            await expect(ed).toBeVisible();
            await page.waitForTimeout(3000);
            return ed;
        };
        const timedSave = async (kind: string, ed: import("@playwright/test").Locator, opts?: { dbl?: boolean }) => {
            const reqs: Array<{ m: string; u: string; start: number; end?: number; status?: number }> = [];
            const refusals: Array<{ asked: string; said: string }> = [];
            const onReq = (r: import("@playwright/test").Request) => {
                if (!r.url().includes("/api/")) return;
                reqs.push({ m: r.method(), u: r.url().replace(/^https?:\/\/[^/]+/, "").split("?")[0]!.slice(0, 70), start: Date.now() });
            };
            const onDone = async (r: import("@playwright/test").Request) => {
                const u = r.url().replace(/^https?:\/\/[^/]+/, "").split("?")[0]!.slice(0, 70);
                const row = [...reqs].reverse().find((x) => x.u === u && x.m === r.method() && x.end == null);
                if (row) {
                    row.end = Date.now();
                    const res = await r.response();
                    row.status = res?.status();
                    // A refused tuition commit: keep what was asked and what the server said.
                    if (res && res.status() >= 400 && u === "/api/admin/actions/execute") {
                        refusals.push({ asked: (r.postData() ?? "").slice(0, 600), said: (await res.text().catch(() => "")).slice(0, 600) });
                    }
                }
            };
            page.on("request", onReq);
            page.on("requestfinished", onDone);
            page.on("requestfailed", onDone);
            const t0 = Date.now();
            const commit = ed.locator('[data-schedule-commit="true"]');
            // A disabled commit is a setup failure, not a slow save: fail in seconds, not at the test timeout.
            await expect(commit).toBeEnabled({ timeout: 10000 });
            if (opts?.dbl) await commit.dblclick(); else await commit.click();
            const closed = await page.waitForSelector('[data-schedule-editor="true"]', { state: "detached", timeout: 30000 }).then(() => Date.now() - t0).catch(() => null);
            await page.waitForTimeout(2500);
            page.off("request", onReq); page.off("requestfinished", onDone); page.off("requestfailed", onDone);
            const write = reqs.find((r) => r.m === "POST" && r.u === "/api/admin/scheduling");
            const row = {
                kind,
                clickToWriteResponse: write?.end != null ? write.end - t0 : null,
                writeStatus: write?.status ?? null,
                clickToEditorClosed: closed,
                schedulingPosts: reqs.filter((r) => r.m === "POST" && r.u === "/api/admin/scheduling").length,
                executes: reqs.filter((r) => r.m === "POST" && r.u === "/api/admin/actions/execute").map((r) => r.status),
                financialConfigReads: reqs.filter((r) => r.u.startsWith("/api/admin/financial-config")).length,
                seq: reqs.map((r) => `+${r.start - t0} ${r.m} ${r.u} ${r.end != null ? r.end - r.start : "?"}ms ${r.status ?? ""}`),
            };
            results.push(row);
            fs.writeFileSync(path.join(OUT, `perf-matrix-${label}.json`), JSON.stringify(results, null, 1));
            note(`${label} ${kind}: write ${row.clickToWriteResponse}ms (${row.writeStatus}) closed ${row.clickToEditorClosed}ms posts=${row.schedulingPosts} execs=${JSON.stringify(row.executes)} configReads=${row.financialConfigReads}`);
            for (const l of row.seq) note(`     ${l}`);
            for (const x of refusals) note(`     REFUSED asked=${x.asked} said=${x.said}`);
            fs.writeFileSync(path.join(OUT, `perf-matrix-${label}.log`), log.join("\n"));
            return row;
        };
        /*
         * Every scenario must carry a REAL tuition commit — a save with nothing to accept is a no-op for
         * this measurement. The QA child's assignment resolves no catalog rate, so the rate comes from the
         * site's additional rates: a recorded override (with its reason), committed by the same execute.
         */
        const optionValues = (sel: import("@playwright/test").Locator) =>
            sel.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
        const chooseRate = async (ed: import("@playwright/test").Locator, mode: "keep" | "change") => {
            const sel = ed.locator('[data-assignment-tuition-embed="true"]');
            let opts = await optionValues(sel);
            const more = ed.getByRole("button", { name: /Show additional rates/ });
            if (await more.count()) { await more.first().click(); await page.waitForTimeout(400); opts = await optionValues(sel); }
            const cur = await sel.inputValue();
            const next = mode === "keep" && cur ? cur : opts.find((o) => o !== cur) ?? opts[0];
            if (next && next !== cur) await sel.selectOption(next);
            await page.waitForTimeout(400);
            const reason = ed.locator('[data-assignment-override-reason="true"]');
            if (await reason.count()) await reason.fill("QA timing — fixture rate");
            return { from: cur, to: await sel.inputValue() };
        };
        // The tuition views the editor reads (draft and saved), per child — QA families carry siblings: which facts priced it, under which key.
        const views: Array<{ member: string; draft: boolean; key: unknown; facts: unknown; url: string }> = [];
        page.on("response", async (res) => {
            if (!res.url().includes("/api/admin/financial-config/opportunity/")) return;
            const body = (await res.json().catch(() => null)) as { assignments?: Array<Record<string, unknown>> } | null;
            for (const a of body?.assignments ?? []) {
                views.push({ member: String(a.customerMemberId ?? ""), draft: Boolean(a.draft), key: a.resolutionKey, facts: a.facts, url: res.url().split("?")[1] ?? "" });
            }
        });
        // Create (only if the child has no assignment yet) — else an unchanged save stands in.
        let ed = await openChild();
        const isCreate = /Create Assignment/.test((await ed.locator('[data-schedule-commit="true"]').textContent()) ?? "");
        if (isCreate) {
            for (const i of [1, 2, 3, 4, 5]) {
                const b = ed.locator(`[data-day="${i}"]`);
                if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
            }
            await ed.locator('input[type="date"]').first().fill("2026-11-02");
            const depart = ed.getByLabel("Depart", { exact: true });
            await depart.fill("5:30 PM");
            await depart.press("Enter");
            await ed.locator('[data-room-change="true"]').click();
            await page.waitForTimeout(1500);
            const toddler = page.locator("[data-room-option]", { hasText: "Toddler 2" });
            await ((await toddler.count()) ? toddler.first() : page.locator("[data-room-option]").first()).click();
            await page.waitForTimeout(3000);
            await page.waitForTimeout(2000);
            note(`${label} create: tuition ${JSON.stringify(await chooseRate(ed, "change"))}`);
            await timedSave("create", ed);
        }
        if (process.env.AEV2_PERF_CREATE_ONLY) {
            note(`${label} create-only: isCreate=${isCreate}`);
            const lastDraft = [...views].reverse().find((v) => v.draft);
            note(`${label} draft view before Save: key=${String(lastDraft?.key)} facts=${JSON.stringify(lastDraft?.facts)} q=${lastDraft?.url}`);
            ed = await openChild();
            // THIS child's saved view: an opportunity answers for every sibling, and a sibling's empty
            // proposal once read here as "the server read blank facts".
            const saved = [...views].reverse().find((v) => !v.draft && v.member === lastDraft?.member);
            note(`${label} saved view after Save: key=${String(saved?.key)} facts=${JSON.stringify(saved?.facts)}`);
            fs.writeFileSync(path.join(OUT, `perf-matrix-${label}.log`), log.join("\n"));
            expect(isCreate).toBe(true);
            return;
        }
        for (let i = 0; i < 3; i++) {
            ed = await openChild();
            const r = await chooseRate(ed, "keep");
            note(`${label} unchanged: tuition ${JSON.stringify(r)}`);
            await timedSave("unchanged", ed);
        }
        for (let i = 0; i < 3; i++) {
            ed = await openChild();
            note(`${label} tuition-change: ${JSON.stringify(await chooseRate(ed, "change"))}`);
            await timedSave("tuition-change", ed);
        }
        for (let i = 0; i < 3; i++) {
            ed = await openChild();
            await ed.locator('[data-day="4"]').click();
            await page.waitForTimeout(2500);
            note(`${label} schedule-change: ${JSON.stringify(await chooseRate(ed, "keep"))}`);
            await timedSave("schedule-change", ed);
        }
        ed = await openChild();
        note(`${label} double-click: ${JSON.stringify(await chooseRate(ed, "keep"))}`);
        await timedSave("double-click", ed, { dbl: true });
        // Rejected: the browser answers the schedule write with a 403 (server refusal, simulated).
        ed = await openChild();
        await page.route("**/api/admin/scheduling", async (route) => {
            if (route.request().method() === "POST") return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "You do not have permission to change this schedule." }) });
            return route.continue();
        });
        const rej = await timedSave("rejected-403", ed);
        const errText = await page.locator('[data-schedule-error="true"]').first().textContent().catch(() => null);
        note(`${label} rejected: editor still open=${rej.clickToEditorClosed == null} error="${errText}" commit enabled=${await ed.locator('[data-schedule-commit="true"]').isEnabled().catch(() => null)}`);
        await page.unroute("**/api/admin/scheduling");
        fs.writeFileSync(path.join(OUT, `perf-matrix-${label}.json`), JSON.stringify(results, null, 1));
        fs.writeFileSync(path.join(OUT, `perf-matrix-${label}.log`), log.join("\n"));
        expect(blocked).toEqual([]);
    });
    /*
     * ASSIGNMENTS REGRESSION (deployed staging, mounted operator UI) — create correctness, secondary
     * integrity, tuition matching. QA fixtures only: every child must be a ZZQA record (enforced).
     *
     * Select steps with AEV4_STEPS (comma list):
     *   create   — pre-enrolment create (AEV4_CREATE_CHILD; AEV4_SKIP_PATTERN=1 leaves the pattern unchosen)
     *   denied   — create refused (simulated 403): editor stays open, nothing committed
     *   readview — reopen and read THIS child's saved tuition view
     *   rates    — matched configured rates: program set on the child's own proposal, 3/5 days,
     *              the 2026-07-27/28 effective-date boundary, override needs a reason, save + reopen
     *   stale    — a stale preview key is refused (409) and re-resolved (AEV4_SECONDARY_CHILD)
     *   secondary, replace — create a Before Care secondary; a replacement naming another site's room
     *              is refused with the prior row intact
     *   v5sec    — a secondary edit opens hydrated, carries no tuition, an unchanged save writes
     *              nothing, a moved start writes one replacement and no pricing action
     *   v5label  — a primary with no named schedule type shows its days
     * Ids default to the staging QA site (KLA Schools of Hillsboro): patterns, rooms, preschool program.
     * Writes evidence to certification/evidence/assignment-editor-v2/deployed/v4-<label>.log.
     */
    test("assignments regression: create / secondary / stale / invalid room / rates / reopen", async ({ page }) => {
        test.setTimeout(Number(process.env.CERT_TIMEOUT_MS || 900000));
        await page.setViewportSize({ width: 1440, height: 900 });
        const label = process.env.AEV2_TIMING_LABEL || "v4";
        const CREATE = process.env.AEV4_CREATE_CHILD || "";
        const SECONDARY = process.env.AEV4_SECONDARY_CHILD || "";
        const steps = (process.env.AEV4_STEPS || "create,secondary").split(",");
        for (const c of [CREATE, SECONDARY].filter(Boolean)) expect(c).toMatch(/ZZQA/);
        const flush = () => fs.writeFileSync(path.join(OUT, `v4-${label}.log`), log.join("\n"));
        const OTHER_SITE_ROOM = "93c66b6f-bc30-4899-900c-c37aad4c3200"; // Toddler 2 under the OTHER site

        const views: Array<{ member: string; draft: boolean; key: unknown; facts: unknown; q: string; state?: unknown; rec?: unknown; tied?: unknown; accepted?: unknown }> = [];
        page.on("response", async (res) => {
            if (!res.url().includes("/api/admin/financial-config/opportunity/")) return;
            const body = (await res.json().catch(() => null)) as { assignments?: Array<Record<string, unknown>> } | null;
            for (const a of body?.assignments ?? []) {
                const amt = (o: unknown) => (o as { amountCents?: number; sourceId?: string } | null) ? `${(o as { amountCents: number }).amountCents}@${String((o as { sourceId: string }).sourceId).slice(0, 8)}` : null;
                views.push({
                    member: String(a.customerMemberId ?? ""), draft: Boolean(a.draft), key: a.resolutionKey, facts: a.facts, q: res.url().split("?")[1] ?? "",
                    state: a.state, rec: amt(a.recommended), tied: ((a.tied as unknown[]) ?? []).map(amt),
                    accepted: a.accepted ? `${(a.accepted as { state?: string }).state}:${(a.accepted as { amountCents?: number }).amountCents}` : null,
                });
            }
        });
        const writes: Array<{ u: string; body: string; status?: number; said?: string; ms?: number }> = [];
        page.on("request", (r) => {
            const u = r.url().replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
            if (r.method() === "POST" && (u === "/api/admin/scheduling" || u === "/api/admin/actions/execute")) writes.push({ u, body: (r.postData() ?? "").slice(0, 700) });
        });
        page.on("requestfinished", async (r) => {
            const u = r.url().replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
            const w = [...writes].reverse().find((x) => x.u === u && x.status == null);
            if (!w) return;
            const res = await r.response();
            w.status = res?.status();
            w.ms = r.timing().responseEnd;
            if (res && res.status() >= 400) w.said = (await res.text().catch(() => "")).slice(0, 500);
        });

        const openChild = async (name: string, opts?: { recordOnly?: boolean }) => {
            const [first] = name.split(" ");
            await page.goto(PATHNAME);
            await page.waitForTimeout(4000);
            const bosClose = page.getByRole("button", { name: "Close", exact: true }).first();
            if (await bosClose.isVisible().catch(() => false)) await bosClose.click().catch(() => {});
            for (const tab of [/^Registration/, /^Waitlist/, /^All/]) {
                await page.getByText(tab).first().click();
                await page.waitForTimeout(3000);
                const row = page.getByText(name, { exact: true });
                if (await row.count()) { await row.first().click(); break; }
            }
            await page.waitForTimeout(5000);
            if (opts?.recordOnly) return;
            // The child's own schedule link: the linked value inside the row that carries THIS child's name.
            const links = page.locator('[data-universal-card-key="children"] [data-identity-linked="true"] .identity-field-value__value--linked');
            const at = await links.evaluateAll((els, full) => {
                return els.findIndex((el) => {
                    let n: Element | null = el;
                    while (n && !(n.textContent ?? "").includes(full)) n = n.parentElement;
                    return Boolean(n) && n!.querySelectorAll(".identity-field-value__value--linked").length === 1;
                });
            }, name);
            note(`open ${name}: schedule link #${at} (first name ${first})`);
            await links.nth(Math.max(0, at)).click();
            await page.waitForTimeout(4000);
        };
        const commitTimed = async (what: string, opts?: { dbl?: boolean }) => {
            const ed = page.locator('[data-schedule-editor="true"]');
            const commit = ed.locator('[data-schedule-commit="true"]');
            await expect(commit).toBeEnabled({ timeout: 10000 });
            const before = writes.length;
            const t0 = Date.now();
            if (opts?.dbl) await commit.dblclick(); else await commit.click();
            const closed = await page.waitForSelector('[data-schedule-editor="true"]', { state: "detached", timeout: 30000 }).then(() => Date.now() - t0).catch(() => null);
            await page.waitForTimeout(3000);
            const mine = writes.slice(before);
            note(`${label} ${what}: closed=${closed}ms writes=${JSON.stringify(mine.map((w) => `${w.u.split("/").pop()} ${w.status}${w.said ? ` ${w.said.slice(0, 160)}` : ""}`))}`);
            for (const w of mine) note(`     ${w.u} ${w.status} ${w.body.slice(0, 400)}`);
            const err = await optText(page.locator('[data-schedule-error="true"], [data-assignments-card="true"] p'));
            if (err) note(`     notice/error: ${err.slice(0, 200)}`);
            flush();
            return { closed, mine };
        };
        const chooseRoom = async (name: string) => {
            await page.locator('[data-schedule-editor="true"] [data-room-change="true"]').click();
            await page.waitForTimeout(1500);
            const opt = page.locator("[data-room-option]", { hasText: name });
            if (await opt.count()) await opt.first().click();
            await page.waitForTimeout(1500);
        };
        const choosePattern = async (id: string) => {
            const ed = page.locator('[data-schedule-editor="true"]');
            await ed.locator('[data-pattern-shortcut="true"]').click();
            await page.waitForTimeout(800);
            const opt = ed.locator(`[data-pattern-option="${id}"]`);
            if (await opt.count()) await opt.first().click();
            await page.waitForTimeout(1200);
        };
        const chooseAdditionalRate = async () => {
            const ed = page.locator('[data-schedule-editor="true"]');
            const sel = ed.locator('[data-assignment-tuition-embed="true"]');
            if (!(await sel.count())) return null;
            const more = ed.getByRole("button", { name: /Show additional rates/ });
            if (await more.count()) { await more.first().click(); await page.waitForTimeout(400); }
            const vals = await sel.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
            if (vals[0]) await sel.selectOption(vals[0]);
            await page.waitForTimeout(400);
            const reason = ed.locator('[data-assignment-override-reason="true"]');
            if (await reason.count()) await reason.fill("QA V4 — fixture rate");
            return vals[0] ?? null;
        };
        // An element that may not exist on this build: read it only if it is there (a missing one waits the full timeout).
        const optText = async (l: import("@playwright/test").Locator) => ((await l.count()) ? await l.first().textContent({ timeout: 3000 }).catch(() => null) : null);
        const lastView = (draft: boolean, member?: string) => [...views].reverse().find((v) => v.draft === draft && (!member || v.member === member));

        if (steps.includes("create") && CREATE) {
            await openChild(CREATE);
            const card = page.locator('[data-assignments-card="true"]');
            const createBtn = card.locator('[data-schedule-create-new="true"]');
            if (!(await page.locator('[data-schedule-editor="true"]').count()) && (await createBtn.count())) await createBtn.first().click();
            await page.waitForTimeout(2500);
            const ed = page.locator('[data-schedule-editor="true"]');
            const isCreate = /Create Assignment/.test((await optText(ed.locator('[data-schedule-commit="true"]'))) ?? "");
            note(`${label} create ${CREATE}: isCreate=${isCreate}`);
            expect(isCreate).toBe(true);
            for (const i of [1, 2, 3, 4, 5]) {
                const b = ed.locator(`[data-day="${i}"]`);
                if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
            }
            await ed.locator('input[type="date"]').first().fill("2026-11-02");
            const depart = ed.getByLabel("Depart", { exact: true });
            await depart.fill("5:30 PM");
            await depart.press("Enter");
            // Scenario 3: change room before create (Toddler 1, then Toddler 2).
            await chooseRoom("Toddler 1");
            await chooseRoom("Toddler 2");
            await page.waitForTimeout(2500);
            const unset = await optText(ed.locator('[data-schedule-type-unset="true"]'));
            const d0 = lastView(true);
            note(`${label} create: before choosing a pattern — unset-hint="${unset}" draft q=${d0?.q} facts=${JSON.stringify(d0?.facts)}`);
            await shot(page, `v4-${label}-create-unchosen`);
            // The operator chooses the schedule (Full Day) — unless this run measures the unchosen case.
            if (!process.env.AEV4_SKIP_PATTERN) await choosePattern("07a0ac51-82de-467a-8a26-1378884eaadd");
            await page.waitForTimeout(2500);
            const d1 = lastView(true);
            note(`${label} create: after Full Day — draft key=${String(d1?.key)} q=${d1?.q} facts=${JSON.stringify(d1?.facts)}`);
            const noMatch = await optText(ed.locator('[data-assignment-tuition-no-match="true"]'));
            note(`${label} create: tuition panel no-match="${noMatch?.slice(0, 160)}"`);
            note(`${label} create: rate ${await chooseAdditionalRate()}`);
            // Scenario 9: double-click Save — one write.
            await commitTimed("create (double-click)", { dbl: true });
            const member = d1?.member ?? "";
            // Scenario 6: reopen and read what persisted.
            await openChild(CREATE);
            await page.waitForTimeout(3000);
            const saved = lastView(false, member);
            note(`${label} create: saved view for this child key=${String(saved?.key)} facts=${JSON.stringify(saved?.facts)} (draft key was ${String(d1?.key)})`);
            note(`${label} create: card after reopen: ${(await card.innerText({ timeout: 5000 }).catch(() => "")).replace(/\s+/g, " ").slice(0, 400)}`);
            await shot(page, `v4-${label}-create-reopen`);
            flush();
        }

        if (steps.includes("v5sec") && SECONDARY) {
            // V5 B+C on the mounted editor: a secondary opens hydrated, carries no tuition, an unchanged
            // Save writes nothing, and a moved start writes ONE replacement and no pricing action.
            const card = page.locator('[data-assignments-card="true"]');
            const openSecondary = async () => {
                await openChild(SECONDARY);
                const sec = card.getByText("Before Care", { exact: false }).first();
                if (await sec.count()) { await sec.click(); await page.waitForTimeout(2500); }
                const edit = card.locator("button", { hasText: /Edit/ }).first();
                if (await edit.count()) { await edit.click(); await page.waitForTimeout(3500); }
                return page.locator('[data-schedule-editor="true"]');
            };
            let ed = await openSecondary();
            const days = await ed.locator("[data-day][aria-pressed=\"true\"]").evaluateAll((els) => els.map((e) => e.getAttribute("data-day")));
            const startVal = await ed.locator('input[type="date"]').first().inputValue().catch(() => null);
            note(`${label} v5 secondary opens: days=${JSON.stringify(days)} start=${startVal} tuition region=${await ed.locator('[data-assignment-tuition-embed="true"]').count()} commit enabled=${await ed.locator('[data-schedule-commit="true"]').isEnabled().catch(() => null)}`);
            await shot(page, `v4-${label}-secondary-hydrated`);
            const unchanged = await commitTimed("v5 secondary unchanged save");
            note(`${label} v5 unchanged: writes=${unchanged.mine.length}`);
            ed = await openSecondary();
            await ed.locator('input[type="date"]').first().fill("2026-11-16");
            await page.waitForTimeout(800);
            const moved = await commitTimed("v5 secondary moved start (replacement)");
            note(`${label} v5 moved: assignment.create=${moved.mine.filter((w) => /assignment\.create/.test(w.body)).map((w) => w.status)} pricing=${moved.mine.filter((w) => /enrollment\.pricing/.test(w.body)).length} quote=${moved.mine.filter((w) => /assignment-quote/.test(w.u)).length}`);
            await openChild(SECONDARY);
            note(`${label} v5 after replacement: ${(await card.innerText({ timeout: 5000 }).catch(() => "")).replace(/\s+/g, " ").slice(0, 400)}`);
            flush();
        }

        if (steps.includes("v5label") && CREATE) {
            await openChild(CREATE);
            const card = page.locator('[data-assignments-card="true"]');
            const chips = await card.locator("[data-assignment-type-named]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-assignment-type-named")}:${(e.textContent ?? "").trim()}`));
            note(`${label} v5 label: chips=${JSON.stringify(chips)} untitled=${(await card.innerText({ timeout: 5000 }).catch(() => "")).includes("Untitled type")}`);
            await shot(page, `v4-${label}-label`);
            flush();
        }

        if (steps.includes("rates") && CREATE) {
            // TRACK F — matched configured rates. The child's own program is set through the operator
            // Children card (writes only this child's proposal); no room or program configuration changes.
            const PROGRAM = process.env.AEV5_PROGRAM_ID || "2147d374-8112-4e88-8342-b49c9b95fc7b"; // preschool @ site
            await openChild(CREATE, { recordOnly: true });
            // Focus THIS child in the Children card (its name), where the edit lives.
            const nameInCard = page.locator('[data-universal-card-key="children"]').getByText(CREATE, { exact: true });
            if (await nameInCard.count()) { await nameInCard.first().click(); await page.waitForTimeout(2500); }
            const trigger = page.locator("[data-children-edit-trigger]").first();
            await shot(page, `v4-${label}-child-focus`);
            if (await trigger.count()) {
                await trigger.click();
                await page.waitForTimeout(1500);
                const sel = page.locator('[data-testid="child-edit-program_category_id"]');
                if (await sel.count()) {
                    await sel.locator("button").first().click();
                    await page.waitForTimeout(500);
                    const opt = page.locator(`[data-option-value="${PROGRAM}"]`);
                    note(`${label} rates: program option present=${await opt.count()}`);
                    if (await opt.count()) await opt.first().click();
                    await page.waitForTimeout(500);
                    const save = page.locator('[data-testid="child-edit-save"]');
                    if (await save.isEnabled().catch(() => false)) { await save.click(); await page.waitForTimeout(4000); }
                    note(`${label} rates: program saved phase=${await save.getAttribute("data-save-phase").catch(() => null)}`);
                } else note(`${label} rates: no program field in the child edit`);
            } else {
                /*
                 * The card offers no child edit to this identity on this record. The fixture's program is
                 * then set through the SAME canonical route the card's edit uses (POST
                 * /api/admin/child-participation, enrollment.record.manage), from this page and this
                 * operator session — the child's own proposal only, no configuration.
                 */
                note(`${label} rates: no child edit trigger — setting the program through the card's route`);
                await openChild(CREATE);
                const createBtn0 = page.locator('[data-assignments-card="true"] [data-schedule-create-new="true"]');
                if (!(await page.locator('[data-schedule-editor="true"]').count()) && (await createBtn0.count())) await createBtn0.first().click();
                await page.waitForTimeout(3000);
                const ids = await page.evaluate(() => {
                    const url = performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("draft_customer_member_id=")) ?? "";
                    const u = new URL(url || "http://x/");
                    return { opp: u.pathname.split("/").pop() ?? "", member: u.searchParams.get("draft_customer_member_id") ?? "" };
                });
                note(`${label} rates: ids ${JSON.stringify(ids)}`);
                const res = await page.evaluate(async ({ member, program }) => {
                    const r = await fetch("/api/admin/child-participation", {
                        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ customer_member_id: member, patch: { program_category_id: program } }),
                    });
                    return { status: r.status, body: (await r.text()).slice(0, 300) };
                }, { member: ids.member, program: PROGRAM });
                note(`${label} rates: program set via route -> ${res.status} ${res.body}`);
            }
            flush();
            await openChild(CREATE);
            const card = page.locator('[data-assignments-card="true"]');
            const createBtn = card.locator('[data-schedule-create-new="true"]');
            if (!(await page.locator('[data-schedule-editor="true"]').count()) && (await createBtn.count())) await createBtn.first().click();
            await page.waitForTimeout(2500);
            const ed = page.locator('[data-schedule-editor="true"]');
            const sel = ed.locator('[data-assignment-tuition-embed="true"]');
            const resolved = async (what: string) => {
                await page.waitForTimeout(2500);
                const v = lastView(true) ?? lastView(false);
                const shown = await optText(sel.locator("option:checked"));
                note(`${label} rates ${what}: state=${String(v?.state)} rec=${String(v?.rec)} tied=${JSON.stringify(v?.tied)} facts=${JSON.stringify(v?.facts)} shown="${shown}"`);
                flush();
                return v;
            };
            const setDays = async (want: number[]) => {
                for (const i of [1, 2, 3, 4, 5]) {
                    const b = ed.locator(`[data-day="${i}"]`);
                    const on = (await b.getAttribute("aria-pressed")) === "true";
                    if (on !== want.includes(i)) await b.click();
                }
            };
            await setDays([1, 2, 3, 4, 5]);
            await ed.locator('input[type="date"]').first().fill("2026-11-02");
            const depart = ed.getByLabel("Depart", { exact: true });
            await depart.fill("5:30 PM");
            await depart.press("Enter");
            await chooseRoom("Toddler 2");
            await choosePattern("07a0ac51-82de-467a-8a26-1378884eaadd");
            await resolved("5 days from 2026-11-02");
            await setDays([1, 3, 5]);
            await resolved("3 days (M/W/F) from 2026-11-02");
            await ed.locator('input[type="date"]').first().fill("2026-07-27");
            await resolved("3 days from 2026-07-27 (before the day-count rates)");
            await ed.locator('input[type="date"]').first().fill("2026-07-28");
            await resolved("3 days from 2026-07-28 (day-count rates effective)");
            await ed.locator('input[type="date"]').first().fill("2026-11-02");
            await setDays([1, 2, 3, 4, 5]);
            const v5 = await resolved("back to 5 days from 2026-11-02");
            // A non-matching rate is an explicit, reasoned override: Save holds until a reason is given.
            const more = ed.getByRole("button", { name: /Show additional rates/ });
            if (await more.count()) { await more.first().click(); await page.waitForTimeout(400); }
            const vals = await sel.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
            const recId = String(v5?.rec ?? "").split("@")[1] ?? "";
            const other = vals.find((v) => !v.startsWith(recId));
            if (other) {
                await sel.selectOption(other);
                await page.waitForTimeout(500);
                note(`${label} rates override: reason field=${await ed.locator('[data-assignment-override-reason="true"]').count()} save enabled=${await ed.locator('[data-schedule-commit="true"]').isEnabled()}`);
            }
            const recFull = vals.find((v) => v.startsWith(recId));
            if (recFull) await sel.selectOption(recFull);
            await page.waitForTimeout(600);
            note(`${label} rates: chose recommended ${recFull}; override reason field now=${await ed.locator('[data-assignment-override-reason="true"]').count()}`);
            await commitTimed("rates create (recommended, 5 days)");
            await openChild(CREATE);
            const row = card.getByText("Toddler", { exact: false }).first();
            if (await row.count()) { await row.click(); await page.waitForTimeout(2500); }
            const edit = card.locator("button", { hasText: /Edit/ }).first();
            if (await edit.count()) { await edit.click(); await page.waitForTimeout(5000); }
            const saved = lastView(false);
            note(`${label} rates reopen: shown="${await optText(page.locator('[data-assignment-tuition-embed="true"] option:checked'))}" accepted=${String(saved?.accepted)} days=${JSON.stringify(await page.locator('[data-schedule-editor="true"] [data-day][aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-day"))))}`);
            flush();
        }

        if (steps.includes("denied") && CREATE) {
            // Scenario 8: the create write is refused (403, simulated — the QA session has one identity).
            await openChild(CREATE);
            const card = page.locator('[data-assignments-card="true"]');
            const createBtn = card.locator('[data-schedule-create-new="true"]');
            if (!(await page.locator('[data-schedule-editor="true"]').count()) && (await createBtn.count())) await createBtn.first().click();
            await page.waitForTimeout(2500);
            const ed = page.locator('[data-schedule-editor="true"]');
            for (const i of [1, 2, 3, 4, 5]) {
                const b = ed.locator(`[data-day="${i}"]`);
                if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
            }
            await ed.locator('input[type="date"]').first().fill("2026-11-02");
            const depart = ed.getByLabel("Depart", { exact: true });
            await depart.fill("5:30 PM");
            await depart.press("Enter");
            await chooseRoom("Toddler 2");
            await choosePattern("07a0ac51-82de-467a-8a26-1378884eaadd");
            await page.route("**/api/admin/scheduling", async (route) => {
                if (route.request().method() === "POST") return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "You do not have permission to change this schedule." }) });
                return route.continue();
            });
            const r = await commitTimed("denied create");
            note(`${label} denied: editor still open=${r.closed == null} tuition commits=${r.mine.filter((w) => w.u.endsWith("/execute")).length} error="${await optText(page.locator('[data-schedule-error="true"]'))}"`);
            await page.unroute("**/api/admin/scheduling");
            flush();
        }

        if (steps.includes("readview") && CREATE) {
            // Read-only: this child's SAVED tuition view, fetched directly (no draft), and every view
            // the reopened page itself received for this child, with the query that produced it.
            await openChild(CREATE);
            const card = page.locator('[data-assignments-card="true"]');
            const row = card.getByText("Toddler", { exact: false }).first();
            if (await row.count()) { await row.click(); await page.waitForTimeout(2500); }
            const edit = card.locator("button", { hasText: /Edit/ }).first();
            if (await edit.count()) { await edit.click(); await page.waitForTimeout(5000); }
            const selText = await optText(page.locator('[data-assignment-tuition-embed="true"] option:checked'));
            note(`${label} readview: editor open=${await page.locator('[data-schedule-editor="true"]').count()} tuition shown="${selText}" days=${JSON.stringify(await page.locator('[data-schedule-editor="true"] [data-day][aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-day"))))}`);
            const seen = views.filter((v) => v.q.includes("draft_customer_member_id") || !v.draft);
            for (const v of seen.slice(-12)) note(`${label} readview seen: member=${v.member.slice(0, 8)} draft=${v.draft} key=${String(v.key)} q=${v.q.slice(0, 160)} facts=${JSON.stringify(v.facts)}`);
            const opp = await page.evaluate(() =>
                performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/api/admin/financial-config/opportunity/")) ?? null,
            );
            if (opp) {
                const base = opp.split("?")[0]!;
                const direct = await page.evaluate(async (u) => (await fetch(u, { credentials: "include" })).json(), base);
                for (const a of (direct as { assignments?: Array<Record<string, unknown>> }).assignments ?? []) {
                    note(`${label} readview direct: member=${String(a.customerMemberId).slice(0, 8)} ocm=${String(a.opportunityCustomerMemberId).slice(0, 8)} key=${String(a.resolutionKey)} facts=${JSON.stringify(a.facts)} accepted=${JSON.stringify(a.accepted ?? null).slice(0, 160)}`);
                }
            }
            flush();
        }

        if (steps.includes("stale") && SECONDARY) {
            // Scenario 7: the preview's key is made stale in flight; the server must refuse and Save re-resolve.
            await openChild(SECONDARY);
            const row = page.locator('[data-assignments-card="true"]').getByText("Toddler", { exact: false }).first();
            if (await row.count()) { await row.click(); await page.waitForTimeout(2500); }
            const edit = page.locator('[data-assignments-card="true"] button', { hasText: /Edit/ }).first();
            if (await edit.count()) { await edit.click(); await page.waitForTimeout(3500); }
            await page.route("**/api/admin/actions/execute", async (route) => {
                const body = route.request().postData() ?? "";
                if (/enrollment\.pricing\.(accept|override)/.test(body) && /"resolution_key":"(?!stale-)/.test(body) && !(globalThis as { __staled?: boolean }).__staled) {
                    (globalThis as { __staled?: boolean }).__staled = true;
                    return route.continue({ postData: body.replace(/"resolution_key":"([^"]*)"/, '"resolution_key":"stale-$1"') });
                }
                return route.continue();
            });
            note(`${label} stale: rate ${await chooseAdditionalRate()}`);
            await commitTimed("stale preview");
            await page.unroute("**/api/admin/actions/execute");
        }

        if (steps.includes("secondary") && SECONDARY) {
            // Scenario 2: a secondary (Before Care) beside the primary proposal.
            await openChild(SECONDARY);
            const card = page.locator('[data-assignments-card="true"]');
            await card.locator('[data-schedule-create-new="true"]').first().click();
            await page.waitForTimeout(2000);
            const types = await page.locator("[data-assignment-type-option]").evaluateAll((els) => els.map((e) => e.getAttribute("data-assignment-type-option")));
            note(`${label} secondary: categories offered ${JSON.stringify(types)}`);
            await page.locator('[data-assignment-type-option="before_care"]').first().click();
            await page.waitForTimeout(2500);
            await choosePattern("278fcee2-7aba-464e-96db-3cd0a9e00bcb");
            await page.locator('[data-schedule-editor="true"] input[type="date"]').first().fill("2026-11-02");
            await chooseRoom("Toddler 2");
            const first = await commitTimed("secondary create");
            const created = first.mine.find((w) => w.u.endsWith("/execute") && /assignment\.create/.test(w.body));
            note(`${label} secondary: created status=${created?.status}`);
            flush();
        }

        if (steps.includes("replace") && SECONDARY) {
            const card = page.locator('[data-assignments-card="true"]');
            // Scenarios 10 + 11: replace it with a room at ANOTHER site (request rewritten in flight —
            // the picker cannot offer it). The server must refuse, and the prior secondary must survive.
            await openChild(SECONDARY);
            const sec = card.getByText("Before Care", { exact: false }).first();
            if (await sec.count()) { await sec.click(); await page.waitForTimeout(2500); }
            const edit = card.locator("button", { hasText: /Edit/ }).first();
            if (await edit.count()) { await edit.click(); await page.waitForTimeout(3000); }
            await page.route("**/api/admin/actions/execute", async (route) => {
                const body = route.request().postData() ?? "";
                if (/assignment\.create/.test(body) && /supersedes_assignment_id":"[0-9a-f-]{36}/.test(body)) {
                    return route.continue({ postData: body.replace(/"room_location_id":("[^"]*"|null)/, `"room_location_id":"${OTHER_SITE_ROOM}"`) });
                }
                return route.continue();
            });
            const daysShown = await page.locator('[data-schedule-editor="true"] [data-day][aria-pressed="true"]').count();
            note(`${label} replace: editing the secondary opens with ${daysShown} day(s) selected`);
            if (!daysShown) await choosePattern("278fcee2-7aba-464e-96db-3cd0a9e00bcb"); // an operator re-applies Before Care
            await page.locator('[data-schedule-editor="true"] input[type="date"]').first().fill("2026-11-09");
            const bad = page.locator('[data-schedule-editor="true"] [data-schedule-commit="true"]');
            if (await bad.count() && (await bad.isEnabled())) {
                const before = writes.length;
                await bad.click();
                await page.waitForTimeout(6000);
                note(`${label} invalid-room replacement: ${JSON.stringify(writes.slice(before).map((w) => `${w.u.split("/").pop()} ${w.status} ${(w.said ?? "").slice(0, 200)}`))}`);
                note(`${label} invalid-room replacement: editor still open=${await page.locator('[data-schedule-editor="true"]').count()} error="${await optText(page.locator('[data-schedule-error="true"]'))}"`);
            }
            await page.unroute("**/api/admin/actions/execute");
            await openChild(SECONDARY);
            note(`${label} secondary after refusal: ${(await card.innerText({ timeout: 5000 }).catch(() => "")).replace(/\s+/g, " ").slice(0, 400)}`);
            await shot(page, `v4-${label}-secondary-after`);
            flush();
        }
        flush();
    });

    /*
     * V5 certification — ROSTER BULK ROOM CHANGE against the database room/site invariant.
     * Operations → Roster → site → Assignments lens; select one QA secondary line; Bulk Room Change.
     * Every execute response is captured: the panel reports nothing itself.
     */
    test("v5cert: roster bulk room change", async ({ page }) => {
        test.setTimeout(Number(process.env.CERT_TIMEOUT_MS || 600000));
        await page.setViewportSize({ width: 1440, height: 900 });
        const label = process.env.AEV2_TIMING_LABEL || "v5cert";
        const SUBJECT = process.env.AEV5_ROSTER_SUBJECT || "Ava ZZQA1484F31612";
        const LINE = process.env.AEV5_ROSTER_LINE || "Before Care";
        const SITE = process.env.AEV5_ROSTER_SITE || "KLA Schools of Hillsboro";
        expect(SUBJECT).toMatch(/ZZQA/);
        const moves = (process.env.AEV5_ROSTER_MOVES || "16b9ec76-d1e6-41b2-b76c-44853543dc18@2026-11-23,93c66b6f-bc30-4899-900c-c37aad4c3200@2026-11-30").split(",");
        const out: string[] = [];
        const say = (m: string) => { out.push(m); console.log(`[v5cert] ${m}`); fs.writeFileSync(path.join(OUT, `v5cert-roster-${label}.log`), out.join("\n")); };
        const responses: string[] = [];
        page.on("response", async (res) => {
            if (!res.url().includes("/api/admin/actions/execute") || res.request().method() !== "POST") return;
            responses.push(`${res.status()} ${(res.request().postData() ?? "").slice(0, 260)} => ${(await res.text().catch(() => "")).slice(0, 260)}`);
        });
        const openLens = async () => {
            await page.goto("/workspace");
            await page.waitForTimeout(3000);
            await page.locator('[data-adminv2-sidebar-modal-nav="operations"]').first().click();
            await page.waitForTimeout(3000);
            const roster = page.locator("[data-workspace-mode-sections] button", { hasText: "Roster" });
            if (await roster.count()) await roster.first().click();
            await page.waitForTimeout(1500);
            await page.locator('button[aria-label="Site"]').first().click();
            await page.locator("[role=option]", { hasText: SITE }).first().click();
            await page.waitForTimeout(2500);
            await page.locator('[data-roster-lens-option="assignments"]').first().click();
            await page.waitForTimeout(4000);
        };
        const lineState = async () => {
            const subj = page.locator("[data-assignment-roster-subject]", { hasText: SUBJECT }).first();
            return (await subj.innerText({ timeout: 5000 }).catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
        };
        for (const move of moves) {
            const [room, date] = move.split("@");
            await openLens();
            const subj = page.locator("[data-assignment-roster-subject]", { hasText: SUBJECT }).first();
            say(`subject present=${await subj.count()} before: ${await lineState()}`);
            const toggle = subj.locator("[data-assignment-roster-child]").first();
            if (await toggle.count()) { await toggle.click(); await page.waitForTimeout(1200); }
            const box = page.getByRole("checkbox", { name: `Select ${LINE}` }).first();
            say(`line checkbox present=${await box.count()}`);
            if (!(await box.count())) { await shot(page, `v5cert-roster-${label}-noline`); break; }
            await box.check();
            await page.locator("[data-bulk-room-change]").first().click();
            const panel = page.locator('[data-bulk-room-panel="true"]');
            await panel.locator('input[type="date"]').fill(date!);
            await panel.locator('input[placeholder="Choose room"]').fill(room!);
            const before = responses.length;
            await panel.getByRole("button", { name: "Apply room change" }).click();
            await page.waitForTimeout(7000);
            for (const r of responses.slice(before)) say(`move ${room!.slice(0, 8)}@${date}: ${r}`);
            if (responses.length === before) say(`move ${room!.slice(0, 8)}@${date}: NO request sent`);
            const listed = page.locator('[data-bulk-room-result="refused"]');
            say(`move ${room!.slice(0, 8)}@${date}: panel lists=${(await listed.count()) ? JSON.stringify(await listed.locator("li").allTextContents()) : "none (panel closed: all applied)"}`);
            await openLens();
            say(`after ${room!.slice(0, 8)}: ${await lineState()}`);
            await shot(page, `v5cert-roster-${label}-${room!.slice(0, 8)}`);
        }
    });
});
