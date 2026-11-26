import { open, OUT, ORIGIN, TOUR, RIVERSIDE, riversideTours } from "./lib.mjs";
const op = await open(); const o = op.page; o.on("dialog", (d) => d.accept());
const fam = await op.browser.newContext(); const p = await fam.newPage();
const r = {};
const friTimes = async () => { await p.goto(TOUR, { waitUntil: "networkidle", timeout: 90000 });
  const body = await p.locator("body").innerText(); if (/unavailable/i.test(body) && !/October/.test(body)) return "CALENDAR UNAVAILABLE";
  const day = p.getByRole("button", { name: /October 30/ }); const dis = await day.isDisabled().catch(() => null);
  if (dis) return { disabled: true };
  await day.click(); await p.waitForTimeout(1000);
  return { disabled: false, times: await p.getByTestId("public-tour-times").getByRole("button").allInnerTexts().catch(() => []) }; };
// republish
await riversideTours(o); await o.getByText("Preview & Share").first().click(); await o.waitForTimeout(3000);
const pubBtn = o.getByRole("button", { name: /Publish tour calendar here/ }).first(); if (await pubBtn.isVisible().catch(() => false)) { await pubBtn.click(); await o.waitForTimeout(3000); }
r.before = await friTimes();
// add holiday
await riversideTours(o); await o.getByRole("tab", { name: /^Scheduling$/ }).click(); await o.waitForTimeout(3500);
const sub = o.getByText(/^Operating calendar$/).first(); if (await sub.isVisible().catch(() => false) && !(await o.getByTestId("locations-operating-calendar").count())) { await sub.click(); await o.waitForTimeout(2500); }
console.error("SCHED:", (await o.locator("main").first().innerText()).replace(/\n+/g, " | ").slice(0, 700));
const panel = o.getByTestId("locations-operating-calendar"); await panel.waitFor({ timeout: 20000 });
r.panelIntro = (await panel.innerText()).replace(/\n+/g, " | ").slice(0, 300);
await o.getByTestId("operating-calendar-add-holiday").click(); await o.waitForTimeout(800);
const ed = o.getByTestId("operating-calendar-editor");
await ed.getByTestId("operating-calendar-name").fill("QA Holiday");
await ed.getByTestId("operating-calendar-from").fill("2026-10-30");
await ed.getByTestId("operating-calendar-to").fill("2026-10-30");
r.editor = (await ed.innerText()).replace(/\n+/g, " | ").slice(0, 600);
await ed.getByTestId("operating-calendar-review").click(); await o.waitForTimeout(3000);
r.impact = (await o.getByTestId("operating-calendar-impact").innerText().catch(async () => (await ed.innerText()))).replace(/\n+/g, " | ").slice(0, 700);
console.error("PRE-CONFIRM", JSON.stringify({ editor: r.editor, impact: r.impact, err: await o.getByTestId("operating-calendar-error").innerText().catch(() => null) }));
await o.getByTestId("operating-calendar-confirm").click(); await o.waitForTimeout(3000);
r.entries = (await o.getByTestId("operating-calendar-entries").innerText()).replace(/\n+/g, " | ").slice(0, 400);
await o.screenshot({ path: `${OUT}oc1-holiday.png`, fullPage: true });
r.during = await friTimes();
await p.screenshot({ path: `${OUT}oc1-public-holiday.png`, fullPage: true });
// reopen (withdraw) the holiday
const entry = o.locator("[data-testid^=operating-calendar-entry-]", { hasText: "QA Holiday" }).first();
await entry.locator("[data-testid^=operating-calendar-withdraw-]").click(); await o.waitForTimeout(1500);
const rev = o.getByTestId("operating-calendar-review"); if (await rev.isVisible().catch(() => false)) { await rev.click(); await o.waitForTimeout(2500); }
const cf = o.getByTestId("operating-calendar-confirm"); if (await cf.isVisible().catch(() => false)) { await cf.click(); await o.waitForTimeout(3000); }
r.entriesAfterReopen = (await o.getByTestId("operating-calendar-entries").innerText().catch(() => "")).replace(/\n+/g, " | ").slice(0, 300);
r.after = await friTimes();
// withdraw calendar again
await riversideTours(o); await o.getByText("Preview & Share").first().click(); await o.waitForTimeout(3000);
await o.getByRole("button", { name: /Withdraw calendar/ }).click(); await o.waitForTimeout(3000);
r.errors = op.errors.slice(0, 4);
console.log(JSON.stringify(r, null, 1));
await op.browser.close();
