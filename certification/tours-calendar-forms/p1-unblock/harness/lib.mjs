import { chromium } from "playwright";
import os from "node:os";
export const ORIGIN = process.env.PREVIEW_ORIGIN; // the preview record's public_origin
if (!ORIGIN) throw new Error("PREVIEW_ORIGIN is required");
export const STATE = `${os.homedir()}/.local/state/alloy-dev/gateway/auth/candidate-preview/alloy.candidate.enrollment/storage-state.json`;
export const OUT = process.env.QA_OUT || new URL("./out/", import.meta.url).pathname;
export async function open({ auth = true, viewport = { width: 1440, height: 1000 } } = {}) {
  // Harness-only: the preview is a private tailnet host; Chromium's Local Network Access check would block a framing test page.
  const browser = await chromium.launch({ args: ["--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests"] });
  const ctx = await browser.newContext({ storageState: auth ? STATE : undefined, viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  return { browser, ctx, page, errors };
}
export const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
export async function createSchedule(page, { name, days, windows, len = 30, max = 1, approval = false, tz = "America/Los_Angeles" }) {
  const ed = page.getByTestId("tours-schedule-editor");
  await ed.waitFor({ timeout: 20000 });
  await ed.getByTestId("tours-schedule-name").fill(name);
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const b = ed.getByTestId(`tours-schedule-day-${d}`);
    const on = (await b.getAttribute("aria-pressed")) === "true";
    if (on !== days.includes(d)) await b.click();
  }
  for (let i = 0; i < windows.length; i++) {
    if (i > 0) await ed.getByTestId("tours-schedule-add-window").click();
    await ed.getByTestId(`tours-schedule-window-start-${i}`).fill(windows[i][0]);
    await ed.getByTestId(`tours-schedule-window-end-${i}`).fill(windows[i][1]);
  }
  const tzIn = ed.getByTestId("locations-tour-timezone");
  if (!(await tzIn.inputValue())) await tzIn.fill(tz);
  await ed.getByTestId("locations-tour-duration").fill(String(len));
  await ed.getByTestId("locations-tour-max-bookings").fill(String(max));
  const ap = ed.getByTestId("locations-tour-approval");
  if ((await ap.isChecked()) !== approval) await ap.click();
  const preview = await ed.getByTestId("tours-schedule-preview").innerText();
  await ed.getByTestId("tours-schedule-save").click();
  try { await ed.waitFor({ state: "detached", timeout: 15000 }); }
  catch { throw new Error("EDITOR STILL OPEN: " + (await ed.innerText()).replace(/\n+/g, " | ").slice(0, 900)); }
  await page.waitForTimeout(1500);
  return preview;
}
export async function riversideTours(page) {
  await page.goto(`${ORIGIN}/organization/locations?locationId=${RIVERSIDE}&tab=tours`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(3000);
}
export const mainText = async (page) => (await page.locator("main").first().innerText()).replace(/\n{2,}/g, "\n");
export async function openProcessing(page, intent) {
  if (!/\/workspace$/.test(page.url())) await page.goto(`${ORIGIN}/workspace`, { waitUntil: "networkidle", timeout: 90000 });
  await page.evaluate((intent) => window.dispatchEvent(new CustomEvent("adminv2:open-processing-modal", { detail: { intent } })), intent);
  await page.waitForTimeout(3500);
}
export const FORM_ID = process.env.FORM_ID; // the published inquiry form's id
export async function openForm(page, name = "Northwind Tour Inquiry", folder = /^Manual forms$/) {
  await openProcessing(page, { mode: "studio", studioTab: "forms", formId: FORM_ID, formName: name });
  if (await page.getByTestId("processing-form-builder").isVisible().catch(() => false)) return page.locator('[role="dialog"]').last();
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.getByText(folder).first().click(); await page.waitForTimeout(1500);
  await dlg.getByText(name).first().click(); await page.waitForTimeout(4000);
  return dlg;
}
export const TOUR = process.env.TOUR_URL; // Preview & Share > Hosted booking page (not committed: it carries the link token)
export async function fillStep2(page, { first = "Robin", last = "Tourqa", email, phone = "5415550101", cfirst = "Avery", clast = "Tourqa" }) {
  const f = page.locator("body");
  const text = f.locator('input[type="text"]'); 
  await text.nth(0).fill(first); await text.nth(1).fill(last);
  await f.locator('input[type="email"]').first().fill(email);
  await f.locator('input[type="tel"]').first().fill(phone);
  await text.nth(2).fill(cfirst); await text.nth(3).fill(clast);
}
export async function openCase(page, emailRe) {
  await openProcessing(page, { mode: "work", workView: "work" });
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.getByText(/^Incoming$/).first().click(); await page.waitForTimeout(2000);
  const rows = dlg.getByRole("button", { name: /New enrollment lead/ });
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    await rows.nth(i).click(); await page.waitForTimeout(3000);
    if (emailRe.test(await dlg.innerText())) return dlg;
  }
  throw new Error("case not found");
}
export const caseText = async (dlg) => { const t = (await dlg.innerText()).replace(/\n+/g, " | "); const i = t.lastIndexOf("Robin Tourqa — New enrollment lead | "); return t.slice(i); };
