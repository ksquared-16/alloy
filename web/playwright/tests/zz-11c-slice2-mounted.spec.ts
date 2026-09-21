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
    toggleAlloyMulti,
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
    const details = page.locator("[data-financials-open-details]").first();
    if (await details.count()) {
        await details.click({ timeout: 20_000 });
        await page.waitForTimeout(11_000);
    }
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

    /* Child A + Child B — both stay selected. */
    await toggleAlloyMulti(page, "addcharge-target", children[0]!.label);
    await toggleAlloyMulti(page, "addcharge-target", children[1]!.label);
    await closeAlloy(page, "addcharge-target");
    R.bothChildren = await alloySelectedLabels(page, "addcharge-target");
    log(`BOTH CHILDREN: ${JSON.stringify(R.bothChildren)}`);
    expect(R.bothChildren, "both children remain selected").toHaveLength(2);

    /* Household clears the children. */
    await toggleAlloyMulti(page, "addcharge-target", /household/i);
    await closeAlloy(page, "addcharge-target");
    R.afterHousehold = await alloySelectedLabels(page, "addcharge-target");
    log(`AFTER HOUSEHOLD: ${JSON.stringify(R.afterHousehold)}`);
    expect(R.afterHousehold, "Household is the whole answer").toEqual([household[0]!.label]);

    /* A child clears Household. */
    await toggleAlloyMulti(page, "addcharge-target", children[0]!.label);
    await closeAlloy(page, "addcharge-target");
    R.afterChild = await alloySelectedLabels(page, "addcharge-target");
    log(`AFTER CHILD: ${JSON.stringify(R.afterChild)}`);
    expect(R.afterChild, "choosing a child evicts Household").toEqual([children[0]!.label]);

    /* Empty is empty — never Household. */
    await toggleAlloyMulti(page, "addcharge-target", children[0]!.label);
    await closeAlloy(page, "addcharge-target");
    R.afterEmpty = await alloySelectedLabels(page, "addcharge-target");
    R.emptyTriggerText = await alloyValueText(page, "addcharge-target");
    log(`EMPTY: selected=${JSON.stringify(R.afterEmpty)} trigger="${R.emptyTriggerText}"`);
    expect(R.afterEmpty, "nobody is selected").toHaveLength(0);
    expect(String(R.emptyTriggerText), "and an empty selection NEVER reads as Household")
        .not.toMatch(/household/i);

    /* No secondary sibling field, and Add's other controls are canonical too. */
    R.secondarySiblingField = await page.locator("[data-addcharge-alsochild], text=/also bill/i").count();
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

    const offered = await alloyOptions(page, "addcharge-target");
    const children = offered.filter((o) => /cert[ab]\s+certhouse/i.test(o.label));
    const householdIndex = offered.findIndex((o) => /household/i.test(o.label));

    /* Open with the keyboard and toggle the two children by arrow + Enter. */
    const idxA = offered.findIndex((o) => o.label === children[0]!.label);
    await keyboardPick(page, "addcharge-target", { openKey: "Enter", downs: idxA, commitKey: "Enter" });
    R.afterFirstKey = (await page.locator("[data-testid='addcharge-target'] [role=option][aria-selected=true]").allInnerTexts())
        .map((t) => t.replace(/\s+/g, " ").trim());
    /* The list stays OPEN on a multi-select, so the second child is another arrow away. */
    const idxB = offered.findIndex((o) => o.label === children[1]!.label);
    for (let i = 0; i < Math.abs(idxB - idxA); i += 1) await page.keyboard.press(idxB > idxA ? "ArrowDown" : "ArrowUp");
    await page.keyboard.press("Enter");
    R.afterSecondKey = (await page.locator("[data-testid='addcharge-target'] [role=option][aria-selected=true]").allInnerTexts())
        .map((t) => t.replace(/\s+/g, " ").trim());
    log(`KEYBOARD both: ${JSON.stringify(R.afterSecondKey)}`);
    expect(R.afterSecondKey, "both children selected by keyboard").toHaveLength(2);

    /* Household by keyboard clears them. */
    const from = idxB;
    for (let i = 0; i < Math.abs(householdIndex - from); i += 1) {
        await page.keyboard.press(householdIndex > from ? "ArrowDown" : "ArrowUp");
    }
    await page.keyboard.press("Enter");
    R.afterHouseholdKey = (await page.locator("[data-testid='addcharge-target'] [role=option][aria-selected=true]").allInnerTexts())
        .map((t) => t.replace(/\s+/g, " ").trim());
    log(`KEYBOARD household: ${JSON.stringify(R.afterHouseholdKey)}`);
    expect(R.afterHouseholdKey, "exclusivity holds under the keyboard too").toHaveLength(1);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    R.listAfterEscape = await page.locator("[data-testid='addcharge-target'] [role=listbox]").count();
    R.focusAfterEscape = await activeElementDescriptor(page);
    log(`ESCAPE: list=${R.listAfterEscape} focus=${R.focusAfterEscape}`);
    expect(R.listAfterEscape, "Escape dismisses the list").toBe(0);
    expect(String(R.focusAfterEscape), "and focus returns to the trigger, not BODY").not.toBe("BODY");
    save("add-keyboard", R);
});
