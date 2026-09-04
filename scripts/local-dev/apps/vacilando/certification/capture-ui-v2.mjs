#!/usr/bin/env node
/**
 * Vacilando UI V2 — desktop and mobile certification.
 *
 * Drives the REAL browser bundle against the deterministic fixture server and
 * both CAPTURES evidence and ASSERTS the mobile contract. A screenshot proves a
 * layout existed; it does not prove nothing clipped, so the checks below measure
 * the page rather than trusting the picture.
 *
 *   node apps/vacilando/certification/capture-ui-v2.mjs [--out <dir>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFixtureServer } from "./ui-v2-fixture-server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");

// Playwright lives in the canonical checkout's web workspace. Read-only import.
const PLAYWRIGHT = process.env.VACILANDO_PLAYWRIGHT
  || "/Users/vacilando/Alloy/web/node_modules/playwright/index.mjs";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : join(REPO, "docs", "platform", "planning", "vacilando-os", "ui-v2", "certification");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 950 },
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
  // The lane composer with a phone keyboard open: the visual viewport shrinks
  // to roughly this while the layout viewport does not.
  keyboard: { width: 390, height: 380 },
};

const LANE = "lane_trustruntime01";
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

const { chromium } = await import(PLAYWRIGHT);
const { server, port } = await startFixtureServer();
const BASE = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();

async function open(page, hash, { settle = 900 } = {}) {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
}

/**
 * Nothing the operator can see or reach may extend past the viewport.
 *
 * Two exclusions, both deliberate and both narrow:
 *
 *   · An element inside a container that scrolls horizontally ON PURPOSE is
 *     allowed to be wider than the viewport — that is what the container is
 *     for. The lane tab strip is the only such container in V2.
 *   · A closed off-canvas drawer is `inert` and `aria-hidden`; it is parked
 *     off-screen by design and is neither visible nor focusable.
 *
 * Everything else counts, and the document's own scrollWidth is asserted
 * separately, so neither exclusion can hide a page that actually scrolls.
 */
async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const worst = [];
    const inScroller = (el) => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      return false;
    };
    const parked = (el) => Boolean(el.closest("[inert]") || el.closest('[aria-hidden="true"]'));
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (style.overflowX === "auto" || style.overflowX === "scroll") continue;
      if (inScroller(el) || parked(el)) continue;
      if (r.right > vw + 1) worst.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), right: Math.round(r.right) });
    }
    return { vw, docScroll: document.documentElement.scrollWidth, worst: worst.slice(0, 5) };
  });
}

