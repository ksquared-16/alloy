#!/usr/bin/env node
/**
 * LIVE ACCEPTANCE against the RUNNING, INSTALLED Gateway.
 *
 * The fixture certification drives the real browser bundle against deterministic
 * data. That is supporting evidence, and it is not the product: it certified 199
 * green checks while the running Gateway sent the operator to "Lane unavailable"
 * from the one control that exists to take them to what needs them, because the
 * fixture never filed a request carrying a worktree name where a lane id belongs.
 *
 * This drives the INSTALLED runtime with the REAL lane list, and it asserts the
 * things a screenshot cannot: that a route did not change, that a click was not
 * swallowed, that a copy carries the whole message.
 *
 *   node apps/vacilando/certification/capture-live-acceptance.mjs \
 *     [--base http://127.0.0.1:3030] [--out <dir>]
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const PLAYWRIGHT = process.env.VACILANDO_PLAYWRIGHT
  || "/Users/vacilando/Alloy/web/node_modules/playwright/index.mjs";

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argOf("--base", "http://127.0.0.1:3030");
const OUT = argOf("--out", join(REPO, "docs", "platform", "planning", "vacilando-os", "ui-v2", "live"));
mkdirSync(OUT, { recursive: true });

const MOBILE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 568 };
const KB = { width: 390, height: 380 };
const KB320 = { width: 320, height: 300 };
const DESKTOP = { width: 1440, height: 950 };

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

// The browser authenticates the way a person does: a session cookie, obtained
// from the token file this host already trusts. No token is ever put in a URL.
function gatewayToken() {
  for (const p of [
    join(homedir(), ".local/state/alloy-dev/gateway/vacilando/api-token"),
    join(homedir(), ".local/state/alloy-dev/vacilando/api-token"),
  ]) {
    try { const t = readFileSync(p, "utf8").trim(); if (t) return t; } catch { /* next */ }
  }
  return null;
}

const token = gatewayToken();
if (!token) { process.stderr.write("no gateway token on this host\n"); process.exit(2); }

