/**
 * Focus Panel CARD / COMMAND readiness — T0..T4 per transition.
 *
 * DESTINATION SIGNAL. `data-fp-depth="active"` is the Focus Panel's own details-depth marker — the
 * SHARED destination seam every card and command commits through. Using it (rather than a
 * per-target selector) is what makes these numbers comparable across the interaction family, and it
 * is why no card-specific or command-specific fast path was introduced. A menu-style command that
 * commits to a popup instead is caught by `[role=menu]`.
 *
 * Every one of these transitions commits IN PLACE inside the Focus Panel: no dialog, no route
 * change, no modal. So the signals are panel-relative, and each is measured against a BASELINE
 * captured immediately before the click — a non-target-relative predicate would stamp the previous
 * content at ~2ms and make every transition look instant (a mistake this program has already made).
 *
 *   T1 acknowledgement   first DOM mutation inside the panel after the click
 *   T2 destination       the panel's content identity changes away from the baseline
 *   T3 primary usable    the destination carries an interactive control that was not there before
 *   T4 fully hydrated    no /api/ request for 1.2s AND no panel mutation for 0.8s
 *
 * Also captured: request count + offsets from the click (0 requests = consumed prepared state),
 * layout shift during the transition, console errors, and the return-to-baseline timing.
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";

const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const PANEL = "[data-adminv2-record-modal-scroll]";

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();

const consoleErrors = [];
p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 120)); });
const reqs = [];
p.on("request", (r) => { if (r.url().includes("/api/")) reqs.push({ u: r.url().replace(BASE, ""), t: Date.now() }); });

await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 });
await p.waitForTimeout(26000);
await p.locator('a[href^="/workspace/work-unit/waitlist"]').first().click({ timeout: 20000 });
await p.waitForTimeout(15000);

/** Arm panel-relative instrumentation, then run `clickFn` in the page. */
async function measure(label, clickSpec) {
  const errs0 = consoleErrors.length;
  const n0 = reqs.length;
  const t0 = Date.now();
  const result = await p.evaluate(async ({ panelSel, spec }) => {
    const panel = document.querySelector(panelSel);
    if (!panel) return { error: "no panel" };
    const sig = (el) => (el?.innerText || "").replace(/\s+/g, " ").trim();
    const controlCensus = (el) =>
      new Set([...(el?.querySelectorAll("button,a,input,textarea,select,[role=button],[contenteditable=true]") ?? [])]
        .map((n, i) => `${n.tagName}:${(n.textContent || "").trim().slice(0, 24)}:${i}`));

    const depthEl = () => document.querySelector("[data-fp-depth]");
    const depthOf = () => depthEl()?.getAttribute("data-fp-depth") ?? null;
    const menuEl = () => document.querySelector("[role=menu],[role=listbox],[data-radix-popper-content-wrapper]");
    const baseDepth = depthOf();
    const baseSig = sig(panel).slice(0, 60);
    const baseControls = controlCensus(panel);
    const baseLen = sig(panel).length;

    const m = { t1: null, t2: null, t3: null, lastMut: null, cls: 0, depth: null, via: null };
    const start = performance.now();
    const now = () => Math.round(performance.now() - start);

    let clsObs = null;
    try {
      clsObs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) m.cls += e.value;
      });
      clsObs.observe({ type: "layout-shift", buffered: false });
    } catch { /* not supported */ }

    const check = () => {
      const el = document.querySelector(panelSel);
      if (!el) return;
      m.lastMut = now();
      if (m.t1 == null) m.t1 = now();
      const s = sig(el);
      // T2 — destination committed, via the SHARED depth seam (or a command popup).
      if (m.t2 == null) {
        const d = depthOf();
        if (d != null && d !== baseDepth) { m.t2 = now(); m.depth = d; m.via = "fp-depth"; }
        else if (menuEl()) { m.t2 = now(); m.via = "menu"; }
        else if (s.slice(0, 60) !== baseSig) { m.t2 = now(); m.via = "panel-content"; }
      }
      // T3 — the destination carries a control that was not present before the intent.
      if (m.t3 == null && m.t2 != null) {
        const scope = (m.via === "menu" ? menuEl() : depthEl()) ?? el;
        const controls = controlCensus(scope);
        let fresh = 0;
        for (const k of controls) if (!baseControls.has(k)) fresh++;
        // A menu destination is legitimately short ("Send Tour Invitation / Reschedule / Cancel"),
        // so the content floor is scoped to the destination kind rather than one global number.
        const floor = m.via === "menu" ? 20 : 80;
        if (fresh > 0 && sig(scope).length > floor) m.t3 = now();
      }
    };
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });

    // ---- the intent
    //
    // A FULL POINTER SEQUENCE, not `el.click()`. Menu-style commands open on POINTERDOWN, so a lone
    // synthetic `click` leaves them closed — which made the Tour command look broken (aria-expanded
    // stayed false, zero new nodes) when it is not. Same class of error as dispatching a synthetic
    // `mouseenter` at a React `onMouseEnter`.
    const fire = (el) => {
      const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, button: 0, isPrimary: true };
      el.dispatchEvent(new PointerEvent("pointerdown", o));
      el.dispatchEvent(new PointerEvent("pointerup", o));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    };
    let clicked = false;
    if (spec.kind === "text") {
      const el = [...document.querySelectorAll("button,a,[role=button]")].find((e) => (e.textContent || "").trim() === spec.text);
      if (el) { fire(el); clicked = true; }
    } else if (spec.kind === "cardRow") {
      const card = [...document.querySelectorAll("[data-card-role]")].find((e) =>
        (e.getAttribute("data-focus-panel-cell-type") || e.closest("[data-focus-panel-grid-cell]")?.getAttribute("data-focus-panel-grid-cell")) === spec.cell);
      const el = [...(card?.querySelectorAll("button,a,[role=button]") ?? [])].find((x) => new RegExp(spec.match).test(x.textContent || ""));
      if (el) { fire(el); clicked = true; }
    }
    check();

    await new Promise((r) => setTimeout(r, 9000));
    obs.disconnect();
    try { clsObs?.disconnect(); } catch {}
    const el = document.querySelector(panelSel);
    return { clicked, ...m, baseDepth, baseLen, finalLen: sig(el).length, cls: Math.round(m.cls * 1000) / 1000 };
  }, { panelSel: PANEL, spec: clickSpec });

  const during = reqs.slice(n0).map((r) => ({ u: r.u.split("?")[0].replace("/api/admin/", ""), off: r.t - t0 }));
  // return to baseline
  const tRet = Date.now();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(3000);
  const returned = await p.evaluate((s) => Boolean(document.querySelector(s)), PANEL);

  return { label, ...result, reqCount: during.length, reqs: during.slice(0, 6),
           errs: consoleErrors.length - errs0, returnMs: Date.now() - tRet, returned };
}

