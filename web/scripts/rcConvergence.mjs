/**
 * PRIORITY 2 — live convergence probe harness.
 *
 * A convergence claim needs three things a screenshot cannot give: the SIGNAL a mutation emitted,
 * the REQUESTS that signal caused, and whether the document/route/surface survived. This harness
 * records all three against a phase marker so every probe reads as
 *
 *   phase → signals[] → requests[] → remount/reload evidence
 *
 * The event tap patches `window.dispatchEvent` rather than adding listeners, because a listener
 * only sees events it subscribed to and the point is to discover which signal fires — including
 * one nobody wired a listener for, which is precisely the STALE_UNTIL_MANUAL_REFRESH case.
 *
 * ── WHAT THIS INSTRUMENT CANNOT SEE (law 32) ──
 *
 * Only `window` CustomEvents. A module-scoped pub/sub bus is invisible to it. That is not
 * hypothetical: this harness recorded Organization configuration saves as emitting "no signal at
 * all", when in fact `publishConfigurationInvalidation` was firing correctly on an in-module bus and
 * its subscriber's reload was the very GET the harness had already logged. A missing-signal finding
 * from this tool means "no window event" and NOTHING MORE — confirm the mechanism in source before
 * calling a surface unconverged.
 */
import { createRequire } from "module";
import { homedir } from "os";
import { join } from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
export const { chromium } = require("playwright");

export const BASE = process.env.RC_BASE ?? `http://127.0.0.1:${process.env.RC_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");

/** Requests that are page furniture, not convergence evidence. */
const NOISE = /^\/_next\/static|^\/favicon|^\/marketing\/|\.(png|jpg|svg|woff2?|css|ico)$/;

export function classify(path, resourceType) {
    if (path.includes("_rsc=")) return "RSC";
    if (path.includes("/api/")) return "API";
    if (resourceType === "document") return "DOCUMENT";
    if (NOISE.test(path.split("?")[0])) return "STATIC";
    return "OTHER";
}

export async function openProbe({ headless = true } = {}) {
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext({
        storageState: STORAGE,
        viewport: { width: 1512, height: 982 },
    });
    const page = await context.newPage();

    const state = { phase: "boot", requests: [], signals: [], consoleErrors: [], docEvents: [] };

    await page.addInitScript(() => {
        window.__rcSignals = [];
        const summarise = (d) => {
            if (d == null || typeof d !== "object") return d === undefined ? null : d;
            const out = {};
            for (const k of Object.keys(d).slice(0, 12)) {
                const v = d[k];
                out[k] = v && typeof v === "object" ? (Array.isArray(v) ? `[${v.length}]` : "{…}") : v;
            }
            return out;
        };
        const orig = window.dispatchEvent.bind(window);
        window.dispatchEvent = function (ev) {
            try {
                if (ev && typeof ev.type === "string" && /^(adminv2|alloy|admin):/.test(ev.type)) {
                    window.__rcSignals.push({ t: Date.now(), type: ev.type, detail: summarise(ev.detail) });
                }
            } catch { /* tap must never break dispatch */ }
            return orig(ev);
        };
        // Document-replacement / reload evidence.
        window.__rcDoc = [];
        try {
            const r = Location.prototype.reload;
            Object.defineProperty(Location.prototype, "reload", {
                configurable: true,
                value: function (...a) {
                    window.__rcDoc.push({ t: Date.now(), kind: "LOCATION_RELOAD", stack: new Error().stack?.split("\n").slice(1, 5).join(" | ") });
                    return r.apply(this, a);
                },
            });
        } catch { /* engine refused — reload still visible as a DOCUMENT request */ }
        for (const m of ["pushState", "replaceState"]) {
            const o = history[m];
            history[m] = function (...a) {
                window.__rcDoc.push({ t: Date.now(), kind: "HISTORY_" + m, to: String(a[2] ?? "") });
                return o.apply(this, a);
            };
        }
        // Surface mount identity — a replaced node is a remount, a re-rendered node is not.
        const ANCHORS = {
            ROOT: "[data-alloy-os-runtime]",
            WORK_UNIT: "[data-runtime-label='WU.SURFACE']",
            FOCUS_PANEL: "[data-inline-focus-panel]",
            MODAL: "[data-adminv2-bos-modal]",
        };
        const seen = new Map();
        const scan = () => {
            for (const [name, sel] of Object.entries(ANCHORS)) {
                const el = document.querySelector(sel);
                const had = seen.get(name);
                if (el && had && el !== had) window.__rcDoc.push({ t: Date.now(), kind: name + "_REMOUNT" });
                if (el !== had) seen.set(name, el ?? null);
            }
        };
        const start = () => { new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true }); scan(); };
        if (document.documentElement) start(); else addEventListener("readystatechange", start, { once: true });
    });

    page.on("request", (r) => {
        const u = r.url();
        if (!u.startsWith(BASE) && !u.startsWith("http://localhost:3015")) return;
        const path = u.replace(BASE, "").replace("http://localhost:3015", "");
        const kind = classify(path, r.resourceType());
        if (kind === "STATIC") return;
        state.requests.push({ t: Date.now(), phase: state.phase, kind, method: r.method(), path });
    });
    page.on("console", (m) => {
        if (m.type() === "error") state.consoleErrors.push({ phase: state.phase, text: m.text().slice(0, 160) });
    });

    const drainPage = async () => {
        try {
            const got = await page.evaluate(() => {
                const s = window.__rcSignals ?? []; const d = window.__rcDoc ?? [];
                window.__rcSignals = []; window.__rcDoc = [];
                return { s, d };
            });
            for (const x of got.s) state.signals.push({ ...x, phase: state.phase });
            for (const x of got.d) state.docEvents.push({ ...x, phase: state.phase });
        } catch { /* mid-navigation — next drain collects it */ }
    };

    return {
        page, browser, context, state,
        /** Start a named phase; everything recorded until the next mark belongs to it. */
        async mark(phase) { await drainPage(); state.phase = phase; },
        async drain() { await drainPage(); },
        /** Everything recorded during `phase`. */
        slice(phase) {
            return {
                requests: state.requests.filter((r) => r.phase === phase),
                signals: state.signals.filter((r) => r.phase === phase),
                docEvents: state.docEvents.filter((r) => r.phase === phase),
                consoleErrors: state.consoleErrors.filter((r) => r.phase === phase),
            };
        },
        report(phase) {
            const s = this.slice(phase);
            const byPath = {};
            for (const r of s.requests) {
                const key = `${r.kind} ${r.method} ${r.path.split("?")[0]}`;
                byPath[key] = (byPath[key] ?? 0) + 1;
            }
            return {
                phase,
                signals: s.signals.map((x) => `${x.type} ${JSON.stringify(x.detail ?? null)}`),
                docEvents: s.docEvents.map((x) => x.kind + (x.to ? ` → ${x.to}` : "")),
                requests: Object.entries(byPath).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${String(v).padStart(2)}× ${k}`),
                documentLoads: s.requests.filter((r) => r.kind === "DOCUMENT").length,
                rsc: s.requests.filter((r) => r.kind === "RSC").length,
                api: s.requests.filter((r) => r.kind === "API").length,
                consoleErrors: s.consoleErrors.length,
            };
        },
        write(file, extra = {}) {
            fs.mkdirSync("/tmp/rc", { recursive: true });
            fs.writeFileSync(file, JSON.stringify({ ...state, ...extra }, null, 2));
        },
    };
}

