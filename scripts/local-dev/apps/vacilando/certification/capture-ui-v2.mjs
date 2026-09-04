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
  // FIVE BLOCKS, and Needs You is deliberately not one of them any more: an
  // interruption is global state that lives in the shell, not Home's content.
  check("desktop Home renders the five command-centre blocks",
    (await desk.locator(".vcard-health, .vcard-lanes, .vcard-usage, .vcard-effect, .vcard-activity").count()) >= 5);
  check("desktop Home renders no Needs You card",
    (await desk.locator(".vcard-needs").count()) === 0);
  check("desktop Home uses the width in two columns",
    (await desk.evaluate(() => getComputedStyle(document.querySelector(".vhome-grid")).gridTemplateColumns.split(" ").length)) === 2);
  // The genuine blocker is still listed — in the global interruption centre,
  // one click from anywhere, rather than as the top of this page.
  await desk.locator("[data-v-needs-open]:visible").first().click();
  await desk.waitForTimeout(250);
  const centre = await desk.evaluate(() => {
    const rows = [...document.querySelectorAll("#needs-panel .vneeds-row")];
    return rows.map((r) => ({
      lane: r.querySelector(".vneeds-row-lane")?.textContent.trim(),
      request: r.querySelector(".vneeds-row-request")?.textContent.trim(),
      why: r.querySelector(".vneeds-row-why")?.textContent.trim() || null,
      age: r.querySelector(".vneeds-row-age")?.textContent.trim(),
    }));
  });
  check("the interruption centre lists every genuine blocker",
    centre.length === 2, centre.map((c) => `${c.lane}: ${c.request}`).join(" | "));
  // GROUPED AND IDENTIFIED BY LANE. With one request a list proves nothing
  // about which lane is asking; with two, the lane is the first thing each row
  // has to say.
  check("each request is identified by its lane",
    centre.every((c) => c.lane) && new Set(centre.map((c) => c.lane)).size === 2);
  check("each request states the ask, one line of why, and its age",
    centre.every((c) => c.request && c.why && c.age));
  check("the interruption centre carries the count",
    (await desk.locator("#needs-panel .vneeds-panel-count").innerText()) === "2");
  await desk.keyboard.press("Escape");
  await desk.waitForTimeout(200);
  check("Home shows no invented effectiveness number",
    await desk.evaluate(() => [...document.querySelectorAll(".vcard-effect .vmetric")]
      .every((el) => el.classList.contains("is-unavailable"))));
  check("primary navigation carries the Needs You count",
    (await desk.locator(".vnav-badge").count()) === 1);
  check("primary navigation carries no diagnostics",
    await desk.evaluate(() => !/Context|Slot|ahead|behind/.test(document.querySelector(".vnav").textContent)));

  // ============ THE OPERATOR VOCABULARY IS THE ONLY VOCABULARY ============
  //
  // Four words: WORKING, NEEDS YOU, READY, FAILED. "Suspended" named a
  // scheduler decision, not a state of anyone's work, and left the operator
  // with nothing to do about it. The Communications fixture lane is
  // WAITING_RESOURCE underneath — the exact run state that used to surface as
  // SUSPENDED — so this asserts against a lane that would fail it.
  const OPERATOR_WORDS = /^(Working|Needs you|Ready|Failed)$/i;
  await open(desk, "/lanes");
  check("no operator-facing surface says suspended",
    await desk.evaluate(() => !/suspend/i.test(document.body.innerText)));
  check("every lane state is one of the four operator words",
    await desk.evaluate((src) => {
      const re = new RegExp(src);
      return [...document.querySelectorAll(".vstate")]
        .every((el) => re.test(el.textContent.trim().split("·")[0].trim()));
    }, OPERATOR_WORDS.source));
  // AGREEMENT, NOT COINCIDENCE. Home, the Lanes list and the Lane header each
  // used to describe a lane in their own words; one resolver now feeds all of
  // them, and this is what proves they did not drift apart again.
  // Home renders `laneRowV2` and the rail renders `mission-rail-item`; they
  // carry the same word in different chrome, so the comparison reads the WORD
  // rather than a selector. Comparing markup would only prove they share a
  // component, which is not the claim.
  const READ_STATES = (words) => Object.fromEntries(
    [...document.querySelectorAll("[data-gw-lane]")].map((r) => {
      const m = r.textContent.match(new RegExp(words, "i"));
      return [r.dataset.gwLane, m ? m[0].toLowerCase() : null];
    }).filter(([, v]) => v));
  const lanesStates = await desk.evaluate(READ_STATES, "Working|Needs you|Ready|Failed");
  await open(desk, "/home");
  const homeStates = await desk.evaluate(READ_STATES, "Working|Needs you|Ready|Failed");
  const shared = Object.keys(homeStates).filter((k) => k in lanesStates);
  check("Home and Lanes agree about every lane they both show",
    shared.length > 0 && shared.every((k) => homeStates[k] === lanesStates[k]),
    `${shared.length} lanes compared`);

  await open(desk, `/lanes/${LANE}`);
  await desk.screenshot({ path: join(OUT, "03-desktop-lane.png"), fullPage: false });
  const headWord = (await desk.locator(".vlane-head .vstate").first().innerText())
    .match(/Working|Needs you|Ready|Failed/i)?.[0].toLowerCase() || null;
  check("the Lane header agrees with the list it was opened from",
    headWord !== null && headWord === lanesStates[LANE],
    `header "${headWord}" vs list "${lanesStates[LANE]}"`);
  check("lane header shows breadcrumb, state and identity",
    (await desk.locator(".vcrumb").count()) === 1
    && (await desk.locator(".vlane-title").innerText()) === "Trust Runtime"
    && /Slot 6/.test(await desk.locator(".vlane-head-meta").innerText()));
  check("lane tabs are present",
    (await desk.locator(".vtab-lane").count()) === 6);
  // PROGRESS IS AN ADJECTIVE ON THE STATUS, NOT A SUBSYSTEM.
  // It used to be its own labelled band ("Provider estimate: ~62% complete"),
  // which read as a second, competing account of what the lane was doing.
  // It now qualifies the one state the operator already reads.
  const statusLine = await desk.locator(".vlane-head .vstate").first().innerText();
  check("progress qualifies the lane's status in one line",
    /Working/.test(statusLine) && /~62%/.test(statusLine) && /Claude/.test(statusLine), statusLine);
  check("the estimate is marked as an estimate", statusLine.includes("~"), statusLine);
  check("there is no second progress subsystem",
    (await desk.locator(".vprogress, .vprogress-label, .vprogress-bar").count()) === 0);
  check("no ETA is shown", !(await desk.evaluate(() => /\bETA\b/i.test(document.body.innerText))));
  // THE CURRENT WORK CARD IS GONE, AND THE INSTRUCTION IS NOT.
  // The card restated the operator's own instruction directly above the same
  // instruction shown as the first YOU message. Removing a duplicate is only
  // correct if nothing is lost, so this asserts both halves.
  check("no standalone Current Work card",
    (await desk.locator(".vcard-work").count()) === 0);
  check("the instruction survives as an authored YOU message, before any reply",
    await desk.evaluate(() => {
      const roles = [...document.querySelectorAll(".vthread [data-v-role]")].map((n) => n.dataset.vRole);
      const u = roles.indexOf("user");
      const p = roles.indexOf("provider");
      return u >= 0 && (p === -1 || u < p);
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
    // The hierarchy is the same on both form factors; what leads it changed.
    // Home opens on what is RUNNING, because what needs you is now in the shell
    // on every route rather than at the top of one page.
    check(`mobile ${label} keeps the same Home hierarchy`,
      await m.evaluate(() => {
        const order = [...document.querySelectorAll(".vcard")].map((c) => c.className);
        return order.findIndex((c) => c.includes("vcard-lanes")) === 0
          && !order.some((c) => c.includes("vcard-needs"));
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
    check(`mobile ${label} lane shows progress inside its status, not beside it`,
      /Working/.test(await m.locator(".vlane-head .vstate").first().innerText())
      && /~62%/.test(await m.locator(".vlane-head .vstate").first().innerText()));
    check(`mobile ${label} carries no second progress subsystem`,
      (await m.locator(".vprogress, .vprogress-label, .vprogress-bar").count()) === 0);
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
    check(`mobile ${label} spends no height on a Current Work card`,
      above.work === null, `current work ${above.work}px`);
    check(`mobile ${label} the operator's instruction is still said, before any reply`,
      await m.evaluate(() => {
        const roles = [...document.querySelectorAll(".vthread [data-v-role]")].map((n) => n.dataset.vRole);
        const u = roles.indexOf("user");
        const p = roles.indexOf("provider");
        return u >= 0 && (p === -1 || u < p);
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
    // ================= FOUR-LINE PREVIEW, PER MESSAGE =================
    //
    // A long provider message used to own the whole screen, so the thread read
    // as one document instead of a conversation. The fix CLAMPS, it does not
    // truncate: every character stays in the DOM, so copy, find-in-page and a
    // screen reader still get the whole message. The checks below exist
    // because "it looks shorter" is exactly what a truncating bug also looks
    // like.
    // Measure the element the clamp is actually applied to, and subtract its
    // own padding. Measuring the padded bubble instead reports ~100px for a
    // correct four-line clamp and invites "relax the threshold", which is how
    // a real defect gets certified away.
    const clamp = await m.evaluate(() => {
      const el = document.querySelector(".vmsg.is-clampable");
      if (!el) return null;
      const inner = el.querySelector("[data-v-msg-clamp] > *");
      const cs = getComputedStyle(inner);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const line = parseFloat(cs.lineHeight) || 18;
      return {
        text: Math.round(inner.getBoundingClientRect().height - pad),
        lines: Math.round(line),
        clampProp: cs.webkitLineClamp,
        display: cs.display,
        chars: inner.textContent.trim().length,
        hasToggle: Boolean(el.querySelector("[data-v-msg-more]")),
      };
    });
    // ASSERT THE EFFECT, NOT THE SPELLING. This check first read
    // `getComputedStyle().display === "-webkit-box"` and failed on a clamp that
    // was working perfectly: current Chromium reports the used display as
    // `flow-root` while still clamping. The height below is the real contract,
    // and it is what caught the genuine defect — `.vmsg` is a flex container,
    // so a clamp declared on `.vmsg-clamp` was blockified away and every
    // message rendered full height with a toggle underneath lying about it.
    check(`mobile ${label} a long message declares the four-line preview`,
      clamp !== null && clamp.clampProp === "4", clamp && `line-clamp ${clamp.clampProp}`);
    check(`mobile ${label} a long message previews at four lines`,
      clamp !== null && clamp.text <= clamp.lines * 4 + 4,
      clamp && `${clamp.text}px of text, line ${clamp.lines}px`);
    check(`mobile ${label} a clamped message offers Show more`, clamp?.hasToggle === true);
    await m.locator("[data-v-msg-more]").first().click();
    await m.waitForTimeout(200);
    const expanded = await m.evaluate(() => {
      const el = document.querySelector(".vmsg.is-clampable");
      const inner = el.querySelector("[data-v-msg-clamp] > *");
      const cs = getComputedStyle(inner);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      return {
        open: el.classList.contains("is-expanded"),
        rendered: Math.round(inner.getBoundingClientRect().height - pad),
        chars: inner.textContent.trim().length,
        others: document.querySelectorAll(".vmsg.is-expanded").length,
      };
    });
    check(`mobile ${label} Show more reveals the whole message`,
      expanded.open && expanded.rendered > clamp.text,
      `${expanded.rendered}px expanded vs ${clamp.text}px clamped`);
    // THE DATA WAS NEVER TRUNCATED. Same character count either way — the
    // clamp is a visual treatment, so copy and assistive technology keep it all.
    check(`mobile ${label} the preview clamps, it does not truncate`,
      expanded.chars === clamp.chars && clamp.chars > 150,
      `${clamp.chars} characters collapsed, ${expanded.chars} expanded`);
    check(`mobile ${label} expanding one message expands only that message`,
      expanded.others === 1, `${expanded.others} expanded`);
    await m.locator("[data-v-msg-more]").first().click();
    await m.waitForTimeout(200);
    check(`mobile ${label} Show less collapses it again`,
      await m.evaluate(() => !document.querySelector(".vmsg.is-clampable").classList.contains("is-expanded")));
    check(`mobile ${label} a short message is never given a toggle`,
      await m.evaluate(() => [...document.querySelectorAll(".vmsg:not(.is-clampable)")]
        .every((el) => !el.querySelector("[data-v-msg-more]"))));

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
    // ============ THE CASE THAT MOTIVATED THE PREVIEW AT ALL ============
    //
    // A completed lane, whose provider closed with a real multi-paragraph final
    // report. The working lane certifies a SHORT status message, so on its own
    // it proves nothing about the thing the operator actually complained
    // about: one verbose provider answer owning the entire phone screen.
    await open(m, "/lanes/lane_payments00001");
    await m.screenshot({ path: join(OUT, `14-mobile${label}-long-report.png`), fullPage: false });
    const report = await m.evaluate(() => {
      const el = document.querySelector(".vmsg-provider");
      if (!el) return null;
      // A provider report is a heading plus prose, so the FOUR LINES are the
      // prose. Measuring the whole card instead would demand that its heading
      // and byline fit inside the four lines too, and the honest way to pass
      // that is to delete the heading.
      const outer = el.querySelector("[data-v-msg-clamp] > *");
      const prose = el.querySelector(".gw-report-body") || outer;
      const cs = getComputedStyle(prose);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      return {
        clampable: el.classList.contains("is-clampable"),
        chars: outer.textContent.trim().length,
        text: Math.round(prose.getBoundingClientRect().height - pad),
        whole: Math.round(outer.getBoundingClientRect().height),
        lines: Math.round(parseFloat(cs.lineHeight) || 18),
        vh: window.innerHeight,
        toggle: Boolean(el.querySelector("[data-v-msg-more]")),
      };
    });
    check(`mobile ${label} a real provider report is long enough to be worth clamping`,
      report !== null && report.chars > 900, report && `${report.chars} characters`);
    // Four line BOXES, measured against a fifth. `lineHeight` and the actual
    // line box differ by a point or two once a report's prose sets its own
    // font, so an exact 4x threshold fails a correct clamp — and the tempting
    // fix, padding the tolerance until it passes, is how a five-line clamp gets
    // certified as four. A strict "fewer than five lines" cannot be satisfied
    // by anything but a working clamp: unclamped, this report was 875px.
    check(`mobile ${label} a long provider report previews at four lines`,
      report !== null && report.clampable && report.text < report.lines * 5,
      report && `${report.text}px of text, line ${report.lines}px`);
    check(`mobile ${label} the long report does not own the screen`,
      report !== null && report.whole < report.vh / 2,
      report && `${report.whole}px of ${report.vh}`);
    check(`mobile ${label} the long report offers Show more`, report?.toggle === true);

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

  /* ======================= COMPOSE MODE =======================
   *
   * The keyboard checks above prove the composer is REACHABLE. They passed
   * throughout the period the operator was telling us that writing on a phone
   * felt like typing through a letterbox — because reachable is not usable.
   * These measure the writing surface itself.
   */
  for (const [label, vp, kbvp] of [
    ["390", VIEWPORTS.mobile, VIEWPORTS.keyboard],
    ["320", VIEWPORTS.narrow, { width: 320, height: 300 }],
  ]) {
    const cm = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await open(cm, `/lanes/${LANE}`);
    await cm.setViewportSize(kbvp);
    await cm.waitForTimeout(500);
    await cm.locator("#gw-instruction").click();
    await cm.waitForTimeout(350);
    await cm.screenshot({ path: join(OUT, `17-mobile${label}-compose.png`), fullPage: false });

    const idle = await cm.evaluate(() => {
      const ta = document.querySelector("#gw-instruction");
      const vh = window.visualViewport?.height || window.innerHeight;
      return { on: document.documentElement.hasAttribute("data-gw-compose"), h: ta.getBoundingClientRect().height, vh };
    });
    check(`compose ${label} focusing the field enters compose mode`, idle.on === true);
    // 35-45% of the ABOVE-KEYBOARD area. Asserted as a band, not a pixel count,
    // because the point is the proportion of what the keyboard left behind.
    const idlePct = idle.h / idle.vh * 100;
    check(`compose ${label} the field opens at a third of the writing area`,
      idlePct >= 33 && idlePct <= 47, `${Math.round(idle.h)}px of ${idle.vh} = ${idlePct.toFixed(0)}%`);

    await cm.locator("#gw-instruction").fill(
      "Investigate the resource attribution path end to end.\n\n".repeat(8));
    await cm.waitForTimeout(300);
    await cm.screenshot({ path: join(OUT, `18-mobile${label}-compose-long.png`), fullPage: false });
    const full = await cm.evaluate(() => {
      const ta = document.querySelector("#gw-instruction");
      const body = document.querySelector(".vlane-body");
      const send = document.querySelector("[data-gw-send]");
      const att = document.querySelector(".gw-attach");
      const prov = document.querySelector(".gw-provider");
      const vis = (el) => Boolean(el) && el.getBoundingClientRect().height > 0;
      const vh = window.visualViewport?.height || window.innerHeight;
      return {
        h: ta.getBoundingClientRect().height, vh,
        scrolls: ta.scrollHeight > ta.clientHeight + 1,
        thread: body ? body.getBoundingClientRect().height : 0,
        sendBottom: send ? Math.round(send.getBoundingClientRect().bottom) : null,
        send: vis(send), attach: vis(att), provider: vis(prov),
        column: getComputedStyle(document.querySelector(".gw-composer-box")).flexDirection,
        messages: [...document.querySelectorAll(".vmsg")].filter((n) => n.getBoundingClientRect().height > 0).length,
      };
    });
    const fullPct = full.h / full.vh * 100;
    check(`compose ${label} the field grows toward half the writing area`,
      fullPct >= 40 && fullPct <= 50, `${Math.round(full.h)}px = ${fullPct.toFixed(0)}%`);
    check(`compose ${label} past its ceiling the field scrolls itself`, full.scrolls === true);
    // A composer that ate the conversation would trade one defect for another.
    check(`compose ${label} the conversation keeps a readable tail`,
      full.thread >= 40 && full.messages > 0, `${Math.round(full.thread)}px, ${full.messages} messages`);
    check(`compose ${label} the field owns its own line, not a slot beside Send`,
      full.column === "column");
    check(`compose ${label} Send and attach stay immediately reachable`,
      full.send && full.attach && full.sendBottom <= full.vh + 2);
    // Reachable but secondary — the instruction asked for exactly this, and
    // the previous behaviour hid it entirely.
    check(`compose ${label} the provider stays reachable while writing`, full.provider === true);
    check(`compose ${label} orientation chrome stands down`,
      await cm.evaluate(() => {
        const gone = (s) => { const el = document.querySelector(s); return !el || getComputedStyle(el).display === "none"; };
        return gone(".vtabs-lane") && gone(".vtabs") && gone(".vlane-head-meta") && gone(".vlane-head-acts");
      }));
    const cmOverflow = await overflow(cm);
    check(`compose ${label} no sideways scroll`, cmOverflow.docScroll <= cmOverflow.vw + 1);

    // Leaving the mode restores the lane.
    await cm.evaluate(() => document.querySelector("#gw-instruction").blur());
    await cm.waitForTimeout(300);
    check(`compose ${label} blurring the field returns the lane`,
      await cm.evaluate(() => !document.documentElement.hasAttribute("data-gw-compose")));
    await cm.close();
  }

  /* ======================= COPY ======================= */
  {
    const cp = await browser.newPage({ viewport: VIEWPORTS.desktop, deviceScaleFactor: 2 });
    await cp.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    // The long final report — the case that makes Copy worth having, and the
    // one where scraping the rendered element would copy a four-line excerpt.
    await open(cp, "/lanes/lane_payments00001");
    const before = await cp.evaluate(() => {
      const li = document.querySelector(".vmsg-provider");
      const btn = li?.querySelector("[data-v-msg-copy]");
      return {
        clamped: li?.classList.contains("is-clampable") && !li.classList.contains("is-expanded"),
        visible: Boolean(btn) && btn.getBoundingClientRect().height > 0,
        inOverflow: Boolean(btn?.closest("details, [hidden]")),
        len: btn?.getAttribute("data-v-copy-text")?.length || 0,
      };
    });
    check("Copy is visible on provider output without opening anything",
      before.visible && !before.inOverflow);
    check("the report under test is genuinely clamped", before.clamped === true);
    await cp.locator(".vmsg-provider [data-v-msg-copy]").first().click();
    await cp.waitForTimeout(250);
    const copied = await cp.evaluate(async () => ({
      text: await navigator.clipboard.readText(),
      label: document.querySelector(".vmsg-provider [data-v-msg-copy] .vmsg-copy-label")?.textContent,
      stillCollapsed: !document.querySelector(".vmsg-provider").classList.contains("is-expanded"),
    }));
    check("Copy takes the WHOLE message while it is collapsed",
      copied.text.length === before.len && copied.text.length > 1000,
      `${copied.text.length} characters`);
    check("Copy preserves the report's paragraphs", copied.text.split("\n\n").length >= 4);
    // The byline and the run's own labels are chrome, not what the provider said.
    check("Copy takes no UI metadata",
      !/^CLAUDE/i.test(copied.text) && !/Final report/.test(copied.text));
    check("Copy confirms itself in place", copied.label === "Copied");
    check("Copy does not expand the message to read it", copied.stillCollapsed === true);
    check("Copy needs no Show more first", before.clamped && copied.text.length > 1000);
    await cp.screenshot({ path: join(OUT, "19-desktop-copy.png"), fullPage: false });
    await cp.close();
  }

  /* =============== NEEDS YOU — GLOBAL INTERRUPT STATE =============== */
  for (const [label, vp, mobile] of [
    ["desktop", VIEWPORTS.desktop, false],
    ["mobile390", VIEWPORTS.mobile, true],
  ]) {
    const ny = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    for (const route of ["/home", "/lanes"]) {
      await open(ny, route);
      const r = await ny.evaluate(() => ({
        card: Boolean(document.querySelector(".vcard-needs")),
        bar: (() => { const b = document.getElementById("approvals-bar"); return Boolean(b) && !b.hidden && b.innerHTML.trim().length > 0; })(),
        controls: [...document.querySelectorAll("[data-v-needs-open]")].filter((b) => b.getBoundingClientRect().height > 0).length,
      }));
      check(`${label} ${route} renders no permanent Needs You content`, !r.card && !r.bar);
      check(`${label} ${route} carries exactly one global Needs You control`, r.controls === 1);
    }
    await open(ny, "/home");
    await ny.locator("[data-v-needs-open]:visible").first().click();
    await ny.waitForTimeout(300);
    await ny.screenshot({ path: join(OUT, `20-${label}-needs-you.png`), fullPage: false });
    const panel = await ny.evaluate(() => {
      const p = document.getElementById("needs-panel");
      const row = p?.querySelector(".vneeds-row");
      return {
        open: Boolean(p) && !p.hidden,
        rows: p?.querySelectorAll(".vneeds-row").length || 0,
        lane: Boolean(row?.querySelector(".vneeds-row-lane")?.textContent.trim()),
        request: Boolean(row?.querySelector(".vneeds-row-request")?.textContent.trim()),
        age: Boolean(row?.querySelector(".vneeds-row-age")?.textContent.trim()),
        review: Boolean(row?.querySelector("[data-v-needs-review-link]")),
        route: location.hash,
        // The full governed proposal belongs behind Review, not in this list.
        payload: /content_fingerprint|Approve|Deny/.test(p?.textContent || ""),
      };
    });
    check(`${label} the Needs You panel opens from the shell`, panel.open === true);
    check(`${label} opening it is not navigation`, panel.route === "#/home");
    check(`${label} each request names its lane, the ask, and its age`,
      panel.rows > 0 && panel.lane && panel.request && panel.age && panel.review);
    check(`${label} the governed payload stays behind Review`, panel.payload === false);
    // A REQUEST'S LANE REFERENCE IS RESOLVED, NEVER PASTED INTO A ROUTE.
    // The running host files some requests with the worktree NAME in lane_id;
    // trusting it produced #/lanes/ui-vac and "Lane unavailable".
    const routes = await ny.evaluate(() => [...document.querySelectorAll("#needs-panel [data-v-needs-review-link]")]
      .map((a) => a.getAttribute("href")));
    check(`${label} every Review link points at a lane that exists`,
      routes.length > 0 && routes.every((h) => /^#\/lanes\/lane_[a-z0-9]+$/.test(h)),
      routes.join(" "));
    // And following one must not land on the unavailable screen.
    await ny.locator("#needs-panel [data-v-needs-review-link]").first().click();
    await ny.waitForTimeout(700);
    const landed = await ny.evaluate(() => ({
      hash: location.hash,
      unavailable: /Lane unavailable|could not be resolved/i.test(document.body.innerText),
      panelClosed: document.getElementById("needs-panel")?.hidden === true,
    }));
    check(`${label} Review opens a real lane, not "Lane unavailable"`,
      landed.unavailable === false && /^#\/lanes\/lane_/.test(landed.hash), JSON.stringify(landed));
    check(`${label} Review closes the sheet on its way`, landed.panelClosed === true);
    // A STATE FLAG MUST NOT SHARE A SELECTOR WITH AN ACTION HOOK.
    //
    // The open flag was written to <html> under the SAME attribute the control
    // carries, so closest("[data-v-needs-open]") matched the root for EVERY
    // click while the sheet was open: the handler treated every click in the
    // document as a press of the Needs You control, cancelled it, and toggled
    // the panel. Review could not navigate and nothing else worked either.
    await open(ny, "/home");
    await ny.locator("[data-v-needs-open]:visible").first().click();
    await ny.waitForTimeout(250);
    check(`${label} the open flag does not impersonate the control`,
      await ny.evaluate(() => !document.documentElement.hasAttribute("data-v-needs-open")
        && document.documentElement.hasAttribute("data-v-needs-panel-open")));
    // Proof by behaviour, not just by attribute name: an ordinary link inside
    // the sheet still does what a link does.
    const stillWorks = await ny.evaluate(() => {
      const a = document.querySelector("#needs-panel [data-v-needs-review-link]");
      if (!a) return null;
      const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
      a.dispatchEvent(ev);
      return { prevented: ev.defaultPrevented };
    });
    check(`${label} a click inside the sheet is not swallowed by the control`,
      stillWorks && stillWorks.prevented === false, JSON.stringify(stillWorks));
    await ny.close();
  }

  /* ============ HOME IS A COMMAND CENTRE, LANES IS A DIRECTORY ============ */
  {
    const hv = await browser.newPage({ viewport: VIEWPORTS.desktop, deviceScaleFactor: 2 });
    await open(hv, "/home");
    const home = await hv.evaluate(() => ({
      title: document.querySelector(".vcard-lanes .vcard-title")?.textContent.trim(),
      rows: document.querySelectorAll(".vcard-lanes .vlane").length,
      viewAll: Boolean(document.querySelector('.vcard-lanes a[href="#/lanes"]')),
      health: Boolean(document.querySelector(".vcard-health")),
      usage: Boolean(document.querySelector(".vcard-usage")),
      activity: Boolean(document.querySelector(".vcard-activity")),
    }));
    await open(hv, "/lanes");
    const dir = await hv.evaluate(() => document.querySelectorAll("[data-gw-lane]").length);
    check("Home shows a bounded operational subset, not the directory",
      home.rows > 0 && home.rows < dir, `Home ${home.rows} of ${dir} shown on Lanes`);
    check("Home names that subset for what it is", home.title === "Active lanes");
    check("Home offers the directory rather than reproducing it", home.viewAll === true);
    check("Home keeps its command-centre blocks", home.health && home.usage && home.activity);
    await hv.close();
  }

  /* ================= BACK PRESERVES THE ENTRY ORIGIN ================= */
  for (const [label, vp, mobile] of [
    ["desktop", VIEWPORTS.desktop, false],
    ["mobile390", VIEWPORTS.mobile, true],
  ]) {
    const nav = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    for (const origin of ["/home", "/lanes"]) {
      await open(nav, origin);
      const entry = nav.locator(`[data-gw-lane="${LANE}"]:visible`).first();
      if (await entry.count() === 0) continue;
      await entry.click();
      await nav.waitForTimeout(600);
      const back = await nav.evaluate(() => ({
        href: document.querySelector("[data-gw-back]")?.getAttribute("href"),
        crumb: document.querySelector(".vlane-crumb a")?.textContent.trim(),
      }));
      check(`${label} a lane opened from ${origin} returns to ${origin}`,
        back.href === `#${origin}`, `back="${back.href}"`);
      check(`${label} the breadcrumb names the origin, not the directory`,
        back.crumb === (origin === "/home" ? "Home" : "Lanes"), back.crumb);
    }
    // A deep link has no journey to return to.
    await nav.goto(`${BASE}/#/lanes/${LANE}`, { waitUntil: "domcontentloaded" });
    await nav.waitForTimeout(700);
    check(`${label} a deep-linked lane falls back to the directory`,
      await nav.evaluate(() => document.querySelector("[data-gw-back]")?.getAttribute("href") === "#/lanes"));
    await nav.close();
  }

  /* ========== RE-VERIFICATION: THREAD DENSITY, PROGRESS, VOCABULARY ==========
   *
   * The prior pass is not assumed to have landed correctly. These re-assert its
   * claims against the shipped build, and add the three the harness never had:
   * that reading does not cost you your place, that a stale estimate disappears
   * rather than lingering, and that the operator vocabulary holds on EVERY
   * surface rather than the one route it was first checked on.
   */
  {
    const rv = await browser.newPage({ viewport: VIEWPORTS.mobile, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    // ---- expanding a message must not move the thread underneath the reader ----
    await open(rv, "/lanes/lane_payments00001");
    const scroll = await rv.evaluate(async () => {
      const body = document.querySelector(".vlane-body");
      body.scrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
      const before = body.scrollTop;
      const li = document.querySelector(".vmsg-provider.is-clampable");
      const btn = li?.querySelector("[data-v-msg-more]");
      if (!btn) return null;
      const anchorTop = li.getBoundingClientRect().top;
      btn.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const afterTop = li.getBoundingClientRect().top;
      const expanded = li.classList.contains("is-expanded");
      btn.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        expanded, collapsed: !li.classList.contains("is-expanded"),
        before, after: body.scrollTop, drift: Math.abs(afterTop - anchorTop),
      };
    });
    check("expanding a message keeps the message where the reader was looking",
      Boolean(scroll) && scroll.expanded && scroll.drift <= 8,
      scroll ? `moved ${Math.round(scroll.drift)}px` : "no clampable message");
    check("Show less collapses it again", scroll?.collapsed === true);

    // ---- a live provider repaint must not reset the thread ----
    await open(rv, `/lanes/${LANE}`);
    const live = await rv.evaluate(async () => {
      const body = document.querySelector(".vlane-body");
      body.scrollTop = 0;
      const li = document.querySelector(".vmsg-provider");
      const id = li?.getAttribute("data-v-msg-id");
      const btn = li?.querySelector("[data-v-msg-more]");
      if (btn) btn.click();
      const wasExpanded = li?.classList.contains("is-expanded") || false;
      const at = body.scrollTop;
      // The controller repaints the whole view on every poll; force one.
      window.dispatchEvent(new Event("focus"));
      await new Promise((r) => setTimeout(r, 900));
      const now = document.querySelector(`.vmsg[data-v-msg-id="${CSS.escape(id || "")}"]`);
      return {
        stillExpanded: wasExpanded ? Boolean(now?.classList.contains("is-expanded")) : true,
        scrollKept: Math.abs((document.querySelector(".vlane-body")?.scrollTop || 0) - at) <= 24,
      };
    });
    check("a repaint does not slam an expanded message shut", live.stillExpanded === true);
    check("a repaint does not throw the thread back to the top", live.scrollKept === true);

    // ---- progress: fresh shows, stale disappears, absent invents nothing ----
    await open(rv, `/lanes/${LANE}`);
    const fresh = await rv.evaluate(() => document.querySelector(".vlane-head .vstate")?.textContent || "");
    check("a FRESH estimate rides with the lane's state", /~62%/.test(fresh), fresh.trim());
    await open(rv, "/lanes/lane_runtimeperf001");
    const stale = await rv.evaluate(() => document.querySelector(".vlane-head .vstate")?.textContent || "");
    // The fixture's estimate is 95 minutes old against a 30-minute staleness
    // floor. A number nobody has refreshed is worse than no number.
    check("a STALE estimate is dropped, not left attached to the lane",
      !/%/.test(stale), stale.trim());
    await open(rv, "/lanes/lane_payments00001");
    const none = await rv.evaluate(() => document.querySelector(".vlane-head .vstate")?.textContent || "");
    check("no estimate invents no percentage — and never 0%",
      !/%/.test(none) && !/\b0%/.test(none), none.trim());

    // ---- the operator vocabulary holds on EVERY surface ----
    for (const route of ["/home", "/lanes", "/activity", "/system",
      `/lanes/${LANE}`, "/lanes/lane_suspended0001", "/lanes/lane_runtimeperf001"]) {
      await open(rv, route);
      const leak = await rv.evaluate(() => {
        // The Inspector is Details: scheduler and provider internals legitimately
        // live there. Everything the operator reads WITHOUT asking must not.
        const insp = document.querySelector(".vinsp");
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll(".vinsp, .gw-lane-aside").forEach((n) => n.remove());
        const text = clone.innerText || clone.textContent || "";
        return { primary: /suspend/i.test(text), hasInspector: Boolean(insp) };
      });
      check(`no operator-facing surface says suspended — ${route}`, leak.primary === false);
    }
    await rv.close();
  }

  /* ============ LANE RESOURCES — MEASURED, OR SAID TO BE ABSENT ============ */
  {
    const rs = await browser.newPage({ viewport: VIEWPORTS.desktop, deviceScaleFactor: 2 });
    await open(rs, `/lanes/${LANE}`);
    const res = await rs.evaluate(() => {
      const sec = document.querySelector('[data-v-inspector="resources"]');
      if (!sec) return null;
      sec.open = true;
      const text = sec.textContent.replace(/\s+/g, " ");
      return {
        memory: /Memory 1\.7 GB/.test(text),
        cpuAbsent: /CPU Not sampled/.test(text),
        peakAbsent: /Peak memory Not projected yet/.test(text),
        ancestry: /ancestry/.test(text),
        // A number for CPU would be the whole failure.
        cpuNumber: /CPU \d+ ?%/.test(text),
      };
    });
    check("the lane reports the memory its own process tree holds", res?.memory === true);
    check("the lane says how that was attributed", res?.ancestry === true);
    check("CPU is declared absent, not estimated", res?.cpuAbsent === true && res?.cpuNumber === false);
    check("peak memory names its unwired source", res?.peakAbsent === true);
    await rs.screenshot({ path: join(OUT, "21-desktop-lane-resources.png"), fullPage: false });
    await rs.close();
  }

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