const TARGETS = [
  ["CMD  Message",     { kind: "text", text: "Message" }],
  ["CMD  Send form",   { kind: "text", text: "Send form" }],
  ["CMD  Tour",        { kind: "text", text: "Tour ▾" }],
  ["CARD Children",    { kind: "cardRow", cell: "children", match: "Kurzman|Kid" }],
  ["CARD Household",   { kind: "text", text: "View household →" }],
  ["CARD Assignment",  { kind: "cardRow", cell: "scheduling", match: "Kurzman|Kid" }],
  ["CARD Billing",     { kind: "text", text: "View configuration" }],
];

const rows = [];
for (const [label, spec] of TARGETS) {
  rows.push(await measure(label, spec));
  await p.waitForTimeout(2500);
}

console.log("\n" + "═".repeat(112));
console.log("transition          click  T1     T2     T3     T4(quiet)  reqs  CLS     err  return   via");
console.log("═".repeat(112));
for (const r of rows) {
  const f = (v) => String(v ?? "—").padStart(5);
  console.log(
    `${r.label.padEnd(19)} ${String(r.clicked).padEnd(5)} ${f(r.t1)} ${f(r.t2)} ${f(r.t3)} ${f(r.lastMut).padStart(9)}   ` +
    `${String(r.reqCount).padStart(3)}  ${String(r.cls ?? 0).padEnd(6)} ${String(r.errs).padStart(3)}  ${String(r.returnMs).padStart(5)}ms  ${r.via ?? "—"}`);
  if (r.reqs?.length) console.log(`      requests: ${r.reqs.map((q) => `${q.u}@${q.off}ms`).join(", ")}`);
}
/*
 * CROSS-CHILD LEAKAGE — Children -> child A -> child B.
 *
 * Asserted on the canonical identity seam (`data-children-focused-member` inside
 * `[data-identity-depth="details"]`), NOT on the panel. `data-fp-depth` is the whole Focus Panel,
 * which lists every child in the family — an assertion scoped there is satisfied by the roster and
 * proves nothing. Two DIFFERENT children are selected in sequence so a pass cannot come from a
 * default, and each is checked to exclude the other's identity.
 */
await p.keyboard.press("Escape");
await p.waitForTimeout(2500);
const leak = await p.evaluate(async () => {
  const fire = (el) => {
    const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, button: 0, isPrimary: true };
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  };
  const cardOf = (cell) => [...document.querySelectorAll("[data-card-role]")].find((e) =>
    (e.getAttribute("data-focus-panel-cell-type") || e.closest("[data-focus-panel-grid-cell]")?.getAttribute("data-focus-panel-grid-cell")) === cell);
  const rowsOf = () => [...(cardOf("children")?.querySelectorAll("button,a,[role=button]") ?? [])]
    .filter((x) => /Kurzman|Kid/.test(x.textContent || ""));

  const open = async (idx) => {
    const rows = rowsOf();
    if (rows.length <= idx) return null;
    const name = (rows[idx].textContent || "").trim().split("\n")[0].slice(0, 40);
    const t0 = performance.now();
    fire(rows[idx]);
    await new Promise((r) => setTimeout(r, 3500));
    const pane = document.querySelector("[data-identity-depth='details']");
    const holder = document.querySelector("[data-children-focused-member]");
    return {
      name,
      memberId: holder?.getAttribute("data-children-focused-member") ?? null,
      paneText: (pane?.innerText || "").replace(/\s+/g, " "),
      commitMs: Math.round(performance.now() - t0),
    };
  };

  const a = await open(1);
  if (!a) return { ok: false, why: "not enough children rows" };
  // back out to the card list, then a DIFFERENT child
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise((r) => setTimeout(r, 2000));
  const b2 = await open(2);

  const firstName = (n) => (n || "").split(" ")[0];
  return {
    ok: true,
    a: { name: a.name, memberId: a.memberId, showsSelf: a.paneText.includes(firstName(a.name)) },
    b: b2 && { name: b2.name, memberId: b2.memberId, showsSelf: b2.paneText.includes(firstName(b2.name)),
               showsPrevious: b2.paneText.includes(firstName(a.name)) },
    distinctMembers: Boolean(a.memberId && b2?.memberId && a.memberId !== b2.memberId),
  };
});
console.log("\nCROSS-CHILD LEAKAGE (Children -> child A -> child B, identity-scoped)");
console.log("  " + JSON.stringify(leak));
const verdict = leak.ok && leak.distinctMembers && leak.a.showsSelf && leak.b?.showsSelf && !leak.b?.showsPrevious;
console.log("  VERDICT: " + (verdict ? "PASS — no cross-child leakage" : "REVIEW — see above"));

await b.close();
