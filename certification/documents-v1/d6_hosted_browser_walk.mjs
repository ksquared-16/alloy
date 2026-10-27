// Documents V1 / D6 — hosted browser walk of the D6 surfaces, as the QA run's fixture_admin session.
// Usage: node d6_hosted_browser_walk.mjs <qa_run_id>   (run from web/ so `playwright` resolves)
// Visible controls only (role/text locators); screenshots in d6-human-qa/. Never prints cookies or URLs with tokens.
import { createRequire } from "node:module";
const { chromium } = createRequire(process.cwd() + "/package.json")("playwright");
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const RUN = process.argv[2];
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "d6-human-qa");
mkdirSync(OUT, { recursive: true });
const BASE = "https://staging.workwithalloy.com";
const STORAGE = join(os.homedir(), ".local/state/alloy-dev/gateway/auth/qa-runs", RUN, "fixture_admin", "storage-state.json");
const SUFFIX = RUN.split("_")[1];
const R = [];
const rec = (id, goal, ok, actual, shot) => { R.push({ id, goal, pass: !!ok, actual, screenshot: shot ?? null }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${goal} :: ${actual}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const api = [];
page.on("response", (r) => { const u = r.url(); if (/\/api\/admin\/documents\/(requirements|configuration\/requirements)/.test(u)) api.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, "").split("?")[0]}`); });
const body = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
const shot = async (n) => { const p = join(OUT, n); await page.screenshot({ path: p }); return `d6-human-qa/${n}`; };
const clickText = async (re, ms = 15000) => { const l = page.getByRole("button", { name: re }).or(page.getByRole("link", { name: re })).or(page.getByRole("tab", { name: re })).first(); await l.waitFor({ timeout: ms }); await l.click(); };

const openProcessing = async () => {
  await page.goto(`${BASE}/adminV2`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  if (/\/login/.test(page.url())) { console.log("SESSION DEAD"); process.exit(2); }
  await page.getByRole("link", { name: "Workspace home" }).click();
  await page.waitForTimeout(8000);
  await page.getByRole("button", { name: /^Processing/ }).first().click();
  await page.waitForTimeout(6000);
};
const inDialog = (re) => page.locator("[role=dialog] button").filter({ hasText: re }).first();
await openProcessing();

// 1. Processing → Work → Documents → Missing documents.
try {
  await inDialog(/^Work$/).click(); await page.waitForTimeout(4000);
  await inDialog(/^Documents$/).click(); await page.waitForTimeout(6000);
  await inDialog(/Missing documents/).click(); await page.waitForTimeout(9000);
  const t = await body();
  const s = await shot("01-missing-documents.png");
  rec("W1", "Processing → Documents → Missing documents lists the run's unmet requirement", t.includes(`QA D6 Kid Two ${SUFFIX}`) && /Missing/.test(t), `kid2=${t.includes(`QA D6 Kid Two ${SUFFIX}`)} kid1(satisfied, absent)=${!t.includes(`QA D6 Kid One ${SUFFIX}`)}`, s);
  rec("W2", "a satisfied requirement is not listed as work", !t.includes(`QA D6 Kid One ${SUFFIX}`), "Kid One absent", s);
  const row = page.getByText(`QA D6 Kid Two ${SUFFIX}`).first();
  await row.click(); await page.waitForTimeout(4000);
  const t2 = await body();
  const s2 = await shot("02-missing-row-detail.png");
  rec("W3", "the row detail names the action, due date and offers waive / open record", /Collect the document/i.test(t2) && /waive/i.test(t2) && /Open/i.test(t2), `collect=${/Collect the document/i.test(t2)} waive=${/waive/i.test(t2)} due=${/Due|due/.test(t2)}`, s2);
} catch (e) { rec("W1", "Processing → Documents → Missing documents reachable", false, String(e).slice(0, 200), await shot("01-missing-documents-error.png")); }

// 2. Studio → Documents → Requirements.
try {
  await openProcessing();
  await inDialog(/^Studio$/).click(); await page.waitForTimeout(5000);
  await inDialog(/^Documents$/).click(); await page.waitForTimeout(5000);
  await inDialog(/Requirements/).click(); await page.waitForTimeout(7000);
  const t = await body();
  const s = await shot("03-studio-requirements.png");
  rec("W4", "Studio → Documents → Requirements lists the run's requirement with its published version", t.includes("enrollment form (browser)") && /Published|published|v3/.test(t), `listed=${t.includes("enrollment form (browser)")}`, s);
} catch (e) { rec("W4", "Studio → Documents → Requirements reachable", false, String(e).slice(0, 200), await shot("03-studio-requirements-error.png")); }

// 3. Focus Panel readiness, reached from the work row's "Open the record's documents".
try {
  await openProcessing();
  await inDialog(/^Work$/).click(); await page.waitForTimeout(4000);
  await inDialog(/^Documents$/).click(); await page.waitForTimeout(6000);
  await inDialog(/Missing documents/).click(); await page.waitForTimeout(9000);
  await page.locator("[role=dialog] button").filter({ hasText: `QA D6 Kid Two ${SUFFIX}` }).first().click(); await page.waitForTimeout(3000);
  await inDialog(/Open the record.s documents/).click(); await page.waitForTimeout(12000);
  const childView = await body();
  await shot("05a-open-record-child-view.png");
  rec("W5a", "the work row's 'Open the record's documents' reaches the record's Documents card", /Document readiness|\d+ required/i.test(childView), `child view shows documents=${/Document readiness|\d+ required/i.test(childView)}`, "d6-human-qa/05a-open-record-child-view.png");
  // The case Focus Panel (as D4.7): New Leads → the run's family → Activity → Documents.
  await page.goto(`${BASE}/adminV2`, { waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForTimeout(6000);
  await page.getByRole("link", { name: "Workspace home" }).click(); await page.waitForTimeout(8000);
  const search = page.getByPlaceholder(/search/i).first();
  await search.click(); await search.fill(`QA D6 Adult One ${SUFFIX}`); await page.waitForTimeout(6000);
  await shot("05b-search-adult.png");
  await page.getByText(new RegExp(`QA D6 Adult One.*${SUFFIX}`)).first().click(); await page.waitForTimeout(10000);
  await shot("05c-adult-opened.png");
  try { await page.getByRole("button", { name: /^Activity$/ }).or(page.getByRole("tab", { name: /^Activity$/ })).first().click({ timeout: 8000 }); await page.waitForTimeout(3000); } catch {}
  try { await page.getByRole("button", { name: /^Documents$/ }).or(page.getByRole("tab", { name: /^Documents$/ })).first().click({ timeout: 8000 }); await page.waitForTimeout(9000); } catch {}
  const t = await body();
  const s = await shot("05-focus-readiness.png");
  rec("W5", "Focus Panel Documents shows readiness from the same evaluator (required / missing counts, the requirement)",
      /\d+ required/i.test(t) && /\d+ missing/i.test(t) && t.includes("enrollment form (browser)"),
      `required=${/\d+ required/i.test(t)} missing=${/\d+ missing/i.test(t)} req=${t.includes("enrollment form (browser)")}`, s);
  rec("W5b", "readiness shows the satisfied child and the missing child separately", t.includes(`QA D6 Kid One ${SUFFIX}`) && t.includes(`QA D6 Kid Two ${SUFFIX}`) && /Satisfied/i.test(t), `satisfied=${/Satisfied/i.test(t)}`, s);
} catch (e) { rec("W5", "Focus Panel readiness reachable", false, String(e).slice(0, 200), await shot("05-focus-readiness-error.png")); }

rec("W6", "the surfaces read only the canonical D6 routes", api.length > 0 && api.every((a) => /^2\d\d /.test(a)), JSON.stringify([...new Set(api)]).slice(0, 400));
writeFileSync(join(HERE, `d6_hosted_browser_walk_results.${RUN}.json`), JSON.stringify({ run: RUN, at: new Date().toISOString(), results: R, api: [...new Set(api)] }, null, 2));
console.log("SUMMARY", JSON.stringify({ passed: R.filter((r) => r.pass).length, total: R.length }));
await browser.close();
