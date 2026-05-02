/**
 * On-screen perf overlay uses `window.__alloyPerf` (see AdminV2PerfOverlay).
 * Active in development or when overlay is explicitly enabled (URL / localStorage).
 */

export const ALLOY_PERF_TICK_EVENT = "alloy-perf-tick";

declare global {
    interface Window {
        __alloyPerf?: AlloyPerfGlobal;
    }
}

export type AlloyPerfGlobal = {
    marks: Record<string, number>;
    set: (name: string, value: number) => void;
    get: (name: string) => number | undefined;
};

export function ensureAlloyPerf(): AlloyPerfGlobal | null {
    if (typeof window === "undefined") return null;
    if (!window.__alloyPerf) {
        window.__alloyPerf = {
            marks: Object.create(null) as Record<string, number>,
            set(name: string, value: number) {
                this.marks[name] = value;
                window.dispatchEvent(new Event(ALLOY_PERF_TICK_EVENT));
            },
            get(name: string) {
                return this.marks[name];
            },
        };
    }
    return window.__alloyPerf;
}

/** Convenience: set mark if perf API is available (client-only). */
export function alloyPerfSet(name: string, value: number): void {
    ensureAlloyPerf()?.set(name, value);
}
