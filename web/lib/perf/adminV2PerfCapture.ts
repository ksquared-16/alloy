/**
 * Dev / explicit opt-in performance capture for AdminV2.
 * Active when NODE_ENV=development OR localStorage alloy_perf_capture=true.
 *
 * Console hook runs in the browser only. Tags emitted only on the server (e.g. [queue-opt], [admin-timing])
 * are not captured here — use server logs or forward timings to the client if needed.
 */

export type AdminV2PerfEvent = {
    id: string;
    ts: number;
    source: "console" | "mark";
    /** Primary grouping key, e.g. "[page-timing]" or "mark:workspace_page_ready" */
    tag: string;
    route: string;
    level?: "log" | "warn" | "info" | "error" | "debug";
    message?: string;
    payload?: unknown;
    duration_ms?: number;
};

const LS_FLAG = "alloy_perf_capture";
const LS_EVENTS = "alloy_perf_events_v1";
const MAX_EVENTS = 300;

export const PERF_CAPTURE_LOG_SUBSTRINGS = [
    "[wu-load-phase]",
    "[queue-opt]",
    "[queue-perf]",
    "[drawer-load]",
    "[page-timing]",
    "[timing][opportunity-api]",
    "[timing][drawer]",
    "[admin-timing]",
    "[admin-context]",
    "[pipeline-count-unify]",
] as const;

let memoryEvents: AdminV2PerfEvent[] = [];
let storageHydrated = false;
let consoleHookInstalled = false;

const originalConsole: Partial<Record<"log" | "warn" | "info" | "error" | "debug", (...args: unknown[]) => void>> = {};

function safeRoute(): string {
    if (typeof window === "undefined") return "";
    try {
        return `${window.location.pathname}${window.location.search}`;
    } catch {
        return "";
    }
}

export function isAdminV2PerfCaptureActive(): boolean {
    if (typeof window === "undefined") return false;
    try {
        if (window.localStorage.getItem(LS_FLAG) === "true") return true;
    } catch {
        /* private mode */
    }
    return process.env.NODE_ENV === "development";
}

function hydrateFromStorage(): void {
    if (typeof window === "undefined" || storageHydrated) return;
    storageHydrated = true;
    try {
        const raw = window.localStorage.getItem(LS_EVENTS);
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
            memoryEvents = (parsed as AdminV2PerfEvent[]).slice(-MAX_EVENTS);
        }
    } catch {
        memoryEvents = [];
    }
}

function persistToStorage(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(LS_EVENTS, JSON.stringify(memoryEvents.slice(-MAX_EVENTS)));
    } catch {
        /* quota */
    }
}

function dispatch(name: string, detail?: unknown): void {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {
        /* */
    }
}

function coerceDuration(payload: unknown): number | undefined {
    if (payload && typeof payload === "object" && "duration_ms" in payload) {
        const v = (payload as { duration_ms?: unknown }).duration_ms;
        if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return undefined;
}

function perfArgsMatch(args: unknown[]): boolean {
    for (const a of args) {
        if (typeof a === "string") {
            for (const s of PERF_CAPTURE_LOG_SUBSTRINGS) {
                if (a.includes(s)) return true;
            }
        }
    }
    return false;
}

export function extractPerfLogTag(args: unknown[]): string {
    for (const a of args) {
        if (typeof a !== "string") continue;
        for (const s of PERF_CAPTURE_LOG_SUBSTRINGS) {
            if (a.includes(s)) return s;
        }
    }
    return "[perf-unknown]";
}

export function recordAdminV2PerfEvent(
    event: Omit<AdminV2PerfEvent, "id" | "ts" | "route"> & { route?: string }
): void {
    if (typeof window === "undefined" || !isAdminV2PerfCaptureActive()) return;
    hydrateFromStorage();
    const route = event.route ?? safeRoute();
    const duration_ms = event.duration_ms ?? coerceDuration(event.payload);
    const ev: AdminV2PerfEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        ts: Date.now(),
        route,
        source: event.source,
        tag: event.tag,
        level: event.level,
        message: event.message,
        payload: event.payload,
        duration_ms,
    };
    memoryEvents.push(ev);
    if (memoryEvents.length > MAX_EVENTS) {
        memoryEvents = memoryEvents.slice(-MAX_EVENTS);
    }
    persistToStorage();
    dispatch("alloy:perf-event", ev);
}

export function recordAdminV2PerfMark(name: string, payload?: Record<string, unknown>): void {
    const duration_ms = payload && typeof payload.duration_ms === "number" ? payload.duration_ms : coerceDuration(payload);
    recordAdminV2PerfEvent({
        source: "mark",
        tag: `mark:${name}`,
        payload: payload ?? {},
        duration_ms: duration_ms ?? undefined,
    });
}

export function getAdminV2PerfEvents(): AdminV2PerfEvent[] {
    if (typeof window === "undefined") return [];
    hydrateFromStorage();
    return [...memoryEvents];
}

export function clearAdminV2PerfEvents(): void {
    memoryEvents = [];
    storageHydrated = true;
    if (typeof window !== "undefined") {
        try {
            window.localStorage.removeItem(LS_EVENTS);
        } catch {
            /* */
        }
    }
    dispatch("alloy:perf-cleared");
}

export function exportAdminV2PerfEvents(): string {
    return JSON.stringify(getAdminV2PerfEvents(), null, 2);
}

/**
 * Patch console once. Recording runs only when {@link isAdminV2PerfCaptureActive} is true.
 */
export function installAdminV2PerfConsoleHook(): void {
    if (typeof window === "undefined" || consoleHookInstalled) return;
    consoleHookInstalled = true;

    const wrap = (level: "log" | "warn" | "info" | "error" | "debug") => {
        const orig = console[level].bind(console) as (...args: unknown[]) => void;
        originalConsole[level] = orig;
        (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = (...args: unknown[]) => {
            try {
                if (isAdminV2PerfCaptureActive() && perfArgsMatch(args)) {
                    const tag = extractPerfLogTag(args);
                    const payload = args.length >= 2 ? args[1] : undefined;
                    recordAdminV2PerfEvent({
                        source: "console",
                        tag,
                        level,
                        message: typeof args[0] === "string" ? args[0] : undefined,
                        payload: args.length > 2 ? args.slice(1) : payload,
                        duration_ms: coerceDuration(payload),
                    });
                }
            } catch {
                /* never break logging */
            }
            orig(...args);
        };
    };

    for (const level of ["log", "warn", "info", "error", "debug"] as const) {
        wrap(level);
    }
}

/** For tests: reset module state. */
export function __resetAdminV2PerfCaptureForTests(): void {
    memoryEvents = [];
    storageHydrated = false;
    consoleHookInstalled = false;
}
