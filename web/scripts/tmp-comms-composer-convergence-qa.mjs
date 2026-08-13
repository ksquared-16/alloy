/**
 * Browser evidence: Communications composer entry semantics (A/B/C/D).
 * Slot 5 · localhost:3015 · waitlist Kurzman.
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = process.env.ALLOY_BASE_URL || "http://127.0.0.1:3015";
const outDir =
  process.env.OUT_DIR ||
  "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-comms-composer-convergence";
const storage = path.join(
  process.env.HOME,
  ".local/state/alloy-dev/auth/slot5/storage-state.json",
);

fs.mkdirSync(outDir, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForQueue(page, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    await page.goto(`${BASE}/workspace/work-unit/waitlist`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    try {
      await page.waitForSelector("[data-entity-id]", { timeout: 25000 });
      const err = await page.locator("text=couldn't be loaded").count();
      if (!err) return true;
    } catch {
      /* retry */
    }
    await sleep(2000);
  }
  return false;
}

async function openFirstRecord(page) {
  await page.locator("[data-entity-id]").first().click();
  await page.waitForSelector("text=WHAT'S NEXT", { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  // Close BOS if open
  const bosClose = page.locator("button").filter({ hasText: /^Close$/ }).filter({
    has: page.locator("xpath=ancestor::*[contains(., 'BOS')]"),
  });
  if (await page.locator("text=Operational Intelligence").count()) {
    const closeInBos = page.locator("[aria-label='Close'], button:has-text('Close')").last();
    // Prefer clicking BOS header Close via evaluate
    await page.evaluate(() => {
      const headers = [...document.querySelectorAll("button")].filter((b) =>
        /^Close$/i.test((b.textContent || "").trim()),
      );
      for (const b of headers) {
        if (b.closest("[data-bos], .alloy-bos, [class*='bos']") || /BOS/i.test(b.parentElement?.textContent || "")) {
          b.click();
          return;
        }
      }
      // fallback: any visible BOS close near Operational Intelligence
      const oi = [...document.querySelectorAll("*")].find((el) =>
        /Operational Intelligence/i.test(el.textContent || "") && (el.textContent || "").length < 80,
      );
      oi?.parentElement?.querySelector("button")?.click();
    });
    await sleep(600);
  }
  // Ensure Work tab
  const work = page.locator("[role='tab']").filter({ hasText: /^Work$/i });
  if (await work.count()) await work.first().click().catch(() => {});
  await sleep(800);
}

async function closeComposer(page) {
  for (let i = 0; i < 5; i++) {
    const open = await page.locator("[data-work-action-surface='communications_composer']").count();
    if (!open) return;
    const closeBtn = page.locator("button[aria-label='Close composer'], [data-work-action-panel-close]");
    if (await closeBtn.count()) {
      await closeBtn.first().click({ force: true }).catch(() => {});
    } else {
      await page.keyboard.press("Escape");
    }
    await sleep(600);
  }
}

async function probeComposer(page, label) {
  return page.evaluate((label) => {
    const host = document.querySelector("[data-work-action-surface='communications_composer']");
    const topic = document.querySelector("[data-cc-topic-rail]");
    const bodies = [...document.querySelectorAll("[contenteditable='true'], textarea")].map((el) =>
      ((el instanceof HTMLTextAreaElement ? el.value : el.textContent) || "").trim(),
    );
    const body = bodies.sort((a, b) => b.length - a.length)[0] || "";
    const subjectEl = document.querySelector(
      "input[placeholder*='Subject' i], input[name*='subject' i], input[aria-label*='Subject' i]",
    );
    const text = (host?.textContent || "").replace(/\s+/g, " ").trim();
    return {
      label,
      workSurface: host?.getAttribute("data-work-action-surface") || null,
      workComposeIntent: host?.getAttribute("data-work-compose-intent") || null,
      preparing: host?.getAttribute("data-tour-invitation-prepare") || null,
      entryContext:
        document.querySelector("[data-cc-entry-context]")?.getAttribute("data-cc-entry-context") || null,
      composeIntent:
        document.querySelector("[data-cc-compose-intent]")?.getAttribute("data-cc-compose-intent") || null,
      topicVisible: topic
        ? getComputedStyle(topic).display !== "none" && topic.getClientRects().length > 0
        : false,
      hasNewMessage: /New Message/i.test(text),
      hasReplyCta: /\bReply\b/i.test(text) && !/New Message/i.test(text),
      subjectValue: subjectEl && "value" in subjectEl ? subjectEl.value : null,
      bodyPreview: body.slice(0, 500),
      hasBookingLink: /\/a\/[A-Za-z0-9_-]+/.test(body),
      hostText: text.slice(0, 420),
    };
  }, label);
}

async function listWhatsNextButtons(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector("[data-whats-next], .alloy-os-currentwork, [data-focus-panel]") ||
      document.body;
    return [...root.querySelectorAll("button")]
      .map((b) => (b.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 40);
  });
}

const log = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: storage,
  viewport: { width: 1440, height: 980 },
});
const page = await context.newPage();
page.setDefaultTimeout(25000);

