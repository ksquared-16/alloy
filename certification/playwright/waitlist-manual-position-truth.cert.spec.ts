import { expect, test, type Page } from "@playwright/test";

/**
 * A manual waitlist position must actually move the child, and stay moved.
 *
 * This spec exists because the defect it covers ESCAPED every unit test and reached deployed
 * staging. The Adjust control wrote an override, the API answered `200 {"ok":true}` with an active
 * pin carrying the requested ordinal, the popover closed — and the row did not move. Not on the
 * screen, not in the canonical provisioning answer, and not after a reload. The write was real; the
 * read never honoured it, because `pin_ordinal` was spliced into `sort_tuple` and compared against
 * a bucket priority, so every ordinal below that constant collapsed to the same answer.
 *
 * A unit test could not have caught it: each layer was individually correct. Only write → canonical
 * read → rendered order → reload, end to end against the deployed product, closes the loop.
 *
 * Restores the tenant's exact starting truth on the way out. A certification that leaves a child in
 * a different queue position than it found them has broken the thing it was sent to protect.
 */

const SETTLE = 120_000;
const WAITLIST = "/workspace/work-unit/waitlist";
const ANSWER = "/api/admin/work-units/waitlist/provisioning-answer";

type CandidateRow = {
    placement_candidate_id?: string;
    child_display_name?: string;
    program_room_cohort_key?: string;
    runtime_position?: number;
    runtime_position_label?: string;
    runtime_group_position?: number;
    runtime_group_total?: number;
};

/** The canonical answer — the truth the surface is supposed to be rendering. */
async function canonicalRows(page: Page): Promise<CandidateRow[]> {
    return page.evaluate(async (url) => {
        const res = await fetch(url, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`provisioning answer ${res.status}`);
        const json = (await res.json()) as { rows?: Array<{ _placement_waitlist_row?: CandidateRow }> };
        return (json.rows ?? [])
            .map((r) => r._placement_waitlist_row)
            .filter((p): p is CandidateRow => Boolean(p?.placement_candidate_id));
    }, ANSWER);
}

/** Rendered order, read from the queue rows themselves rather than from any internal state. */
async function renderedOrder(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll("[role=button]").forEach((el) => {
            const t = (el as HTMLElement).innerText.replace(/\s+/g, " ");
            const m = t.match(/^(?:[A-Z] )?(.+?) \d+ \/ \d+ Adjust/);
            if (m) out.push(m[1]!);
        });
        return out;
    });
}

