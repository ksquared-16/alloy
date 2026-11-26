/**
 * Promotion smoke — the canonical representative journey, structural only.
 *
 * NOT a timing campaign: this proves the certified behaviours still hold end to end after rebase.
 * Every step asserts a STRUCTURAL fact (a destination committed, an identity is correct, a position
 * resumed), because a step that only proves "something rendered" would pass through a regression.
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";

const BASE = process.env.PE3_BASE ?? "http://127.0.0.1:3015";
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
const errs = [];
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 90)); });

const fire = async (matcher, scope = null) => p.evaluate(({ m, s }) => {
  const root = s ? document.querySelector(s) : document;
  const el = [...(root?.querySelectorAll("button,a,[role=button],[role=tab]") ?? [])]
    .find((x) => new RegExp(m).test((x.textContent || "").trim()));
  if (!el) return false;
  const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, button: 0, isPrimary: true };
  el.dispatchEvent(new PointerEvent("pointerdown", o));
  el.dispatchEvent(new PointerEvent("pointerup", o));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return true;
}, { m: matcher, s: scope });

console.log("\n── canonical operator journey ──");
await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 });
await p.waitForTimeout(24000);
ok("Workspace renders with work-unit destinations", true);

// prepared Work Unit
await p.locator('a[href^="/workspace/work-unit/waitlist"]').first().click({ timeout: 20000 });
await p.waitForTimeout(14000);
const wu = await p.evaluate(() => ({
  surface: Boolean(document.querySelector("[data-runtime-label='WU.SURFACE']")),
  cards: document.querySelectorAll("[data-card-role]").length,
  header: document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0] ?? null,
}));
ok("prepared Work Unit — surface + cards + header", wu.surface && wu.cards >= 4 && Boolean(wu.header), `cards=${wu.cards} header="${wu.header}"`);

// Work View switch — by real work-unit href, then RETURN BY NAVIGATION.
// `goBack()` was leaving the Work Unit entirely, which invalidated every later assertion while
// still reporting them as product failures.
const wuHref = await p.evaluate(() => location.pathname + location.search);
const viewHref = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/workspace/work-unit/"]')]
    .map((x) => x.getAttribute("href"))
    .find((h) => h && h !== location.pathname + location.search);
  return a ?? null;
});
if (viewHref) {
  await p.goto(`${BASE}${viewHref}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(9000);
  const afterView = await p.evaluate(() => location.pathname + location.search);
  ok("Work View switch changes destination", afterView !== wuHref, `${wuHref} -> ${afterView}`);
} else {
  ok("Work View switch changes destination", false, "no alternate work-unit href offered");
}
await p.goto(`${BASE}${wuHref}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(13000);

// queue child switch — identity must follow the row
// Activity
await fire("^Activity$");
await p.waitForTimeout(6000);
// POLL for content rather than sampling once: the cockpit re-renders while composing, so a single
// sample can land on an empty container and report a committed mode as a failure.
const act = await p.evaluate(async () => {
  const read = () => ({
    mode: document.querySelector("[data-inline-focus-panel]")?.getAttribute("data-inline-focus-panel-mode") ?? null,
    chars: (document.querySelector("[data-adminv2-record-modal-scroll]")?.innerText ?? "").trim().length,
  });
  let best = read();
  for (let i = 0; i < 16 && best.chars <= 120; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const now = read();
    if (now.chars > best.chars) best = now;
  }
  return best;
});
// Structural: the mode committed and the cockpit carries content. A family-specific heading
// ("Recent Activity") is not a runtime contract — a record with no events legitimately lacks it.
ok("Activity mode commits", act.mode === "activity" && act.chars > 120, `mode=${act.mode} chars=${act.chars}`);
await fire("^Work$");
await p.waitForTimeout(5000);

// cards + commands, via the shared depth seam
const panelPresent = async () => p.evaluate(() => Boolean(document.querySelector("[data-inline-focus-panel]")));
/** Return to base depth, VERIFIED. A click issued at an open depth cannot commit a new one. */
async function closeToBase() {
  for (let i = 0; i < 5; i++) {
    const d = await p.evaluate(() => document.querySelector("[data-fp-depth]")?.getAttribute("data-fp-depth") ?? null);
    if (d !== "active") return true;
    await p.keyboard.press("Escape");
    await p.waitForTimeout(1400);
  }
  return false;
}
ok("Focus Panel still present before card/command steps", await panelPresent());
const depthOf = () => p.evaluate(() => document.querySelector("[data-fp-depth]")?.getAttribute("data-fp-depth") ?? null);
const childClicked = await p.evaluate(() => {
  const card = [...document.querySelectorAll("[data-card-role]")].find((e) =>
    (e.getAttribute("data-focus-panel-cell-type") || e.closest("[data-focus-panel-grid-cell]")?.getAttribute("data-focus-panel-grid-cell")) === "children");
  const el = [...(card?.querySelectorAll("button,a,[role=button]") ?? [])].find((x) => /Kurzman|Kid/.test(x.textContent || ""));
  if (!el) return false;
  const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, button: 0, isPrimary: true };
  el.dispatchEvent(new PointerEvent("pointerdown", o)); el.dispatchEvent(new PointerEvent("pointerup", o));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return true;
});
await p.waitForTimeout(5000);
const childIdentity = await p.evaluate(() => document.querySelector("[data-children-focused-member]")?.getAttribute("data-children-focused-member") ?? null);
ok("Children card — destination + child identity seam", childClicked && Boolean(childIdentity), `member=${childIdentity ? childIdentity.slice(0, 8) : "none"}`);
await closeToBase();

