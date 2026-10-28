import { open, ORIGIN } from "./lib.mjs";
const OUT = new URL("./out2/", import.meta.url).pathname;
const { browser, page, errors } = await open();
const net = [];
page.on("response", async (r) => { if (r.request().method() !== "GET" && /lifecycle-catalog|lifecycle-activation|stage-work-unit/.test(r.url())) { let b = ""; try { b = (await r.text()).slice(0, 500); } catch {} net.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")} ${b.replace(/[0-9a-f-]{36}/g, "<id>")}`); } });
const openMore = async () => {
  await page.goto(`${ORIGIN}/organization/processes`, { waitUntil: "networkidle", timeout: 90000 }); await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /^More$/ }).first().click(); await page.waitForTimeout(2000);
  const menu = page.getByTestId("lifecycle-board-process-menu").first();
  if (!(await menu.evaluate((d) => d.open))) await menu.locator("summary").click(); await page.waitForTimeout(800);
};
await openMore();
console.log("MENU:", (await page.getByTestId("lifecycle-board-process-menu").first().innerText()).replace(/\n+/g, " | "));
await page.getByTestId("lifecycle-activation-repair-workspace").click(); await page.waitForTimeout(8000);
await openMore();
const wu = page.getByTestId("lifecycle-activation-repair-work-units");
console.log("repair-work-units offered after workspace repair:", await wu.count());
if (await wu.count()) { await wu.click(); await page.waitForTimeout(8000); }
await page.screenshot({ path: `${OUT}bp5-after-repairs.png`, fullPage: true });
await page.getByText(/^Health$/).first().click(); await page.waitForTimeout(2000);
const refresh = page.getByRole("button", { name: /^Refresh$/ }); if (await refresh.count()) { await refresh.first().click(); await page.waitForTimeout(6000); }
const h = (await page.locator("main").first().innerText()).replace(/\n+/g, " | ");
console.log("HEALTH:", h.slice(h.indexOf("Not ready") >= 0 ? h.indexOf("Not ready") : h.indexOf("Configuration Health", 100), (h.indexOf("Not ready") >= 0 ? h.indexOf("Not ready") : h.indexOf("Configuration Health", 100)) + 700));
await page.screenshot({ path: `${OUT}bp5-health.png`, fullPage: true });
console.log("NET", JSON.stringify(net, null, 1));
console.log("errors", JSON.stringify(errors.slice(0, 4)));
await browser.close();
