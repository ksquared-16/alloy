/**
 * Phase 2.6 — D-19: governed provider timeout and cancellation boundary.
 *
 * The activation gate for a real adapter. Trust must bound its own execution
 * without depending on a provider to cooperate, and — the part that actually
 * matters — an adapter that resolves after the deadline must not be able to
 * come back and change what happened.
 *
 * Fake timers throughout: deterministic, no sleeps, no CI flakiness. No network,
 * no credential, no real provider.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    PROVIDER_EXECUTION_FAILURES,
    executeGovernedProviderReasoning,
    isRetryableProviderFailure,
    type GovernedProviderExecutionRequestV1,
    type ProviderAdapterResponseV1,
    type ProviderAdapterV1,
} from "@/lib/trust/provider/governedProviderExecution";
import {
    buildEligibleReasoningInput,
    buildInformationPackage,
    type EligibleReasoningInputV1,
    type InformationPackageSpecV1,
} from "@/lib/trust/information/informationPackage";
import { ATTENTION_SUGGESTION_MINIMIZATION_V1 } from "@/lib/trust/platform/platformPrivacyPolicies";

const WEB_ROOT = process.cwd();
const SRC = "lib/trust/provider/governedProviderExecution.ts";
const CLASS_KEY = "attention_suggestion_enrichment";
const DEADLINE = 5_000;

type Src = { body: string };
const SPEC: InformationPackageSpecV1<Src> = {
    key: "timeout_fixture",
    version: "1.0.0",
    decision_class_key: CLASS_KEY,
    source_kind: "communication_messages",
    elements: [{ key: "inbound_message_text", information_class: "communications", source_field: "f", select: (s) => s.body }],
};

function eligible(): EligibleReasoningInputV1 {
    const pkg = buildInformationPackage({ spec: SPEC, source: { body: "hello" }, sourceRefs: { org_id: "org-1" } });
    if (!pkg.ok) throw new Error("fixture package failed");
    const e = buildEligibleReasoningInput({ package: pkg.package, policy: ATTENTION_SUGGESTION_MINIMIZATION_V1 });
    if (!e.ok) throw new Error("fixture eligibility failed");
    return e.input;
}

function request(over: Partial<GovernedProviderExecutionRequestV1> = {}): GovernedProviderExecutionRequestV1 {
    return {
        schema_version: 1,
        decision_class_key: CLASS_KEY,
        correlation_id: "corr-1",
        input: eligible(),
        requested_strategy_kind: "large_reasoning",
        requested_provider_key: "fake_provider",
        deadline_ms: DEADLINE,
        ...over,
    };
}

const IDENTITY = { provider_key: "fake_provider", model_key: "m", execution_location: "remote" as const };
const OK: ProviderAdapterResponseV1 = { ok: true, output: { fine: true }, provider_identity: IDENTITY };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Advances fake time and lets microtasks drain, so the race settles. */
async function advance(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
}

// ---------------------------------------------------------------------------
// 1. Fast paths still complete normally
// ---------------------------------------------------------------------------

describe("P26-1 — executions that finish inside the budget are unaffected", () => {
    it("a fast success completes normally", async () => {
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: { adapter_key: "fast", async execute() { return OK; } },
        });
        await advance(1);
        const r = await p;
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.output).toEqual({ fine: true });
    });

    it("a fast normalized provider failure completes normally", async () => {
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: {
                adapter_key: "fast_fail",
                async execute() { return { ok: false, failure_code: "provider_refused", provider_identity: IDENTITY }; },
            },
        });
        await advance(1);
        const r = await p;
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("provider_refused");
    });

    it("a fast success leaves NO timer alive", async () => {
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: { adapter_key: "fast", async execute() { return OK; } },
        });
        await advance(1);
        await p;
        // A leaked deadline timer would still be pending here.
        expect(vi.getTimerCount()).toBe(0);
    });

    it("a fast failure also leaves no timer alive", async () => {
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: { adapter_key: "boom", async execute() { throw new Error("nope"); } },
        });
        await advance(1);
        const r = await p;
        expect(r.ok).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// 2. The hard wall
// ---------------------------------------------------------------------------

