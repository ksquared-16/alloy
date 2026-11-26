import { chromium, devices } from "/Users/Kelly/Code/alloy-worktrees/wt5-vacilando-gateway-v2/web/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const SP = process.env.SP;
const TOKEN = readFileSync(`${SP}/tok`, "utf8").trim();
const BASE = "http://localhost:3020";
const LANE = "lane_db3431e755a8";        // long completed response
const OTHER = "lane_73a897409906";       // second lane, to test navigation
const SAT = 59, SAB = 34;

const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 14 Pro"], hasTouch: true });
await ctx.addCookies([{ name: "vacilando_gw", value: TOKEN, domain: "localhost", path: "/", sameSite: "Lax" }]);
// Same faithful safe-area substitution used for the before/after measurement.
await ctx.route(/styles\.css(\?.*)?$/, async (route) => {
  const res = await route.fetch();
  let css = await res.text();
  css = css
    .replace(/env\(safe-area-inset-top,\s*0px\)/g, "var(--sim-sat)")
    .replace(/env\(safe-area-inset-top\)/g, "var(--sim-sat)")
    .replace(/env\(safe-area-inset-bottom,\s*0px\)/g, "var(--sim-sab)")
    .replace(/env\(safe-area-inset-bottom\)/g, "var(--sim-sab)")
    .replace(/env\(safe-area-inset-(left|right)\)/g, "0px");
  await route.fulfill({ response: res, body: `:root{--sim-sat:${SAT}px;--sim-sab:${SAB}px;}\n${css}`, headers: { ...res.headers(), "content-type": "text/css" } });
});
const p = await ctx.newPage();
const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
p.on("requestfailed", (r) => errs.push(`${r.url()} ${r.failure()?.errorText}`));
const out = {};
const shot = (n) => p.screenshot({ path: `${SP}/shots/${n}.png` });

const geometry = () => p.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const r = (s) => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width), x: Math.round(b.x) }; };
  const th = q(".gw-thread");
  return {
    laneNameTop: q(".gw-chat-title") ? Math.round(q(".gw-chat-title").getBoundingClientRect().top) : null,
    header: r(".gw-chat-head"),
    thread: r(".gw-thread"),
    composer: r(".gw-composer"),
    firstMsgVisible: (() => {
      const u = q(".gw-msg-user"); if (!u || !th) return null;
      const a = u.getBoundingClientRect(), bx = th.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(a.bottom, bx.bottom) - Math.max(a.top, bx.top)));
    })(),
    threadScrollTop: th ? Math.round(th.scrollTop) : null,
    threadScrollH: th ? th.scrollHeight : null,
    asideOpen: q(".gw")?.classList.contains("is-aside-open") || false,
    aside: (() => { const a = q(".gw-lane-aside"); if (!a) return null; const cs = getComputedStyle(a); const bb = a.getBoundingClientRect();
      return { x: Math.round(bb.x), visibility: cs.visibility, pointerEvents: cs.pointerEvents, inert: a.hasAttribute("inert"), ariaHidden: a.getAttribute("aria-hidden") }; })(),
    // Does the closed panel steal any layout from the chat?
    stageWidth: r(".gw-lane-stage")?.w,
    docScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    diagnosticsBeforeChat: (() => {
      const thread = q(".gw-thread"); const diag = q(".gw-terminal, [data-gw-runtime], [data-gw-status]");
      if (!thread || !diag) return false;
      return diag.getBoundingClientRect().top < thread.getBoundingClientRect().top;
    })(),
  };
});

// 1. open the lane fresh
await p.goto(`${BASE}/#/lanes/${LANE}`, { waitUntil: "domcontentloaded" });
await p.waitForSelector(".gw-thread", { timeout: 20000 });
await p.waitForTimeout(3500);
out.onEntry = await geometry();
await shot("17-lane-entry-chat-first");

// 4/7. closed Details must be inert and take no space; what is under it is the chat
out.closedPanelHitTest = await p.evaluate(() => {
  const el = document.elementFromPoint(window.innerWidth - 8, Math.round(window.innerHeight / 2));
  return { tag: el?.tagName, cls: String(el?.className || "").split(" ")[0], insideAside: Boolean(el?.closest(".gw-lane-aside")) };
});
// Tab through the page and see whether focus can ever land inside the closed
// panel. offsetParent is a poor proxy for a fixed-position element.
out.focusOrder = await p.evaluate(async () => {
  const count = document.querySelectorAll("#gw-details-panel button, #gw-details-panel a, #gw-details-panel summary").length;
  const hidden = [...document.querySelectorAll("#gw-details-panel button, #gw-details-panel a, #gw-details-panel summary")]
    .every((e) => getComputedStyle(e).visibility === "hidden");
  return { countInClosedPanel: count, allVisibilityHidden: hidden, inert: document.querySelector("#gw-details-panel").hasAttribute("inert") };
});
out.tabProbe = await (async () => {
  const landed = [];
  for (let i = 0; i < 14; i += 1) {
    await p.keyboard.press("Tab");
    landed.push(await p.evaluate(() => Boolean(document.activeElement?.closest?.("#gw-details-panel"))));
  }
  return { focusEnteredClosedPanel: landed.some(Boolean) };
})();

