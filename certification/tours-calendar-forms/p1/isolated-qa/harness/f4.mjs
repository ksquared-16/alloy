import { open, OUT, TOUR, fillStep2 } from "./lib.mjs";
const results = {};
for (const [name, viewport, submit] of [["iframe-desktop", { width: 1440, height: 1000 }, false], ["iframe-mobile", { width: 390, height: 844 }, true], ["standalone-mobile", { width: 390, height: 844 }, false]]) {
  const { browser, page, errors } = await open({ auth: false, viewport });
  const framed = name.startsWith("iframe");
  let fr = page;
  if (framed) {
    await page.route("http://localhost:4719/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><body style="font-family:Georgia;background:#fbf7ef;margin:0;padding:8px"><h1>Come visit our campus</h1><iframe src="${TOUR}" title="Book a Campus Visit" style="width:100%;max-width:760px;min-height:900px;border:0;"></iframe></body></html>` }));
    await page.goto("http://localhost:4719/visit", { waitUntil: "networkidle", timeout: 90000 });
    fr = page.frameLocator("iframe");
  } else await page.goto(TOUR, { waitUntil: "networkidle", timeout: 90000 });
  const r = {};
  if (submit) { await fr.getByRole("button", { name: /October 29/ }).click(); await page.waitForTimeout(1500); }
  await fr.getByTestId("public-tour-times").getByRole("button").first().click();
  await fr.getByRole("button", { name: /Continue/ }).first().click(); await page.waitForTimeout(4000);
  r.parentUrlUnchanged = framed ? page.url() === "http://localhost:4719/visit" : null;
  r.requestedTour = (await fr.getByText(/Requested tour/).count()) > 0;
  const bb = async (i) => { const b = await fr.locator('input[type="text"]').nth(i).boundingBox(); return b && [Math.round(b.x), Math.round(b.y), Math.round(b.width)]; };
  r.firstLast = [await bb(0), await bb(1)];
  r.sideBySide = r.firstLast[0] && r.firstLast[1] && r.firstLast[0][1] === r.firstLast[1][1];
  const sb = await fr.getByRole("button", { name: /^Submit$/ }).boundingBox(); r.submitWidth = sb && Math.round(sb.width);
  r.hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: `${OUT}f4-${name}.png`, fullPage: true });
  if (submit) {
    await fillStep2(framed ? { locator: (s) => fr.locator(s) } : page, { email: "qa+enrtour2@example.invalid" }).catch(async () => {
      const t = fr.locator('input[type="text"]'); await t.nth(0).fill("Jordan"); await t.nth(1).fill("Tourqa"); await fr.locator('input[type="email"]').fill("qa+enrtour2@example.invalid"); await t.nth(2).fill("Sky"); await t.nth(3).fill("Tourqa");
    });
    await fr.getByRole("button", { name: /^Submit$/ }).click(); await page.waitForTimeout(6000);
    r.received = (await fr.getByText(/Your tour request was received/).count()) > 0;
    r.receivedText = (await fr.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 300);
    r.parentUrlAfterSubmit = page.url();
    await page.screenshot({ path: `${OUT}f4-${name}-received.png`, fullPage: true });
  }
  r.errors = errors.filter(e => !/409/.test(e)).slice(0, 4);
  results[name] = r; await browser.close();
}
console.log(JSON.stringify(results, null, 1));
