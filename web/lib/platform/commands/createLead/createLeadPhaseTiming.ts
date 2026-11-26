/**
 * Server-side Create Lead phase timing — measurable spans for clean-new latency work.
 * Enable with CREATE_LEAD_PERF_DEBUG=1 (always logs in non-production when that flag is set).
 */

export type CreateLeadPerfPhase =
    | "execute_total"
    | "ingest_total"
    | "case_open"
    | "facts_extract"
    | "identity_resolution"
    | "review_load"
    | "commit_total"
    | "stage_entry"
    | "work_view_handoff";

export type CreateLeadPerfSpans = Partial<Record<CreateLeadPerfPhase, number>>;

export type CreateLeadPhaseTimer = {
    mark: (phase: string) => void;
    measure: (phase: CreateLeadPerfPhase, fromMark?: string) => number;
    spans: () => CreateLeadPerfSpans;
    elapsedMs: () => number;
    logSummary: (extra?: Record<string, unknown>) => CreateLeadPerfSpans;
};

function shouldLog(): boolean {
    if (process.env.CREATE_LEAD_PERF_DEBUG === "1") return true;
    if (process.env.VITEST === "true") return false;
    return process.env.NODE_ENV !== "production";
}

export function createLeadPhaseTimer(opts?: {
    correlationId?: string | null;
    mode?: string | null;
}): CreateLeadPhaseTimer {
    const startedAt = Date.now();
    const marks = new Map<string, number>([["_start", startedAt]]);
    const recorded: CreateLeadPerfSpans = {};

    return {
        mark(phase: string) {
            marks.set(phase, Date.now());
        },
        measure(phase: CreateLeadPerfPhase, fromMark = "_start") {
            const from = marks.get(fromMark) ?? startedAt;
            const ms = Math.max(0, Date.now() - from);
            recorded[phase] = ms;
            return ms;
        },
        spans() {
            return { ...recorded };
        },
        elapsedMs() {
            return Math.max(0, Date.now() - startedAt);
        },
        logSummary(extra = {}) {
            const spans = { ...recorded, execute_total: recorded.execute_total ?? Math.max(0, Date.now() - startedAt) };
            if (shouldLog()) {
                console.info("[create_lead:perf]", {
                    correlation_id: opts?.correlationId ?? null,
                    mode: opts?.mode ?? null,
                    spans_ms: spans,
                    ...extra,
                });
            }
            return spans;
        },
    };
}