try {
  const ok = await waitForQueue(page);
  log.push({ queueReady: ok });
  if (!ok) throw new Error("waitlist queue never ready");

  await openFirstRecord(page);
  await page.screenshot({ path: path.join(outDir, "00-focus-ready.png") });
  const buttons = await listWhatsNextButtons(page);
  log.push({ whatsNextButtons: buttons });

  // ---- B: Send Message ----
  const msg = page.locator("button").filter({ hasText: /^Message$/ }).first();
  await msg.click({ timeout: 15000 });
  await page.waitForSelector("[data-work-action-surface='communications_composer']", {
    timeout: 20000,
  });
  for (let i = 0; i < 20; i++) {
    if (/New Message/i.test(await page.locator("[data-work-action-surface='communications_composer']").innerText().catch(() => "")))
      break;
    await sleep(700);
  }
  await sleep(1000);
  await page.screenshot({ path: path.join(outDir, "B-send-message-new-message.png") });
  log.push(await probeComposer(page, "B-send-message"));

  await closeComposer(page);
  await sleep(800);

  // Reload focus if Tour missing after close
  let btns = await listWhatsNextButtons(page);
  if (!btns.some((t) => /^Tour/i.test(t))) {
    await page.locator("[data-entity-id]").first().click();
    await sleep(2500);
    btns = await listWhatsNextButtons(page);
  }
  log.push({ buttonsBeforeTour: btns });

  // ---- C: Tour Invitation ----
  const tourCandidates = page.locator("button").filter({ hasText: /Tour/i });
  const tourCount = await tourCandidates.count();
  log.push({ tourButtonCount: tourCount });
  if (tourCount === 0) {
    await page.screenshot({ path: path.join(outDir, "C-tour-button-miss.png") });
  } else {
    await tourCandidates.first().click();
    await sleep(900);
    const invite = page.locator("[role='menuitem'], button, [role='option'], [data-radix-collection-item]").filter({
      hasText: /Invitation/i,
    });
    log.push({ inviteCount: await invite.count(), inviteTexts: await invite.allTextContents() });
    if (await invite.count()) {
      await invite.first().click();
      await page.waitForSelector("[data-work-action-surface='communications_composer']", {
        timeout: 25000,
      });
      for (let i = 0; i < 45; i++) {
        const st = await page.evaluate(() => {
          const host = document.querySelector("[data-work-action-surface='communications_composer']");
          const preparing = host?.getAttribute("data-tour-invitation-prepare");
          const bodies = [...document.querySelectorAll("[contenteditable='true'], textarea")].map((el) =>
            ((el instanceof HTMLTextAreaElement ? el.value : el.textContent) || "").trim(),
          );
          const body = bodies.sort((a, b) => b.length - a.length)[0] || "";
          return {
            preparing,
            bodyLen: body.length,
            hasLink: /\/a\//.test(body),
            hasNew: /New Message/i.test(host?.textContent || ""),
            err: preparing === "error",
          };
        });
        if (st.err || ((!st.preparing || st.preparing === "false") && (st.hasLink || st.bodyLen > 40 || st.hasNew)))
          break;
        await sleep(1000);
      }
      await sleep(1200);
      await page.screenshot({ path: path.join(outDir, "C-tour-invitation-new-message.png") });
      log.push(await probeComposer(page, "C-tour-invitation"));
    }
  }

  await closeComposer(page);
  await sleep(600);

  // ---- D: Activity ----
  const act = page.locator("[role='tab']").filter({ hasText: /^Activity$/i });
  if (!(await act.count())) {
    // focus header tabs sometimes not role=tab
    await page.locator("button, [role='tab']").filter({ hasText: /^Activity$/i }).first().click({ timeout: 10000 });
  } else {
    await act.first().click();
  }
  await sleep(5000);
  await page.screenshot({ path: path.join(outDir, "D-activity-history.png") });
  const d = await page.evaluate(() => {
    const topic = document.querySelector("[data-cc-topic-rail]");
    return {
      label: "D-activity",
      topicVisible: topic
        ? getComputedStyle(topic).display !== "none" && topic.getClientRects().length > 0
        : false,
      forcedNewMessageHost: !!document.querySelector("[data-work-compose-intent='new_message']"),
      hasReplyWord: /\bReply\b/i.test(document.body.innerText),
      hasTopicsWord: /Topics/i.test(document.body.innerText),
      text: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 600),
    };
  });
  log.push(d);

  const reply = page.locator("button").filter({ hasText: /^Reply$/i });
  if (await reply.count()) {
    await reply.first().click();
    await sleep(3000);
    await page.screenshot({ path: path.join(outDir, "D-activity-reply.png") });
    log.push(await probeComposer(page, "D-activity-reply"));
  }
} catch (err) {
  log.push({ error: String(err?.message || err), stack: String(err?.stack || "").slice(0, 800) });
  await page.screenshot({ path: path.join(outDir, "error.png") }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(outDir, "browser-qa-final.json"), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
  await browser.close();
}