describe("P26-2 — Trust bounds itself without adapter cooperation", () => {
    it("a NEVER-resolving adapter yields a governed timeout", async () => {
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: { adapter_key: "hangs", execute: () => new Promise<ProviderAdapterResponseV1>(() => {}) },
        });
        await advance(DEADLINE + 1);
        const r = await p;
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("timeout");
        expect(r.retryable).toBe(true);
    });

    it("timeout uses the EXISTING Phase 2.4 code — no second timeout outcome", () => {
        expect(PROVIDER_EXECUTION_FAILURES.filter((c) => c.includes("timeout"))).toEqual(["timeout"]);
        expect(isRetryableProviderFailure("timeout")).toBe(true);
    });

    it("a cooperative adapter RECEIVES the cancellation signal", async () => {
        let aborted = false;
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: {
                adapter_key: "cooperative",
                execute: (_req, options) =>
                    new Promise<ProviderAdapterResponseV1>((_resolve, reject) => {
                        options?.signal.addEventListener("abort", () => {
                            aborted = true;
                            reject(new Error("aborted by signal"));
                        });
                    }),
            },
        });
        await advance(DEADLINE + 1);
        const r = await p;
        expect(aborted).toBe(true);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("timeout");
    });

    it("a NON-cooperative adapter that ignores the signal still cannot block Trust", async () => {
        let sawSignal = false;
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: {
                adapter_key: "stubborn",
                execute: (_req, options) => {
                    sawSignal = options?.signal !== undefined;
                    // Deliberately ignores the signal and never resolves.
                    return new Promise<ProviderAdapterResponseV1>(() => {});
                },
            },
        });
        await advance(DEADLINE + 1);
        const r = await p;
        expect(sawSignal).toBe(true);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("timeout");
    });

    it("the adapter is invoked AT MOST once", async () => {
        let calls = 0;
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: {
                adapter_key: "counting",
                execute() { calls += 1; return new Promise<ProviderAdapterResponseV1>(() => {}); },
            },
        });
        await advance(DEADLINE * 3);
        await p;
        expect(calls).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// 3. Late-result quarantine — the authority guarantee
// ---------------------------------------------------------------------------

describe("P26-3 — a late adapter result cannot reopen a terminal execution", () => {
    /** Resolves only when the test says so, long after the deadline. */
    function lateAdapter(response: ProviderAdapterResponseV1 | Error) {
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const adapter: ProviderAdapterV1 = {
            adapter_key: "late",
            async execute() {
                await gate;
                if (response instanceof Error) throw response;
                return response;
            },
        };
        return { adapter, release };
    }

    it("a late SUCCESS is ignored — the timeout result stands", async () => {
        const { adapter, release } = lateAdapter(OK);
        const p = executeGovernedProviderReasoning({ request: request(), adapter });
        await advance(DEADLINE + 1);
        const r = await p;
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("timeout");

        // The provider now finishes. It must change nothing.
        release();
        await advance(1_000);
        const again = await p;
        expect(again).toBe(r);
        expect(again.ok).toBe(false);
    });

    it("a late FAILURE is ignored, and does not become an unhandled rejection", async () => {
        const { adapter, release } = lateAdapter(new Error("late boom"));
        const p = executeGovernedProviderReasoning({ request: request(), adapter });
        await advance(DEADLINE + 1);
        const r = await p;
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("timeout");

        release();
        await advance(1_000);
        expect((await p).ok).toBe(false);
        expect(JSON.stringify(await p)).not.toContain("late boom");
    });

    it("late USAGE and provider identity do not mutate the authoritative result", async () => {
        const { adapter, release } = lateAdapter({
            ok: true,
            output: { smuggled_after_deadline: true },
            provider_identity: { provider_key: "sneaky", model_key: "late-model", execution_location: "local" },
            usage: { input_units: 999, output_units: 999, provider_cost_units: 42 },
        });
        const p = executeGovernedProviderReasoning({ request: request(), adapter });
        await advance(DEADLINE + 1);
        const r = await p;

        release();
        await advance(1_000);
        const final = await p;

        expect(final.ok).toBe(false);
        // Nothing the late provider claimed may appear anywhere.
        const blob = JSON.stringify(final);
        // NB: no bare "late" here — it is a substring of the legitimate
        // `latency_ms` field, and asserting on it would fail for the wrong
        // reason. Fixture tokens must not collide with real field names.
        for (const f of ["sneaky", "late-model", "999", "42", "smuggled_after_deadline"]) {
            expect(blob, `leaked ${f}`).not.toContain(f);
        }
        // Usage was never received before the deadline, so it stays ABSENT —
        // not zero, and certainly not the late provider's numbers.
        expect(final.usage).toBeUndefined();
        expect(final).toBe(r);
    });

    it("the timeout result is emitted exactly once", async () => {
        const { adapter, release } = lateAdapter(OK);
        const p = executeGovernedProviderReasoning({ request: request(), adapter });
        await advance(DEADLINE + 1);
        const first = await p;
        release();
        await advance(5_000);
        // A promise settles once; asserted explicitly because the quarantine's
        // whole job is that nothing downstream observes a second answer.
        expect(await p).toBe(first);
        expect(await p).toBe(first);
    });

    it("quarantine is enforced by a settled flag, not by adapter goodwill", () => {
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        expect(src).toContain("let settled = false;");
        expect(src).toMatch(/if \(settled\) return LATE;/);
        expect(src).toContain("const LATE = Symbol(");
    });
});

