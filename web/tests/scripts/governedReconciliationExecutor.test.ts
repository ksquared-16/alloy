/**
 * A KEY, AN ENVIRONMENT, AND A BOOLEAN — never a command.
 *
 * `qaConvergePlacementWaitlistedChildren` was already canonical: it writes only through
 * `applyChildWaitlistViaOutcomeRuntime`, is idempotent, defaults to DRY_RUN and contains no ad-hoc
 * SQL lifecycle write. What it had no way to be was RUN. The control plane's registered actions
 * include no script executor, and `vacilando.apply_reconciliation_plan` is not one — that applies
 * Vacilando METADATA from a plan the executor recomputes, and misusing it to move children between
 * enrollment stages would launder product data through a governance capability.
 *
 * So a sanctioned repair existed with no sanctioned way to perform it, and the alternatives were a
 * permanent admin endpoint or hand-run SQL. Both are worse than the gap.
 *
 * The safety property is not "the runner is careful". It is that a caller CANNOT EXPRESS a command:
 * no path, no shell string, no executable, no environment variables. Which script runs, which
 * environments it may touch and what a dry run means are resolved from a frozen table. These tests
 * live at exactly that boundary, and prove the refusals without executing anything.
 */

import { describe, expect, it, vi } from "vitest";

import {
    REGISTERED_RECONCILIATION_KEYS,
    RECONCILIATION_REFUSALS,
    resolveReconciliationRequest,
} from "../../../scripts/local-dev/lib/vacilando/reconciliation-registry.mjs";
import {
    parseReconciliationOutput,
    runRegisteredReconciliation,
} from "../../../scripts/local-dev/lib/vacilando/trusted-host-reconciliation.mjs";

const KEY = "converge_placement_waitlisted_children";

/** A spawn that records the call and never runs anything. */
function recordingSpawn(result: Record<string, unknown> = { status: 0, stdout: "", stderr: "" }) {
    return vi.fn(() => result);
}

describe("registered reconciliation — what may run", () => {
    it("13. only registered keys resolve", () => {
        expect(REGISTERED_RECONCILIATION_KEYS).toEqual([KEY]);
        expect(resolveReconciliationRequest({ reconciliation_key: KEY, target_environment: "staging", dry_run: true }).ok).toBe(true);
    });

    it("14. a path, a command or an executable is refused as an unregistered key", () => {
        /*
         * None of these is "sanitised" — they are simply not registered, which is the point. There
         * is no input that means "run this"; there is only a name that must already be in the table.
         */
        for (const attempt of [
            "../../etc/passwd",
            "scripts/qaConvergePlacementWaitlistedChildren.ts",
            "bash -c 'rm -rf /'",
            "npm run dev:qa:converge-placement-waitlisted",
            "converge_placement_waitlisted_children; echo pwned",
            "CONVERGE_PLACEMENT_WAITLISTED_CHILDREN",
        ]) {
            const out = resolveReconciliationRequest({ reconciliation_key: attempt, target_environment: "staging", dry_run: true });
            expect(out.ok, `"${attempt}" must not resolve`).toBe(false);
            expect(out.code).toBe(RECONCILIATION_REFUSALS.UNREGISTERED_KEY);
        }
    });

    it("15. the environment allowlist is enforced, and production is absent by construction", () => {
        for (const env of ["production", "prod", "alloy_deployed_primary", "", "  "]) {
            const out = resolveReconciliationRequest({ reconciliation_key: KEY, target_environment: env, dry_run: true });
            expect(out.ok, `"${env}" must not resolve`).toBe(false);
        }
        expect(resolveReconciliationRequest({ reconciliation_key: KEY, target_environment: "staging", dry_run: true }).ok).toBe(true);
    });

    it("requires dry_run explicitly rather than defaulting it", () => {
        // The one ambiguity that could turn a look into a write. A caller must say which it meant.
        for (const value of [undefined, null, "true", 1, "0"]) {
            const out = resolveReconciliationRequest({ reconciliation_key: KEY, target_environment: "staging", dry_run: value });
            expect(out.ok, `dry_run=${JSON.stringify(value)} must not resolve`).toBe(false);
            expect(out.code).toBe(RECONCILIATION_REFUSALS.DRY_RUN_NOT_BOOLEAN);
        }
    });

    it("resolves the runner from the registry, never from the caller", () => {
        const out = resolveReconciliationRequest({
            reconciliation_key: KEY,
            target_environment: "staging",
            dry_run: true,
            // Every one of these is ignored: there is nowhere for them to be read.
            runner: "bash",
            script: "/tmp/evil.sh",
            env: { DRY_RUN: "0" },
        } as never);
        expect(out.ok).toBe(true);
        expect(out.normalized?.runner).toBe("dev:qa:converge-placement-waitlisted");
        expect(out.normalized?.runner_env).toEqual({ DRY_RUN: "1" });
    });
});

