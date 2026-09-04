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
  // CONTEXT -> CONVERSATION -> HUMAN ACTION. The output card became a
  // chronological thread; the ordering contract is unchanged.
  check("current work orients, then the conversation follows",
    await desk.evaluate(() => {
      const w = document.querySelector(".vcard-work")?.getBoundingClientRect().top ?? 1e9;
      const t = document.querySelector(".vcard-thread")?.getBoundingClientRect().top ?? -1;
      return t > w;
    }));
  check("desktop keeps the conversation as the central content, not dashboard cards",
    await desk.evaluate(() => {
      const roles = [...document.querySelectorAll(".vthread [data-v-role]")].map((n) => n.dataset.vRole);
      return roles.includes("user") && roles.includes("provider");
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
      const o = document.querySelector(".vcard-thread")?.getBoundingClientRect();
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

    // ---- Home and Lanes as product surfaces ----
    await open(m, "/home");
    check(`mobile ${label} Home has ONE page identity`,
      await m.evaluate(() => {
        const crumb = document.querySelector(".topbar .crumb");
        const title = document.querySelector(".vpage-title")?.textContent?.trim();
        return title === "Home" && !(crumb && getComputedStyle(crumb).display !== "none");
      }));
    check(`mobile ${label} Home Needs You is a summary, not a payload`,
      await m.evaluate(() => [...document.querySelectorAll(".vneeds-row")]
        .every((r) => r.getBoundingClientRect().height <= 96 && !r.querySelector(".vneeds-row-detail"))));
    check(`mobile ${label} Home metric tiles are wide enough to read`,
      await m.evaluate(() => {
        const g = document.querySelector(".vcard-health .vgrid-4");
        return Boolean(g) && getComputedStyle(g).gridTemplateColumns.split(" ").length <= 2;
      }));

    await open(m, "/lanes");
    check(`mobile ${label} the lane catalogue carries no governed payload`,
      await m.evaluate(() => {
        const bar = document.querySelector("#approvals-bar");
        return !bar || getComputedStyle(bar).display === "none" || bar.getBoundingClientRect().height === 0;
      }));
    check(`mobile ${label} no "No folder" heading`,
      await m.evaluate(() => !/no folder/i.test(document.querySelector("#view")?.innerText || "")));
    const laneRows = await m.evaluate(() => {
      const rows = [...document.querySelectorAll("[data-gw-lane]")];
      return {
        total: rows.length,
        visible: rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; }).length,
      };
    });
    check(`mobile ${label} several lanes are scannable at once`,
      laneRows.visible >= 4, `${laneRows.visible} of ${laneRows.total} rows in the first screen`);

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

    // ===================== VISUAL / PRODUCT ASSERTIONS =====================
    //
    // GEOMETRY IS NOT DESIGN. "Nothing overflows" and "Send is technically
    // visible" both passed on a lane that spent 158px of an 844px screen on
    // chrome before showing any work. These measure whether the phone layout is
    // actually FOR a phone.
    const above = await m.evaluate(() => {
      const h = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().height) : null; };
      const top = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().top) : null; };
      const shown = (sel) => { const el = document.querySelector(sel); return Boolean(el) && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0; };
      return {
        vh: window.innerHeight,
        header: h(".vlane-head"),
        work: h(".vcard-work"),
        firstMessageTop: top(".vmsg"),
        textareaH: h(".gw-composer textarea"),
        trayH: h(".vneeds-tray"),
        stopShown: shown(".vlane-stop"),
        metaShown: shown(".vlane-head-meta"),
        cancelInCard: shown(".vcard-work [data-gw-cancel-run]"),
      };
    });
    check(`mobile ${label} lane header is phone-scale`,
      above.header !== null && above.header <= 100, `header ${above.header}px of ${above.vh}`);
    check(`mobile ${label} header carries no desktop actions or identity detail`,
      above.stopShown === false && above.metaShown === false && above.cancelInCard === false);
    check(`mobile ${label} Current Work is a bounded summary, not a document`,
      above.work !== null && above.work <= 230, `current work ${above.work}px`);
    check(`mobile ${label} the long instruction is behind a disclosure`,
      await m.evaluate(() => {
        const d = document.querySelector("[data-v-work-details]");
        const card = document.querySelector(".vcard-work");
        if (!d || !card) return false;
        return !d.open && !/do not stop at the first green suite/i.test(card.innerText);
      }));
    check(`mobile ${label} conversation begins in the first screen`,
      above.firstMessageTop !== null && above.firstMessageTop < above.vh,
      `first message at ${above.firstMessageTop} of ${above.vh}`);
    check(`mobile ${label} authorship is visually distinguishable`,
      await m.evaluate(() => {
        const u = document.querySelector(".vmsg-user");
        const p = document.querySelector(".vmsg-provider");
        if (!u || !p) return false;
        const uw = u.querySelector(".vmsg-who")?.textContent?.trim();
        const pw = p.querySelector(".vmsg-who")?.textContent?.trim();
        const ub = getComputedStyle(u.querySelector(".vmsg-body")).backgroundColor;
        const pb = getComputedStyle(p.querySelector(".vmsg-body")).backgroundColor;
        return Boolean(uw) && Boolean(pw) && uw !== pw && ub !== pb;
      }));
    check(`mobile ${label} a completed governed action is a system line, not a banner`,
      await m.evaluate(() => {
        const sys = document.querySelector(".vmsg-system");
        const banner = document.querySelector(".gw-gv-outcome");
        return Boolean(sys) && !banner && sys.getBoundingClientRect().height <= 60;
      }));
    check(`mobile ${label} the idle composer asks for one line`,
      above.textareaH !== null && above.textareaH <= 44, `textarea ${above.textareaH}px`);
    check(`mobile ${label} the Needs You tray is one line`,
      above.trayH === null || above.trayH <= 52, `tray ${above.trayH}px`);

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
  // WHAT MUST YIELD WHEN THE KEYBOARD IS UP.
  //
  // The back row is no longer one of them: the compact header folds the back
  // arrow into the identity row, so it costs nothing. What goes is everything
  // you cannot use while composing — the tabs, the identity detail, and the
  // orientation card, which is context for work you are already looking at.
  check("keyboard-open lane sheds navigation chrome for the composer",
    await kb.evaluate(() => {
      const gone = (s) => { const el = document.querySelector(s); return !el || getComputedStyle(el).display === "none"; };
      const head = document.querySelector(".vlane-head");
      return gone(".vtabs-lane") && gone(".vlane-head-meta") && gone(".vcard-work")
        && Boolean(head) && head.getBoundingClientRect().height <= 60;
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
