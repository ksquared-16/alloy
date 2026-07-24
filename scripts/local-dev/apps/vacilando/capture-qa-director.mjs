#!/usr/bin/env node
/** Persist Director-conversation-fix QA screenshots by driving the LIVE app.
 *  The success (slot 4) and auth-failure (slot 6) records already exist in the
 *  director logs from live QA, so this only navigates + captures; it previews
 *  the long prompt but CANCELS (no execution). Run with node 18+.
 *  node scripts/local-dev/apps/vacilando/capture-qa-director.mjs */
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/web/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/docs/platform/planning/vacilando-os/qa/director-conversation-fix";
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:3020";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` }).then(() => console.log("saved", n));
const goDirector = async (slot) => {
  await p.goto(`${BASE}/?_=${Date.now()}#/command/worker/${slot}`, { waitUntil: "domcontentloaded" });
  // Snapshot compose can be slow — wait for the worker surface tabs to exist.
  await p.waitForSelector('[data-tab="director"]', { timeout: 25000 }).catch(() => {});
  await sleep(1200);
  for (let i = 0; i < 4 && !(await p.$("#d-msg")); i++) {
    const t = await p.$('[data-tab="director"]'); if (t) await t.click();
    await sleep(1000);
  }
  await p.waitForSelector("#d-msg", { timeout: 8000 }).catch(() => {});
  await sleep(600);
};
const type = async (text) => { const ta = await p.$("#d-msg"); if (ta) { await ta.fill(text); } };
try {
  // 01 — provider-neutral Director surface (Send to Worker / Copy Instruction; provider is metadata)
  await goDirector(6); await sleep(500); await shot("01-provider-neutral-surface");

  // 02 — draft preserved through several live refresh cycles
  await type("SLICE-2 DRAFT PERSISTENCE — this instruction must survive periodic dashboard, worker-state, resource, and director-history refreshes plus SSE snapshot events without being wiped. It is owned by application state, not the DOM.");
  await sleep(15000); // >3 refresh cycles (SSE + poll@4s + resources@9s)
  await shot("02-draft-preserved-after-refresh");

  // 03 — per-worker draft: type distinct drafts, return to slot 6, its own draft remains
  await type("PER-WORKER DRAFT for SLOT 6 — must not bleed into other workers.");
  await goDirector(4); await type("PER-WORKER DRAFT for SLOT 4 — a different worker, different content.");
  await goDirector(6); await sleep(800); await shot("03-per-worker-draft-restored");

  // 04 — long prompt (>1800 chars) previews successfully (then CANCEL — no execution)
  await type("LONG PROMPT PREVIEW (>1800 chars). " + "Review the current worker state and enumerate every open question, blocker, and risk; do not modify files. ".repeat(18));
  await sleep(400);
  const ask = await p.$("[data-ask]"); if (ask) await ask.click();
  await p.waitForSelector(".ov .dlg", { timeout: 8000 }).catch(() => {});
  await sleep(800); await shot("04-long-prompt-preview");
  const cancel = await p.$(".ov .cancel"); if (cancel) await cancel.click(); await sleep(500);

  // 05 — successful worker response (slot 4 has the real PONG round-trip in its log)
  await goDirector(4);
  await p.waitForSelector(".dconv", { timeout: 8000 }).catch(() => {});
  await sleep(1500); await shot("05-worker-response-success");

  // 06 — failure with preserved draft (slot 6 has the auth-failure record; type a draft to show it persists)
  await goDirector(6);
  await type("FAILURE-TEST DRAFT: this instruction must remain in the box after a provider authentication failure.");
  await sleep(800); await shot("06-failure-with-preserved-draft");
  console.log("Director QA capture complete →", OUT);
} catch (e) { console.error("err:", e.message); await shot("ERROR"); } finally { await b.close(); }
