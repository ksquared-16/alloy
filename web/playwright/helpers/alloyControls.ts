import { expect, type Locator, type Page } from "@playwright/test";

/**
 * DRIVING THE CANONICAL ALLOY CONTROLS FROM CERTIFICATION.
 *
 * The product moved off native `<select>` deliberately: a native option popup is drawn by the OS
 * on macOS, ignores the product's CSS, and cannot express a checked multi-selection. Certification
 * has to follow the product, so these helpers drive the shipped control through its REAL
 * semantics — open the listbox, read what it offers, choose by pointer or keyboard, dismiss —
 * rather than asserting an implementation detail that is no longer doctrine.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────────
 *
 * It adds no compatibility DOM to the product and reverts nothing for test convenience. Where an
 * old probe asserted `HTMLSelectElement.value`, the replacement asserts the EFFECT — what the
 * control now reads, and what the surface does about it — because that is the thing the product
 * actually promises.
 *
 * ── THE SHAPE IT DRIVES ───────────────────────────────────────────────────────────────────────
 *
 *   root      .alloy-select                  (data-testid from the `testId` prop)
 *   trigger   button.alloy-select__trigger    — carries the current summary and aria-expanded
 *   list      ul[role=listbox]                — aria-multiselectable on the multi variant
 *   option    li[role=option]                 — aria-selected, aria-disabled, data-option-value
 *
 * The list is mounted only while open, so every read here opens first and dismisses after.
 */

export type AlloyOption = {
    label: string;
    value: string | null;
    selected: boolean;
    disabled: boolean;
};

/** The control's root, addressed the way the product labels it. */
export function alloyControl(page: Page, testId: string): Locator {
    return page.locator(`[data-testid="${testId}"]`);
}

export function alloyTrigger(page: Page, testId: string): Locator {
    return alloyControl(page, testId).locator("button.alloy-select__trigger");
}

/** What the trigger currently reads — the single-select value, or the multi-select summary. */
export async function alloyValueText(page: Page, testId: string): Promise<string> {
    const v = alloyControl(page, testId).locator(".alloy-select__value");
    if ((await v.count()) === 0) return "";
    return (await v.first().innerText()).replace(/\s+/g, " ").trim();
}

export async function isAlloyControl(page: Page, testId: string): Promise<boolean> {
    return (await alloyControl(page, testId).locator("button.alloy-select__trigger").count()) > 0;
}

export async function isMultiSelect(page: Page, testId: string): Promise<boolean> {
    return (await alloyControl(page, testId).getAttribute("data-alloy-multiselect")) === "true";
}

export async function openAlloy(page: Page, testId: string): Promise<void> {
    const trigger = alloyTrigger(page, testId);
    await expect(trigger, `${testId} has a canonical Alloy trigger`).toHaveCount(1);
    if ((await trigger.getAttribute("aria-expanded")) === "true") return;
    await trigger.click({ timeout: 15_000 });
    await expect(alloyControl(page, testId).locator("[role=listbox]")).toHaveCount(1, { timeout: 15_000 });
}

export async function closeAlloy(page: Page, testId: string): Promise<void> {
    if ((await alloyControl(page, testId).locator("[role=listbox]").count()) === 0) return;
    await page.keyboard.press("Escape");
    await expect(alloyControl(page, testId).locator("[role=listbox]")).toHaveCount(0, { timeout: 10_000 });
}

