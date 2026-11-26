import { open, TOUR, openCase } from "./lib.mjs";
const OUT = new URL("./out2/", import.meta.url).pathname;
const fam = await open({ auth: false });
const p = fam.page; let status = null;
// Tamper with the browser's submit body: inject the hidden person opt-in answers.
await p.route("**/submissions/*/submit", async (route) => {
  const body = route.request().postDataJSON();
  body.payload = body.payload ?? {}; body.payload.values = { ...(body.payload.values ?? {}), email_opt_in: true, sms_opt_in: true };
  const res = await route.fetch({ postData: JSON.stringify(body) }); status = res.status(); await route.fulfill({ response: res });
});
await p.goto(TOUR, { waitUntil: "networkidle", timeout: 90000 });
await p.getByRole("button", { name: /October 29/ }).click(); await p.waitForTimeout(800);
await p.getByTestId("public-tour-times").getByRole("button").last().click();
await p.getByRole("button", { name: /Continue/ }).first().click(); await p.waitForTimeout(3500);
await p.getByLabel(/^Parent \/ guardian first name/).fill("Tamper");
await p.getByLabel(/^Parent \/ guardian last name/).fill("Optinqa");
await p.getByLabel(/^Email\s*\*$/).fill("qa+enrtamper@example.invalid");
await p.getByLabel(/^Child first name/).fill("Sage");
await p.getByLabel(/^Child last name/).fill("Optinqa");
await p.getByRole("button", { name: /^Submit$/ }).click(); await p.waitForTimeout(6000);
const received = /tour request was received/.test(await p.locator("body").innerText());
await fam.browser.close();
const op = await open();
const dlg = await openCase(op.page, /qa\+enrtamper@/);
const t = (await dlg.innerText()).replace(/\n+/g, " | ");
const came = t.slice(t.indexOf("SUBMITTED VALUES"), t.indexOf("WHERE IT CAME FROM"));
await dlg.screenshot({ path: `${OUT}d5-tamper-case.png` });
console.log(JSON.stringify({ submitStatus: status, received, submittedValues: came, optInStored: /opt-in/i.test(came) }, null, 1));
await op.browser.close();
