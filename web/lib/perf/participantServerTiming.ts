/**
 * Server-Timing for the participant Enrollment endpoints — the same convention as
 * `queueRowsServerTiming.ts`, applied to the runtime the mission just made fast.
 *
 * Production observability without a new platform: every participant response carries a standard
 * `Server-Timing` header a browser trace or an edge log can read, so turn latency, objective
 * resolution, governed-provider time, write time and document render time are measurable on the
 * SAME request that experienced them.
 *
 * PII-safe by construction: durations and one boolean-ish flag (`provider;desc=hit|miss`) only —
 * never ids, values, tokens or tenant identifiers.
 */

export type ParticipantTimingPhase =
    | "token"
    | "canonical"
    | "objective"
    | "interpret"
    | "write_recompute"
    | "render"
    | "total";

export type ParticipantTiming = {
    /** Record a phase's duration from a `performance.now()`-style start. */
    readonly mark: (phase: ParticipantTimingPhase, startedAtMs: number) => void;
    /** Note whether a governed provider execution actually ran. */
    readonly provider: (ran: boolean) => void;
    /** The header value, in phase order, total last. */
    readonly header: () => string;
    readonly now: () => number;
};

const PHASE_ORDER: readonly ParticipantTimingPhase[] = [
    "token",
    "canonical",
    "objective",
    "interpret",
    "write_recompute",
    "render",
    "total",
];

export function startParticipantTiming(): ParticipantTiming {
    const startedAt = Date.now();
    const durations = new Map<ParticipantTimingPhase, number>();
    let providerRan: boolean | null = null;

    return {
        now: () => Date.now(),
        mark: (phase, startedAtMs) => {
            durations.set(phase, Math.max(0, Date.now() - startedAtMs));
        },
        provider: (ran) => {
            providerRan = ran;
        },
        header: () => {
            durations.set("total", Math.max(0, Date.now() - startedAt));
            const parts: string[] = [];
            for (const phase of PHASE_ORDER) {
                const value = durations.get(phase);
                if (value === undefined) continue;
                parts.push(`${phase};dur=${Math.round(value)}`);
            }
            if (providerRan !== null) parts.push(`provider;desc=${providerRan ? "hit" : "miss"}`);
            return parts.join(", ");
        },
    };
}
