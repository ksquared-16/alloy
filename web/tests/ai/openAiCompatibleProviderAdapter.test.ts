/**
 * Phase 2.7 — the first REAL provider adapter behind Trust's governed seam.
 *
 * Every test here uses an intercepted `fetch`. No test in this file requires a
 * credential, a network, or a live provider, and that is asserted directly
 * rather than assumed (P27-8).
 *
 * The through-line: real transport must satisfy the Trust contract without
 * gaining any authority it should not have. The adapter may say what happened;
 * it may not say whether the answer was good, who it is, or what anything cost.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
    buildChatCompletionsBody,
    createOpenAiCompatibleProviderAdapter,
    extractUsage,
    failureCodeForHttpStatus,
    resolveExecutionLocation,
} from "@/lib/ai/trust/openAiCompatibleProviderAdapter";
import { executeGovernedProviderReasoning } from "@/lib/trust/provider/governedProviderExecution";
import type { GovernedProviderExecutionRequestV1 } from "@/lib/trust/provider/governedProviderExecution";
import type { EligibleReasoningInputV1 } from "@/lib/trust/information/informationPackage";

const API_KEY = "sk-test-DO-NOT-LEAK-0123456789";

const ELIGIBLE_INPUT: EligibleReasoningInputV1 = {
    schema_version: 1,
    spec_key: "attention_suggestion_enrichment",
    spec_version: "1.0.0",
    decision_class_key: "attention_suggestion_enrichment",
    privacy_policy_key: "operator_safe_v1",
    elements: { urgency_band: "high", days_since_contact: 12 },
    classes_present: [],
    pii_mode: "minimized",
    transformations: [],
    text_minimizations: [],
    participant_redactions: [],
    redaction_steps: [],
    // Built to the real shape rather than cast into it. A cast here would let a
    // fixture drift from the contract it claims to represent, which is how a
    // test ends up certifying something the type system never agreed to.
    provenance: {
        source_kind: "attention_suggestion",
        source_refs: { org_id: "org-1", suggestion_id: "sug-1" },
        element_sources: [
            { key: "urgency_band", source_field: "attention.urgency" },
            { key: "days_since_contact", source_field: "attention.last_contact_at" },
        ],
    },
    content_hash: "eri_deadbeef",
};

function governedRequest(overrides?: Partial<GovernedProviderExecutionRequestV1>): GovernedProviderExecutionRequestV1 {
    // No cast. The annotation makes the compiler check this fixture against the
    // real contract — which is how `model_structured`, a strategy kind that does
    // not exist, was caught here rather than shipped as a plausible-looking string.
    const base: GovernedProviderExecutionRequestV1 = {
        schema_version: 1,
        decision_class_key: "attention_suggestion_enrichment",
        correlation_id: "corr-1",
        input: ELIGIBLE_INPUT,
        requested_strategy_kind: "small_reasoning",
        requested_provider_key: "openai",
        requested_model_key: "gpt-4o-mini",
        deadline_ms: 20_000,
    };
    return { ...base, ...overrides };
}

function adapter(overrides?: Partial<Parameters<typeof createOpenAiCompatibleProviderAdapter>[0]>) {
    return createOpenAiCompatibleProviderAdapter({
        provider_key: "openai",
        base_url: "https://api.openai.com",
        model: "gpt-4o-mini",
        api_key: API_KEY,
        ...overrides,
    });
}

function jsonResponse(body: unknown, init?: { status?: number }): Response {
    return {
        ok: (init?.status ?? 200) < 400,
        status: init?.status ?? 200,
        text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as unknown as Response;
}

function completion(content: unknown, extra?: Record<string, unknown>): Record<string, unknown> {
    return {
        model: "gpt-4o-mini-2024-07-18",
        choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
        ...extra,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("P27-1 — the adapter implements Trust's port, and does not invent a second one", () => {
    it("satisfies ProviderAdapterV1 structurally", () => {
        const a = adapter();
        expect(typeof a.adapter_key).toBe("string");
        expect(a.adapter_key).toBeTruthy();
        expect(typeof a.execute).toBe("function");
        // Trust's contract is (request, options?) — two parameters, the second optional.
        expect(a.execute.length).toBeLessThanOrEqual(2);
    });

    it("declares no competing provider interface — it imports Trust's types only", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/ai/trust/openAiCompatibleProviderAdapter.ts", "utf8"),
        );
        // A competing contract would mean re-declaring the PORT itself. A local
        // config type is not that, so the assertion names the port precisely
        // rather than anything shaped like it.
        expect(src).not.toMatch(/export\s+type\s+\w*ProviderAdapterV\d\s*=/);
        // The port is imported from Trust and used as the factory's return type.
        expect(src).toContain('from "@/lib/trust/provider/governedProviderExecution"');
        expect(src).toMatch(/\)\s*:\s*ProviderAdapterV1\s*\{/);
    });
});

describe("P27-2 — request translation", () => {
    it("builds an OpenAI-compatible chat completions request", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(completion({ ok: true })));
        vi.stubGlobal("fetch", fetchMock);

        await adapter().execute(governedRequest());

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.openai.com/v1/chat/completions");
        expect(init.method).toBe("POST");

        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body.model).toBe("gpt-4o-mini");
        expect(body.response_format).toEqual({ type: "json_object" });
        expect(Array.isArray(body.messages)).toBe(true);
    });

    it("the Eligible Reasoning Input is the ONLY source of reasoning payload", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(completion({ ok: true })));
        vi.stubGlobal("fetch", fetchMock);

        await adapter().execute(governedRequest());

        const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
            messages: { role: string; content: string }[];
        };
        const user = body.messages.find((m) => m.role === "user")!;
        const payload = JSON.parse(user.content) as Record<string, unknown>;

        expect(payload.elements).toEqual(ELIGIBLE_INPUT.elements);
        expect(payload.content_hash).toBe(ELIGIBLE_INPUT.content_hash);
        expect(payload.privacy_policy_key).toBe(ELIGIBLE_INPUT.privacy_policy_key);
        // Only governed keys — nothing invented, nothing from a canonical record.
        expect(Object.keys(payload).sort()).toEqual(
            ["content_hash", "correlation_id", "decision_class_key", "elements", "privacy_policy_key", "spec_key", "spec_version"].sort(),
        );
    });

    it("the whole wire request contains no field the governed input did not supply", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(completion({ ok: true })));
        vi.stubGlobal("fetch", fetchMock);

        await adapter().execute(governedRequest());

        const raw = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
        // A canonical-record column name must never appear on the wire.
        for (const leak of ["participant_id", "first_name", "email", "phone", "household"]) {
            expect(raw).not.toContain(leak);
        }
    });
});

describe("P27-3 — the Trust AbortSignal reaches the real transport", () => {
    it("hands the EXACT signal object to fetch", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(completion({ ok: true })));
        vi.stubGlobal("fetch", fetchMock);

        const controller = new AbortController();
        await adapter().execute(governedRequest(), { signal: controller.signal });

        const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
        // Identity, not equality: a copied or re-wrapped signal would not abort.
        expect(init.signal).toBe(controller.signal);
    });

    it("D-19 reaches the wire — aborting the Trust signal aborts the in-flight request", async () => {
        const controller = new AbortController();
        // A transport that only settles when its signal fires, like a real socket.
        const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
            return new Promise((_resolve, reject) => {
                init.signal?.addEventListener("abort", () => {
                    const err = new Error("aborted");
                    err.name = "AbortError";
                    reject(err);
                });
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        const pending = adapter().execute(governedRequest(), { signal: controller.signal });
        controller.abort();
        const result = await pending;

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.failure_code).toBe("timeout");
    });
});

describe("P27-4 — successful normalization", () => {
    it("normalizes the model's JSON object as output", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(completion({ recommendation: "follow_up", score: 3 }))));

        const result = await adapter().execute(governedRequest());

        expect(result.ok).toBe(true);
        expect(result.ok === true && result.output).toEqual({ recommendation: "follow_up", score: 3 });
    });

    it("retains provider identity and the model actually used", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(completion({ ok: true }))));

        const result = await adapter().execute(governedRequest());

        expect(result.provider_identity.provider_key).toBe("openai");
        expect(result.provider_identity.model_key).toBe("gpt-4o-mini-2024-07-18");
    });

    it("falls back to the requested model when the provider names none", async () => {
        const body = completion({ ok: true });
        delete body.model;
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));

        const result = await adapter().execute(governedRequest());
        expect(result.provider_identity.model_key).toBe("gpt-4o-mini");
    });

    it("the adapter does NOT judge whether the content is valid — that stays with Trust", async () => {
        // Business-nonsense JSON. A valid envelope is all the adapter asserts.
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(completion({ utter: "nonsense" }))));

        const result = await adapter().execute(governedRequest());
        expect(result.ok).toBe(true);
    });
});

describe("P27-5 — execution locality is never claimed without proof", () => {
    it("the public OpenAI origin is remote", () => {
        expect(resolveExecutionLocation("https://api.openai.com")).toBe("remote");
    });

    it("localhost is UNKNOWN — a loopback URL is configuration, not evidence about where weights live", () => {
        expect(resolveExecutionLocation("http://localhost:11434")).toBe("unknown");
        expect(resolveExecutionLocation("http://127.0.0.1:8080")).toBe("unknown");
    });

    it("an arbitrary compatible host is unknown, not remote-by-assumption", () => {
        expect(resolveExecutionLocation("https://llm.internal.example")).toBe("unknown");
    });

    it("only an explicit operator declaration can assert local", () => {
        expect(resolveExecutionLocation("http://localhost:11434", "local")).toBe("local");
    });

    it("locality reaches the normalized result", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(completion({ ok: true }))));
        const result = await adapter({ base_url: "http://localhost:11434" }).execute(governedRequest());
        expect(result.provider_identity.execution_location).toBe("unknown");
    });

    it("an unparseable base URL is unknown, never a guess", () => {
        expect(resolveExecutionLocation("not a url")).toBe("unknown");
    });
});

describe("P27-6 — usage is forwarded, never invented", () => {
    it("extracts prompt and completion tokens when supplied", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(jsonResponse(completion({ ok: true }, { usage: { prompt_tokens: 120, completion_tokens: 45 } }))),
        );

        const result = await adapter().execute(governedRequest());
        expect(result.usage).toEqual({ input_units: 120, output_units: 45 });
    });

    it("absent usage stays ABSENT — never zero", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(completion({ ok: true }))));

        const result = await adapter().execute(governedRequest());
        expect(result.usage).toBeUndefined();
    });

    it("a non-numeric token count is omitted, never coerced to a number", () => {
        expect(extractUsage({ usage: { prompt_tokens: "120", completion_tokens: null } })).toBeUndefined();
    });

    it("provider cost units are NEVER set — no canonical pricing mechanism exists to derive them", () => {
        const usage = extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, total_cost: 0.02 } });
        expect(usage).toEqual({ input_units: 10, output_units: 5 });
        expect(usage && "provider_cost_units" in usage).toBe(false);
    });

    it("a nonsensical number is passed through so TRUST refuses it, rather than being laundered here", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(jsonResponse(completion({ ok: true }, { usage: { prompt_tokens: -5 } }))),
        );

        const raw = await adapter().execute(governedRequest());
        expect(raw.usage).toEqual({ input_units: -5 });

        // End-to-end: Trust is the one that rejects it.
        const governed = await executeGovernedProviderReasoning({ request: governedRequest(), adapter: adapter() });
        expect(governed.ok).toBe(false);
        expect(governed.ok === false && governed.failure_code).toBe("adapter_contract_violation");
    });
});

describe("P27-7 — error normalization into the closed vocabulary", () => {
    it("a network failure is a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
        const result = await adapter().execute(governedRequest());
        expect(result.ok === false && result.failure_code).toBe("transport_failure");
    });

    it("an abort is a timeout", async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
        const result = await adapter().execute(governedRequest());
        expect(result.ok === false && result.failure_code).toBe("timeout");
    });

    it("rate limiting and server errors are provider_unavailable (and Trust treats them retryable)", () => {
        expect(failureCodeForHttpStatus(429)).toBe("provider_unavailable");
        expect(failureCodeForHttpStatus(500)).toBe("provider_unavailable");
        expect(failureCodeForHttpStatus(503)).toBe("provider_unavailable");
    });

    it("a 4xx the provider understood and rejected is a transport failure, not an availability problem", () => {
        expect(failureCodeForHttpStatus(400)).toBe("transport_failure");
        expect(failureCodeForHttpStatus(401)).toBe("transport_failure");
    });

    it("a rate-limited call normalizes end to end", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Rate limited" } }, { status: 429 })));
        const result = await adapter().execute(governedRequest());
        expect(result.ok === false && result.failure_code).toBe("provider_unavailable");
    });

    it("a non-JSON body is a malformed response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse("<html>gateway</html>")));
        const result = await adapter().execute(governedRequest());
        expect(result.ok === false && result.failure_code).toBe("malformed_response");
    });

    it("missing choices, missing content, and non-JSON content are all malformed", async () => {
        for (const body of [{ choices: [] }, { choices: [{ message: {} }] }, completion("not json at all")]) {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));
            const result = await adapter().execute(governedRequest());
            expect(result.ok === false && result.failure_code).toBe("malformed_response");
        }
    });

    it("model content that is an array or scalar is malformed — output must be an object", async () => {
        for (const content of [[1, 2, 3], 42, "\"just a string\""]) {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(completion(content))));
            const result = await adapter().execute(governedRequest());
            expect(result.ok === false && result.failure_code).toBe("malformed_response");
        }
    });

    it("a content-filter stop is provider_refused — the provider declined, the envelope was fine", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse({ model: "m", choices: [{ finish_reason: "content_filter", message: { content: null } }] }),
            ),
        );
        const result = await adapter().execute(governedRequest());
        expect(result.ok === false && result.failure_code).toBe("provider_refused");
    });
});

describe("P27-8 — hostile provider output, and no credential anywhere", () => {
    it("raw provider error text never reaches the normalized result", async () => {
        const nasty = "Your key sk-live-REAL-SECRET is invalid; contact support@evil.example";
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { message: nasty } }, { status: 401 })));

        const result = await adapter().execute(governedRequest());
        const blob = JSON.stringify(result);
        expect(blob).not.toContain("sk-live-REAL-SECRET");
        expect(blob).not.toContain("evil.example");
        expect(blob).not.toContain("contact support");
    });

    it("the failure branch has no free-text field at all — prose is structurally impossible", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { message: "boom" } }, { status: 500 })));
        const result = await adapter().execute(governedRequest());
        expect(Object.keys(result).sort()).toEqual(["failure_code", "ok", "provider_identity"]);
    });

    it("a provider cannot rename itself — identity comes from local configuration", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(completion({ ok: true }, { provider_identity: { provider_key: "impostor", execution_location: "local" } })),
            ),
        );

        const result = await adapter().execute(governedRequest());
        expect(result.provider_identity.provider_key).toBe("openai");
        expect(result.provider_identity.execution_location).toBe("remote");
    });

    it("extra envelope fields cannot smuggle Decision Package fields", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                jsonResponse(
                    completion(
                        { legitimate: true },
                        { trust_score: 99, decision_package: { forged: true }, lifecycle_state: "accepted", usage: { prompt_tokens: 1 } },
                    ),
                ),
            ),
        );

        const result = await adapter().execute(governedRequest());
        expect(result.ok === true && result.output).toEqual({ legitimate: true });
        const blob = JSON.stringify(result);
        expect(blob).not.toContain("trust_score");
        expect(blob).not.toContain("forged");
        expect(blob).not.toContain("lifecycle_state");
    });

    it("the API key never appears in a result, on success or failure", async () => {
        for (const response of [jsonResponse(completion({ ok: true })), jsonResponse({ error: {} }, { status: 500 })]) {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
            const result = await adapter().execute(governedRequest());
            expect(JSON.stringify(result)).not.toContain(API_KEY);
            expect(JSON.stringify(result)).not.toContain("sk-test");
        }
    });

    it("the key is sent as a Bearer header and is never logged", async () => {
        const logs: unknown[] = [];
        vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a));
        vi.spyOn(console, "error").mockImplementation((...a) => void logs.push(a));
        vi.spyOn(console, "warn").mockImplementation((...a) => void logs.push(a));

        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(completion({ ok: true })));
        vi.stubGlobal("fetch", fetchMock);

        await adapter().execute(governedRequest());

        const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
        expect(logs).toHaveLength(0);
    });

    it("the module logs nothing at all", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync("lib/ai/trust/openAiCompatibleProviderAdapter.ts", "utf8"),
        );
        expect(src).not.toMatch(/console\.(log|error|warn|info|debug)/);
    });
});

describe("P27-9 — the seam still holds end to end", () => {
    it("a real-transport adapter satisfies governed execution and produces a normalized Trust result", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(jsonResponse(completion({ recommendation: "follow_up" }, { usage: { prompt_tokens: 10, completion_tokens: 4 } }))),
        );

        const result = await executeGovernedProviderReasoning({ request: governedRequest(), adapter: adapter() });

        expect(result.ok).toBe(true);
        expect(result.ok === true && result.output).toEqual({ recommendation: "follow_up" });
        expect(result.usage).toEqual({ input_units: 10, output_units: 4 });
        expect(result.provider_identity.execution_location).toBe("remote");
        expect(typeof result.latency_ms).toBe("number");
    });

    it("Trust's hard deadline still terminates a non-cooperative real adapter", async () => {
        // Ignores the signal entirely, exactly like a stubborn provider.
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));

        const result = await executeGovernedProviderReasoning({
            request: governedRequest({ deadline_ms: 20 }),
            adapter: adapter(),
        });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.failure_code).toBe("timeout");
    });

    it("required tests use no live provider and no credential from the environment", () => {
        // The adapter under test is constructed with an inline fake key, and
        // every call is intercepted. Nothing here reads OPENAI_API_KEY.
        expect(process.env.OPENAI_API_KEY).toBeUndefined();
    });
});