describe("registered reconciliation — execution", () => {
    it("16. a dry run cannot mutate: it runs the registry's dry-run environment", () => {
        const spawn = recordingSpawn();
        const out = runRegisteredReconciliation(
            { reconciliation_key: KEY, target_environment: "staging", dry_run: true },
            { spawn, repoRoot: "/repo" },
        );
        expect(out.ok).toBe(true);
        const [cmd, args, opts] = spawn.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }];
        expect(cmd).toBe("npm");
        expect(args).toEqual(["run", "--silent", "dev:qa:converge-placement-waitlisted"]);
        expect(opts.env.DRY_RUN).toBe("1");
        // The apply opt-in the script itself demands is absent, so even a mis-set DRY_RUN refuses.
        expect(opts.env.QA_CONVERGE_APPLY).toBeUndefined();
    });

    it("17. an apply carries BOTH the declared apply flags, from the registry", () => {
        const spawn = recordingSpawn();
        runRegisteredReconciliation(
            { reconciliation_key: KEY, target_environment: "staging", dry_run: false },
            { spawn, repoRoot: "/repo" },
        );
        const [, , opts] = spawn.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }];
        expect(opts.env.DRY_RUN).toBe("0");
        expect(opts.env.QA_CONVERGE_APPLY).toBe("1");
    });

    it("never reaches the spawn when the request is refused", () => {
        // The property the whole design rests on, asserted where it actually holds.
        const spawn = recordingSpawn();
        for (const bad of [
            { reconciliation_key: "bash", target_environment: "staging", dry_run: true },
            { reconciliation_key: KEY, target_environment: "production", dry_run: true },
            { reconciliation_key: KEY, target_environment: "staging" },
        ]) {
            expect(runRegisteredReconciliation(bad as never, { spawn, repoRoot: "/repo" }).ok).toBe(false);
        }
        expect(spawn).not.toHaveBeenCalled();
    });

    it("runs the canonical runner in web/, with the control plane's trusted environment", () => {
        const spawn = recordingSpawn();
        runRegisteredReconciliation(
            { reconciliation_key: KEY, target_environment: "staging", dry_run: true },
            { spawn, repoRoot: "/repo", trustedEnv: { ALLOY_SERVER_ENV_SOURCE: "/trusted/.env" } },
        );
        const [, , opts] = spawn.mock.calls[0] as unknown as [string, string[], { cwd: string; env: Record<string, string> }];
        expect(opts.cwd).toBe("/repo/web");
        expect(opts.env.ALLOY_SERVER_ENV_SOURCE).toBe("/trusted/.env");
    });

    it("reports a non-zero exit as a failure rather than a result", () => {
        const spawn = recordingSpawn({ status: 1, stdout: "", stderr: "boom" });
        const out = runRegisteredReconciliation(
            { reconciliation_key: KEY, target_environment: "staging", dry_run: true },
            { spawn, repoRoot: "/repo" },
        );
        expect(out.ok).toBe(false);
        expect(out.error).toBe("reconciliation_failed");
        expect(out.detail).toContain("boom");
    });

    it("18. reads the runner's own counts, and invents none when it printed none", () => {
        /*
         * The idempotency contract is read from the runner, not asserted by the executor: a second
         * run reporting zero `would_converge` is evidence, and a made-up zero would not be.
         */
        const withCounts = recordingSpawn({
            status: 0,
            stdout: 'starting\n{"considered":19,"already_converged":19,"would_converge":0}\ndone\n',
            stderr: "",
        });
        const out = runRegisteredReconciliation(
            { reconciliation_key: KEY, target_environment: "staging", dry_run: true },
            { spawn: withCounts, repoRoot: "/repo" },
        );
        expect(out.counts).toEqual({ considered: 19, already_converged: 19, would_converge: 0 });

        const silent = recordingSpawn({ status: 0, stdout: "no json here\n", stderr: "" });
        expect(
            runRegisteredReconciliation(
                { reconciliation_key: KEY, target_environment: "staging", dry_run: true },
                { spawn: silent, repoRoot: "/repo" },
            ).counts,
        ).toBeNull();
    });

    it("takes the LAST structured line, so trailing summary wins over earlier noise", () => {
        expect(parseReconciliationOutput('{"would_converge":17}\n{"would_converge":0}\n')).toEqual({ would_converge: 0 });
        expect(parseReconciliationOutput("[1,2,3]")).toBeNull();
        expect(parseReconciliationOutput("")).toBeNull();
    });
});

describe("it is not the metadata capability", () => {
    it("registers its own action, capability and approval", async () => {
        const registry = await import("../../../scripts/local-dev/lib/vacilando/trusted-host-action-registry.mjs");
        const key = registry.ACTION_TYPES.ENVIRONMENT_EXECUTE_REGISTERED_RECONCILIATION;
        expect(key).toBe("environment.execute_registered_reconciliation");
        // Distinct from the Vacilando metadata capability it must never be confused with.
        expect(key).not.toBe(registry.ACTION_TYPES.VACILANDO_APPLY_RECONCILIATION_PLAN);
    });
});