const sessionRes = await fetch(`${BASE}/api/gateway/session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ gateway_token: token }),
});
const setCookie = sessionRes.headers.get("set-cookie") || "";
const m = setCookie.match(/vacilando_gw=([^;]+)/);
if (!m) { process.stderr.write(`could not establish a session: ${sessionRes.status}\n`); process.exit(2); }
const COOKIE = { name: "vacilando_gw", value: m[1], domain: "127.0.0.1", path: "/" };

const lanesRes = await fetch(`${BASE}/api/lanes`, { headers: { authorization: `Bearer ${token}` } });
const LANES = (await lanesRes.json()).lanes || [];
const lenOf = (l) => String(l.execution_run?.instruction || l.previous_run?.instruction
  || l.last_instruction?.instruction || "").length;
const repOf = (l) => String(l.execution_run?.completion_report?.summary
  || l.previous_run?.completion_report?.summary || "").length;
const LONG_USER = [...LANES].sort((a, b) => lenOf(b) - lenOf(a))[0];
const LONG_PROVIDER = [...LANES].sort((a, b) => repOf(b) - repOf(a))[0];
process.stdout.write(`lanes=${LANES.length} longest instruction=${LONG_USER?.label} (${lenOf(LONG_USER)}) `
  + `longest report=${LONG_PROVIDER?.label} (${repOf(LONG_PROVIDER)})\n\n`);

const { chromium } = await import(PLAYWRIGHT);
const browser = await chromium.launch();

async function newPage(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2 });
  await ctx.addCookies([COOKIE]);
  return ctx.newPage();
}
async function open(page, hash, settle = 2200) {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
}
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });

try {
  /* ============ 3. NEEDS YOU OPENS IN PLACE, FROM EVERY SURFACE ============ */
  for (const [tag, vp, mobile] of [["mobile", MOBILE, true], ["desktop", DESKTOP, false]]) {
    const p = await newPage(vp, mobile);
    for (const [route, hash] of [["Home", "/home"], ["Lanes", "/lanes"], ["Lane", `/lanes/${LANES[0]?.lane_id}`]]) {
      await open(p, hash);
      const before = await p.evaluate(() => location.hash);
      const historyBefore = await p.evaluate(() => history.length);
      const ctl = p.locator("[data-v-needs-open]:visible").first();
      if (await ctl.count() === 0) { check(`${tag} ${route}: a global Needs You control exists`, false); continue; }
      check(`${tag} ${route}: a global Needs You control exists`, true);
      await ctl.click();
      await p.waitForTimeout(500);
      const st = await p.evaluate(() => ({
        hash: location.hash,
        open: document.getElementById("needs-panel")?.hidden === false,
        unavailable: /Lane unavailable|could not be resolved/i.test(document.body.innerText),
        history: history.length,
      }));
      check(`${tag} ${route}: the control opens a sheet in place`, st.open === true);
      check(`${tag} ${route}: opening it does not navigate`, st.hash === before, `${before} -> ${st.hash}`);
      check(`${tag} ${route}: no "Lane unavailable"`, st.unavailable === false);
      check(`${tag} ${route}: the sheet does not pollute history`, st.history === historyBefore,
        `${historyBefore} -> ${st.history}`);
      if (route === "Home") await shot(p, tag === "mobile" ? "live-02-mobile-needs-sheet" : "live-14-desktop-needs-panel");
      // Every offered route must name a lane that exists.
      const routes = await p.evaluate(() => [...document.querySelectorAll("#needs-panel [data-v-needs-review-link]")]
        .map((a) => a.getAttribute("href")));
      check(`${tag} ${route}: every Review link names a real lane`,
        routes.every((h) => /^#\/lanes\/lane_[a-z0-9]+$/i.test(h)), routes.join(" ") || "(none pending)");
      // Closing returns to exactly the screen underneath.
      await p.locator("[data-v-needs-close]").first().click();
      await p.waitForTimeout(350);
      check(`${tag} ${route}: closing returns to the same screen`,
        (await p.evaluate(() => location.hash)) === before);
    }
    await p.close();
  }

  /* ============ HOME / LANES / thread ============ */
  const m = await newPage(MOBILE, true);
  await open(m, "/home");
  await shot(m, "live-01-mobile-home");
  const home = await m.evaluate(() => ({
    needsCard: Boolean(document.querySelector(".vcard-needs")),
    bar: (() => { const b = document.getElementById("approvals-bar"); return Boolean(b) && !b.hidden && b.innerHTML.trim().length > 0; })(),
    laneRows: document.querySelectorAll(".vcard-lanes .vlane").length,
    title: document.querySelector(".vcard-lanes .vcard-title")?.textContent?.trim() || null,
    viewAll: Boolean(document.querySelector('.vcard-lanes a[href="#/lanes"]')),
    health: Boolean(document.querySelector(".vcard-health")),
  }));
  check("Home renders no permanent Needs You card", home.needsCard === false);
  check("Home renders no permanent approvals block", home.bar === false);
  await open(m, "/lanes");
  await shot(m, "live-03-mobile-lanes");
  const total = await m.evaluate(() => document.querySelectorAll("[data-gw-lane]").length);
  check("Home shows an operational subset, not the directory",
    home.laneRows > 0 && home.laneRows < total, `Home ${home.laneRows} of ${total} on Lanes`);
  check("Home names that subset and offers the directory",
    home.title === "Active lanes" && home.viewAll === true, String(home.title));
  check("Home keeps its command-centre blocks", home.health === true);

  /* ============ 4 + 5. MESSAGE-LOCAL COPY, FOUR-LINE CONTRACT ============ */
  const laneForThread = LONG_PROVIDER?.lane_id || LANES[0]?.lane_id;
  await open(m, `/lanes/${laneForThread}`);
  await shot(m, "live-04-mobile-user-collapsed");
  const thread = await m.evaluate(() => {
    const rows = [...document.querySelectorAll(".vmsg")];
    const of = (role) => {
      const li = rows.find((r) => r.getAttribute("data-v-role") === role);
      if (!li) return null;
      const clamp = li.querySelector("[data-v-msg-clamp]");
      const body = clamp?.firstElementChild || clamp || li;
      const lh = (body instanceof Element ? parseFloat(getComputedStyle(body).lineHeight) : NaN) || 20;
      return {
        clampable: li.classList.contains("is-clampable"),
        expanded: li.classList.contains("is-expanded"),
        lines: Math.round((clamp?.getBoundingClientRect().height || 0) / lh),
        hasCopy: Boolean(li.querySelector("[data-v-msg-copy]")),
        copyVisible: (li.querySelector("[data-v-msg-copy]")?.getBoundingClientRect().height || 0) > 0,
        hasMore: Boolean(li.querySelector("[data-v-msg-more]")),
        chars: li.querySelector("[data-v-msg-copy]")?.getAttribute("data-v-copy-text")?.length || 0,
      };
    };
    // A thread-level Copy is exactly what this pass removed.
    const threadCopy = [...document.querySelectorAll("[data-gw-copy]")]
      .filter((el) => el.getBoundingClientRect().height > 0).length;
    return { user: of("user"), provider: of("provider"), threadCopy };
  });
  check("there is no thread-level Copy anywhere", thread.threadCopy === 0, `${thread.threadCopy} found`);
  for (const role of ["user", "provider"]) {
    const r = thread[role];
    if (!r) { check(`${role} message present in a live lane`, false); continue; }
    check(`${role} message owns a Copy control`, r.hasCopy && r.copyVisible);
    if (r.clampable) {
      check(`${role} message defaults to about four lines`, r.lines <= 5 && r.lines >= 3, `${r.lines} lines`);
      check(`${role} long message offers See more`, r.hasMore === true);
    } else {
      check(`${role} short message needs no See more but keeps Copy`, r.hasMore === false && r.hasCopy);
    }
  }
  // Expand the provider message, then copy it while collapsed and expanded.
  const providerLi = m.locator('.vmsg[data-v-role="provider"]').first();
  if (await providerLi.locator("[data-v-msg-more]").count()) {
    await providerLi.locator("[data-v-msg-more]").click();
    await m.waitForTimeout(350);
    await shot(m, "live-07-mobile-provider-expanded");
    check("expanding shows See less", await m.evaluate(() =>
      Boolean(document.querySelector('.vmsg[data-v-role="provider"].is-expanded')))); 
    await providerLi.locator("[data-v-msg-more]").click();
    await m.waitForTimeout(300);
  }
  await shot(m, "live-06-mobile-provider-collapsed");
  await m.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const copyBtn = providerLi.locator("[data-v-msg-copy]").first();
  if (await copyBtn.count()) {
    await copyBtn.scrollIntoViewIfNeeded();
    await shot(m, "live-08-mobile-message-copy");
    await copyBtn.click();
    await m.waitForTimeout(300);
    await shot(m, "live-09-mobile-copied");
    const copied = await m.evaluate(async () => ({
      label: document.querySelector('.vmsg[data-v-role="provider"] .vmsg-copy-label')?.textContent,
      clip: await navigator.clipboard.readText().catch(() => ""),
      attr: document.querySelector('.vmsg[data-v-role="provider"] [data-v-msg-copy]')?.getAttribute("data-v-copy-text") || "",
      collapsed: !document.querySelector('.vmsg[data-v-role="provider"]')?.classList.contains("is-expanded"),
    }));
    check("Copy confirms in place", copied.label === "Copied", String(copied.label));
    check("Copy takes the whole message while collapsed",
      copied.clip.length > 0 && copied.clip.length === copied.attr.length && copied.collapsed,
      `${copied.clip.length} chars`);
    check("Copy excludes byline and status chrome",
      !/^CLAUDE|^You\b/i.test(copied.clip) && !/Final report/.test(copied.clip));
  }

  /* ============ 6 + 7. PROGRESS BESIDE STATE, NO CURRENT WORK ============ */
  const lane = await m.evaluate(() => ({
    status: document.querySelector(".vlane-head .vstate")?.textContent?.trim() || "",
    workCard: document.querySelectorAll(".vcard-work").length,
    progressBar: document.querySelectorAll(".vprogress, .vprogress-bar, .vprogress-label").length,
    eta: /\bETA\b/i.test(document.body.innerText),
    firstBlock: document.querySelector(".vlane-body")?.firstElementChild?.className || "",
  }));
  check("no standalone Current Work card", lane.workCard === 0);
  check("no second progress subsystem", lane.progressBar === 0);
  check("no ETA anywhere", lane.eta === false);
  check("the lane status line carries state (and progress when fresh)",
    /Working|Needs you|Ready|Failed/i.test(lane.status), lane.status);
  await shot(m, "live-10-mobile-lane-status");

  /* ============ 11. OPERATOR VOCABULARY ON EVERY ROUTE ============ */
  for (const hash of ["/home", "/lanes", "/activity", "/system", `/lanes/${laneForThread}`]) {
    await open(m, hash, 1600);
    const leak = await m.evaluate(() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll(".vinsp, .gw-lane-aside").forEach((n) => n.remove());
      return /suspend/i.test(clone.innerText || clone.textContent || "");
    });
    check(`no operator-facing surface says suspended — ${hash}`, leak === false);
  }

  /* ============ 13. LANE RESOURCES ============ */
  await open(m, `/lanes/${laneForThread}`);
  const res = await m.evaluate(() => {
    const sec = document.querySelector('[data-v-inspector="resources"]');
    if (!sec) return { present: false };
    sec.open = true;
    const text = sec.textContent.replace(/\s+/g, " ");
    return { present: true, text: text.slice(0, 200), fakeCpu: /CPU\s+\d+\s?%/.test(text) };
  });
  check("lane resources never show a CPU figure that was not measured", res.fakeCpu !== true,
    res.present ? res.text : "(no resources block — no live seat for this lane)");

  /* ============ 10. ORIGIN-AWARE BACK ============ */
  for (const [originName, originHash] of [["Home", "/home"], ["Lanes", "/lanes"]]) {
    await open(m, originHash);
    const entry = m.locator(`[data-gw-lane]:visible`).first();
    if (await entry.count() === 0) continue;
    await entry.click();
    await m.waitForTimeout(1500);
    const back = await m.evaluate(() => ({
      href: document.querySelector("[data-gw-back]")?.getAttribute("href"),
      crumb: document.querySelector(".vlane-crumb a")?.textContent?.trim(),
    }));
    check(`a lane opened from ${originName} returns to ${originName}`,
      back.href === `#${originHash}`, `back="${back.href}" crumb="${back.crumb}"`);
  }
  await m.close();

  /* ============ 8. COMPOSE MODE, REAL TYPING ============ */
  const INSTRUCTION = [
    "Re-run the wave-0 authority census against the deployed primary.",
    "",
    "Compare every consequence-bearing count against run 3 and say plainly which",
    "ones moved. If q4_pairs_without_profile has grown, size M1 from the new",
    "number rather than from the file, because W-7 fails closed behind it.",
    "",
    "Then tell me which write path created the new rows.",
  ].join("\n");
  for (const [label, normal, kb] of [["390", MOBILE, KB], ["320", NARROW, KB320]]) {
    const c = await newPage(normal, true);
    await open(c, `/lanes/${LANES[0]?.lane_id}`);
    await c.setViewportSize(kb);
    await c.waitForTimeout(700);
    const ta = c.locator("#gw-instruction");
    if (await ta.count() === 0) { check(`compose ${label}: composer present`, false); await c.close(); continue; }
    await ta.click();
    await c.waitForTimeout(400);
    await ta.fill(INSTRUCTION);
    await c.waitForTimeout(500);
    await shot(c, label === "390" ? "live-11-mobile-compose" : "live-12-mobile320-compose");
    const cm = await c.evaluate(() => {
      const el = document.querySelector("#gw-instruction");
      const vh = window.visualViewport?.height || window.innerHeight;
      const r = el.getBoundingClientRect();
      const send = document.querySelector("[data-gw-send]")?.getBoundingClientRect();
      const body = document.querySelector(".vlane-body")?.getBoundingClientRect();
      const gone = (s) => { const n = document.querySelector(s); return !n || getComputedStyle(n).display === "none"; };
      return {
        on: document.documentElement.hasAttribute("data-gw-compose"),
        h: Math.round(r.height), vh, pct: Math.round(r.height / vh * 100),
        sendOnScreen: Boolean(send) && send.bottom <= vh + 2,
        attach: (document.querySelector(".gw-attach")?.getBoundingClientRect().height || 0) > 0,
        provider: (document.querySelector(".gw-provider")?.getBoundingClientRect().height || 0) > 0,
        thread: Math.round(body?.height || 0),
        chromeGone: gone(".vtabs-lane") && gone(".vtabs") && gone(".vlane-head-acts"),
        column: getComputedStyle(document.querySelector(".gw-composer-box")).flexDirection === "column",
      };
    });
    check(`compose ${label}: typing enters compose mode`, cm.on === true);
    check(`compose ${label}: the field is the dominant surface above the keyboard`,
      cm.pct >= 33 && cm.pct <= 50, `${cm.h}px of ${cm.vh} = ${cm.pct}%`);
    check(`compose ${label}: the field owns its own line`, cm.column === true);
    check(`compose ${label}: Send and attach stay reachable`, cm.sendOnScreen && cm.attach);
    check(`compose ${label}: the provider stays reachable`, cm.provider === true);
    check(`compose ${label}: orientation chrome stands down`, cm.chromeGone === true);
    check(`compose ${label}: some conversation remains`, cm.thread >= 30, `${cm.thread}px`);
    await c.close();
  }

  /* ============ DESKTOP SET ============ */
  const d = await newPage(DESKTOP, false);
  await open(d, "/home");
  await shot(d, "live-13-desktop-home");
  await open(d, "/lanes");
  await shot(d, "live-15-desktop-lanes");
  await open(d, `/lanes/${laneForThread}`);
  await shot(d, "live-16-desktop-lane-thread");
  await d.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "results.json"), `${JSON.stringify({
  captured_at: new Date().toISOString(),
  base: BASE,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
}, null, 2)}\n`);
process.stdout.write(`\nLIVE acceptance: ${results.length - failed.length} passed, ${failed.length} failed\nEvidence → ${OUT}\n`);
process.exit(failed.length ? 1 : 0);