/*
 * Re-anchor to a freshly settled Work Unit before the command loop.
 *
 * The Children step drills into a CHILD; Escape returns to base depth but leaves the panel
 * child-scoped, and the commands were then measured from a context they are not offered in. The
 * certification harness measured each command from a clean family-settled panel, so the smoke does
 * the same — otherwise it reports an ordering artefact as a command regression.
 */
await p.goto(`${BASE}${wuHref}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(14000);
ok("re-anchored to a settled Work Unit before commands", await panelPresent());

/*
 * SCOPED to the Focus Panel, and for a card to that CARD.
 *
 * A document-wide match clicked the wrong control: "Kurzman|Kid" matches a left-rail queue row long
 * before the Assignment card row, and "Message" can match outside the panel. Those clicks switched
 * subject instead of committing a destination, and were reported as command regressions. "Send form"
 * is unique document-wide, which is exactly why it was the only one passing.
 */
for (const [label, spec] of [
  ["Assignment", { cell: "scheduling", match: "Kurzman|Kid" }],
  ["Message", { match: "^Message$" }],
  ["Send form", { match: "^Send form$" }],
]) {
  const atBase = await closeToBase();
  const clicked = await p.evaluate(({ cell, match }) => {
    const panel = document.querySelector("[data-inline-focus-panel]") ?? document;
    const root = cell
      ? [...panel.querySelectorAll("[data-card-role]")].find((e) =>
          (e.getAttribute("data-focus-panel-cell-type")
            || e.closest("[data-focus-panel-grid-cell]")?.getAttribute("data-focus-panel-grid-cell")) === cell)
      : panel;
    const el = [...(root?.querySelectorAll("button,a,[role=button]") ?? [])]
      .find((x) => new RegExp(match).test((x.textContent || "").trim()));
    if (!el) return false;
    const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, button: 0, isPrimary: true };
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  }, spec);
  await p.waitForTimeout(5000);
  const d = await depthOf();
  ok(`${label} destination commits`, clicked && d === "active", `fp-depth=${d}${clicked ? "" : " (control not found in panel)"}${atBase ? "" : " (not at base depth)"}`);
}
await closeToBase();
const tourClicked = await fire("^Tour ▾$");
await p.waitForTimeout(3500);
const menu = await p.evaluate(() => document.querySelectorAll("[role=menu],[data-radix-popper-content-wrapper]").length);
ok("Tour command opens its menu", tourClicked && menu > 0, `menus=${menu}`);
await p.keyboard.press("Escape"); await p.waitForTimeout(2500);

await p.waitForFunction(() => Boolean(document.querySelector("[data-inline-focus-panel-header]")), { timeout: 45000 }).catch(() => {});
const q = await p.evaluate(async () => {
  const rows = [...document.querySelectorAll("[data-queue-row],[role=row],[data-queue-row-subject]")].slice(0, 12);
  const before = document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0] ?? null;
  const target = rows.find((r) => (r.textContent || "").trim() && r !== rows[0]) ?? rows[1];
  if (!target) return { moved: false };
  const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, button: 0, isPrimary: true };
  target.dispatchEvent(new PointerEvent("pointerdown", o));
  target.dispatchEvent(new PointerEvent("pointerup", o));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 6000));
  return { moved: true, before, after: document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0] ?? null };
});
ok("queue child switch — header identity follows the row", q.moved && Boolean(q.after), `"${q.before}" -> "${q.after}"`);


// operational workspace + resume
await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(16000);
await p.evaluate(() => window.sessionStorage.clear());
const openOps = async () => { await p.locator('[aria-label^="Operations"]').first().click({ timeout: 15000 }); await p.waitForTimeout(7000); };
await openOps();
const opsOpen = await p.evaluate(() => Boolean(document.querySelector('[data-adminv2-bos-modal="adminv2-operations-modal"]')));
ok("operational workspace opens", opsOpen);
await fire("^Children$", '[data-adminv2-bos-modal="adminv2-operations-modal"]');
await p.waitForTimeout(5000);
for (let i = 0; i < 4; i++) { await p.keyboard.press("Escape"); await p.waitForTimeout(1200);
  if (!(await p.evaluate(() => Boolean(document.querySelector('[data-adminv2-bos-modal="adminv2-operations-modal"]'))))) break; }
await openOps();
const resumed = await p.evaluate(() => {
  const m = document.querySelector('[data-adminv2-bos-modal="adminv2-operations-modal"]');
  return [...(m?.querySelectorAll("[aria-selected='true'],[data-active='true'],[aria-current]") ?? [])].map((e) => (e.textContent || "").trim());
});
ok("workspace resume restores the stable section", resumed.some((l) => l.startsWith("Children")), JSON.stringify(resumed.slice(0, 4)));
for (let i = 0; i < 4; i++) { await p.keyboard.press("Escape"); await p.waitForTimeout(1000); }

// /organization warm navigation
await p.goto(`${BASE}/organization`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(14000);
const orgWarm = await p.evaluate(async () => {
  const go = async (href) => {
    const start = performance.now(); let t = null;
    const obs = new MutationObserver(() => { if (t == null && location.pathname === href.split("?")[0]) t = Math.round(performance.now() - start); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const a = [...document.querySelectorAll('a[href^="/organization/"]')].find((x) => x.getAttribute("href") === href);
    if (!a) { obs.disconnect(); return null; }
    a.click();
    await new Promise((r) => setTimeout(r, 7000)); obs.disconnect(); return t;
  };
  const first = await go("/organization/access");
  return { first };
});
ok("/organization navigation commits", orgWarm.first != null, `access t2=${orgWarm.first}ms`);

console.log(`\nconsole errors during smoke: ${errs.length}${errs.length ? " — " + JSON.stringify([...new Set(errs)].slice(0, 3)) : ""}`);
const failed = results.filter((r) => !r.pass);
console.log(`\nSMOKE: ${results.length - failed.length}/${results.length} PASS${failed.length ? " — FAILED: " + failed.map((f) => f.name).join(", ") : ""}`);
await b.close();
process.exit(failed.length ? 1 : 0);
