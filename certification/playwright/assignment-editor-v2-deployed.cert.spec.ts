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
});