// 5. open Details explicitly
await p.click("[data-gw-aside-toggle]");
await p.waitForTimeout(700);
out.asideOpened = await geometry();
await shot("18-details-open");

// 6a. Back with Details open closes Details and STAYS in the lane.
await p.goBack();
await p.waitForTimeout(900);
out.backFromDetails = {
  hash: await p.evaluate(() => window.location.hash),
  asideOpen: await p.evaluate(() => document.querySelector(".gw")?.classList.contains("is-aside-open") || false),
  stillInLane: await p.evaluate(() => Boolean(document.querySelector(".gw-thread"))),
  focusOnToggle: await p.evaluate(() => document.activeElement?.hasAttribute?.("data-gw-aside-toggle") || false),
};
await shot("22-back-closes-details");

// 6b. leave the lane and come back — Details must be closed again
await p.click("[data-gw-back]");
await p.waitForTimeout(900);
await p.goto(`${BASE}/#/lanes/${OTHER}`, { waitUntil: "domcontentloaded" });
await p.waitForSelector(".gw-thread", { timeout: 20000 });
await p.waitForTimeout(2500);
out.otherLaneEntry = await geometry();
await shot("19-other-lane-details-closed");
await p.goto(`${BASE}/#/lanes/${LANE}`, { waitUntil: "domcontentloaded" });
await p.waitForSelector(".gw-thread", { timeout: 20000 });
await p.waitForTimeout(2500);
out.reEntry = await geometry();
await shot("20-reentry-chat-first");

// 8. long completion usable — on the lane that actually has one.
await p.goto(`${BASE}/#/lanes/${OTHER}`, { waitUntil: "domcontentloaded" });
await p.waitForSelector("[data-gw-report-body]", { timeout: 20000 });
await p.waitForTimeout(3500);
out.longEntry = await geometry();
await shot("23-long-completion-entry");
// 8. long completion usable: scroll through it, composer stays reachable
out.longContent = await p.evaluate(() => {
  const th = document.querySelector(".gw-thread");
  const body = document.querySelector("[data-gw-report-body]");
  const before = th.scrollTop;
  th.scrollTop = th.scrollHeight;
  const after = th.scrollTop;
  th.scrollTop = before;
  return {
    reportChars: body?.textContent?.length || 0,
    threadScrollable: th.scrollHeight > th.clientHeight,
    reachedBottom: after > before,
    composerVisible: (() => { const c = document.querySelector(".gw-composer"); const r = c.getBoundingClientRect(); return r.bottom <= window.innerHeight + 2 && r.height > 0; })(),
  };
});

// 9. keyboard open
await p.click("#gw-instruction");
await p.evaluate(() => {
  const vv = window.visualViewport;
  Object.defineProperty(vv, "height", { value: Math.round(window.innerHeight * 0.55), configurable: true });
  vv.dispatchEvent(new Event("resize"));
});
await p.waitForTimeout(800);
out.keyboard = await p.evaluate(() => {
  const c = document.querySelector(".gw-composer");
  const h = document.querySelector(".gw-chat-head");
  const t = document.getElementById("gw-instruction");
  const vvh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gw-vvh")) || null;
  const cr = c.getBoundingClientRect();
  return {
    vvh,
    headerVisible: h ? getComputedStyle(h).display !== "none" && h.getBoundingClientRect().height > 0 : false,
    headerTop: h ? Math.round(h.getBoundingClientRect().top) : null,
    composerBottom: Math.round(cr.bottom),
    // The honest bound is the APP box: the shell is inset by the safe areas, so
    // the composer must end inside it, not merely inside the visual viewport.
    appBottom: (() => { const a = document.querySelector(".app"); return a ? Math.round(a.getBoundingClientRect().bottom) : null; })(),
    withinAppBox: (() => { const a = document.querySelector(".app"); return a ? Math.round(cr.bottom) <= Math.round(a.getBoundingClientRect().bottom) + 2 : null; })(),
    withinViewport: Math.round(cr.bottom) <= Math.ceil(vvh || window.innerHeight) + 2,
    fontPx: parseFloat(getComputedStyle(t).fontSize),
    assistantVisiblePx: (() => {
      const pre = document.querySelector("[data-gw-report-body]"); const th = document.querySelector(".gw-thread");
      if (!pre || !th) return 0;
      const a = pre.getBoundingClientRect(), bx = th.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(a.bottom, bx.bottom) - Math.max(a.top, bx.top)));
    })(),
    diag: (() => {
      const th = document.querySelector(".gw-thread");
      const art = document.querySelector(".gw-msg-assistant");
      const body = document.querySelector("[data-gw-report-body]");
      const b = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; };
      return { thread: b(th), threadScrollTop: th ? Math.round(th.scrollTop) : null, threadScrollH: th?.scrollHeight,
               assistant: b(art), body: b(body), userHidden: getComputedStyle(document.querySelector(".gw-msg-user") || document.body).display };
    })(),
  };
});
await shot("21-keyboard-open-compact-header");

out.errors = errs;
writeFileSync(`${SP}/acceptance6.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
