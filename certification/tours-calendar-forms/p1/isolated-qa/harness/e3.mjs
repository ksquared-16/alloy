import { open, OUT, openForm, riversideTours, RIVERSIDE } from "./lib.mjs";
const { browser, page, errors } = await open();
await openForm(page);
const dist = page.getByTestId("form-builder-distribution-section");
await dist.waitFor({ timeout: 15000 });
if (!(await page.getByTestId("form-location-share-links").count())) { await dist.getByText(/^DISTRIBUTION$/).first().click(); await page.waitForTimeout(1500); }
await page.getByTestId(`location-link-create-${RIVERSIDE}`).click(); await page.waitForTimeout(3000);
console.log("ROW:", (await page.getByTestId(`location-share-site-row-${RIVERSIDE}`).innerText()).replace(/\n+/g, " | "));
await page.keyboard.press("Escape");
// §E Preview & Share
await riversideTours(page);
await page.getByText("Preview & Share").first().click(); await page.waitForTimeout(3500);
const sec = () => page.locator("main").first().innerText().then(t => { const i = t.indexOf("Preview & Share", t.indexOf("Booking experience")); return t.slice(i, i + 1800).replace(/\n+/g, " | "); });
console.log("BEFORE:", await sec());
const pub = page.getByRole("button", { name: /Publish tour calendar here/ }).first();
const resp = page.waitForResponse(r => r.request().method() === "PATCH", { timeout: 20000 }).catch(() => null);
await pub.click(); const r = await resp; console.log("patch", r ? `${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "").replace(/[A-Za-z0-9_-]{24,}/g, "<id>")}` : "none");
await page.waitForTimeout(3000);
console.log("AFTER:", await sec());
await page.screenshot({ path: `${OUT}e3-share-published.png`, fullPage: true });
const snippets = await page.locator("main code, main pre, main textarea, main input[readonly]").evaluateAll(e => e.map(x => (x.value || x.textContent || "").slice(0, 400)));
console.log("SNIPPETS:", JSON.stringify(snippets));
console.log("errors", JSON.stringify(errors.slice(0, 5)));
await browser.close();