/** Everything the control offers, with the two states certification cares about. */
export async function alloyOptions(page: Page, testId: string): Promise<AlloyOption[]> {
    await openAlloy(page, testId);
    const options = await alloyControl(page, testId)
        .locator("[role=option]")
        .evaluateAll((nodes) =>
            nodes.map((n) => ({
                label: (n as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
                value: n.getAttribute("data-option-value"),
                selected: n.getAttribute("aria-selected") === "true",
                disabled: n.getAttribute("aria-disabled") === "true",
            })),
        );
    await closeAlloy(page, testId);
    return options;
}

/** Choose by visible label, as an operator does. Leaves a single-select closed. */
export async function pickAlloy(page: Page, testId: string, label: string | RegExp): Promise<void> {
    await openAlloy(page, testId);
    const option = alloyControl(page, testId).locator("[role=option]").filter({ hasText: label }).first();
    await expect(option, `${testId} offers ${String(label)}`).toHaveCount(1);
    await option.click({ timeout: 15_000 });
}

/**
 * Toggle one option of a multi-select and leave the list OPEN, which is what the control does:
 * picking one of several is not finishing.
 */
export async function toggleAlloyMulti(page: Page, testId: string, label: string | RegExp): Promise<void> {
    await openAlloy(page, testId);
    const option = alloyControl(page, testId).locator("[role=option]").filter({ hasText: label }).first();
    await expect(option, `${testId} offers ${String(label)}`).toHaveCount(1);
    await option.click({ timeout: 15_000 });
}

/** The labels currently ticked. Reads the list, so it reflects the control and not a cached summary. */
export async function alloySelectedLabels(page: Page, testId: string): Promise<string[]> {
    return (await alloyOptions(page, testId)).filter((o) => o.selected).map((o) => o.label);
}

/**
 * KEYBOARD ONLY. Focus the trigger, open with the keyboard, walk with arrows and commit.
 *
 * `openKey` distinguishes the two ways the control opens; `commitKey` distinguishes select
 * (single, which closes) from toggle (multi, which does not).
 */
export async function keyboardPick(
    page: Page,
    testId: string,
    steps: { openKey?: "Enter" | " " | "ArrowDown"; downs: number; commitKey?: "Enter" | " " },
): Promise<void> {
    const trigger = alloyTrigger(page, testId);
    await trigger.focus();
    await page.keyboard.press(steps.openKey ?? "Enter");
    await expect(alloyControl(page, testId).locator("[role=listbox]")).toHaveCount(1, { timeout: 10_000 });
    for (let i = 0; i < steps.downs; i += 1) await page.keyboard.press("ArrowDown");
    await page.keyboard.press(steps.commitKey ?? "Enter");
}

/** Where focus actually sits — the question a focus-restoration claim has to answer. */
export async function activeElementDescriptor(page: Page): Promise<string> {
    return page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return "(null)";
        if (a === document.body) return "BODY";
        const testId = a.closest("[data-testid]")?.getAttribute("data-testid");
        return `${a.tagName}${testId ? `[${testId}]` : ""}${a.getAttribute("aria-label") ? `("${a.getAttribute("aria-label")}")` : ""}`;
    });
}

/**
 * Choose by the option's VALUE rather than its label.
 *
 * Certification often knows the identity it wants (a charge id it just posted) and not the
 * sentence the product renders for it — for these lists that sentence is a money string that
 * changes between runs. `data-option-value` carries the identity on both variants, so this
 * resolves the row and then commits by pointer, which is what an operator does.
 */
export async function pickAlloyByValue(page: Page, testId: string, value: string): Promise<void> {
    await openAlloy(page, testId);
    const list = alloyControl(page, testId).locator("[role=option]");
    const index = await list.evaluateAll(
        (nodes, wanted) =>
            nodes.findIndex(
                (n) =>
                    n.getAttribute("data-option-value") === wanted
                    || (n as HTMLElement).dataset.optionValue === wanted,
            ),
        value,
    );
    if (index >= 0) {
        await list.nth(index).click({ timeout: 15_000 });
        return;
    }
    throw new Error(
        `${testId} does not offer value ${value}; options are `
            + JSON.stringify(await list.allInnerTexts()),
    );
}

/**
 * The option identities a control is offering, for surfaces whose single-select rows do not carry
 * `data-option-value`. Returns labels; callers that need identity should match on a substring they
 * already know (a charge description, an amount), which is what the operator reads too.
 */
export async function alloyOptionLabels(page: Page, testId: string): Promise<string[]> {
    return (await alloyOptions(page, testId)).map((o) => o.label);
}
