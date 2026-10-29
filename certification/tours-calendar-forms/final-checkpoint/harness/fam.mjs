import { open, OUT } from "./lib.mjs";
import fs from "node:fs";
export const LINK = JSON.parse(fs.readFileSync(new URL("./tour-url.secret", import.meta.url), "utf8"));
export const STATE_FILE = new URL("./journey-state.json", import.meta.url);
export const loadState = () => (fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {});
export const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1));
export const MOBILE = { width: 390, height: 844 };
/** A family requests a tour: standalone (hosted page) or iframe (the published embed on a school page). */
export async function familyRequest({ tag, dayRe, time, first, last, email, consent = {}, mobile = false, iframe = false }) {
  const { browser, page, errors } = await open({ auth: false, viewport: mobile ? MOBILE : undefined });
  let root = page;
  if (iframe) {
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body style="margin:0;font-family:sans-serif"><h1 style="font-size:18px;padding:8px">Northwind — school website</h1>${LINK.iframe}</body></html>`);
    await page.waitForTimeout(6000);
    root = page.frameLocator("iframe").first();
  } else {
    await page.goto(LINK.hosted, { waitUntil: "networkidle", timeout: 90000 });
  }
  const r = { tag, mobile, iframe };
  const next = root.getByRole("button", { name: /›|Next month/ }).first();
  if (!(await root.getByRole("button", { name: dayRe }).count())) { await next.click(); await page.waitForTimeout(1200); }
  await root.getByRole("button", { name: dayRe }).first().click(); await page.waitForTimeout(1200);
  r.times = await root.getByTestId("public-tour-times").getByRole("button").allInnerTexts();
  await root.getByTestId("public-tour-times").getByRole("button", { name: time }).click();
  await root.getByRole("button", { name: /Continue/ }).first().click(); await page.waitForTimeout(4000);
  r.consentControls = await root.getByTestId("public-marketing-consent").count();
  await root.getByLabel(/^Parent \/ guardian first name/).fill(first);
  await root.getByLabel(/^Parent \/ guardian last name/).fill(last);
  await root.getByLabel(/^Email\s*\*?$/).fill(email);
  await root.getByLabel(/^Child first name/).fill("Quinn");
  await root.getByLabel(/^Child last name/).fill(last);
  if (consent.email) await root.getByTestId("public-marketing-consent-email").check();
  if (consent.sms) await root.getByTestId("public-marketing-consent-sms").check();
  await page.screenshot({ path: `${OUT}${tag}-form.png`, fullPage: !iframe });
  const sub = page.waitForResponse((x) => /\/submit$/.test(x.url()) && x.request().method() === "POST", { timeout: 30000 }).catch(() => null);
  await root.getByRole("button", { name: /^Submit$/ }).click();
  const resp = await sub; r.submitStatus = resp?.status() ?? null;
  try { const j = await resp?.json(); r.submitRequest = j ? { tour: j.data?.tour_request?.state ?? null, consent: (resp.request().postDataJSON() ?? {}).marketing_consent ?? null } : null; } catch {}
  await page.waitForTimeout(5000);
  const body = iframe ? await page.frameLocator("iframe").first().locator("body").innerText() : await page.locator("body").innerText();
  r.received = /tour request was received/i.test(body);
  await page.screenshot({ path: `${OUT}${tag}-received.png`, fullPage: !iframe });
  r.errors = errors.filter((e) => !/favicon|409/.test(e)).slice(0, 3);
  r.err409 = errors.filter((e) => /409/.test(e)).length;
  await browser.close();
  return r;
}
