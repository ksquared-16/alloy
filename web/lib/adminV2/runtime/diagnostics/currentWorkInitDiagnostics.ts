/**
 * What's Next / Focus Panel initialization diagnostics (Phase A).
 *
 * A dev + flag-gated tracer for the work-unit → Focus Panel → CurrentWork mount/fetch lifecycle.
 * It answers ONE question with measurement, not guesses: does navigating into a work unit produce
 * ONE authoritative initialization, or does the surface initialize/fetch twice?
 *
 * Zero cost unless explicitly enabled: no-op in production, and in dev only when a debug flag is
 * present (`?wnDebug=1`, `localStorage.alloyWnDebug=1`, or `window.__ALLOY_WN_DEBUG=true`). When
 * enabled it appends structured, correlation-tagged events to `window.__ALLOY_WN_EVENTS` (read by
 * the focused-spec Playwright timeline) and mirrors them to `console.debug("[WN-INIT] …")`.
 *
 * This is a diagnostic, never a control path — nothing here changes rendering or fetching.
 */

export type CurrentWorkInitEvent = {
    /** Monotonic sequence across the page's lifetime. */
    seq: number;
    /** ms since the first recorded event (relative timeline). */
    t: number;
    /** Absolute epoch ms (for cross-referencing network traces). */
    at: number;
    /** Lifecycle checkpoint, e.g. "surfaceHost.render" | "focusPanel.mount" | "recordRuntime.fetch.start". */
    phase: string;
    subjectId?: string | null;
    /** Route/navigation generation (increments per work-unit navigation). */
    navGen?: number;
    /** Stable id for a runtime/data owner instance (per hook mount). */
    runtimeId?: string;
    /** Stable id for a component instance (per component mount). */
    componentId?: string;
    /** Request generation guard value at the time of the event. */
    reqGen?: number;
    cacheKey?: string | null;
    /** Where first-paint data came from: "seed" | "live" | "prefetch" | "cache". */
    preloadSource?: string;
    cache?: "hit" | "miss" | "seed" | "live" | "deferred" | "event-reload" | "record-patch";
    note?: string;
};

type DiagWindow = Window & {
    __ALLOY_WN_DEBUG?: boolean;
    __ALLOY_WN_EVENTS?: CurrentWorkInitEvent[];
    __ALLOY_WN_SEQ?: number;
    __ALLOY_WN_T0?: number;
};

let cachedEnabled: boolean | null = null;

function resolveEnabled(): boolean {
    if (process.env.NODE_ENV === "production") return false;
    if (typeof window === "undefined") return false;
    if (cachedEnabled !== null) return cachedEnabled;
    const w = window as DiagWindow;
    let on = w.__ALLOY_WN_DEBUG === true;
    try {
        if (!on && new URLSearchParams(window.location.search).get("wnDebug") === "1") on = true;
        if (!on && window.localStorage?.getItem("alloyWnDebug") === "1") on = true;
    } catch {
        // location/localStorage may be unavailable — leave `on` as-is.
    }
    if (on) w.__ALLOY_WN_DEBUG = true;
    cachedEnabled = on;
    return on;
}

/** True when diagnostics are active — cheap guard callers can use to skip building fields. */
export function currentWorkInitDiagnosticsEnabled(): boolean {
    return resolveEnabled();
}

/** Record one lifecycle checkpoint. No-op unless diagnostics are enabled. */
export function logCurrentWorkInit(phase: string, fields: Omit<CurrentWorkInitEvent, "seq" | "t" | "at" | "phase"> = {}): void {
    if (!resolveEnabled()) return;
    const w = window as DiagWindow;
    const at = Date.now();
    if (w.__ALLOY_WN_T0 === undefined) w.__ALLOY_WN_T0 = at;
    if (w.__ALLOY_WN_SEQ === undefined) w.__ALLOY_WN_SEQ = 0;
    if (!Array.isArray(w.__ALLOY_WN_EVENTS)) w.__ALLOY_WN_EVENTS = [];
    const event: CurrentWorkInitEvent = {
        seq: w.__ALLOY_WN_SEQ++,
        t: at - w.__ALLOY_WN_T0,
        at,
        phase,
        ...fields,
    };
    w.__ALLOY_WN_EVENTS.push(event);
    // eslint-disable-next-line no-console -- diagnostic-only, dev + flag gated
    console.debug(
        `[WN-INIT] +${String(event.t).padStart(4, " ")}ms #${event.seq} ${phase}`,
        JSON.stringify(fields),
    );
}

/** Reset the timeline (e.g. at the start of a fresh navigation capture). */
export function resetCurrentWorkInitDiagnostics(): void {
    if (typeof window === "undefined") return;
    const w = window as DiagWindow;
    w.__ALLOY_WN_EVENTS = [];
    w.__ALLOY_WN_SEQ = 0;
    w.__ALLOY_WN_T0 = undefined;
}

/** A short, stable-per-mount instance id (module counter; no Math.random / Date.now dependency for id). */
let instanceCounter = 0;
export function nextCurrentWorkInstanceId(prefix: string): string {
    return `${prefix}-${++instanceCounter}`;
}
