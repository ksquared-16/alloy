/**
 * REAL ENROLLMENT V1 — the named certification driver.
 *
 * ## Why this exists
 *
 * The fixture proves a STARTING STATE. Nothing drove the lifecycle that follows it, so every
 * certification verdict past "the fixture verifies" was unprovable — and reported as NO for several
 * runs because saying otherwise would have been a claim without a run behind it. This is that
 * missing driver.
 *
 * ## Shape: composable phases, not one long script
 *
 * A single sequential script fails as a unit and tells you only that Enrollment is broken. Each phase
 * here owns one semantic step, states its own precondition, and reports its own failure boundary, so
 * a red run names the step that broke rather than the program.
 *
 * Phases run in order and share a context. A phase that cannot run because an earlier one failed is
 * reported SKIPPED with the blocking phase named — not silently passed, and not counted as green.
 *
 * ## What it drives, and what it refuses to do
 *
 * Real product entry points only. The driver never writes lifecycle state directly to skip a step:
 * a certification that reaches `enrolled` by patching a column has certified the column, not the
 * product. Database reads ARE used for assertions, because asserting through the UI would test the
 * projection rather than the durable truth underneath it.
 *
 * ## Configuration is truth
 *
 * Requirement counts, entry stages and outcome keys come from the ACTIVE published revision, never
 * from a constant here. An earlier version of this program hardcoded a stage name this tenant does
 * not publish, and hardcoded "five Form requirements" against a tenant that configures one. Both
 * cost real time. The rule that prevents a third instance is: if configuration can answer it, the
 * harness must ask rather than assert.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `not_applicable` is a CLOSED verdict, not a soft failure.
 *
 * A phase is N/A when the active configuration makes it inapplicable — the handoff materializer
 * being gated off for the org, say. That is a real answer about a real tenant, and it is different
 * in kind from `not_implemented`, which means nobody has written the phase yet.
 *
 * The distinction has to exist in the type or the two collapse: without it, a configuration-proven
 * N/A has to be reported either as a pass it did not earn or as a TODO that implies missing work.
 * A legitimate N/A must carry the configuration evidence that makes it non-applicable, which is why
 * it is a phase RESULT rather than a phase that was skipped.
 */
export type PhaseStatus = "passed" | "failed" | "skipped" | "not_implemented" | "not_applicable";

export type PhaseResult = {
    readonly key: string;
    readonly title: string;
    readonly status: PhaseStatus;
    /** One line an operator can act on. Never a stack trace. */
    readonly detail: string;
    /** Facts the phase established, for later phases and for the report. */
    readonly evidence?: Readonly<Record<string, unknown>>;
};

export type DriverContext = {
    readonly supabase: SupabaseClient;
    readonly orgId: string;
    readonly actorUserId: string | null;
    /** Accumulated evidence, keyed by phase. Later phases read what earlier ones proved. */
    readonly facts: Record<string, unknown>;
};

export type Phase = {
    readonly key: string;
    readonly title: string;
    /**
     * Phases that must have PASSED for this one to be meaningful. A phase whose dependency failed is
     * skipped and says which dependency stopped it, because "12 failures" from one broken login is
     * noise, not a report.
     */
    readonly dependsOn?: readonly string[];
    run(ctx: DriverContext): Promise<Omit<PhaseResult, "key" | "title">>;
};

export type DriverRunResult = {
    readonly ok: boolean;
    readonly phases: readonly PhaseResult[];
    /** The first phase that failed. The single thing to look at in a red run. */
    readonly firstFailure: PhaseResult | null;
};

/**
 * Run phases in order, honouring declared dependencies.
 *
 * A thrown error becomes a FAILED phase rather than a crashed process: the run must still produce a
 * report for the phases that already passed, or a late failure erases the evidence of an early
 * success.
 */
