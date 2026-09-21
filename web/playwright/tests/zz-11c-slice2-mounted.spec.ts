/**
 * 11C SLICE 2 — MOUNTED CERTIFICATION of the transaction control grammar.
 *
 * Runs against DEPLOYED staging (production runtime, no HMR), and every control is driven through
 * the canonical helper — open the listbox, read what it offers, choose, dismiss — because that is
 * the product as shipped. Nothing here asserts `HTMLSelectElement`.
 *
 * NOTHING IS WRITTEN. The designated Human-QA fixture is read, never mutated: no charge, no
 * adjustment, no payment, no arrangement. Where a proof would need a write, the limit is recorded
 * instead of manufactured.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

import {
    activeElementDescriptor,
    alloyOptions,
    alloySelectedLabels,
    alloyTrigger,
    alloyValueText,
    closeAlloy,
    isAlloyControl,
    isMultiSelect,
    keyboardPick,
    openAlloy,
    toggleAlloyMultiByValue,
} from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
const ENTRY = "/workspace/work-unit/enrolled-children";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2));
};

/** The entry surface, then the Financials card's own Details depth. */
async function openDetails(page: import("@playwright/test").Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
    /*
     * The door is the card's own "Details →" button. `[data-financials-open-details]` does NOT
     * exist on the deployed build — an earlier pass used it, silently stayed on the entry card,
     * and reported the Details controls as absent. A probe that cannot open the surface it is
     * measuring must fail, not report zeros, so this asserts the door before going through it.
     */
    const details = page.locator("[data-financials-card='true']")
        .getByRole("button", { name: /^Details/ })
        .first();
    await expect(details, "the Financials card offers a Details door").toHaveCount(1);
    await details.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await expect(
        page.locator("[data-financials-payment-methods], [data-testid='financials-filter-responsible-party']").first(),
        "Details actually opened — measured by a control only Details has",
    ).toHaveCount(1, { timeout: 30_000 });
}

