import { open, OUT, openForm } from "./lib.mjs";
const { browser, page, errors } = await open();
await openForm(page);
const measure = async (label) => {
  const out = {};
  for (const f of ["Parent / guardian first name", "Parent / guardian last name", "Child first name", "Child last name", "Email"]) {
    const el = page.getByText(new RegExp(`^${f.replace("/", "\\/")}\\s*\\*?$`)).last();
    const b = await el.boundingBox().catch(() => null);
    out[f] = b && [Math.round(b.x), Math.round(b.y)];
  }
  await page.screenshot({ path: `${OUT}h7-${label}.png` });
  return out;
};
const r = {};
r.edit = await measure("edit");
await page.getByRole("button", { name: /Preview/ }).first().click(); await page.waitForTimeout(3000);
r.preview = await measure("preview");
const pv = page.getByRole("button", { name: /^Submit$/ }).last();
r.previewSubmit = await pv.evaluate(e => { const s = getComputedStyle(e); return { bg: s.backgroundColor, color: s.color }; }).catch(() => null);
r.requiredMarks = await page.locator("text=*").count();
r.pairs = Object.fromEntries(["edit", "preview"].map(k => [k, { parent: r[k]["Parent / guardian first name"]?.[1] === r[k]["Parent / guardian last name"]?.[1], child: r[k]["Child first name"]?.[1] === r[k]["Child last name"]?.[1], emailOwnRow: r[k]["Email"]?.[1] !== r[k]["Parent / guardian first name"]?.[1] }]));
r.errors = errors.slice(0, 4);
console.log(JSON.stringify(r, null, 1));
await browser.close();