export async function runEnrollmentCertification(
    ctx: DriverContext,
    phases: readonly Phase[],
): Promise<DriverRunResult> {
    const results: PhaseResult[] = [];
    const statusByKey = new Map<string, PhaseStatus>();

    for (const phase of phases) {
        /*
         * A phase that is configuration-proven N/A does not block what comes after it. Its
         * prerequisite ran and answered; the answer was "this does not apply here". Treating that
         * as a blocker would cascade one tenant's configuration into a wall of SKIPs that look
         * like failures.
         */
        const satisfied = (k: string) => {
            const st = statusByKey.get(k);
            return st === "passed" || st === "not_applicable";
        };
        const blocker = (phase.dependsOn ?? []).find((k) => !satisfied(k));
        if (blocker) {
            const r: PhaseResult = {
                key: phase.key,
                title: phase.title,
                status: "skipped",
                detail: `not run: phase ${blocker} did not pass`,
            };
            results.push(r);
            statusByKey.set(phase.key, r.status);
            continue;
        }

        let outcome: Omit<PhaseResult, "key" | "title">;
        try {
            outcome = await phase.run(ctx);
        } catch (e) {
            outcome = {
                status: "failed",
                detail: e instanceof Error ? e.message : String(e),
            };
        }

        const r: PhaseResult = { key: phase.key, title: phase.title, ...outcome };
        results.push(r);
        statusByKey.set(phase.key, r.status);
        if (r.evidence) Object.assign(ctx.facts, { [phase.key]: r.evidence });
    }

    /*
     * NOT_IMPLEMENTED is not a pass. A harness that reports green while half its phases are stubs is
     * worse than no harness, because it converts an unknown into a false assurance.
     */
    const firstFailure = results.find((r) => r.status === "failed") ?? null;
    // Green means every phase reached a CLOSED verdict: it passed, or the configuration proved it
    // does not apply. A stub or a skip is neither.
    const ok = results.every((r) => r.status === "passed" || r.status === "not_applicable");
    return { ok, phases: results, firstFailure };
}

/**
 * Select a phase and everything it genuinely depends on, in declared order.
 *
 * A certification acceleration, not a second harness. Answering one question about one phase was
 * costing a full six-minute suite run, so a targeted run executes the SAME prerequisite chain from
 * the same fresh bootstrap and hands the target phase exactly the state it receives in a full run.
 * It never attaches to stale fixture state and never skips a prerequisite — the dependency closure is
 * computed, not hand-listed, so a chain cannot silently go stale when a phase gains a dependency.
 */
export function selectPhaseChain(
    phases: readonly Phase[],
    targetKeys: readonly string[],
): readonly Phase[] {
    const byKey = new Map(phases.map((p) => [p.key, p]));
    const needed = new Set<string>();

    const walk = (key: string) => {
        if (needed.has(key)) return;
        const phase = byKey.get(key);
        if (!phase) return;
        needed.add(key);
        for (const dep of phase.dependsOn ?? []) walk(dep);
    };
    for (const k of targetKeys) walk(k);

    // Bootstrap always runs: a targeted chain that inherited state would defeat the point.
    const first = phases[0];
    if (first) needed.add(first.key);

    return phases.filter((p) => needed.has(p.key));
}

/** Render a report an operator can read without knowing the harness. */
export function formatDriverReport(result: DriverRunResult): string {
    const mark: Record<PhaseStatus, string> = {
        passed: "PASS",
        failed: "FAIL",
        skipped: "SKIP",
        not_implemented: "TODO",
        not_applicable: "N/A ",
    };
    /*
     * Evidence is printed, not just collected. A certification report that states verdicts without
     * showing what they were read from asks to be trusted rather than checked, and this program has
     * had enough of claims that outran their evidence.
     */
    const lines = result.phases.flatMap((p) => {
        const head = `  ${mark[p.status]}  ${p.key}  ${p.title} — ${p.detail}`;
        if (!p.evidence) return [head];
        const body = Object.entries(p.evidence).map(([k, v]) => {
            const rendered = typeof v === "string" ? v : JSON.stringify(v);
            /*
             * 400 characters truncated the one field that answered the question the phase was asked --
             * a report that clips its own decisive evidence is a report you cannot act on.
             */
            return `        ${k}: ${(rendered ?? "").slice(0, 1600)}`;
        });
        return [head, ...body];
    });
    const counts = result.phases.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
    }, {});
    return [
        "REAL ENROLLMENT V1 — certification driver",
        ...lines,
        "",
        `  passed=${counts.passed ?? 0} failed=${counts.failed ?? 0} skipped=${counts.skipped ?? 0}`
        + ` not_applicable=${counts.not_applicable ?? 0} not_implemented=${counts.not_implemented ?? 0}`,
        result.firstFailure
            ? `  FIRST FAILURE: ${result.firstFailure.key} — ${result.firstFailure.detail}`
            : result.ok
              ? (counts.not_applicable
                    ? `  ALL PHASES CLOSED (${counts.passed ?? 0} passed, ${counts.not_applicable} configuration-proven N/A)`
                    : "  ALL PHASES PASSED")
              : "  no failure, but the run is not green: unimplemented phases remain",
    ].join("\n");
}
