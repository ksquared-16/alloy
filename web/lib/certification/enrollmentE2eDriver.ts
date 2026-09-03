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

export type PhaseStatus = "passed" | "failed" | "skipped" | "not_implemented";

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
        const blocker = (phase.dependsOn ?? []).find((k) => statusByKey.get(k) !== "passed");
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
    const ok = results.every((r) => r.status === "passed");
    return { ok, phases: results, firstFailure };
}

/** Render a report an operator can read without knowing the harness. */
export function formatDriverReport(result: DriverRunResult): string {
    const mark: Record<PhaseStatus, string> = {
        passed: "PASS",
        failed: "FAIL",
        skipped: "SKIP",
        not_implemented: "TODO",
    };
    const lines = result.phases.map((p) => `  ${mark[p.status]}  ${p.key}  ${p.title} — ${p.detail}`);
    const counts = result.phases.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
    }, {});
    return [
        "REAL ENROLLMENT V1 — certification driver",
        ...lines,
        "",
        `  passed=${counts.passed ?? 0} failed=${counts.failed ?? 0} skipped=${counts.skipped ?? 0} not_implemented=${counts.not_implemented ?? 0}`,
        result.firstFailure
            ? `  FIRST FAILURE: ${result.firstFailure.key} — ${result.firstFailure.detail}`
            : result.ok
              ? "  ALL PHASES PASSED"
              : "  no failure, but the run is not green: unimplemented phases remain",
    ].join("\n");
}
