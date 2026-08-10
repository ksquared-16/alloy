/**
 * Lightweight timing marks for Current Work command surfaces (Move to Waitlist, etc.).
 * Emits `performance.measure` + a compact `alloy-command-timing` CustomEvent for browser QA.
 * Never throws; never blocks the command path.
 */

export type CommandTimingPhase =
    | "click_to_shell"
    | "shell_to_subjects"
    | "continue_to_preview"
    | "confirm_to_mutation"
    | "mutation_to_refresh"
    | "refresh_to_close";

const MARK_PREFIX = "alloy-cw:";

function safeNow(): number {
    return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
}

export function commandTimingMark(commandKey: string, phase: string): void {
    try {
        if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
        performance.mark(`${MARK_PREFIX}${commandKey}:${phase}`);
    } catch {
        /* ignore */
    }
}

export function commandTimingMeasure(
    commandKey: string,
    phase: CommandTimingPhase,
    startPhase: string,
    endPhase: string = startPhase,
): number | null {
    try {
        if (typeof performance === "undefined" || typeof performance.measure !== "function") return null;
        const name = `${MARK_PREFIX}${commandKey}:${phase}`;
        const start = `${MARK_PREFIX}${commandKey}:${startPhase}`;
        const end = `${MARK_PREFIX}${commandKey}:${endPhase}`;
        performance.measure(name, start, end);
        const entries = performance.getEntriesByName(name);
        const last = entries[entries.length - 1];
        const duration = last && typeof last.duration === "number" ? last.duration : null;
        if (duration != null && typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent("alloy-command-timing", {
                    detail: { commandKey, phase, durationMs: Math.round(duration), at: safeNow() },
                }),
            );
        }
        return duration;
    } catch {
        return null;
    }
}

export function commandTimingStamp(commandKey: string, phase: string, extra?: Record<string, unknown>): void {
    try {
        if (typeof window === "undefined") return;
        window.dispatchEvent(
            new CustomEvent("alloy-command-timing", {
                detail: {
                    commandKey,
                    phase,
                    at: safeNow(),
                    ...extra,
                },
            }),
        );
    } catch {
        /* ignore */
    }
}
