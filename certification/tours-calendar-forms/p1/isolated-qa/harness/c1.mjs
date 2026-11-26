import { open, ORIGIN, OUT, createSchedule, riversideTours, mainText } from "./lib.mjs";
const { browser, page, errors } = await open();
const log = {};
await page.goto(`${ORIGIN}/organization/tours`, { waitUntil: "networkidle", timeout: 90000 });
for (const n of [1, 2]) {
  await page.getByRole("button", { name: /Add organization-wide schedule/i }).first().click();
  log[`org${n}`] = await createSchedule(page, { name: "Monday window", days: [1], windows: [["09:00", "12:00"]] });
}
await riversideTours(page);
await page.getByRole("button", { name: /Add a schedule for/i }).first().click();
log.loc1 = await createSchedule(page, { name: "Monday window", days: [1], windows: [["10:00", "12:00"]] });
await page.getByRole("button", { name: /Add a schedule for/i }).first().click();
log.loc2 = await createSchedule(page, { name: "QA Weekdays", days: [2, 3, 4, 5], windows: [["13:00", "14:00"]], approval: true });
await riversideTours(page);
const t = await mainText(page);
log.view = t.slice(t.indexOf("Families booking"), t.indexOf("Families booking") + 2500);
await page.screenshot({ path: `${OUT}c-riverside-availability.png`, fullPage: true });
log.errors = errors.slice(0, 5);
console.log(JSON.stringify(log, null, 1));
await browser.close();