export const settle = (page, ms = 2500) => page.waitForTimeout(ms);

/**
 * ── THE REVERSIBLE-PROBE RESTORATION CONTRACT ──
 *
 * Written because two probes have now left residue on Firefly.
 *
 * 1. A prior certification probe renamed a child and restored it in the surface it was editing. The
 *    placement projection kept the probe name, and is still wrong today. Restoring the value you can
 *    see is not restoring the truth.
 * 2. This probe renamed a configuration Program and restored it. The live label came back exactly —
 *    and the object's REVISION HISTORY permanently holds two revisions named `Toddler RCPROBE`,
 *    because a versioned object records the restore as a NEW version rather than removing the old one.
 *
 * So the contract has two halves, and the second is the one that bites:
 *
 *   VERIFY EVERY PROJECTION, not the one you edited. `assertRestored` takes a reader per projection
 *   and fails unless all of them are byte-equal to the captured original.
 *
 *   DO NOT PROBE A VERSIONED OBJECT AT ALL. Publication-versioned configuration (Programs, and
 *   anything else with a `revisions` array or a publish step) is NOT reversible by definition — the
 *   restore is an append. There is no "restore" that makes it clean, so such a mutation must never be
 *   chosen as a "safe reversible probe" in the first place.
 */

/** Refuse a probe target whose restore would only append a version. */
export function assertReversibleTarget(sample, label = "target") {
    const s = typeof sample === "string" ? sample : JSON.stringify(sample ?? {});
    if (/"revisions"\s*:\s*\[|"publishedRevisionId"|"action"\s*:\s*"publish"/.test(s)) {
        throw new Error(
            `${label} is publication-versioned — a restore APPENDS a revision and cannot make it clean. ` +
            `Choose an unversioned field, or accept the history and say so up front.`,
        );
    }
}

/**
 * Prove restoration across EVERY affected projection.
 * `readers` is `{ name: async () => value }`; every value must equal the captured original.
 */
export async function assertRestored(originals, readers) {
    const failures = [];
    for (const [name, read] of Object.entries(readers)) {
        const now = await read();
        const before = originals[name];
        const eq = JSON.stringify(now) === JSON.stringify(before);
        if (!eq) failures.push(`${name}: expected ${JSON.stringify(before)}, found ${JSON.stringify(now)}`);
    }
    if (failures.length) {
        throw new Error(`RESTORATION INCOMPLETE — do not report this probe as clean:\n  ${failures.join("\n  ")}`);
    }
    return true;
}

