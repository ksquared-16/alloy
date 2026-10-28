import { open, OUT, ORIGIN, TOUR, riversideTours, mainText } from "./lib.mjs";
const { browser, page, errors } = await open();
page.on("dialog", (d) => d.accept());
const r = {};
// step 9: delete one duplicate org-wide Monday window
await page.goto(`${ORIGIN}/organization/tours`, { waitUntil: "networkidle", timeout: 90000 }); await page.waitForTimeout(2500);
const orgCards = page.locator("li", { hasText: "Monday window" });
r.orgBefore = await orgCards.count();
await orgCards.first().getByRole("button", { name: /^Delete$/ }).click(); await page.waitForTimeout(3000);
r.orgAfter = await page.locator("li", { hasText: "Monday window" }).count();
await riversideTours(page);
const t = await mainText(page);
r.box = (t.match(/Families booking at[^\n]*/) || [""])[0].slice(0, 160);
r.sameNote = /Same days and times as/.test(t);
// step 35: reset booking experience
await page.getByText("Booking experience").first().click(); await page.getByTestId("tours-public-brand").waitFor();
await page.getByRole("button", { name: /Use the organization/ }).click(); await page.waitForTimeout(800);
const save = page.getByTestId("tours-brand-save"); if (await save.isEnabled()) await save.click(); await page.waitForTimeout(2500);
r.brandAfter = (await page.getByTestId("tours-public-brand").innerText()).match(/Shown to families: [^\n]*/g)?.slice(0, 4);
// step 33: withdraw calendar
await riversideTours(page); await page.getByText("Preview & Share").first().click(); await page.waitForTimeout(3000);
await page.getByRole("button", { name: /Withdraw calendar/ }).click(); await page.waitForTimeout(3000);
const s = await mainText(page); r.share = s.slice(s.indexOf("Preview & Share", s.indexOf("Booking experience")), s.indexOf("Preview & Share", s.indexOf("Booking experience")) + 220).replace(/\n+/g, " | ");
await page.screenshot({ path: `${OUT}i1-withdrawn.png`, fullPage: true });
const fam = await browser.newContext(); const fp = await fam.newPage();
await fp.goto(TOUR, { waitUntil: "networkidle" }); r.publicAfterWithdraw = (await fp.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 200);
r.errors = errors.slice(0, 4);
console.log(JSON.stringify(r, null, 1));
await browser.close();