// ---------------------------------------------------------------------------
// 4. Deadline validation — fail closed BEFORE invocation
// ---------------------------------------------------------------------------

describe("P26-4 — an unusable execution budget fails before the adapter is invoked", () => {
    it.each([
        ["zero", 0],
        ["negative", -1],
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["absurdly large", 24 * 60 * 60 * 1000],
        ["non-numeric", "5000" as unknown as number],
    ])("%s deadline is refused and the adapter never runs", async (_label, deadline_ms) => {
        let called = false;
        const r = await executeGovernedProviderReasoning({
            request: request({ deadline_ms }),
            adapter: { adapter_key: "never", async execute() { called = true; return OK; } },
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("invalid_execution_budget");
        expect(called, "adapter was invoked despite an invalid budget").toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("an invalid budget is NOT retryable — retrying a malformed request repeats the mistake", () => {
        expect(isRetryableProviderFailure("invalid_execution_budget")).toBe(false);
    });

    it("nonsense is refused, never coerced into a default timeout", () => {
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        // No fallback deadline anywhere: `deadline_ms ?? SOMETHING` would
        // silently invent a policy nobody set.
        expect(src).not.toMatch(/deadline_ms\s*\?\?/);
        expect(src).not.toMatch(/deadline_ms\s*\|\|/);
    });

    it("the budget is validated BEFORE the adapter call in source order", () => {
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        const validation = src.indexOf('return fail("invalid_execution_budget"');
        const invocation = src.indexOf("input.adapter.execute(");
        expect(validation).toBeGreaterThan(-1);
        expect(invocation).toBeGreaterThan(-1);
        expect(validation).toBeLessThan(invocation);
    });
});

// ---------------------------------------------------------------------------
// 5. Nothing else moved
// ---------------------------------------------------------------------------

describe("P26-5 — Phase 2.4/2.5 semantics and the boundary are intact", () => {
    it("raw provider error text still does not leak", async () => {
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: { adapter_key: "leaky", async execute() { throw new Error("sk-live-secret jane@example.com"); } },
        });
        await advance(1);
        const r = await p;
        const blob = JSON.stringify(r);
        expect(blob).not.toContain("sk-live-secret");
        expect(blob).not.toContain("jane@example.com");
    });

    it("Phase 2.4 normalization is unchanged — an unknown failure code is still a contract violation", async () => {
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: {
                adapter_key: "bogus",
                async execute() { return { ok: false, failure_code: "invented" as never, provider_identity: IDENTITY }; },
            },
        });
        await advance(1);
        const r = await p;
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.failure_code).toBe("adapter_contract_violation");
    });

    it("identity known BEFORE a timeout is not fabricated after it", async () => {
        // Trust learns nothing about the model from an adapter that never
        // answered, so the timeout result carries only what was requested.
        const p = executeGovernedProviderReasoning({
            request: request(),
            adapter: { adapter_key: "hangs", execute: () => new Promise<ProviderAdapterResponseV1>(() => {}) },
        });
        await advance(DEADLINE + 1);
        const r = await p;
        if (r.ok) return;
        expect(r.provider_identity.provider_key).toBe("fake_provider");
        expect(r.provider_identity.model_key).toBeUndefined();
        expect(r.provider_identity.execution_location).toBe("unknown");
    });

    it("the seam still reaches no network, credential or Communications module", () => {
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        for (const p of [
            /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /@anthropic-ai/, /\bopenai\b/i, /axios/,
            /from\s+"node:https?"/, /process\.env/, /API_KEY/, /lib\/communications/,
        ]) {
            expect(src, `matched ${p}`).not.toMatch(p);
        }
    });

    it("cancellation uses the standard AbortSignal, not a bespoke abstraction", () => {
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        expect(src).toContain("new AbortController()");
        expect(src).toContain("AbortSignal");
        // No hand-rolled cancellation type.
        expect(src).not.toMatch(/CancellationToken|CancelHandle|ProviderCancel/);
    });
});
