import { open, riversideTours, openForm, TOUR } from "./lib.mjs";
const OUT = new URL("./out3/", import.meta.url).pathname;
const phase = process.argv[2]; // "override" | "inherit"
const { browser, page, errors } = await open();
const r = { phase };
if (phase === "override") {
  await riversideTours(page);
  await page.getByText("Booking experience").first().click(); await page.getByTestId("tours-public-brand").waitFor();
  await page.getByTestId("tours-brand-display_name").fill("Riverside QA");
  await page.getByTestId("tours-brand-save").click(); await page.waitForTimeout(2500);
  await riversideTours(page); await page.getByText("Preview & Share").first().click(); await page.waitForTimeout(3000);
  const pub = page.getByRole("button", { name: /Publish tour calendar here/ }).first();
  if (await pub.isVisible().catch(() => false)) { await pub.click(); await page.waitForTimeout(3000); }
}
if (phase === "customize") {
  await openForm(page);
  await page.getByTestId("form-builder-branding-card").click(); await page.waitForTimeout(1200);
  await page.getByTestId("form-builder-brand-source").getByText(/Customize for this form/).click(); await page.waitForTimeout(800);
  await page.getByTestId("form-builder-save-draft").click(); await page.waitForTimeout(2500);
  await page.keyboard.press("Escape"); await page.waitForTimeout(800);
  await openForm(page);
  const dist = page.getByTestId("form-builder-distribution-section"); await dist.waitFor({ timeout: 20000 });
  if (!(await page.getByRole("button", { name: /^Republish version$/ }).isVisible().catch(() => false))) { await dist.getByText(/DISTRIBUTION/i).first().click(); await page.waitForTimeout(1200); }
  const pubResp = page.waitForResponse((x) => x.request().method() !== "GET" && /publish/i.test(x.url()), { timeout: 30000 }).catch(() => null);
  await page.getByRole("button", { name: /^Republish version$/ }).click(); await page.waitForTimeout(1500);
  const pr = await pubResp; r.republish = pr ? pr.status() : "none";
  await page.keyboard.press("Escape");
}
if (phase === "inherit") {
  await openForm(page);
  const card = page.getByTestId("form-builder-branding-card");
  await card.click(); await page.waitForTimeout(1200);
  const radios = await page.getByTestId("form-builder-brand-source").locator("input").evaluateAll((e) => e.map((x) => x.checked));
  if (!radios[0]) { await page.getByTestId("form-builder-brand-source").getByText(/Use the school/).click(); await page.getByTestId("form-builder-save-draft").click(); await page.waitForTimeout(2500); }
  r.brandSourceInherit = (await page.getByTestId("form-builder-brand-source").locator("input").evaluateAll((e) => e.map((x) => x.checked)))[0];
  await page.keyboard.press("Escape"); await page.waitForTimeout(800);
  await openForm(page);
  const dist = page.getByTestId("form-builder-distribution-section"); await dist.waitFor({ timeout: 20000 });
  if (!(await page.getByRole("button", { name: /^Republish version$/ }).isVisible().catch(() => false))) { await dist.getByText(/DISTRIBUTION/i).first().click(); await page.waitForTimeout(1200); }
  const pubResp = page.waitForResponse((x) => x.request().method() !== "GET" && /publish/i.test(x.url()), { timeout: 30000 }).catch(() => null);
  await page.getByRole("button", { name: /^Republish version$/ }).click(); await page.waitForTimeout(1500);
  const c = page.getByRole("button", { name: /^(Publish|Confirm|Republish|Republish version)$/ }).last(); if (await c.isVisible().catch(() => false)) await c.click().catch(() => {});
  const pr = await pubResp; r.republish = pr ? pr.status() : "none";
  await page.waitForTimeout(2500);
  r.toolbar = (await page.getByTestId("surface-publish-toolbar").innerText()).replace(/\n+/g, " | ");
  await page.keyboard.press("Escape");
}
// Booking experience
await riversideTours(page);
await page.getByText("Booking experience").first().click(); const panel = page.getByTestId("tours-public-brand"); await panel.waitFor(); await page.waitForTimeout(1500);
r.note = (await page.getByTestId("tours-brand-published-form").innerText()).replace(/\n+/g, " ");
r.nameField = (await page.locator('[data-testid="tours-brand-display_name-form-wins"], [data-testid="tours-brand-display_name-shown"]').first().innerText()).replace(/\n+/g, " ");
r.colourField = (await page.locator('[data-testid="tours-brand-accent_color-form-wins"], [data-testid="tours-brand-accent_color-shown"]').first().innerText()).replace(/\n+/g, " ");
r.previewName = (await page.getByTestId("tours-brand-preview").innerText()).split("\n").find((l) => l && !/PREVIEW/i.test(l));
await panel.screenshot({ path: `${OUT}d1-${phase}-booking-experience.png` });
// Preview & Share
await page.getByText("Preview & Share").first().click(); await page.waitForTimeout(3000);
r.share = (await page.getByTestId("tours-share-effective-brand").innerText().catch(() => "—")).replace(/\n+/g, " ");
r.shareStep2 = (await page.getByTestId("tours-share-published").first().innerText().catch(() => "")).split("\n").find((l) => /Step 2/.test(l));
await page.getByTestId("tours-share-section").screenshot({ path: `${OUT}d1-${phase}-preview-share.png` });
// public page
const fam = await browser.newContext(); const fp = await fam.newPage();
await fp.goto(TOUR, { waitUntil: "networkidle", timeout: 90000 });
r.publicHeader = (await fp.locator("body").innerText()).split("\n")[0];
r.publicCta = await fp.getByTestId("public-tour-cta-heading").innerText().catch(() => null);
await fp.screenshot({ path: `${OUT}d1-${phase}-public.png` });
r.errors = errors.filter((e) => !/404/.test(e)).slice(0, 4);
console.log(JSON.stringify(r, null, 1));
await browser.close();
