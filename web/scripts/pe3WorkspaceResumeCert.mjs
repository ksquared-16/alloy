/**
 * Operational workspace RESUME — certification of Scenarios A, B and C.
 *
 * A: default -> move to a non-default stable section -> close -> reopen  => that section restored
 * B: stable section -> open a transient detail/editor/popover -> close -> reopen
 *                                                              => section restored, transient ABSENT
 * C: return to the default/overview -> close -> reopen                   => default restored
 *
 * Measures T1 launcher acknowledgement, T2 shell, T3 resumed primary content on every reopen.
 *
 * The transient probe is deliberately GENERIC: it counts open dialogs/popovers by role, so it
 * cannot be satisfied by a workspace-specific selector that happens to be absent for another reason.
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";

const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");

const WORKSPACES = [
  {
    label: "Processing", aria: "^Processing", modal: '[data-adminv2-bos-modal="adminv2-processing-modal"]',
    defaultTab: "Work", stableTab: "Studio",
  },
  {
    label: "Work Items", aria: "^Work Items", modal: '[data-adminv2-bos-modal="adminv2-tasks-modal"]',
    defaultTab: "Overview", stableTab: "Queue",
  },
  {
    label: "Operations", aria: "^Operations", modal: '[data-adminv2-bos-modal="adminv2-operations-modal"]',
    defaultTab: "Roster", stableTab: "Children",
  },
];

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(22000);

/** Click the launcher, timing acknowledgement / shell / primary content. */
async function openTimed(ws) {
  const alreadyOpen = await p.evaluate((m) => Boolean(document.querySelector(m)), ws.modal);
  if (alreadyOpen) throw new Error(`${ws.label}: modal already open before the click — reopen timing would be fiction`);
  await p.evaluate(({ aria, modal }) => {
    window.__r = { t0: performance.now(), ack: null, shell: null, content: null };
    const baseChars = (document.querySelector(modal)?.innerText ?? "").length;
    const check = () => {
      const m = document.querySelector(modal);
      if (window.__r.shell == null && m) window.__r.shell = Math.round(performance.now() - window.__r.t0);
      if (window.__r.content == null && m && (m.innerText ?? "").length > baseChars + 200)
        window.__r.content = Math.round(performance.now() - window.__r.t0);
    };
    window.__rObs?.disconnect?.();
    window.__rObs = new MutationObserver(() => {
      if (window.__r.ack == null) window.__r.ack = Math.round(performance.now() - window.__r.t0);
      check();
    });
    window.__rObs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const el = [...document.querySelectorAll("[aria-label]")]
      .find((e) => new RegExp(aria, "i").test(e.getAttribute("aria-label") || ""));
    if (!el) throw new Error("launcher not found");
    el.click();
    check();
  }, ws);
  await p.waitForTimeout(8000);
  return p.evaluate(() => window.__r);
}

/**
 * Close the WORKSPACE, not merely whatever is on top of it.
 *
 * A single Escape dismisses an open popover/dialog and leaves the workspace standing. If the next
 * "reopen" then measures an already-open modal it reports a 0 ms shell and NO acknowledgement, and
 * every assertion after it passes vacuously — the failure mode this harness exists to catch. So the
 * close is verified, and an unclosed workspace throws rather than being measured.
 */
const close = async (ws) => {
  for (let i = 0; i < 4; i++) {
    await p.keyboard.press("Escape");
    await p.waitForTimeout(1200);
    const stillOpen = await p.evaluate((m) => Boolean(document.querySelector(m)), ws.modal);
    if (!stillOpen) return;
  }
  throw new Error(`${ws.label}: workspace did not close — measurement would be vacuous`);
};

/** Which top-level tab reads as active, plus a generic transient-surface census. */
async function inspect(ws) {
  return p.evaluate((modal) => {
    const m = document.querySelector(modal);
    const active = [...(m?.querySelectorAll("[aria-selected='true'],[data-active='true'],[aria-current]") ?? [])]
      .map((e) => (e.textContent || "").trim()).filter(Boolean).slice(0, 6);
    const transient = (m?.querySelectorAll("[role='dialog'],[role='alertdialog'],[role='menu'],[role='listbox']") ?? []).length;
    return { active, transient, chars: (m?.innerText ?? "").length };
  }, ws.modal);
}

async function clickText(ws, label) {
  return p.evaluate(({ modal, label: l }) => {
    const m = document.querySelector(modal);
    const el = [...(m?.querySelectorAll("button,[role=tab],a") ?? [])]
      .find((e) => (e.textContent || "").trim() === l);
    if (!el) return false;
    el.click();
    return true;
  }, { modal: ws.modal, label });
}

const fmt = (t) => `T1 ${String(t.ack ?? "—").padStart(4)}ms  T2 ${String(t.shell ?? "—").padStart(4)}ms  T3 ${String(t.content ?? "—").padStart(5)}ms`;

for (const ws of WORKSPACES) {
  console.log(`\n════ ${ws.label} ════`);
  // clear any remembered position so Scenario A starts from a true first open
  await p.evaluate(() => window.sessionStorage.clear());

  // ---- Scenario A
  let t = await openTimed(ws);
  const first = await inspect(ws);
  console.log(`  first open        ${fmt(t)}   active=${JSON.stringify(first.active)}`);
  const moved = await clickText(ws, ws.stableTab);
  await p.waitForTimeout(5000);
  const movedState = await inspect(ws);
  await close(ws);
  t = await openTimed(ws);
  const resumedA = await inspect(ws);
  // Compare SECTION IDENTITY, never the label text: cohort tabs embed live counts ("All
  // Children15"), so a string compare fails whenever the count differs between capture and reopen —
  // a harness artifact that says nothing about whether resume worked.
  const aPass = moved && resumedA.active.some((l) => l.startsWith(ws.stableTab));
  console.log(`  A reopen          ${fmt(t)}   active=${JSON.stringify(resumedA.active)}`);
  console.log(`  A: moved to ${ws.stableTab} -> restored? ${moved ? (aPass ? "PASS" : "FAIL") : "SKIP (tab not found)"}`);

  // ---- Scenario B: open something transient, close, reopen
  await p.evaluate((modal) => {
    const m = document.querySelector(modal);
    const btn = [...(m?.querySelectorAll("button") ?? [])]
      .find((e) => /^(Add|New|Create|Filter|Sort|Edit)\b/i.test((e.textContent || "").trim()));
    btn?.click();
  }, ws.modal);
  await p.waitForTimeout(3500);
  const withTransient = await inspect(ws);
  await close(ws);
  t = await openTimed(ws);
  const resumedB = await inspect(ws);
  const bPass = resumedB.active.some((l) => l.startsWith(ws.stableTab)) && resumedB.transient === 0;
  console.log(`  B reopen          ${fmt(t)}   transientOpenBefore=${withTransient.transient} afterReopen=${resumedB.transient}`);
  console.log(`  B: section kept + transient absent? ${bPass ? "PASS" : "FAIL"}`);

  // ---- Scenario C: back to default, close, reopen
  const back = await clickText(ws, ws.defaultTab);
  await p.waitForTimeout(4000);
  const backState = await inspect(ws);
  await close(ws);
  t = await openTimed(ws);
  const resumedC = await inspect(ws);
  const cPass = back && resumedC.active.some((l) => l.startsWith(ws.defaultTab));
  console.log(`  C reopen          ${fmt(t)}   active=${JSON.stringify(resumedC.active)}`);
  console.log(`  C: returned to ${ws.defaultTab} -> restored? ${back ? (cPass ? "PASS" : "FAIL") : "SKIP (tab not found)"}`);
  await close(ws);
}
await b.close();