test("§7 — the deployed build this evidence binds to", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD: ${JSON.stringify(build)}`);
    expect(build.gitSha, "the merged slice").toBe("9675a76be43bee92ed817b84d77aa2a8bb79f87a");
    expect(build.gitBranch).toBe("staging");
    expect(build.nodeEnv, "production runtime, not a dev server").toBe("production");
    expect(build.supabaseProjectRef).toBe("ikaxilmwmrmbagoidedu");
    save("build", build);
});

test("§8 §9 — Add asks who receives this with one canonical multi-select", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    const add = page.getByRole("button", { name: /^Add$/ }).first();
    expect(await add.count(), "Add is reachable from ordinary navigation").toBeGreaterThan(0);
    await add.click({ timeout: 20_000 });
    await page.waitForTimeout(9000);

    R.isAlloy = await isAlloyControl(page, "addcharge-target");
    R.isMulti = await isMultiSelect(page, "addcharge-target");
    expect(R.isAlloy, "the target is a canonical Alloy control").toBe(true);
    expect(R.isMulti, "and it is the multi variant").toBe(true);

    const offered = await alloyOptions(page, "addcharge-target");
    R.offered = offered.map((o) => o.label);
    log(`ADD TARGET OFFERS: ${JSON.stringify(R.offered)}`);
    const household = offered.filter((o) => /household/i.test(o.label));
    const children = offered.filter((o) => /cert[ab]\s+certhouse/i.test(o.label));
    expect(household, "Household is offered explicitly, exactly once").toHaveLength(1);
    expect(children, "each child exactly once").toHaveLength(2);
    expect(new Set(children.map((c) => c.label)).size).toBe(2);

    /*
     * Start from a known state: the fixture may already have a child ticked, and a proof that
     * begins by assuming an empty selection is proving something about the fixture, not the rule.
     */
    for (const sel of offered.filter((o) => o.selected && o.value)) {
        await toggleAlloyMultiByValue(page, "addcharge-target", sel.value!);
    }
    await closeAlloy(page, "addcharge-target");
    R.startedFrom = await alloySelectedLabels(page, "addcharge-target");
    expect(R.startedFrom, "cleared to a known empty start").toHaveLength(0);

    /* Child A + Child B — both stay selected. */
    await toggleAlloyMultiByValue(page, "addcharge-target", children[0]!.value!);
    await toggleAlloyMultiByValue(page, "addcharge-target", children[1]!.value!);
    await closeAlloy(page, "addcharge-target");
    R.bothChildren = await alloySelectedLabels(page, "addcharge-target");
    log(`BOTH CHILDREN: ${JSON.stringify(R.bothChildren)}`);
    expect(R.bothChildren, "both children remain selected").toHaveLength(2);

    /* Household clears the children. */
    await toggleAlloyMultiByValue(page, "addcharge-target", household[0]!.value!);
    await closeAlloy(page, "addcharge-target");
    R.afterHousehold = await alloySelectedLabels(page, "addcharge-target");
    log(`AFTER HOUSEHOLD: ${JSON.stringify(R.afterHousehold)}`);
    expect(R.afterHousehold, "Household is the whole answer").toEqual([household[0]!.label]);

    /* A child clears Household. */
    await toggleAlloyMultiByValue(page, "addcharge-target", children[0]!.value!);
    await closeAlloy(page, "addcharge-target");
    R.afterChild = await alloySelectedLabels(page, "addcharge-target");
    log(`AFTER CHILD: ${JSON.stringify(R.afterChild)}`);
    expect(R.afterChild, "choosing a child evicts Household").toEqual([children[0]!.label]);

    /* Empty is empty — never Household. */
    await toggleAlloyMultiByValue(page, "addcharge-target", children[0]!.value!);
    await closeAlloy(page, "addcharge-target");
    R.afterEmpty = await alloySelectedLabels(page, "addcharge-target");
    R.emptyTriggerText = await alloyValueText(page, "addcharge-target");
    log(`EMPTY: selected=${JSON.stringify(R.afterEmpty)} trigger="${R.emptyTriggerText}"`);
    expect(R.afterEmpty, "nobody is selected").toHaveLength(0);
    expect(String(R.emptyTriggerText), "and an empty selection NEVER reads as Household")
        .not.toMatch(/household/i);

    /* No secondary sibling field, and Add's other controls are canonical too. */
    /*
     * "Also bill" was the second control the unified target replaced. Checked as two separate
     * locators: a CSS selector and Playwright's text engine cannot be comma-joined into one
     * string, and the invalid selector throws rather than reporting the absence it was asked about.
     */
    R.secondarySiblingField =
        (await page.locator("[data-addcharge-alsochild]").count())
        + (await page.getByText(/also bill/i).count());
    R.templateIsAlloy = await isAlloyControl(page, "addcharge-template");
    R.nativeSelects = await page.locator("select").count();
    log(`§9: template=${R.templateIsAlloy} secondarySibling=${R.secondarySiblingField} nativeSelectsOnSurface=${R.nativeSelects}`);
    expect(R.secondarySiblingField, "no secondary sibling field").toBe(0);
    save("add", R);
    await page.keyboard.press("Escape");
});

test("§27 — Applies to, keyboard only", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(9000);

    /*
     * Read the option list INSIDE the open menu after every keystroke, rather than computing an
     * arrow count up front. The control moves its own active index when it opens (to the first
     * selected option) and again on every toggle, so a fixed number of downs is a guess about
     * internal state. Walking until the intended row is active is what an operator does anyway.
     */
    const selected = async () =>
        (await page.locator('[data-testid="addcharge-target"] [role=option][aria-selected=true] .alloy-select__option-label')
            .allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    const activeRow = async () =>
        page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            if (!a || a.getAttribute("role") !== "option") return null;
            return {
                label: a.querySelector(".alloy-select__option-label")?.textContent?.trim() ?? null,
                value: a.getAttribute("data-option-value"),
            };
        });

    /**
     * Move to the row carrying `value` and commit it. Keyboard only.
     *
     * Home first, then N ArrowDowns — NOT "press ArrowDown until it looks right". The control's
     * arrow stepper CLAMPS at the ends rather than wrapping (so a disabled option is skipped and
     * the last row is a floor), which means a walk that overshoots can never come back, and a
     * bounded loop silently ends on whatever row it was pinned against. Home is the one key that
     * makes the starting position known.
     */
    async function keyboardToggle(value: string) {
        const index = (await page.locator('[data-testid="addcharge-target"] [role=option]')
            .evaluateAll((nodes, wanted) => nodes.findIndex((n) => n.getAttribute("data-option-value") === wanted), value));
        expect(index, `the list offers ${value}`).toBeGreaterThanOrEqual(0);
        await page.keyboard.press("Home");
        for (let i = 0; i < index; i += 1) await page.keyboard.press("ArrowDown");
        const landed = await activeRow();
        expect(landed?.value, `arrowed onto ${value}`).toBe(value);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
    }

    const offered = await alloyOptions(page, "addcharge-target");
    const children = offered.filter((o) => /cert[ab]\s+certhouse/i.test(o.label));
    const household = offered.find((o) => /household/i.test(o.label))!;

    /* Clear to a known start, by keyboard. */
    await alloyTrigger(page, "addcharge-target").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    for (const s of offered.filter((o) => o.selected && o.value)) await keyboardToggle(s.value!);
    R.start = await selected();

    await keyboardToggle(children[0]!.value!);
    R.afterFirstKey = await selected();
    await keyboardToggle(children[1]!.value!);
    R.afterSecondKey = await selected();
    log(`KEYBOARD start=${JSON.stringify(R.start)} first=${JSON.stringify(R.afterFirstKey)} both=${JSON.stringify(R.afterSecondKey)}`);
    expect(R.afterSecondKey, "both children selected by keyboard").toHaveLength(2);

    await keyboardToggle(household.value!);
    R.afterHouseholdKey = await selected();
    log(`KEYBOARD household=${JSON.stringify(R.afterHouseholdKey)}`);
    expect(R.afterHouseholdKey, "exclusivity holds under the keyboard too").toEqual([household.label]);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);
    R.listAfterEscape = await page.locator('[data-testid="addcharge-target"] [role=listbox]').count();
    R.focusAfterEscape = await activeElementDescriptor(page);
    log(`ESCAPE list=${R.listAfterEscape} focus=${R.focusAfterEscape}`);
    expect(R.listAfterEscape, "Escape dismisses the list").toBe(0);
    expect(String(R.focusAfterEscape), "focus returns to the trigger, not BODY").not.toBe("BODY");
    save("add-keyboard", R);
});
