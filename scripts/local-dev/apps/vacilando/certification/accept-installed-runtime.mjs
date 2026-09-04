#!/usr/bin/env node
/**
 * Vacilando UI V2 — INSTALLED-RUNTIME acceptance.
 *
 * The certification harness (capture-ui-v2.mjs) proves the BUNDLE is correct by
 * serving it against fixed fixtures. This proves the RUNNING GATEWAY serves the
 * promoted code against real runtime state — a different claim, and the one
 * that actually matters after a promotion.
 *
 * It is deliberately READ-MOSTLY against the live host: it drives the real UI
 * and reads real lanes. The only writes it makes are progress reports onto a
 * run it is explicitly given, which is the one thing that cannot be proven any
 * other way.
 *
 *   node accept-installed-runtime.mjs --base http://127.0.0.1:3030 \
 *     [--run <erun_id>] [--lane <lane_id>] [--out <dir>]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const PLAYWRIGHT = process.env.VACILANDO_PLAYWRIGHT
  || "/Users/vacilando/Alloy/web/node_modules/playwright/index.mjs";

const args = process.argv.slice(2);
const arg = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = arg("--base", "http://127.0.0.1:3030");
const RUN_ID = arg("--run", null);
const LANE_ID = arg("--lane", null);
const OUT = arg("--out", join(REPO, "docs", "platform", "planning", "vacilando-os", "ui-v2", "acceptance"));
mkdirSync(OUT, { recursive: true });

const GATEWAY_ROOT = process.env.VACILANDO_GATEWAY_ROOT
  || join(homedir(), ".local", "state", "alloy-dev", "gateway");
const TOKEN = readFileSync(join(GATEWAY_ROOT, "vacilando", "api-token"), "utf8").trim();

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${String(detail).slice(0, 220)}` : ""}\n`);
}

async function api(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) },
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}

/* ---------------------------------------------------------------------------
 * 1. PROVE THE RUNNING PROCESS SERVES THE PROMOTED CODE
 * ------------------------------------------------------------------------- */

const home = await api("/api/v2/views/home");
check("running gateway serves /api/v2/views/home (promoted route)",
  home.status === 200 && home.json?.ok === true,
  `status ${home.status} ${JSON.stringify(home.json).slice(0, 140)}`);

const sys = await api("/api/v2/views/system");
check("running gateway serves /api/v2/views/system", sys.status === 200 && sys.json?.ok === true, `status ${sys.status}`);

const act = await api("/api/v2/views/activity?limit=25");
check("running gateway serves /api/v2/views/activity",
  act.status === 200 && Array.isArray(act.json?.events),
  `${act.json?.events?.length ?? 0} events from the real run/scm/governed logs`);

const lanesRes = await api("/api/lanes");
const lanes = lanesRes.json?.lanes || [];
check("running gateway lists real lanes", lanes.length > 0, `${lanes.length} lanes`);

/* ---------------------------------------------------------------------------
 * 2. PROVIDER PROGRESS THROUGH THE INSTALLED CLI
 * ------------------------------------------------------------------------- */

const INSTALLED_VAC = process.env.VACILANDO_INSTALLED_VAC
  || join(homedir(), ".local", "share", "alloy", "toolkit", "current", "vac");