async function tapTargets(page, selector) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel)]
    .map((el) => { const r = el.getBoundingClientRect(); return { cls: String(el.className).slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((b) => b.w > 0 && b.h > 0), selector);
}

try {
  /* ---------------- DESKTOP ---------------- */
  const desk = await browser.newPage({ viewport: VIEWPORTS.desktop, deviceScaleFactor: 2 });

  for (const [hash, name] of [["/home", "01-desktop-home"], ["/lanes", "02-desktop-lanes"], ["/activity", "05-desktop-activity"], ["/system", "06-desktop-system"]]) {
    await open(desk, hash);
    await desk.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  }

  await open(desk, "/home");
  check("desktop Home renders the five blocks",
    (await desk.locator(".vcard-needs, .vcard-health, .vcard-lanes, .vcard-usage, .vcard-effect, .vcard-activity").count()) >= 6);
  check("desktop Home uses the width in two columns",
    (await desk.evaluate(() => getComputedStyle(document.querySelector(".vhome-grid")).gridTemplateColumns.split(" ").length)) === 2);
  check("Needs You lists the genuine blocker",
    (await desk.locator(".vneeds-row").count()) === 1,
    await desk.locator(".vneeds-row-request").first().innerText().catch(() => ""));
  check("Home shows no invented effectiveness number",
    await desk.evaluate(() => [...document.querySelectorAll(".vcard-effect .vmetric")]
      .every((el) => el.classList.contains("is-unavailable"))));
  check("primary navigation carries the Needs You count",
    (await desk.locator(".vnav-badge").count()) === 1);
  check("primary navigation carries no diagnostics",
    await desk.evaluate(() => !/Context|Slot|ahead|behind/.test(document.querySelector(".vnav").textContent)));

  await open(desk, `/lanes/${LANE}`);
  await desk.screenshot({ path: join(OUT, "03-desktop-lane.png"), fullPage: false });
  check("lane header shows breadcrumb, state and identity",
    (await desk.locator(".vcrumb").count()) === 1
    && (await desk.locator(".vlane-title").innerText()) === "Trust Runtime"
    && /Slot 6/.test(await desk.locator(".vlane-head-meta").innerText()));
  check("lane tabs are present",
    (await desk.locator(".vtab-lane").count()) === 6);
  const prog = await desk.locator(".vprogress-label").first().innerText();
  check("progress reads as a provider estimate", /Provider estimate: ~62% complete/.test(prog), prog);
  check("no ETA is shown", !(await desk.evaluate(() => /\bETA\b/i.test(document.body.innerText))));
  check("current work precedes the agent output",
    await desk.evaluate(() => {
      const w = document.querySelector(".vcard-work")?.getBoundingClientRect().top ?? 1e9;
      const o = document.querySelector(".vcard-output")?.getBoundingClientRect().top ?? -1;
      return o > w;
    }));
  check("the inspector is quiet by default",
    (await desk.locator(".vinsp-sec[open]").count()) === 0);

  // On desktop the inspector is a PERMANENT column, not a drawer — the toggle
  // is display:none above 861px. Certifying it therefore means measuring the
  // column that is already there, not clicking something to open it.
  check("the inspector is a permanent desktop column, not a drawer",
    await desk.evaluate(() => {
      const insp = document.querySelector(".vinsp");
      const stage = document.querySelector(".gw-lane-stage");
      if (!insp || !stage) return false;
      const i = insp.getBoundingClientRect();
      const st = stage.getBoundingClientRect();
      return i.width > 180 && i.left >= st.right - 4 && !insp.hasAttribute("inert");
    }));
  await desk.screenshot({ path: join(OUT, "04-desktop-lane-inspector.png"), fullPage: false });
  const runBlock = await desk.locator(".vinsp-run").innerText();
  check("the inspector RUN block answers the six questions",
    /Agent/.test(runBlock) && /Slot/.test(runBlock) && /Context/.test(runBlock) && /Started/.test(runBlock) && /Stop lane/.test(runBlock),
    runBlock.replace(/\s+/g, " ").slice(0, 120));
  // Opening a folded section is how complexity is meant to arrive.
  await desk.locator('[data-v-inspector="git"] summary').click();
  await desk.waitForTimeout(250);
  check("a folded section opens on request",
    (await desk.locator('[data-v-inspector="git"][open]').count()) === 1);

  await open(desk, `/lanes/lane_surfaces000001`);
  await desk.screenshot({ path: join(OUT, "07-desktop-needs-you.png"), fullPage: false });
  check("the needs-you tray sits immediately above the composer",
    await desk.evaluate(() => {
      const t = document.querySelector(".vneeds-tray")?.getBoundingClientRect();
      const c = document.querySelector(".gw-composer")?.getBoundingClientRect();
      const o = document.querySelector(".vcard-output")?.getBoundingClientRect();
      return Boolean(t && c && o) && t.top > o.top && t.bottom <= c.top + 4;
    }));
  check("the tray is one line, not a card in the narrative",
    (await desk.evaluate(() => Math.round(document.querySelector(".vneeds-tray").getBoundingClientRect().height))) < 90);

  await open(desk, `/lanes/${LANE}/commits`);
  check("an unbuilt tab renders the shell and names its owner",
    /Not implemented/.test(await desk.locator(".vcard-tabshell").innerText()));

  // Placeholder mode is visible and marked.
  await desk.goto(`${BASE}/?placeholders=1#/home`, { waitUntil: "domcontentloaded" });
  await desk.waitForTimeout(900);
  await desk.screenshot({ path: join(OUT, "08-desktop-home-placeholders.png"), fullPage: true });
  check("placeholder mode announces itself on the page",
    (await desk.locator(".vplaceholder-banner").count()) === 1);
  check("every placeholder value is individually flagged",
    await desk.evaluate(() => [...document.querySelectorAll(".vmetric.is-placeholder")]
      .every((el) => el.querySelector(".vmetric-flag"))));
  check("placeholder values are auditable in the DOM",
    (await desk.locator('[data-maturity="INSTRUMENTATION_REQUIRED"]').count()) > 0);
  await desk.goto(`${BASE}/?placeholders=0#/home`, { waitUntil: "domcontentloaded" });
  await desk.waitForTimeout(400);
  await desk.close();

  /* ---------------- MOBILE ---------------- */
  for (const [key, label] of [["mobile", "390"], ["narrow", "320"]]) {
    const m = await browser.newPage({ viewport: VIEWPORTS[key], deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    for (const [hash, name] of [["/home", `10-mobile${label}-home`], ["/lanes", `11-mobile${label}-lanes`], [`/lanes/${LANE}`, `12-mobile${label}-lane`], ["/activity", `14-mobile${label}-activity`], ["/system", `15-mobile${label}-system`]]) {
      await open(m, hash);
      await m.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
      const o = await overflow(m);
      check(`mobile ${label} · ${hash} does not scroll sideways`,
        o.docScroll <= o.vw + 1 && o.worst.length === 0,
        o.worst.length ? JSON.stringify(o.worst) : `scrollWidth ${o.docScroll} ≤ ${o.vw}`);
    }

    await open(m, "/home");
    check(`mobile ${label} bottom navigation is present`, (await m.locator(".vtabs .vtab").count()) === 4);
    const tabs = await tapTargets(m, ".vtabs .vtab");
    check(`mobile ${label} bottom nav tap targets clear 44px`,
      tabs.every((t) => t.h >= 44), JSON.stringify(tabs.map((t) => t.h)));
    check(`mobile ${label} stacks Home in one column`,
      (await m.evaluate(() => getComputedStyle(document.querySelector(".vhome-grid")).gridTemplateColumns.split(" ").length)) === 1);
    check(`mobile ${label} keeps the same Home hierarchy`,
      await m.evaluate(() => {
        const order = [...document.querySelectorAll(".vcard")].map((c) => c.className);
        return order.findIndex((c) => c.includes("vcard-needs")) === 0;
      }));

    await open(m, `/lanes/${LANE}`);
    // THE SUM, NOT THE PIECES. Every component was individually bounded and
    // every bound was honoured; nothing bounded what they had to share.
    check(`mobile ${label} interaction zone fits the space it actually has`,
      await m.evaluate(() => {
        const z = document.querySelector(".vlane-interaction");
        const stage = document.querySelector(".gw-lane-stage");
        if (!z || !stage) return false;
        return z.getBoundingClientRect().height <= stage.getBoundingClientRect().height + 1;
      }));
    check(`mobile ${label} lane keeps the composer on screen`,
      await m.evaluate(() => {
        const c = document.querySelector(".gw-composer")?.getBoundingClientRect();
        return Boolean(c) && c.bottom <= window.innerHeight + 2 && c.top >= 0;
      }));
    check(`mobile ${label} lane shows progress and state`,
      /~62% complete/.test(await m.locator(".vprogress-label").first().innerText()));
    check(`mobile ${label} hides diagnostics from the primary lane screen`,
      await m.evaluate(() => {
        const insp = document.querySelector(".vinsp");
        return !insp || insp.hasAttribute("inert") || getComputedStyle(insp).display === "none" || insp.getBoundingClientRect().left >= window.innerWidth - 1;
      }));

    await m.locator("[data-gw-aside-toggle]").click();
    await m.waitForTimeout(450);
    await m.screenshot({ path: join(OUT, `13-mobile${label}-lane-inspector.png`), fullPage: false });
    check(`mobile ${label} Lane details opens the inspector`,
      await m.evaluate(() => {
        const insp = document.querySelector(".vinsp");
        const r = insp?.getBoundingClientRect();
        return Boolean(r) && r.width > 0 && r.left < window.innerWidth - 20;
      }));
    await m.close();
  }

  /* ---------------- KEYBOARD-OPEN ---------------- */
  const kb = await browser.newPage({ viewport: VIEWPORTS.mobile, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await open(kb, `/lanes/${LANE}`);
  await kb.setViewportSize(VIEWPORTS.keyboard);
  await kb.waitForTimeout(600);
  await kb.locator("#gw-instruction").click().catch(() => {});
  await kb.waitForTimeout(400);
  await kb.screenshot({ path: join(OUT, "16-mobile390-lane-keyboard.png"), fullPage: false });
  const kbBox = await kb.evaluate(() => {
    const c = document.querySelector(".gw-composer")?.getBoundingClientRect();
    const s = document.querySelector("[data-gw-send]")?.getBoundingClientRect();
    return c && s ? { cBottom: Math.round(c.bottom), sBottom: Math.round(s.bottom), vh: window.innerHeight } : null;
  });
  check("the composer stays reachable with the keyboard open",
    Boolean(kbBox) && kbBox.sBottom <= kbBox.vh + 2, JSON.stringify(kbBox));
  const kbOverflow = await overflow(kb);
  check("no sideways scroll with the keyboard open", kbOverflow.docScroll <= kbOverflow.vw + 1);
  // The regions that must yield when the keyboard is up. Asserted explicitly,
  // because "Send happens to fit" passed on a lane that was simply less
  // furnished than any real one.
  check("keyboard-open lane sheds navigation chrome for the composer",
    await kb.evaluate(() => {
      const hidden = (s) => { const el = document.querySelector(s); return !el || getComputedStyle(el).display === "none"; };
      return hidden(".vtabs-lane") && hidden(".vlane-head-top") && hidden(".vlane-head-meta");
    }));
  check("keyboard-open interaction zone bounds itself instead of pushing Send off",
    await kb.evaluate(() => {
      const z = document.querySelector(".vlane-interaction");
      const c = document.querySelector(".gw-composer");
      if (!z || !c) return false;
      const zr = z.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      return zr.bottom <= window.innerHeight + 2 && cr.bottom <= window.innerHeight + 2;
    }));
  await kb.close();
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "results.json"), `${JSON.stringify({
  captured_at: new Date().toISOString(),
  viewports: VIEWPORTS,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
}, null, 2)}\n`);

process.stdout.write(`\nUI V2 certification: ${results.length - failed.length} passed, ${failed.length} failed\nEvidence → ${OUT}\n`);
process.exit(failed.length ? 1 : 0);
