/**
 * Browser cert: centered send confirmation + Done → Focus Panel (no summary card).
 * Slot 5 · localhost:3015
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = process.env.ALLOY_BASE_URL || "http://127.0.0.1:3015";
const outDir =
  "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-comms-composer-convergence";
const storage = path.join(process.env.HOME, ".local/state/alloy-dev/auth/slot5/storage-state.json");
const logPath = path.join(outDir, "browser-qa-send-confirm.json");

fs.mkdirSync(outDir, { recursive: true });
const log = [];
function push(entry) {
  log.push({ t: new Date().toISOString(), ...entry });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(JSON.stringify(entry));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector("[data-cc-send-confirm-dialog='true']");
    const preview = document.querySelector("[data-cc-send-confirm-preview='true']");
    const composer = document.querySelector("[data-work-action-surface='communications_composer']");
    const bodies = [...document.querySelectorAll("[contenteditable='true'], textarea")].map((el) =>
      ((el instanceof HTMLTextAreaElement ? el.value : el.textContent) || "").trim(),
    );
    const body = bodies.sort((a, b) => b.length - a.length)[0] || "";
    return {
      dialogPhase: dialog?.getAttribute("data-cc-send-confirm-phase") || null,
      dialogText: (dialog?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400),
      previewText: (preview?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400),
      previewHasLink: /\/a\/[A-Za-z0-9_-]+/.test(preview?.textContent || ""),
      bodyHasLink: /\/a\/[A-Za-z0-9_-]+/.test(body),
      bodyLink: (body.match(/https?:\/\/[^\s]+\/a\/[A-Za-z0-9_-]+/) || [])[0] || null,
      previewLink: ((preview?.textContent || "").match(/https?:\/\/[^\s]+\/a\/[A-Za-z0-9_-]+/) || [])[0] || null,
      composerOpen: Boolean(composer),
      hasWhatsNext: /WHAT'?S NEXT/i.test(document.body.innerText),
      handoffLike: /Contact attempt recorded|Email sent to.*just now/i.test(document.body.innerText),
      elevatedWorkspace: Boolean(document.querySelector("[data-work-action-surface], .alloy-os-currentwork[data-perspective='focused']")),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 980 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);

try {
  await page.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-entity-id]", { timeout: 45000 });
  for (let i = 0; i < 20; i++) {
    if (!(await page.locator("text=Compiling").count())) break;
    await sleep(1000);
  }
  await page.locator("[data-entity-id]").first().click();
  await page.waitForSelector("text=WHAT'S NEXT", { timeout: 30000 });
  await sleep(2000);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .filter((b) => /^Close$/i.test((b.textContent || "").trim()))
      .find((b) => /BOS|Operational Intelligence/i.test(b.parentElement?.textContent || ""))
      ?.click();
  });
  await sleep(500);
  push({ step: "focus-ready" });

  // ---- B: Send Tour Invitation → confirm → success → Done → Focus Panel ----
  await page.locator("[data-work-tour-menu-trigger='true'], button").filter({ hasText: /^Tour/i }).first().click();
  await sleep(600);
  await page.locator("[role='menuitem']").filter({ hasText: /Send Tour Invitation/i }).first().click();
  await page.waitForSelector("[data-work-action-surface='communications_composer']", { timeout: 25000 });
  for (let i = 0; i < 40; i++) {
    const p = await probe(page);
    if (p.bodyHasLink && p.composerOpen) break;
    await sleep(700);
  }
  let before = await probe(page);
  push({ step: "tour-composer-ready", ...before });
  await page.screenshot({ path: path.join(outDir, "confirm-A-tour-seeded.png") });

  await page.locator("button").filter({ hasText: /^Send$/ }).first().click();
  await page.waitForSelector("[data-cc-send-confirm-dialog='true']", { timeout: 15000 });
  await sleep(800);
  let confirm = await probe(page);
  push({ step: "tour-preflight", ...confirm });
  await page.screenshot({ path: path.join(outDir, "confirm-B-centered-preflight.png") });

  // Back to edit
  await page.locator("[data-cc-send-back='true']").click();
  await sleep(500);
  let afterBack = await probe(page);
  push({ step: "tour-back-to-edit", dialogGone: !afterBack.dialogPhase, bodyStillHasLink: afterBack.bodyHasLink });

  await page.locator("button").filter({ hasText: /^Send$/ }).first().click();
  await page.waitForSelector("[data-cc-send-confirm-action='true']", { timeout: 10000 });
  await page.locator("[data-cc-send-confirm-action='true']").click();
  for (let i = 0; i < 30; i++) {
    const p = await probe(page);
    if (p.dialogPhase === "success" || /Tour invitation sent|Message sent/i.test(p.dialogText || "")) break;
    await sleep(700);
  }
  let success = await probe(page);
  push({ step: "tour-success", ...success });
  await page.screenshot({ path: path.join(outDir, "confirm-C-success-ack.png") });

  await page.locator("[data-cc-send-done='true'], button").filter({ hasText: /^Done$/ }).first().click();
  await sleep(1500);
  let afterDone = await probe(page);
  push({
    step: "tour-done-focus",
    composerClosed: !afterDone.composerOpen,
    hasWhatsNextSummaryElevated: afterDone.hasWhatsNext && afterDone.handoffLike,
    handoffLike: afterDone.handoffLike,
    ...afterDone,
  });
  await page.screenshot({ path: path.join(outDir, "confirm-D-back-to-focus.png") });

  // ---- Generic Message path (no auto send if prior still elevated) ----
  if (!(await page.locator("button").filter({ hasText: /^Message$/ }).count())) {
    await page.locator("[data-entity-id]").first().click();
    await sleep(2000);
  }
  await page.locator("button").filter({ hasText: /^Message$/ }).first().click({ timeout: 10000 });
  await page.waitForSelector("[data-work-action-surface='communications_composer']", { timeout: 20000 });
  await sleep(1500);
  // type a short body via contenteditable
  await page.evaluate(() => {
    const el = document.querySelector("[contenteditable='true'][aria-label='Message body']");
    if (!el) return;
    el.focus();
    el.innerHTML = "Browser cert short message.";
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await sleep(400);
  await page.locator("button").filter({ hasText: /^Send$/ }).first().click();
  await page.waitForSelector("[data-cc-send-confirm-dialog='true']", { timeout: 10000 });
  push({ step: "message-preflight", ...(await probe(page)) });
  await page.locator("[data-cc-send-confirm-action='true']").click();
  for (let i = 0; i < 25; i++) {
    const p = await probe(page);
    if (p.dialogPhase === "success") break;
    await sleep(700);
  }
  push({ step: "message-success", ...(await probe(page)) });
  await page.locator("[data-cc-send-done='true'], button").filter({ hasText: /^Done$/ }).first().click();
  await sleep(1200);
  push({ step: "message-done", ...(await probe(page)) });
  await page.screenshot({ path: path.join(outDir, "confirm-E-message-done-focus.png") });

  push({ step: "done" });
} catch (err) {
  push({ step: "error", error: String(err?.message || err) });
  await page.screenshot({ path: path.join(outDir, "confirm-error.png") }).catch(() => {});
} finally {
  await browser.close();
}
