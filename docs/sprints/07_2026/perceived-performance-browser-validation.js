/**
 * Perceived Performance Sprint — browser validation harness.
 *
 * Paste into DevTools Console on the operator workspace BEFORE starting a run.
 * Works on both baseline (staging, no [perf:perceived]) and Phase 1 (worktree).
 *
 * Usage:
 *   1. __alloyPerceivedValidation.startRun({ label: "before-run-1" })
 *   2. Perform the operator path manually (see protocol doc)
 *   3. __alloyPerceivedValidation.endRun()
 *   4. Repeat 3× per label (before-run-1..3, after-run-1..3)
 *   5. __alloyPerceivedValidation.exportSummary()
 *
 * Kill: __alloyPerceivedValidation.stop()
 */
(function () {
    if (window.__alloyPerceivedValidation) {
        console.warn("[perceived-validation] already loaded");
        return;
    }

    const state = {
        active: false,
        runLabel: null,
        runStart: null,
        runs: [],
        events: [],
        fetchLog: [],
        perceivedLog: [],
        originalWarn: null,
        observers: [],
        pollId: null,
        skeletonFrames: 0,
        lastHadSkeleton: false,
    };

    function now() {
        return performance.now();
    }

    function snapshotDom() {
        const wu = document.querySelector('[data-component="WorkUnitSurface"]');
        const queue = document.querySelector("[data-queue-region]");
        const queueList = queue?.querySelector('ul[role="list"]');
        const fp = document.querySelector('[data-alloy-section="FP.SURFACE"]');
        const activePill = document.querySelector('[role="tab"][aria-selected="true"]');
        const selectedRow = document.querySelector('[data-queue-row-active="true"]');
        const skeleton =
            document.querySelector('[aria-label="Loading queue rows"]') ||
            document.querySelector('[aria-label="Loading work unit"]') ||
            document.querySelector('[aria-label="Loading workspace"]');
        return {
            t: now(),
            surface_mode: wu?.getAttribute("data-surface-mode") ?? null,
            surface_ready: wu?.getAttribute("data-surface-ready") ?? null,
            queue_aria_busy: queueList?.getAttribute("aria-busy") ?? null,
            queue_has_skeleton: Boolean(skeleton),
            focus_panel_open: fp?.getAttribute("data-focus-panel-open") ?? null,
            active_pill_id: activePill?.getAttribute("data-work-view-id") ?? null,
            selected_row_id: selectedRow?.getAttribute("data-entity-id") ?? null,
            alloy_marks: window.__alloyPerf?.marks ? { ...window.__alloyPerf.marks } : {},
        };
    }

    function logEvent(type, detail = {}) {
        if (!state.active) return;
        const ev = { type, t: now(), since_run_ms: state.runStart != null ? now() - state.runStart : 0, ...detail };
        state.events.push(ev);
        console.info("[perceived-validation]", type, ev);
    }

    function onPointerDown(e) {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const pill = t.closest('[role="tab"][data-work-view-id]');
        const row = t.closest("[data-queue-row-active], [data-entity-id][data-entity-type]");
        const tile = t.closest("[data-alloy-section='WS.PROCESS_TILE_WORK_VIEWS'] a, [data-process-id]");
        if (pill) {
            logEvent("intent_pill", { view_id: pill.getAttribute("data-work-view-id") });
            queueMicrotask(() => {
                requestAnimationFrame(() => {
                    const active = document.querySelector(
                        `[role="tab"][data-work-view-id="${pill.getAttribute("data-work-view-id")}"][aria-selected="true"]`,
                    );
                    logEvent(active ? "ack_pill" : "ack_pill_miss", {
                        view_id: pill.getAttribute("data-work-view-id"),
                        ack_ms: now() - state.events[state.events.length - 1].t,
                    });
                });
            });
        }
        if (row && row.hasAttribute("data-entity-id")) {
            logEvent("intent_row", {
                entity_id: row.getAttribute("data-entity-id"),
                entity_type: row.getAttribute("data-entity-type"),
            });
            queueMicrotask(() => {
                requestAnimationFrame(() => {
                    const selected = document.querySelector(
                        `[data-queue-row-active="true"][data-entity-id="${row.getAttribute("data-entity-id")}"]`,
                    );
                    logEvent(selected ? "ack_row" : "ack_row_miss", {
                        entity_id: row.getAttribute("data-entity-id"),
                        ack_ms: now() - state.events[state.events.length - 1].t,
                    });
                });
            });
        }
        if (tile) logEvent("intent_nav", { target: tile.tagName });
    }

    function pollSkeleton() {
        if (!state.active) return;
        const snap = snapshotDom();
        const hasSkel = snap.queue_has_skeleton || snap.surface_mode === "cold";
        if (hasSkel && !state.lastHadSkeleton) {
            logEvent("skeleton_start", snap);
        }
        if (hasSkel) state.skeletonFrames += 1;
        if (!hasSkel && state.lastHadSkeleton) {
            logEvent("skeleton_end", { frames: state.skeletonFrames, ...snap });
            state.skeletonFrames = 0;
        }
        state.lastHadSkeleton = hasSkel;
        if (snap.queue_aria_busy === "true") {
            logEvent("queue_hold", { ...snap });
        }
        if (snap.surface_mode === "held") {
            logEvent("surface_hold", { ...snap });
        }
    }

    function hookFetch() {
        if (window.__alloyPerceivedValidationFetchHooked) return;
        window.__alloyPerceivedValidationFetchHooked = true;
        const orig = window.fetch.bind(window);
        window.fetch = function (...args) {
            const url = typeof args[0] === "string" ? args[0] : args[0]?.url ?? "";
            if (state.active && (url.includes("/api/admin/") || url.includes("/api/"))) {
                state.fetchLog.push({ t: now(), url: url.split("?")[0], since_run_ms: state.runStart != null ? now() - state.runStart : 0 });
            }
            return orig(...args);
        };
    }

    function hookConsole() {
        if (state.originalWarn) return;
        state.originalWarn = console.warn.bind(console);
        console.warn = function (...args) {
            const msg = args[0];
            if (typeof msg === "string" && msg.includes("[perf:perceived]")) {
                state.perceivedLog.push({ t: now(), args: args.slice(1) });
            }
            return state.originalWarn(...args);
        };
    }

    function median(nums) {
        if (!nums.length) return null;
        const s = [...nums].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    window.__alloyPerceivedValidation = {
        startRun({ label }) {
            hookFetch();
            hookConsole();
            state.active = true;
            state.runLabel = label;
            state.runStart = now();
            state.events = [];
            state.fetchLog = [];
            state.perceivedLog = [];
            state.skeletonFrames = 0;
            state.lastHadSkeleton = false;
            document.addEventListener("pointerdown", onPointerDown, true);
            state.pollId = window.setInterval(pollSkeleton, 16);
            logEvent("run_start", { label, dom: snapshotDom() });
            console.info(`[perceived-validation] RUN START: ${label}`);
        },

        endRun() {
            if (!state.active) return null;
            document.removeEventListener("pointerdown", onPointerDown, true);
            if (state.pollId) clearInterval(state.pollId);
            state.pollId = null;
            logEvent("run_end", { dom: snapshotDom() });
            const run = {
                label: state.runLabel,
                duration_ms: now() - (state.runStart ?? now()),
                events: [...state.events],
                fetch_count: state.fetchLog.length,
                fetch_urls: state.fetchLog.map((f) => f.url),
                duplicate_fetches: (() => {
                    const c = {};
                    for (const f of state.fetchLog) c[f.url] = (c[f.url] ?? 0) + 1;
                    return Object.fromEntries(Object.entries(c).filter(([, n]) => n > 1));
                })(),
                perceived_marks: state.perceivedLog.length,
                perceived_log: [...state.perceivedLog],
                ack_pill_ms: state.events.filter((e) => e.type === "ack_pill").map((e) => e.ack_ms),
                ack_row_ms: state.events.filter((e) => e.type === "ack_row").map((e) => e.ack_ms),
                skeleton_episodes: state.events.filter((e) => e.type === "skeleton_start").length,
                queue_hold_events: state.events.filter((e) => e.type === "queue_hold").length,
                surface_hold_events: state.events.filter((e) => e.type === "surface_hold").length,
            };
            state.runs.push(run);
            state.active = false;
            state.runLabel = null;
            state.runStart = null;
            console.info("[perceived-validation] RUN END", run);
            return run;
        },

        exportSummary() {
            const byLabel = {};
            for (const r of state.runs) {
                byLabel[r.label] = r;
            }
            const before = state.runs.filter((r) => r.label.startsWith("before"));
            const after = state.runs.filter((r) => r.label.startsWith("after"));
            const summary = {
                runs: state.runs,
                before_median_ack_pill_ms: median(before.flatMap((r) => r.ack_pill_ms)),
                after_median_ack_pill_ms: median(after.flatMap((r) => r.ack_pill_ms)),
                before_median_ack_row_ms: median(before.flatMap((r) => r.ack_row_ms)),
                after_median_ack_row_ms: median(after.flatMap((r) => r.ack_row_ms)),
                before_median_fetch_count: median(before.map((r) => r.fetch_count)),
                after_median_fetch_count: median(after.map((r) => r.fetch_count)),
            };
            console.table(summary);
            copy(JSON.stringify(summary, null, 2));
            console.info("[perceived-validation] Summary copied to clipboard");
            return summary;
        },

        stop() {
            this.endRun();
            if (state.pollId) clearInterval(state.pollId);
            document.removeEventListener("pointerdown", onPointerDown, true);
            state.active = false;
        },

        getRuns: () => state.runs,
    };

    console.info("[perceived-validation] loaded. Start with __alloyPerceivedValidation.startRun({ label: 'before-run-1' })");
})();
