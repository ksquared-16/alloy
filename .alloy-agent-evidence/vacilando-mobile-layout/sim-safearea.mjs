import { chromium, devices } from "/Users/Kelly/Code/alloy-worktrees/wt5-vacilando-gateway-v2/web/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const SP = process.env.SP;
const TOKEN = readFileSync(`${SP}/tok`, "utf8").trim();
const BASE = "http://localhost:3020";
const LANE = process.env.LANE || "lane_db3431e755a8";
const TAG = process.env.TAG || "before";
const SAT = 59;  // iPhone 14 Pro portrait safe-area-inset-top
const SAB = 34;

const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 14 Pro"], hasTouch: true });
await ctx.addCookies([{ name: "vacilando_gw", value: TOKEN, domain: "localhost", path: "/", sameSite: "Lax" }]);

/**
 * Headless Chromium reports env(safe-area-inset-*) as 0, so the device's real
 * geometry is invisible to it. Serve the SAME stylesheet with env() swapped for
 * a variable of the real inset value: identical selectors, identical max()
 * nesting, identical cascade — only the leaf value is substituted. Whatever
 * arithmetic the cascade performs is then observable.
 */
await ctx.route(/styles\.css(\?.*)?$/, async (route) => {
  const res = await route.fetch();
  let css = await res.text();
  css = css
    .replace(/env\(safe-area-inset-top,\s*0px\)/g, "var(--sim-sat)")
    .replace(/env\(safe-area-inset-top\)/g, "var(--sim-sat)")
    .replace(/env\(safe-area-inset-bottom,\s*0px\)/g, "var(--sim-sab)")
    .replace(/env\(safe-area-inset-bottom\)/g, "var(--sim-sab)")
    .replace(/env\(safe-area-inset-(left|right)\)/g, "0px");
  css = `:root{--sim-sat:${SAT}px;--sim-sab:${SAB}px;}\n` + css;
  await route.fulfill({ response: res, body: css, headers: { ...res.headers(), "content-type": "text/css" } });
});

const p = await ctx.newPage();
const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(`${BASE}/#/lanes/${LANE}`, { waitUntil: "domcontentloaded" });
await p.waitForSelector(".gw-chat-head", { timeout: 20000 });
await p.waitForTimeout(3500);

const m = await p.evaluate((SAT) => {
  const head = document.querySelector(".gw-chat-head");
  const hr = head.getBoundingClientRect();
  const cs = getComputedStyle(head);
  const contentTop = (() => {
    const t = head.querySelector(".gw-chat-title");
    return t ? Math.round(t.getBoundingClientRect().top) : null;
  })();
  const chain = [];
  let el = head;
  while (el && el !== document.documentElement) {
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (parseFloat(c.paddingTop) > 0 || parseFloat(c.marginTop) > 0 || c.minHeight !== "auto" && c.minHeight !== "0px") {
      chain.push({ sel: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ").filter(Boolean)[0] : ""),
        paddingTop: c.paddingTop, marginTop: c.marginTop, minHeight: c.minHeight, top: Math.round(r.top) });
    }
    el = el.parentElement;
  }
  return {
    simulatedSafeAreaTop: SAT,
    headerBoxTop: Math.round(hr.top),
    headerPaddingTop: cs.paddingTop,
    headerHeight: Math.round(hr.height),
    laneNameTop: contentTop,
    deadSpaceAboveLaneName: contentTop,
    threadTop: Math.round(document.querySelector(".gw-thread").getBoundingClientRect().top),
    bodyPaddingTop: getComputedStyle(document.body).paddingTop,
    contributors: chain,
  };
}, SAT);
console.log(JSON.stringify({ tag: TAG, ...m, errors: errs }, null, 2));
await p.screenshot({ path: `${SP}/shots/sim-${TAG}-header.png` });
writeFileSync(`${SP}/sim-${TAG}.json`, JSON.stringify(m, null, 2));
await b.close();