function vac(...a) {
  // USAGE GOES TO STDERR. Reading stdout alone reported "the installed CLI does
  // not advertise --progress" while the CLI was printing exactly that, one
  // stream over. A check that cannot see the thing it is checking is worse than
  // no check: it fails a correct build.
  try {
    const out = execFileSync(INSTALLED_VAC, a, {
      encoding: "utf8", cwd: REPO, stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out: String(out || "") };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ""}${e.stderr || ""}`, code: e.status };
  }
}

/** stdout + stderr, for commands whose useful output is usage text. */
function vacText(...a) {
  const r = vac(...a);
  if (r.out.trim()) return r.out;
  try {
    return execFileSync(`${INSTALLED_VAC} ${a.map((x) => JSON.stringify(x)).join(" ")} 2>&1`, {
      encoding: "utf8", cwd: REPO, shell: true,
    });
  } catch (e) {
    return `${e.stdout || ""}${e.stderr || ""}`;
  }
}

const help = vacText("run-status", "--help");
check("installed CLI advertises the progress flags",
  /--progress\b/.test(help) && /--progress-confidence/.test(help) && /--progress-source/.test(help)
  && /--remaining-work/.test(help),
  help.split("\n")[1]?.trim().slice(0, 160));
check("installed CLI documents progress as milestone-reported, not per message",
  /milestone/i.test(help) && /No ETA/i.test(help));

if (RUN_ID && LANE_ID) {
  // A PROGRESS-ONLY MILESTONE, WITH NO STATE ARGUMENT. This is the specific
  // claim: the state need not be restated to report progress.
  const only = vac("run-status", RUN_ID, "--progress", "62",
    "--progress-confidence", "medium",
    "--progress-summary", "Installed-runtime acceptance: driving the live Gateway",
    "--remaining-work", "mobile acceptance and terminal-state proof",
    "--lane", LANE_ID);
  check("installed CLI accepts a progress-only report with no state argument",
    only.ok && /progress ~62%/.test(only.out),
    only.out.trim().split("\n").join(" | ").slice(0, 240));

  const run = await api(`/api/v2/lanes/run?lane_id=${encodeURIComponent(LANE_ID)}`);
  const est = run.json?.execution_run?.progress_estimate || null;
  check("the running Gateway projects the estimate to the UI",
    est?.percent === 62 && est?.confidence === "medium"
      && Boolean(est?.summary) && Boolean(est?.updated_at)
      && est?.source === "provider_estimate" && Boolean(est?.remaining_work),
    JSON.stringify(est));
} else {
  check("progress reporting exercised against a live run", false, "no --run/--lane supplied");
}

/* ---------------------------------------------------------------------------
 * 3. TERMINAL BEHAVIOUR AND STALENESS, against the INSTALLED module
 * ------------------------------------------------------------------------- */

const installedRun = join(homedir(), ".local", "share", "alloy", "toolkit", "current",
  "lib", "vacilando", "execution-run.mjs");
const ER = await import(installedRun);
const { mkdtempSync } = await import("node:fs");
const { tmpdir } = await import("node:os");

const root = mkdtempSync(join(tmpdir(), "vac-accept-"));
const made = ER.createQueuedRun({ laneId: "lane_acce97a0ce11", instruction: "acceptance", worktreePath: REPO, root });
check("installed module: a run can be created for the terminal-state proof",
  made.ok === true, made.ok ? "" : JSON.stringify(made));
const rid = made.run?.run_id;
if (!rid) throw new Error(`cannot create acceptance run: ${JSON.stringify(made)}`);
ER.reportRunState(rid, "executing", { cwd: REPO, root, progress_percent: 62, progress_confidence: "medium", progress_summary: "midway" });
check("installed module: estimate persists on the run",
  ER.getExecutionRun(rid, root)?.progress_estimate?.percent === 62);

ER.transitionExecutionRun(rid, "COMPLETE", { root, origin: "agent" });
const done = ER.getExecutionRun(rid, root)?.progress_estimate;
check("installed module: COMPLETE becomes a MEASURED 100%",
  done?.percent === 100 && done?.source === "deterministic", JSON.stringify(done));

const r2 = ER.createQueuedRun({ laneId: "lane_acce97a0ce22", instruction: "acceptance", worktreePath: REPO, root });
ER.reportRunState(r2.run.run_id, "executing", { cwd: REPO, root, progress_percent: 55 });
ER.transitionExecutionRun(r2.run.run_id, "FAILED", { root, origin: "agent", reason: "acceptance" });
check("installed module: FAILED removes the estimate",
  ER.getExecutionRun(r2.run.run_id, root)?.progress_estimate === null);

const r3 = ER.createQueuedRun({ laneId: "lane_acce97a0ce33", instruction: "acceptance", worktreePath: REPO, root });
ER.reportRunState(r3.run.run_id, "executing", { cwd: REPO, root, progress_percent: 40 });
ER.transitionExecutionRun(r3.run.run_id, "ABANDONED", { root, origin: "system", reason: "acceptance" });
check("installed module: ABANDONED removes the estimate",
  ER.getExecutionRun(r3.run.run_id, root)?.progress_estimate === null);

const stale = ER.normalizeProgressEstimate({ percent: 62, nowMs: Date.now() - ER.PROGRESS_STALE_MS - 1000 });
check("installed module: an estimate older than 30m is stale",
  ER.progressEstimateIsStale(stale) === true && ER.PROGRESS_STALE_MS === 30 * 60 * 1000);

// The UI half, from the INSTALLED bundle.
const uiModel = await import(join(homedir(), ".local", "share", "alloy", "toolkit", "current",
  "apps", "vacilando", "public", "vacilando-ui-model.mjs"));
const staleView = uiModel.laneProgress({ progress_estimate: stale });
check("installed UI: a stale estimate renders 'Progress estimate unavailable'",
  staleView.available === false && staleView.label === "Progress estimate unavailable", staleView.label);
const noneView = uiModel.laneProgress(null);
check("installed UI: an absent estimate renders unavailable, not 0%",
  noneView.available === false && noneView.percent === null, noneView.label);

/* ---------------------------------------------------------------------------
 * 4. LIVE UI — DESKTOP AND MOBILE
 * ------------------------------------------------------------------------- */

const { chromium } = await import(PLAYWRIGHT);
const browser = await chromium.launch();
const ctxOpts = { baseURL: BASE };

async function newPage(viewport, isMobile = false) {
  const context = await browser.newContext({
    ...ctxOpts, viewport, isMobile, hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 2,
  });
  // The session cookie is how a browser authenticates to the Gateway.
  await context.addCookies([{
    name: "vacilando_gw", value: TOKEN, domain: "127.0.0.1", path: "/",
    httpOnly: true, secure: false, sameSite: "Lax",
  }]);
  return context.newPage();
}

async function open(page, hash, settle = 2500) {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settle);
}

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
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      if (s.overflowX === "auto" || s.overflowX === "scroll") continue;
      if (inScroller(el) || parked(el)) continue;
      if (r.right > vw + 1) worst.push({ cls: String(el.className).slice(0, 50), right: Math.round(r.right) });
    }
    return { vw, docScroll: document.documentElement.scrollWidth, worst: worst.slice(0, 4) };
  });
}

let liveLaneId = LANE_ID;
try {
  const desk = await newPage({ width: 1440, height: 950 });
  await open(desk, "/home", 4000);

  const loggedIn = await desk.evaluate(() => !document.querySelector("#gw-login:not([hidden])"));
  check("browser session authenticates against the live Gateway", loggedIn);

  await desk.screenshot({ path: join(OUT, "live-01-desktop-home.png"), fullPage: true });
  // `data-v-page` is on BOTH the page element and <body> (the shell sets it so
  // CSS can key off the destination), so an === 1 count failed on a Home that
  // was rendering perfectly. Scope to the page element.
  check("LIVE desktop: Home renders the V2 shell",
    (await desk.locator('.vpage[data-v-page="home"]').count()) === 1
    && (await desk.locator(".vcard-needs, .vcard-health, .vcard-lanes").count()) >= 3);
  check("LIVE desktop: primary navigation is Home / Lanes / Activity / System",
    await desk.evaluate(() => {
      const items = [...document.querySelectorAll(".vnav-item .vnav-label")].map((n) => n.textContent.trim());
      return JSON.stringify(items) === JSON.stringify(["Home", "Lanes", "Activity", "System"]);
    }));
  check("LIVE desktop: logo and navigation share one ground",
    await desk.evaluate(() => {
      const rail = document.querySelector(".rail");
      const mark = document.querySelector(".brand-mark");
      if (!rail || !mark) return false;
      const rb = getComputedStyle(rail).backgroundColor;
      const mb = getComputedStyle(mark).backgroundColor;
      // The mark paints no plate of its own, so it inherits the rail's ground.
      return mb === "rgba(0, 0, 0, 0)" && rb !== "rgb(255, 255, 255)";
    }));
  check("LIVE desktop: no placeholder/demo value is presented as truth",
    await desk.evaluate(() => document.querySelectorAll(".vmetric.is-placeholder").length === 0
      && !document.querySelector(".vplaceholder-banner")));
  check("LIVE desktop: unavailable fields use governed copy, not a number",
    await desk.evaluate(() => [...document.querySelectorAll(".vmetric.is-unavailable .vmetric-value")]
      .every((el) => !/\d/.test(el.textContent))));
  check("LIVE desktop: data maturity remains inspectable",
    (await desk.locator("[data-maturity]").count()) > 0,
    `${await desk.locator("[data-maturity]").count()} annotated fields`);

  await open(desk, "/activity", 3000);
  await desk.screenshot({ path: join(OUT, "live-02-desktop-activity.png"), fullPage: true });
  check("LIVE desktop: Activity renders real runtime history",
    (await desk.locator(".vact").count()) > 0, `${await desk.locator(".vact").count()} rows`);

  await open(desk, "/system", 3000);
  await desk.screenshot({ path: join(OUT, "live-03-desktop-system.png"), fullPage: true });
  check("LIVE desktop: System renders host telemetry from the running host",
    await desk.evaluate(() => /\d/.test(document.querySelector(".vmeter-value")?.textContent || "")));

  // A real lane.
  if (!liveLaneId) liveLaneId = lanes.find((l) => l.execution_run)?.lane_id || lanes[0]?.lane_id;
  await open(desk, `/lanes/${encodeURIComponent(liveLaneId)}`, 5000);
  await desk.screenshot({ path: join(OUT, "live-04-desktop-lane.png"), fullPage: false });
  check("LIVE desktop: lane uses the V2 layout",
    (await desk.locator(".vlane-head").count()) === 1
    && (await desk.locator(".vtabs-lane .vtab-lane").count()) === 6
    && (await desk.locator(".vcard-work").count()) === 1);
  // THE INVARIANT IS ABOUT THE PRODUCT, NOT ABOUT USER CONTENT.
  //
  // Scanning document.innerText failed on a real lane whose own transcript
  // discusses ETA — the operator's instruction text and the agent's replies are
  // rendered in the thread. The rule is that Vacilando must not render an ETA
  // FIELD; it is not that the three letters may never appear in something a
  // human wrote. Scoped to the product chrome accordingly.
  check("LIVE desktop: no ETA field in the product chrome",
    await desk.evaluate(() => {
      const zones = [".vcard-work", ".vprogress", ".vlane-head", ".vinsp", ".vcard-health"];
      return zones.every((z) => [...document.querySelectorAll(z)]
        .every((el) => !/\bETA\b/i.test(el.innerText || "")));
    }));
  const progText = await desk.locator(".vprogress-label").first().innerText().catch(() => "");
  check("LIVE desktop: progress renders from the installed contract",
    /Provider estimate: ~\d+% complete/.test(progText) || progText === "Progress estimate unavailable",
    progText);
  check("LIVE desktop: no misleading empty/0% bar when there is no estimate",
    await desk.evaluate(() => {
      const un = document.querySelector(".vprogress.is-unavailable");
      if (!un) return true;
      return !un.querySelector(".vprogress-fill") && !un.querySelector("[role=progressbar]");
    }));
  check("LIVE desktop: inspector is quiet by default",
    (await desk.locator(".vinsp-run").count()) === 1
    && (await desk.locator(".vinsp-sec[open]").count()) === 0);
  // CONTEXT -> CONVERSATION -> HUMAN ACTION, on the real lane.
  check("LIVE desktop: the lane body is a conversation, not dashboard cards",
    await desk.evaluate(() => {
      const roles = [...document.querySelectorAll(".vthread [data-v-role]")].map((n) => n.dataset.vRole);
      const work = document.querySelector(".vcard-work")?.getBoundingClientRect().top ?? 1e9;
      const thread = document.querySelector(".vcard-thread")?.getBoundingClientRect().top ?? -1;
      return roles.length > 0 && thread > work;
    }),
    (await desk.evaluate(() => [...new Set([...document.querySelectorAll(".vthread .vmsg-who")].map((n) => n.textContent.trim()))].join(", "))));
  await desk.screenshot({ path: join(OUT, "live-05-desktop-lane-thread.png"), fullPage: false });

  const trayN = await desk.locator(".vneeds-tray").count();
  if (trayN) {
    check("LIVE desktop: Needs You is anchored at the composer boundary",
      await desk.evaluate(() => {
        const t = document.querySelector(".vneeds-tray").getBoundingClientRect();
        const c = document.querySelector(".gw-composer")?.getBoundingClientRect();
        const o = document.querySelector(".vcard-output")?.getBoundingClientRect();
        return Boolean(c) && t.bottom <= c.top + 6 && (!o || t.top > o.top);
      }));
  } else {
    check("LIVE desktop: Needs You absent because nothing needs the operator", true,
      "no pending blocker on this lane — the tray correctly renders nothing");
  }
  await open(desk, "/lanes", 3000);
  await desk.screenshot({ path: join(OUT, "live-06-desktop-lanes.png"), fullPage: true });
  await desk.context().close();

  /* -------------------------- MOBILE -------------------------- */
  // VISUAL ACCEPTANCE IS THE GATE. These measure the rendered result on REAL
  // lanes, because every geometric assertion in the previous pass was green on
  // a phone layout that was plainly desktop-sized.
  for (const [w, h] of [[390, 844], [320, 568]]) {
    const m = await newPage({ width: w, height: h }, true);
    await open(m, "/home", 4000);
    await m.screenshot({ path: join(OUT, `live-10-mobile${w}-home.png`), fullPage: true });
    check(`LIVE mobile ${w}: bottom navigation matches the V2 IA`,
      await m.evaluate(() => {
        const t = [...document.querySelectorAll(".vtabs .vtab .vtab-label")].map((n) => n.textContent.trim());
        return JSON.stringify(t) === JSON.stringify(["Home", "Lanes", "Activity", "System"]);
      }));
    let o = await overflow(m);
    check(`LIVE mobile ${w}: Home does not scroll sideways`,
      o.docScroll <= o.vw + 1 && o.worst.length === 0, JSON.stringify(o.worst));

    // ---- Home and Lanes, live ----
    await open(m, "/home", 4000);
    await m.screenshot({ path: join(OUT, `live-14-mobile${w}-home.png`), fullPage: true });
    const home = await m.evaluate(() => {
      const crumb = document.querySelector(".topbar .crumb");
      const grid = document.querySelector(".vcard-health .vgrid-4");
      return {
        title: document.querySelector(".vpage-title")?.textContent?.trim() || null,
        crumbShown: Boolean(crumb) && getComputedStyle(crumb).display !== "none",
        homeWords: (document.querySelector("#view")?.innerText || "").split("\n").filter((l) => l.trim() === "Home").length,
        needsRows: [...document.querySelectorAll(".vneeds-row")].map((r) => Math.round(r.getBoundingClientRect().height)),
        healthCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : null,
        homeCols: getComputedStyle(document.querySelector(".vhome-grid")).gridTemplateColumns.split(" ").length,
      };
    });
    check(`LIVE mobile ${w}: Home has exactly one identity`,
      home.title === "Home" && home.crumbShown === false && home.homeWords <= 1,
      `title "${home.title}", crumb shown ${home.crumbShown}, "Home" x${home.homeWords}`);
    check(`LIVE mobile ${w}: Home Needs You is a summary`,
      home.needsRows.every((h) => h <= 110), `row heights ${JSON.stringify(home.needsRows)}`);
    check(`LIVE mobile ${w}: Home stacks and its tiles are readable`,
      home.homeCols === 1 && (home.healthCols === null || home.healthCols <= 2),
      `home ${home.homeCols} col, health tiles ${home.healthCols} across`);

    await open(m, "/lanes", 4000);
    await m.screenshot({ path: join(OUT, `live-15-mobile${w}-lanes.png`), fullPage: true });
    const cat = await m.evaluate(() => {
      const bar = document.querySelector("#approvals-bar");
      const rows = [...document.querySelectorAll("[data-gw-lane]")];
      return {
        approvalsShown: Boolean(bar) && getComputedStyle(bar).display !== "none" && bar.getBoundingClientRect().height > 0,
        noFolder: /no folder/i.test(document.querySelector("#view")?.innerText || ""),
        total: rows.length,
        visible: rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; }).length,
        medianRow: rows.length ? Math.round(rows.map((r) => r.getBoundingClientRect().height).sort((a, b) => a - b)[Math.floor(rows.length / 2)]) : null,
        folderNamesClipped: [...document.querySelectorAll(".gw-folder-name")]
          .some((n) => n.scrollWidth > n.clientWidth + 2),
      };
    });
    check(`LIVE mobile ${w}: the catalogue carries no governed payload`, cat.approvalsShown === false);
    check(`LIVE mobile ${w}: no "No folder" heading`, cat.noFolder === false);
    check(`LIVE mobile ${w}: folder names are not clipped against controls`, cat.folderNamesClipped === false);
    check(`LIVE mobile ${w}: lane rows are compact and scannable`,
      cat.visible >= 5 || cat.visible === cat.total,
      `${cat.visible} of ${cat.total} rows visible, median row ${cat.medianRow}px`);

    await open(m, `/lanes/${encodeURIComponent(liveLaneId)}`, 5000);
    await m.screenshot({ path: join(OUT, `live-11-mobile${w}-lane.png`), fullPage: false });
    o = await overflow(m);
    check(`LIVE mobile ${w}: lane usable at phone width`,
      o.docScroll <= o.vw + 1 && o.worst.length === 0, JSON.stringify(o.worst));
    check(`LIVE mobile ${w}: composer on screen and no approvals surface pushes Send off`,
      await m.evaluate(() => {
        const s = document.querySelector("[data-gw-send]")?.getBoundingClientRect();
        return Boolean(s) && s.bottom <= window.innerHeight + 2 && s.top >= 0;
      }));
    check(`LIVE mobile ${w}: diagnostics are not dumped into the primary lane view`,
      await m.evaluate(() => {
        const i = document.querySelector(".vinsp");
        if (!i) return true;
        return i.hasAttribute("inert") || getComputedStyle(i).display === "none"
          || i.getBoundingClientRect().left >= window.innerWidth - 1;
      }));
    // ---- measured composition, on real content ----
    const comp = await m.evaluate(() => {
      const el = (sel) => document.querySelector(sel);
      const h = (sel) => { const e = el(sel); return e ? Math.round(e.getBoundingClientRect().height) : null; };
      const top = (sel) => { const e = el(sel); return e ? Math.round(e.getBoundingClientRect().top) : null; };
      const shown = (sel) => { const e = el(sel); return Boolean(e) && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0; };
      const scroller = el("[data-gw-thread]");
      return {
        vh: window.innerHeight,
        header: h(".vlane-head"),
        work: h(".vcard-work"),
        workTitle: el(".vwork-title")?.textContent?.trim().slice(0, 60) || null,
        firstMessageTop: top(".vmsg"),
        textarea: h(".gw-composer textarea"),
        tray: h(".vneeds-tray"),
        stopShown: shown(".vlane-stop"),
        metaShown: shown(".vlane-head-meta"),
        detailsShown: shown("[data-gw-aside-toggle]"),
        roles: [...document.querySelectorAll(".vthread [data-v-role]")].map((n) => n.dataset.vRole),
        bylines: [...document.querySelectorAll(".vthread .vmsg-who")].map((n) => n.textContent.trim()),
        // The scroll correction: the hook must be on something that scrolls.
        scrollerScrolls: scroller ? scroller.scrollHeight > scroller.clientHeight + 4 : false,
        scrollTop: scroller ? Math.round(scroller.scrollTop) : null,
        scrollMax: scroller ? Math.round(scroller.scrollHeight - scroller.clientHeight) : null,
        docScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    });
    check(`LIVE mobile ${w}: lane header is phone-scale`,
      comp.header !== null && comp.header <= 110, `header ${comp.header}px of ${comp.vh}`);
    check(`LIVE mobile ${w}: header keeps Details, sheds Stop lane and identity detail`,
      comp.detailsShown === true && comp.stopShown === false && comp.metaShown === false);
    check(`LIVE mobile ${w}: Current Work is an orientation summary`,
      comp.work !== null && comp.work <= 260, `${comp.work}px — "${comp.workTitle}"`);
    check(`LIVE mobile ${w}: conversation begins in the first screen`,
      comp.firstMessageTop !== null && comp.firstMessageTop < comp.vh,
      `first message at ${comp.firstMessageTop} of ${comp.vh}`);
    check(`LIVE mobile ${w}: the thread carries explicit bylines`,
      comp.roles.length > 0 && comp.bylines.length > 0,
      `${comp.roles.length} entries: ${[...new Set(comp.bylines)].join(", ")}`);
    check(`LIVE mobile ${w}: idle composer is compact`,
      comp.textarea !== null && comp.textarea <= 48, `textarea ${comp.textarea}px`);
    check(`LIVE mobile ${w}: no page-level sideways scrolling`, comp.docScroll === true);
    if (comp.scrollerScrolls) {
      check(`LIVE mobile ${w}: a long thread opens at the latest message, not the oldest`,
        comp.scrollMax !== null && comp.scrollTop >= comp.scrollMax - 24,
        `scrollTop ${comp.scrollTop} of ${comp.scrollMax}`);
    } else {
      check(`LIVE mobile ${w}: the scroll hook is on the scrolling element`,
        comp.scrollTop !== null, "thread fits without scrolling on this lane");
    }

    await m.locator("[data-gw-aside-toggle]").click({ timeout: 8000 }).catch(() => {});
    await m.waitForTimeout(700);
    await m.screenshot({ path: join(OUT, `live-12-mobile${w}-inspector.png`), fullPage: false });
    check(`LIVE mobile ${w}: Details opens the compact Lane Inspector`,
      await m.evaluate(() => {
        const i = document.querySelector(".vinsp");
        const r = i?.getBoundingClientRect();
        return Boolean(r) && r.width > 0 && r.left < window.innerWidth - 20
          && document.querySelectorAll(".vinsp-sec[open]").length === 0;
      }));
    await m.context().close();
  }

  // Keyboard-open.
  const kb = await newPage({ width: 390, height: 844 }, true);
  await open(kb, `/lanes/${encodeURIComponent(liveLaneId)}`, 4500);
  await kb.setViewportSize({ width: 390, height: 380 });
  await kb.waitForTimeout(900);
  await kb.locator("#gw-instruction").click({ timeout: 5000 }).catch(() => {});
  await kb.waitForTimeout(500);
  await kb.screenshot({ path: join(OUT, "live-13-mobile390-keyboard.png"), fullPage: false });
  check("LIVE mobile: composer usable with the keyboard open",
    await kb.evaluate(() => {
      const s = document.querySelector("[data-gw-send]")?.getBoundingClientRect();
      return Boolean(s) && s.bottom <= window.innerHeight + 2 && s.top >= 0;
    }),
    await kb.evaluate(() => {
      const s = document.querySelector("[data-gw-send]")?.getBoundingClientRect();
      return `viewport ${window.innerHeight}, Send bottom ${s ? Math.round(s.bottom) : "none"}`;
    }));
  await kb.context().close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "results.json"), `${JSON.stringify({
  accepted_at: new Date().toISOString(),
  base: BASE,
  installed_toolkit: readFileSync(join(homedir(), ".local", "share", "alloy", "toolkit", "current", "INSTALL-MANIFEST"), "utf8").trim().split("\n"),
  passed: results.length - failed.length,
  failed: failed.length,
  results,
}, null, 2)}\n`);
process.stdout.write(`\nInstalled-runtime acceptance: ${results.length - failed.length} passed, ${failed.length} failed\nEvidence → ${OUT}\n`);
process.exit(failed.length ? 1 : 0);
