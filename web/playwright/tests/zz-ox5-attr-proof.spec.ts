import { test } from "@playwright/test";
/**
 * OX5 Gate A — is data-card-subject actually SERVED, and does it agree with the body's subject?
 *
 * cardsBoundToB came back 0 while six cells existed. That has two very different causes: the
 * attribute is absent (instrumentation not really deployed), or it is present but keyed in a
 * different id space than the body attribute the probe compared it against. Only one of those is a
 * Gate A failure, so this reports the raw values instead of a derived count.
 */
test("ox5 attr proof", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(15000);
    const before = await page.evaluate(() => ({
        cardSubjectNodes: document.querySelectorAll("[data-card-subject]").length,
        cardSubjects: [...new Set([...document.querySelectorAll("[data-card-subject]")].map((e) => e.getAttribute("data-card-subject")))],
        bodySubject: document.querySelector("[data-focus-panel-body-subject]")?.getAttribute("data-focus-panel-body-subject") ?? null,
        cells: document.querySelectorAll(".alloy-os-ucard").length,
    }));
    // Switch subject, then re-read both id spaces.
    const acted = await page.evaluate(`(() => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length<2) return false;
        const cur=rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected'));
        rows[cur>=0?(cur+1)%rows.length:1].click(); return true;
    })()`);
    await page.waitForTimeout(12000);
    const after = await page.evaluate(() => ({
        cardSubjectNodes: document.querySelectorAll("[data-card-subject]").length,
        cardSubjects: [...new Set([...document.querySelectorAll("[data-card-subject]")].map((e) => e.getAttribute("data-card-subject")))],
        bodySubject: document.querySelector("[data-focus-panel-body-subject]")?.getAttribute("data-focus-panel-body-subject") ?? null,
        cells: document.querySelectorAll(".alloy-os-ucard").length,
        signedOut: !!document.querySelector('input[type="password"]'),
        // Which render path produced these cards? Their own attribute set names it.
        cardAttrs: [...document.querySelectorAll(".alloy-os-ucard")].slice(0, 2).map((el) => ({
            tag: el.tagName,
            attrs: el.getAttributeNames().filter((a) => a.startsWith("data-")),
        })),
    }));
    console.log(`[attr] ${JSON.stringify({ acted, before, after })}`);
});