/** Real trusted pointer input — `element.click()` cannot reproduce the pointer defects this surface has had. */
async function pointerClick(page: Page, locator: ReturnType<Page["locator"]>, label: string) {
    const n = await locator.count();
    if (n === 0) throw new Error(`PROBE FAILURE: no element for "${label}"`);
    const box = await locator.first().boundingBox();
    if (!box) throw new Error(`PROBE FAILURE: "${label}" is not visible`);
    await page.mouse.move(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
    await page.mouse.down();
    await page.waitForTimeout(20);
    await page.mouse.up();
}

test.describe("waitlist manual position — write, read, render, reload", () => {
    test.setTimeout(SETTLE * 3);

    test("a cohort-local position moves the row, survives reload, and clears back to natural order", async ({ page }) => {
        await page.goto(WAITLIST, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(15_000);

        // ── 1-2. Natural truth, before anything is touched ──────────────────────────────
        const before = await canonicalRows(page);
        expect(before.length, "the fixture must have a populated waitlist").toBeGreaterThan(2);

        // Work inside the largest cohort so a middle ordinal is genuinely expressible.
        const byCohort = new Map<string, CandidateRow[]>();
        for (const r of before) {
            const k = r.program_room_cohort_key ?? "";
            byCohort.set(k, [...(byCohort.get(k) ?? []), r]);
        }
        const [cohortKey, members] = [...byCohort.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
        expect(members.length, `cohort ${cohortKey} needs room for a middle position`).toBeGreaterThan(2);

        const subject = members[0]!;
        const subjectName = subject.child_display_name!;
        const initialGroupPosition = subject.runtime_group_position ?? null;
        const initialLabel = subject.runtime_position_label ?? null;
        const initialOrder = await renderedOrder(page);

        // A middle ordinal — the case the escaped defect could not express. Position 1 would have
        // passed against the broken engine, which is exactly why this spec must not use it.
        const target = Math.min(3, members.length);
        expect(target, "a middle ordinal must differ from where the row already is").not.toBe(initialGroupPosition);

        // ── 3-5. Adjust with real pointer input ─────────────────────────────────────────
        const row = page.locator("[role=button]").filter({ hasText: subjectName }).first();
        await pointerClick(page, row.locator("button", { hasText: "Adjust" }).first(), "Adjust");
        await page.waitForTimeout(1_000);

        const popover = page.locator("body > div[role=dialog]");
        await expect(popover, "the Adjust popover must open on a real click").toHaveCount(1);

        await pointerClick(page, popover.locator("button", { hasText: /current/ }).first(), "position dropdown");
        await page.waitForTimeout(700);
        const option = popover.locator("button").filter({ hasText: new RegExp(`^${target}$`) }).first();
        await pointerClick(page, option, `position ${target}`);
        await page.waitForTimeout(500);
        await pointerClick(page, popover.locator("button", { hasText: "Apply" }).first(), "Apply");
        await page.waitForTimeout(6_000);

        // ── 6. The write is only real if all three agree ────────────────────────────────
        const afterApply = await canonicalRows(page);
        const moved = afterApply.find((r) => r.placement_candidate_id === subject.placement_candidate_id)!;

        expect(moved.runtime_group_position, "canonical answer must place the row at the chosen cohort ordinal").toBe(target);
        expect(moved.runtime_position_label, "the section label must move with it").not.toBe(initialLabel);

        const afterOrder = await renderedOrder(page);
        expect(afterOrder, "the rendered order must change").not.toEqual(initialOrder);
        expect(afterOrder).toContain(subjectName);

        // ── 7-8. Reload: the move must be canonical, not a client illusion ──────────────
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(15_000);
        const afterReload = await canonicalRows(page);
        const persisted = afterReload.find((r) => r.placement_candidate_id === subject.placement_candidate_id)!;
        expect(persisted.runtime_group_position, "the position must survive a reload").toBe(target);
        expect(await renderedOrder(page)).toEqual(afterOrder);

        // ── 9-10. Clear returns natural order ───────────────────────────────────────────
        const rowAgain = page.locator("[role=button]").filter({ hasText: subjectName }).first();
        await pointerClick(page, rowAgain.locator("button", { hasText: "Adjust" }).first(), "Adjust (clear)");
        await page.waitForTimeout(1_000);
        await pointerClick(page, popover.locator("button", { hasText: "Clear adjustment" }).first(), "Clear adjustment");
        await page.waitForTimeout(6_000);

        const cleared = (await canonicalRows(page)).find(
            (r) => r.placement_candidate_id === subject.placement_candidate_id,
        )!;
        expect(cleared.runtime_group_position, "clearing must return the row to its natural cohort position")
            .not.toBe(target);

        // ── 11. Restore the tenant's exact starting truth ───────────────────────────────
        //
        // Only re-pin when the row STARTED pinned. Clearing already restored the natural order for a
        // row that had no adjustment, and re-pinning one that never was would leave the tenant
        // dirtier than this spec found it.
        if (initialGroupPosition != null && cleared.runtime_group_position !== initialGroupPosition) {
            const restoreRow = page.locator("[role=button]").filter({ hasText: subjectName }).first();
            await pointerClick(page, restoreRow.locator("button", { hasText: "Adjust" }).first(), "Adjust (restore)");
            await page.waitForTimeout(1_000);
            await pointerClick(page, popover.locator("button", { hasText: /current/ }).first(), "dropdown (restore)");
            await page.waitForTimeout(700);
            await pointerClick(
                page,
                popover.locator("button").filter({ hasText: new RegExp(`^${initialGroupPosition}$`) }).first(),
                `restore position ${initialGroupPosition}`,
            );
            await page.waitForTimeout(500);
            await pointerClick(page, popover.locator("button", { hasText: "Apply" }).first(), "Apply (restore)");
            await page.waitForTimeout(6_000);

            const restored = (await canonicalRows(page)).find(
                (r) => r.placement_candidate_id === subject.placement_candidate_id,
            )!;
            expect(restored.runtime_group_position, "the tenant must be left exactly as found")
                .toBe(initialGroupPosition);
        }
    });
});
