/**
 * Browser QA — Mission vs EPP (All Family Leads → Kurzman).
 * Evidence under docs/audits/active/enrollment-e2e-mission-convergence/
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3015";
const OUT = join(
  process.cwd(),
  "../docs/audits/active/enrollment-e2e-mission-convergence",
);
mkdirSync(OUT, { recursive: true });
const lines = [];
const log = (l) => {
  lines.push(l);
  console.log(l);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState:
    process.env.PLAYWRIGHT_STORAGE_STATE ||
    `${process.env.HOME}/.local/state/alloy-dev/auth/slot5/storage-state.json`,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const shot = async (n) => {
  await page.screenshot({ path: join(OUT, `${n}.png`), fullPage: false });
  log(`SHOT ${n}`);
};

try {
  await page.goto(`${BASE}/adminV2`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  log(`URL=${page.url()}`);
  if (page.url().includes("/login")) throw new Error("Auth expired");

  // Prefer Enrollment process nav
  const enrollment = page.locator("text=Enrollment").first();
  if (await enrollment.count()) {
    await enrollment.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  // Open All Family Leads work view if visible
  const allLeads = page.getByRole("tab", { name: /All Family Leads|All/i }).first();
  if (await allLeads.count()) {
    await allLeads.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
  } else {
    const pill = page.locator("text=All Family Leads").first();
    if (await pill.count()) {
      await pill.click({ force: true });
      await page.waitForTimeout(2500);
    }
  }
  await shot("01-all-family-leads");

  const kurzman = page.locator("text=Kurzman").first();
  log(`KURZMAN_COUNT=${await kurzman.count()}`);
  if ((await kurzman.count()) === 0) throw new Error("Kurzman row not found");
  await kurzman.click({ force: true });
  await page.waitForTimeout(5000);
  await shot("02-kurzman-focus");

  const bodyText = await page.locator("body").innerText();
  const hasContactFamily = /Contact Family/i.test(bodyText);
  const hasNewFamilyLead = /New Family Lead/i.test(bodyText);
  const hasReviewWaitlist = /Review waitlist position/i.test(bodyText);
  const hasWaitlist = /\bWaitlist\b/i.test(bodyText);
  log(`HAS_CONTACT_FAMILY=${hasContactFamily}`);
  log(`HAS_NEW_FAMILY_LEAD=${hasNewFamilyLead}`);
  log(`HAS_REVIEW_WAITLIST=${hasReviewWaitlist}`);
  log(`HAS_WAITLIST=${hasWaitlist}`);

  const diag = await page.evaluate(() => window.__ALLOY_FOCUS_CHILD_MISSION_DIAG__ ?? null);
  log(`MISSION_DIAG=${JSON.stringify(diag)}`);

  // What's Next card region
  const whatsNext = page.locator("[data-work-card='current_work'], [data-testid='whats-next'], text=WHAT'S NEXT").first();
  log(`WHATS_NEXT_COUNT=${await whatsNext.count()}`);
  await shot("03-whats-next");

  // Waitlist → Lennon path
  const waitlistTab = page.getByRole("tab", { name: /Waitlist/i }).first();
  if (await waitlistTab.count()) {
    await waitlistTab.click({ force: true });
    await page.waitForTimeout(2500);
    const lennon = page.locator("text=Lennon").first();
    if (await lennon.count()) {
      await lennon.click({ force: true });
      await page.waitForTimeout(4000);
      await shot("04-waitlist-lennon");
      const lennonDiag = await page.evaluate(() => window.__ALLOY_FOCUS_CHILD_MISSION_DIAG__ ?? null);
      log(`LENNON_DIAG=${JSON.stringify(lennonDiag)}`);
    }
  }

  const pass =
    hasReviewWaitlist && hasWaitlist && !hasContactFamily && !hasNewFamilyLead;
  log(pass ? "RESULT=PASS_HOMOGENEOUS_WAITLIST_MISSION" : "RESULT=FAIL_STALE_OR_MISSING_MISSION");
} catch (e) {
  log(`ERROR=${e instanceof Error ? e.message : String(e)}`);
  await shot("error");
} finally {
  writeFileSync(join(OUT, "log.txt"), lines.join("\n") + "\n");
  await browser.close();
}
