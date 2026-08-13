/**
 * Narrow Tour insert Path A/B probe — step logging, short timeouts.
 * Slot 5 · localhost:3015
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = process.env.ALLOY_BASE_URL || "http://127.0.0.1:3015";
const outDir =
  "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-comms-composer-convergence";
const storage = path.join(process.env.HOME, ".local/state/alloy-dev/auth/slot5/storage-state.json");
const logPath = path.join(outDir, "browser-qa-tour-insert.json");

fs.mkdirSync(outDir, { recursive: true });
const log = [];
function push(entry) {
  log.push({ t: new Date().toISOString(), ...entry });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(JSON.stringify(entry));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function probe(page, label) {
  return page.evaluate((label) => {
    const host = document.querySelector("[data-work-action-surface='communications_composer']");
    const bodies = [...document.querySelectorAll("[contenteditable='true'], textarea")].map((el) =>
      ((el instanceof HTMLTextAreaElement ? el.value : el.textContent) || "").trim(),
    );
    const body = bodies.sort((a, b) => b.length - a.length)[0] || "";
    const subjectEl = document.querySelector(
      "input[placeholder*='Subject' i], input[name*='subject' i], input[aria-label*='Subject' i]",
    );
    return {
      label,
      preparing: host?.getAttribute("data-tour-invitation-prepare") || null,
      composeIntent: host?.getAttribute("data-work-compose-intent") || null,
      hasNewMessage: /New Message/i.test(host?.textContent || ""),
      subjectValue: subjectEl && "value" in subjectEl ? subjectEl.value : null,
      bodyPreview: body.slice(0, 500),
      hasBookingLink: /\/a\/[A-Za-z0-9_-]+/.test(body),
      insertVisible: Boolean(document.querySelector("[data-cc-insert-trigger='true']")),
      hostSnippet: (host?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 280),
    };
  }, label);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 980 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);

try {
  push({ step: "goto" });
  await page.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-entity-id]", { timeout: 45000 });
  // Wait out compile bubble if present
  for (let i = 0; i < 30; i++) {
    const compiling = await page.locator("text=Compiling").count();
    if (!compiling) break;
    await sleep(1000);
  }
  push({ step: "queue-ready" });

  await page.locator("[data-entity-id]").first().click();
  await page.waitForSelector("text=WHAT'S NEXT", { timeout: 30000 });
  await sleep(2000);
  await page.screenshot({ path: path.join(outDir, "00-focus-ready.png") });
  push({ step: "focus-open" });

  // PATH A
  const tourTrigger = page.locator("[data-work-tour-menu-trigger='true'], button").filter({ hasText: /^Tour/i }).first();
  await tourTrigger.click({ timeout: 10000 });
  await sleep(500);
  const invite = page.locator("[data-work-supporting-action='send_tour_invitation'], [role='menuitem']").filter({
    hasText: /Send Tour Invitation|Invitation/i,
  });
  push({ step: "tour-menu", count: await invite.count() });
  await invite.first().click({ timeout: 10000 });
  await page.waitForSelector("[data-work-action-surface='communications_composer']", { timeout: 20000 });

  let aProbe = null;
  for (let i = 0; i < 40; i++) {
    aProbe = await probe(page, "A");
    if (aProbe.preparing === "error") break;
    if (aProbe.hasBookingLink && aProbe.hasNewMessage) break;
    if ((!aProbe.preparing || aProbe.preparing === "false") && aProbe.bodyPreview.length > 20) break;
    await sleep(750);
  }
  await page.screenshot({ path: path.join(outDir, "A-send-tour-invitation-seeded.png") });
  push({ step: "A-result", ...aProbe });

  // Close
  await page.keyboard.press("Escape");
  await sleep(800);
  const closeBtn = page.locator("[data-work-action-panel-close], button[aria-label='Close composer']");
  if (await closeBtn.count()) await closeBtn.first().click({ force: true }).catch(() => {});
  await sleep(1000);

  // PATH B
  await page.locator("button").filter({ hasText: /^Message$/ }).first().click({ timeout: 10000 });
  await page.waitForSelector("[data-work-action-surface='communications_composer']", { timeout: 20000 });
  for (let i = 0; i < 15; i++) {
    const p = await probe(page, "B-wait");
    if (p.hasNewMessage) break;
    await sleep(600);
  }
  const before = await probe(page, "B-before");
  await page.screenshot({ path: path.join(outDir, "B-send-message-blank.png") });
  push({ step: "B-before-insert", ...before });

  if (before.insertVisible) {
    await page.locator("[data-cc-insert-trigger='true']").click();
    await sleep(400);
    const cap = page.locator("[data-cc-insert-capability='tour_invitation_link']");
    push({ step: "B-menu", count: await cap.count() });
    if (await cap.count()) {
      await cap.first().click();
      let after = null;
      for (let i = 0; i < 25; i++) {
        after = await probe(page, "B-after");
        if (after.hasBookingLink) break;
        await sleep(700);
      }
      await page.screenshot({ path: path.join(outDir, "B-insert-tour-invitation-link.png") });
      push({ step: "B-after-insert", ...after });
    }
  }

  // PATH D quick — Activity tab without forcing new message
  await page.keyboard.press("Escape");
  await sleep(600);
  const act = page.locator("button, [role='tab']").filter({ hasText: /^Activity$/i });
  if (await act.count()) {
    await act.first().click();
    await sleep(3500);
    await page.screenshot({ path: path.join(outDir, "D-activity-history.png") });
    const d = await page.evaluate(() => ({
      forcedNewMessageHost: !!document.querySelector("[data-work-compose-intent='new_message']"),
      hasTopicsWord: /Topics/i.test(document.body.innerText),
      hasReplyWord: /\bReply\b/i.test(document.body.innerText),
    }));
    push({ step: "D-activity", ...d });
  }

  push({ step: "done" });
} catch (err) {
  push({ step: "error", error: String(err?.message || err) });
  await page.screenshot({ path: path.join(outDir, "error.png") }).catch(() => {});
} finally {
  await browser.close();
}
