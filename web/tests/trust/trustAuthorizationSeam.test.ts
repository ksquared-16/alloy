/**
 * Phase 0 Slice 0.3 — Trust authorization resolution seam.
 *
 * Three consumers previously re-implemented the same ~90-line authorization
 * preamble, and the Trust envelope adapter re-derived organization feature
 * policy a fourth time. This suite proves they now resolve through one seam,
 * that the distinctions the old code expressed are preserved rather than
 * collapsed, and that unknown states fail closed.
 *
 * What it deliberately does NOT do: assert that the three consumers behave
 * identically. They do not, on purpose — `workflow_assist_propose` is admin-only,
 * only `attention_draft_enrichment` reaches a provider, and only
 * `task_assist_propose` records an actor. Those differences are certified as
 * differences.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.3
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_ENRICHMENT_USE_PERMISSION_KEY } from "@/lib/ai/aiEnrichmentPermissions";
import { AI_POLICY_METADATA_KEY } from "@/lib/ai/aiPolicy";
import {
    TRUST_AUTHORIZATION_CONSUMERS,
    completeTrustAuthorization,
    describeTrustAuthorizationConsumer,
    resolveTrustAccessAuthorization,
    resolveTrustAuthorization,
    type TrustAuthorizationConsumerKey,
} from "@/lib/ai/resolveTrustAuthorization";
import { trustAuthorizationRefusalResponse } from "@/lib/ai/trustAuthorizationHttp";
import {
    TRUST_AUTHORIZATION_REFUSAL_CATEGORIES,
    isTrustAuthorizationPermitted,
    permitsReasoningMode,
    toTrustRuntimeAuthorization,
    type TrustAuthorizationDecision,
} from "@/lib/trust/authorization/trustAuthorizationDecision";

const WEB_ROOT = join(__dirname, "..", "..");

const ctxOk = { ok: true as const, orgId: "org-1", role: "admin", userId: "user-1" };
const accessOk = {
    ok: true as const,
    userId: "user-1",
    orgId: "org-1",
    roleKeys: ["admin"],
    permissionKeys: [AI_ENRICHMENT_USE_PERMISSION_KEY],
    departmentScope: "all" as const,
    allowedDepartmentIds: null,
    siteScope: "all" as const,
    allowedSiteLocationIds: null,
};

/** Feature key per consumer, from the descriptor rather than restated here. */
function featureOf(consumer: TrustAuthorizationConsumerKey): string {
    return describeTrustAuthorizationConsumer(consumer).featureKey;
}

function orgMetadata(input: {
    consumer?: TrustAuthorizationConsumerKey;
    enabled?: boolean;
    provider?: string;
    features?: readonly string[];
}) {
    const features = input.features ?? (input.consumer ? [featureOf(input.consumer)] : []);
    return {
        [AI_POLICY_METADATA_KEY]: {
            enabled: input.enabled ?? true,
            provider: input.provider ?? "stub",
            allowed_features: features,
        },
    };
}

function resolve(
    consumer: TrustAuthorizationConsumerKey,
    over: {
        ctx?: typeof ctxOk | { ok: false; status: 401 | 403 };
        access?: typeof accessOk | { ok: false; status: 401 | 403 };
        metadata?: unknown;
    } = {},
): TrustAuthorizationDecision {
    return resolveTrustAuthorization({
        consumer,
        ctx: over.ctx ?? ctxOk,
        access: over.access ?? accessOk,
        orgMetadata: over.metadata ?? orgMetadata({ consumer }),
    });
}

beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
    vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

// ---------------------------------------------------------------------------
// One seam
// ---------------------------------------------------------------------------

describe("all three consumers resolve through one canonical seam", () => {
    it("every proven consumer is registered with a descriptor", () => {
        expect([...TRUST_AUTHORIZATION_CONSUMERS]).toEqual([
            "attention_draft_enrichment",
            "task_assist_propose",
            "workflow_assist_propose",
        ]);
        for (const consumer of TRUST_AUTHORIZATION_CONSUMERS) {
            expect(describeTrustAuthorizationConsumer(consumer).key).toBe(consumer);
        }
    });

    it("each consumer is permitted under its own feature, and only its own", () => {
        for (const consumer of TRUST_AUTHORIZATION_CONSUMERS) {
            const mine = resolve(consumer);
            expect(isTrustAuthorizationPermitted(mine)).toBe(true);
            expect(mine.evidence.requested_feature_key).toBe(featureOf(consumer));

            // Another consumer's feature must not authorize this one.
            const other = TRUST_AUTHORIZATION_CONSUMERS.find((c) => c !== consumer)!;
            const wrong = resolve(consumer, { metadata: orgMetadata({ features: [featureOf(other)] }) });
            expect(isTrustAuthorizationPermitted(wrong)).toBe(false);
        }
    });

    it("the three route files import the seam and no authorization authority of their own", () => {
        const routes = [
            "app/api/admin/ai/enrich-attention-suggestion/route.ts",
            "app/api/admin/ai/task-assist/propose/route.ts",
            "app/api/admin/ai/workflow-assist/propose/route.ts",
        ];
        for (const relative of routes) {
            const src = readFileSync(join(WEB_ROOT, relative), "utf8");
            expect(src).toContain("resolveTrustAccessAuthorization");
            expect(src).toContain("completeTrustAuthorization");
            // The authorities are consulted by the seam, never by the route.
            expect(src).not.toContain("aiEnrichmentRouteGuards");
            expect(src).not.toContain("aiEnrichmentPermissions");
            expect(src).not.toContain("aiEnrichmentEnv");
        }
    });

    it("no route retains an independent duplicated policy branch", () => {
        const routes = [
            "app/api/admin/ai/enrich-attention-suggestion/route.ts",
            "app/api/admin/ai/task-assist/propose/route.ts",
            "app/api/admin/ai/workflow-assist/propose/route.ts",
        ];
        for (const relative of routes) {
            const src = readFileSync(join(WEB_ROOT, relative), "utf8");
            for (const gate of [
                "evaluateOrgPolicyFor",
                "resolveAiEnrichmentPortalAccess",
                "computeOpenAiLiveInvocationPermitted",
                "isAiEnrichmentStubEnvEnabled",
                "hasOpenAiStructuredCredentials",
                "AI_OPENAI_FORBIDDEN",
                "AI_FEATURE_NOT_ALLOWED",
                "FEATURE_DISABLED",
                "OPENAI_NOT_CONFIGURED",
            ]) {
                expect(`${relative}: ${src.includes(gate) ? gate : "clean"}`).toBe(`${relative}: clean`);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Fail closed
// ---------------------------------------------------------------------------

describe("fails closed", () => {
    it("unauthenticated context refuses, at the authority's own status", () => {
        const d = resolve("task_assist_propose", { ctx: { ok: false, status: 401 } });
        expect(isTrustAuthorizationPermitted(d)).toBe(false);
        if (d.permitted) return;
        expect(d.refusal.category).toBe("unauthenticated");
        expect(d.refusal.http_status).toBe(401);
        expect(d.refusal.error_code).toBe("Unauthorized");
    });

    it("an access-context failure refuses even when the admin context succeeded", () => {
        const d = resolve("task_assist_propose", { access: { ok: false, status: 403 } });
        expect(isTrustAuthorizationPermitted(d)).toBe(false);
        if (d.permitted) return;
        expect(d.refusal.category).toBe("organization_context_unavailable");
        expect(d.refusal.http_status).toBe(403);
    });

    it("an org mismatch between the two authorities refuses", () => {
        const d = resolve("task_assist_propose", { access: { ...accessOk, orgId: "other-org" } });
        expect(isTrustAuthorizationPermitted(d)).toBe(false);
        if (d.permitted) return;
        expect(d.refusal.error_code).toBe("ORG_CONTEXT_MISMATCH");
        expect(d.refusal.category).toBe("organization_context_unavailable");
    });

    it("organization policy disabled refuses", () => {
        const d = resolve("task_assist_propose", { metadata: orgMetadata({ enabled: false }) });
        expect(isTrustAuthorizationPermitted(d)).toBe(false);
        if (d.permitted) return;
        expect(d.evidence.organization_policy_enabled).toBe(false);
        expect(d.refusal.http_status).toBe(403);
    });

    it("feature not in allowed_features refuses with the historical code", () => {
        const d = resolve("task_assist_propose", { metadata: orgMetadata({ features: [] }) });
        expect(isTrustAuthorizationPermitted(d)).toBe(false);
        if (d.permitted) return;
        expect(d.refusal.category).toBe("feature_disabled_by_policy");
        expect(d.refusal.error_code).toBe("AI_FEATURE_NOT_ALLOWED");
        expect(d.refusal.http_status).toBe(403);
    });

    it("permission denial refuses under strict permission mode", () => {
        const d = resolve("task_assist_propose", { access: { ...accessOk, permissionKeys: [] } });
        expect(isTrustAuthorizationPermitted(d)).toBe(false);
        if (d.permitted) return;
        expect(d.refusal.category).toBe("portal_access_denied");
        expect(d.refusal.error_code).toBe("AI_ENRICHMENT_FORBIDDEN");
        expect(d.evidence.permission_granted).toBe(false);
    });

    it("a provider no consumer supports fails closed rather than falling through", () => {
        for (const provider of ["anthropic", "azure_openai"]) {
            const d = resolve("task_assist_propose", {
                metadata: orgMetadata({ provider, consumer: "task_assist_propose" }),
            });
            expect(isTrustAuthorizationPermitted(d)).toBe(false);
            if (d.permitted) continue;
            expect(d.refusal.category).toBe("unsupported_capability");
            expect(d.refusal.error_code).toBe("AI_POLICY_PROVIDER");
        }
    });

    it("PRE-EXISTING: an enabled policy with a missing or unrecognised provider is coerced to stub", () => {
        // `parseAiPolicyFromMetadata` maps `disabled` and any unrecognised string
        // to `stub` when `enabled` is true. Every one of the three routes has
        // always behaved this way, and the seam reproduces it rather than
        // silently tightening it. Recorded as authorization debt, not fixed here:
        // an org that enables AI without naming a provider gets the stub branch.
        for (const provider of ["disabled", "not_a_provider", ""]) {
            const d = resolve("task_assist_propose", {
                metadata: orgMetadata({ provider, consumer: "task_assist_propose" }),
            });
            expect(isTrustAuthorizationPermitted(d)).toBe(true);
            expect(permitsReasoningMode(d, "deterministic_local")).toBe(true);
            expect(permitsReasoningMode(d, "provider_backed")).toBe(false);
        }
    });

    it("a disabled policy never authorizes, whatever provider it names", () => {
        for (const provider of ["stub", "openai", "anthropic", "disabled"]) {
            const d = resolve("task_assist_propose", {
                metadata: orgMetadata({ enabled: false, provider, consumer: "task_assist_propose" }),
            });
            expect(isTrustAuthorizationPermitted(d)).toBe(false);
            expect(d.evidence.organization_policy_enabled).toBe(false);
            expect(d.evidence.feature_allowed).toBe(false);
        }
    });

    it("an unknown feature key is never allowed by default", () => {
        // `allowed_features` carrying an unrecognised entry must not authorize.
        const d = resolve("task_assist_propose", {
            metadata: orgMetadata({ features: ["some_future_feature", "totally_unknown"] }),
        });
        expect(isTrustAuthorizationPermitted(d)).toBe(false);
        expect(d.evidence.feature_allowed).toBe(false);
    });

    it("a stage-access permit is not authorization", () => {
        const stage1 = resolveTrustAccessAuthorization({
            consumer: "task_assist_propose",
            ctx: ctxOk,
            access: accessOk,
        });
        expect(stage1.ok).toBe(true);
        expect(stage1.decision.permitted).toBe(true);
        expect(stage1.decision.evidence.stage).toBe("access");
        // Permitted at stage 1, but organization policy has not been consulted.
        expect(isTrustAuthorizationPermitted(stage1.decision)).toBe(false);
    });

    it("a null or undefined decision is never permitted", () => {
        expect(isTrustAuthorizationPermitted(null)).toBe(false);
        expect(isTrustAuthorizationPermitted(undefined)).toBe(false);
    });

    it("stage 2 never re-opens a refused stage 1", () => {
        const refusedStage1 = resolveTrustAccessAuthorization({
            consumer: "task_assist_propose",
            ctx: { ok: false, status: 401 },
            access: accessOk,
        });
        const completed = completeTrustAuthorization({
            accessDecision: refusedStage1.decision,
            // A permissive policy must not rescue a failed identity gate.
            orgMetadata: orgMetadata({ consumer: "task_assist_propose" }),
        });
        expect(isTrustAuthorizationPermitted(completed)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Reasoning mode, provider permission and provider availability stay distinct
// ---------------------------------------------------------------------------

describe("authorization, reasoning mode and availability are distinct", () => {
    it("deterministic reasoning stays allowed when provider-backed reasoning is not permitted", () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "false");
        const d = resolve("attention_draft_enrichment", {
            access: { ...accessOk, permissionKeys: [] },
            metadata: orgMetadata({ provider: "stub", consumer: "attention_draft_enrichment" }),
        });

        expect(isTrustAuthorizationPermitted(d)).toBe(true);
        expect(permitsReasoningMode(d, "deterministic_local")).toBe(true);
        expect(permitsReasoningMode(d, "provider_backed")).toBe(false);
        expect(d.evidence.provider_use_permitted).toBe(false);
    });

    it("provider permission denied is 403 — an authorization outcome", () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "false"); // permission never granted
        const d = resolve("attention_draft_enrichment", {
            metadata: orgMetadata({ provider: "openai", consumer: "attention_draft_enrichment" }),
        });
        expect(isTrustAuthorizationPermitted(d)).toBe(false);
        if (d.permitted) return;
        expect(d.refusal.category).toBe("provider_use_not_permitted");
        expect(d.refusal.http_status).toBe(403);
        expect(d.refusal.error_code).toBe("AI_OPENAI_FORBIDDEN");
    });

    it("provider permitted but unconfigured is 503 — availability, not authorization", () => {
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("OPENAI_MODEL", "");
        const d = resolve("attention_draft_enrichment", {
            metadata: orgMetadata({ provider: "openai", consumer: "attention_draft_enrichment" }),
        });
        expect(isTrustAuthorizationPermitted(d)).toBe(false);
        if (d.permitted) return;
        expect(d.refusal.category).toBe("provider_unavailable");
        expect(d.refusal.http_status).toBe(503);
        expect(d.refusal.error_code).toBe("OPENAI_NOT_CONFIGURED");
        // The caller WAS permitted to use a provider; there simply is not one.
        expect(d.evidence.provider_use_permitted).toBe(true);
        expect(d.evidence.provider_availability).toBe("unavailable");
        // Availability is not a Trust refusal — no Decision Package records it.
        expect(d.refusal.trust_outcome).toBeNull();
    });

    it("permission and availability are independent axes", () => {
        vi.stubEnv("OPENAI_API_KEY", "configured");
        vi.stubEnv("OPENAI_MODEL", "some-model");
        const permittedAndAvailable = resolve("attention_draft_enrichment", {
            metadata: orgMetadata({ provider: "openai", consumer: "attention_draft_enrichment" }),
        });
        expect(isTrustAuthorizationPermitted(permittedAndAvailable)).toBe(true);
        expect(permittedAndAvailable.evidence.provider_availability).toBe("available");
        expect(permitsReasoningMode(permittedAndAvailable, "provider_backed")).toBe(true);
    });

    it("only the consumer that reaches a provider checks provider configuration", () => {
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("OPENAI_MODEL", "");
        for (const consumer of ["task_assist_propose", "workflow_assist_propose"] as const) {
            const d = resolve(consumer, { metadata: orgMetadata({ provider: "openai", consumer }) });
            // These run the `openai` POLICY branch deterministically and never call
            // a provider, so missing credentials must not refuse them.
            expect(isTrustAuthorizationPermitted(d)).toBe(true);
            expect(d.evidence.provider_availability).toBe("not_required");
            expect(permitsReasoningMode(d, "deterministic_local")).toBe(true);
        }
        expect(describeTrustAuthorizationConsumer("attention_draft_enrichment").requiresProviderCredentials).toBe(true);
    });

    it("the deterministic mode being switched off is availability, not policy denial", () => {
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "false");
        const d = resolve("task_assist_propose");
        expect(isTrustAuthorizationPermitted(d)).toBe(false);
        if (d.permitted) return;
        expect(d.refusal.category).toBe("reasoning_mode_unavailable");
        expect(d.refusal.error_code).toBe("FEATURE_DISABLED");
        // Status is preserved from the pre-convergence route, not "improved".
        expect(d.refusal.http_status).toBe(403);
    });
});

// ---------------------------------------------------------------------------
// Intentional per-consumer differences
// ---------------------------------------------------------------------------

describe("intentional differences are preserved, not reconciled", () => {
    it("only Task Assist requires a resolvable actor, and refuses 401 without one", () => {
        expect(describeTrustAuthorizationConsumer("task_assist_propose").requiresActorUserId).toBe(true);
        expect(describeTrustAuthorizationConsumer("attention_draft_enrichment").requiresActorUserId).toBe(false);
        expect(describeTrustAuthorizationConsumer("workflow_assist_propose").requiresActorUserId).toBe(false);

        const blank = { ...accessOk, userId: "   " };
        const taskAssist = resolve("task_assist_propose", { access: blank });
        expect(isTrustAuthorizationPermitted(taskAssist)).toBe(false);
        if (!taskAssist.permitted) {
            expect(taskAssist.refusal.category).toBe("actor_unresolved");
            expect(taskAssist.refusal.http_status).toBe(401);
            expect(taskAssist.refusal.error_code).toBe("ACTOR_REQUIRED");
        }

        // The other two are unaffected by a blank actor.
        expect(isTrustAuthorizationPermitted(resolve("workflow_assist_propose", { access: blank }))).toBe(true);
    });

    it("each consumer keeps its own operator-facing messages", () => {
        const messages = TRUST_AUTHORIZATION_CONSUMERS.map(
            (c) => describeTrustAuthorizationConsumer(c).unsupportedProviderMessage,
        );
        expect(new Set(messages).size).toBe(3);

        const taskAssist = resolve("task_assist_propose", {
            metadata: orgMetadata({ provider: "anthropic", consumer: "task_assist_propose" }),
        });
        expect(taskAssist.permitted).toBe(false);
        if (!taskAssist.permitted) {
            expect(taskAssist.refusal.message).toContain("Task Assist requires ai_policy.provider stub or openai");
        }
        const workflow = resolve("workflow_assist_propose", {
            metadata: orgMetadata({ provider: "anthropic", consumer: "workflow_assist_propose" }),
        });
        expect(workflow.permitted).toBe(false);
        if (!workflow.permitted) {
            expect(workflow.refusal.message).toContain("Workflow Assist requires ai_policy.provider stub or openai");
        }
    });

    it("workflow-assist keeps its own admin-only route authority, outside the seam", () => {
        const src = readFileSync(join(WEB_ROOT, "app/api/admin/ai/workflow-assist/propose/route.ts"), "utf8");
        // `requireAdmin` is this route's own access owner and no other consumer
        // has it. Converging it would change who may reach the other two routes.
        expect(src).toContain("requireAdmin");
        for (const other of [
            "app/api/admin/ai/enrich-attention-suggestion/route.ts",
            "app/api/admin/ai/task-assist/propose/route.ts",
        ]) {
            expect(readFileSync(join(WEB_ROOT, other), "utf8")).not.toContain("requireAdmin");
        }
    });

    it("only the enrichment consumer executes provider-backed reasoning under an openai policy", () => {
        expect(describeTrustAuthorizationConsumer("attention_draft_enrichment").openAiPolicyExecutionMode).toBe(
            "provider_backed",
        );
        expect(describeTrustAuthorizationConsumer("task_assist_propose").openAiPolicyExecutionMode).toBe(
            "deterministic_local",
        );
        expect(describeTrustAuthorizationConsumer("workflow_assist_propose").openAiPolicyExecutionMode).toBe(
            "deterministic_local",
        );
    });
});

// ---------------------------------------------------------------------------
// Predictability, evidence hygiene, and the Trust boundary
// ---------------------------------------------------------------------------

describe("changing one authority input changes the decision predictably", () => {
    it("granting the permission flips only the permission axis", () => {
        const denied = resolve("task_assist_propose", { access: { ...accessOk, permissionKeys: [] } });
        const granted = resolve("task_assist_propose");

        expect(denied.evidence.permission_granted).toBe(false);
        expect(granted.evidence.permission_granted).toBe(true);
        expect(isTrustAuthorizationPermitted(denied)).toBe(false);
        expect(isTrustAuthorizationPermitted(granted)).toBe(true);
        // Everything else about the request is unchanged.
        expect(denied.evidence.requested_feature_key).toBe(granted.evidence.requested_feature_key);
        expect(denied.evidence.org_id).toBe(granted.evidence.org_id);
    });

    it("adding the feature to org policy flips only the feature axis", () => {
        const without = resolve("workflow_assist_propose", { metadata: orgMetadata({ features: [] }) });
        const with_ = resolve("workflow_assist_propose");

        expect(without.evidence.feature_allowed).toBe(false);
        expect(with_.evidence.feature_allowed).toBe(true);
        expect(without.evidence.organization_policy_enabled).toBe(true);
        expect(isTrustAuthorizationPermitted(without)).toBe(false);
        expect(isTrustAuthorizationPermitted(with_)).toBe(true);
    });

    it("the required permission key reflects strict mode", () => {
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "false");
        expect(resolve("task_assist_propose").evidence.required_permission_key).toBeNull();
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");
        expect(resolve("task_assist_propose").evidence.required_permission_key).toBe(
            AI_ENRICHMENT_USE_PERMISSION_KEY,
        );
    });
});

describe("decisions carry no credentials or sensitive values", () => {
    const SECRET = "sk-super-secret-key-value";

    it("a provider credential never appears in any decision", () => {
        vi.stubEnv("OPENAI_API_KEY", SECRET);
        vi.stubEnv("OPENAI_MODEL", "gpt-secret-model");
        vi.stubEnv("OPENAI_BASE_URL", "https://internal.example.invalid");

        for (const consumer of TRUST_AUTHORIZATION_CONSUMERS) {
            for (const provider of ["stub", "openai", "disabled"]) {
                const serialized = JSON.stringify(resolve(consumer, { metadata: orgMetadata({ provider, consumer }) }));
                expect(serialized).not.toContain(SECRET);
                expect(serialized).not.toContain("gpt-secret-model");
                expect(serialized).not.toContain("internal.example.invalid");
                expect(serialized).not.toContain("sk-");
            }
        }
    });

    it("evidence exposes exactly the declared, non-sensitive fields", () => {
        const d = resolve("task_assist_propose");
        expect(Object.keys(d.evidence).sort()).toEqual(
            [
                "actor_user_id",
                "consumer_key",
                "feature_allowed",
                "org_id",
                "organization_policy_enabled",
                "permission_granted",
                "permitted_reasoning_modes",
                "provider_availability",
                "provider_use_permitted",
                "requested_feature_key",
                "required_permission_key",
                "stage",
            ].sort(),
        );
        for (const forbidden of ["api_key", "apiKey", "token", "secret", "base_url", "model", "credential"]) {
            expect(Object.keys(d.evidence)).not.toContain(forbidden);
        }
    });
});

describe("the Trust Runtime consumes the decision and resolves no authority itself", () => {
    it("the runtime and the authorization contract import no RBAC or tenant-policy module", () => {
        for (const relative of [
            "lib/trust/runtime/trustRuntime.ts",
            "lib/trust/authorization/trustAuthorizationDecision.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, relative), "utf8");
            // Import statements only — prose in a doc comment is not a dependency.
            const imported = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
            for (const authority of [
                "@/lib/ai/aiPolicy",
                "@/lib/ai/aiEnrichmentPermissions",
                "@/lib/ai/aiEnrichmentRouteGuards",
                "@/lib/ai/aiEnrichmentEnv",
                "@/lib/admin/getAdminContext",
                "@/lib/admin/getAdminAccessContext",
            ]) {
                expect(`${relative} imports ${imported.includes(authority) ? authority : "nothing forbidden"}`).toBe(
                    `${relative} imports nothing forbidden`,
                );
            }
            // …and no authority is re-implemented inline either.
            for (const identifier of [
                "parseAiPolicyFromMetadata",
                "permissionKeys",
                "roleKeys",
                "org_settings",
                "allowed_features",
            ]) {
                expect(`${relative}: ${src.includes(identifier) ? identifier : "clean"}`).toBe(`${relative}: clean`);
            }
        }
    });

    it("a rich decision narrows to exactly what the runtime accepts", () => {
        const permitted = toTrustRuntimeAuthorization(resolve("task_assist_propose"));
        expect(permitted).toEqual({ permitted: true });

        const refused = toTrustRuntimeAuthorization(
            resolve("task_assist_propose", { metadata: orgMetadata({ features: [] }) }),
        );
        expect(refused.permitted).toBe(false);
        if (refused.permitted) return;
        expect(refused.outcome).toBe("refused_policy");
        expect(refused.detail.length).toBeGreaterThan(0);
        // The runtime never sees an HTTP status or a permission key.
        expect(Object.keys(refused).sort()).toEqual(["detail", "outcome", "permitted"]);
    });

    it("a permission refusal narrows to refused_permission, not refused_policy", () => {
        const refused = toTrustRuntimeAuthorization(
            resolve("task_assist_propose", { access: { ...accessOk, permissionKeys: [] } }),
        );
        expect(refused.permitted).toBe(false);
        if (refused.permitted) return;
        expect(refused.outcome).toBe("refused_permission");
    });

    it("an availability refusal that never reaches the runtime still fails closed if it does", () => {
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("OPENAI_MODEL", "");
        const availability = resolve("attention_draft_enrichment", {
            metadata: orgMetadata({ provider: "openai", consumer: "attention_draft_enrichment" }),
        });
        const narrowed = toTrustRuntimeAuthorization(availability);
        expect(narrowed.permitted).toBe(false);
        if (narrowed.permitted) return;
        expect(narrowed.outcome).toBe("refused_policy");
    });
});

// ---------------------------------------------------------------------------
// HTTP shape preservation
// ---------------------------------------------------------------------------

describe("routes preserve their existing response status and shape", () => {
    it("a context failure keeps the admin-context body shape", async () => {
        const d = resolve("task_assist_propose", { ctx: { ok: false, status: 401 } });
        const res = trustAuthorizationRefusalResponse(d)!;
        expect(res.status).toBe(401);
        await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("a policy failure keeps the { ok:false, error, message } body shape", async () => {
        const d = resolve("task_assist_propose", { metadata: orgMetadata({ features: [] }) });
        const res = trustAuthorizationRefusalResponse(d)!;
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error).toBe("AI_FEATURE_NOT_ALLOWED");
        expect(typeof body.message).toBe("string");
    });

    it("a provider-availability failure keeps its 503", async () => {
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("OPENAI_MODEL", "");
        const d = resolve("attention_draft_enrichment", {
            metadata: orgMetadata({ provider: "openai", consumer: "attention_draft_enrichment" }),
        });
        const res = trustAuthorizationRefusalResponse(d)!;
        expect(res.status).toBe(503);
        await expect(res.json()).resolves.toMatchObject({ ok: false, error: "OPENAI_NOT_CONFIGURED" });
    });

    it("a permitted decision produces no response, so success can never be answered as an error", () => {
        expect(trustAuthorizationRefusalResponse(resolve("task_assist_propose"))).toBeNull();
    });

    it("every refusal category is reachable or explicitly accounted for", () => {
        // A taxonomy with unreachable members is a taxonomy nobody maintains.
        const seen = new Set<string>();
        const record = (d: TrustAuthorizationDecision) => {
            if (!d.permitted) seen.add(d.refusal.category);
        };

        record(resolve("task_assist_propose", { ctx: { ok: false, status: 401 } }));
        record(resolve("task_assist_propose", { access: { ...accessOk, orgId: "other" } }));
        record(resolve("task_assist_propose", { access: { ...accessOk, userId: "  " } }));
        record(resolve("task_assist_propose", { access: { ...accessOk, permissionKeys: [] } }));
        record(resolve("task_assist_propose", { metadata: orgMetadata({ features: [] }) }));
        record(
            resolve("task_assist_propose", {
                metadata: orgMetadata({ provider: "anthropic", consumer: "task_assist_propose" }),
            }),
        );

        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "false");
        record(resolve("task_assist_propose"));
        vi.stubEnv("AI_ENRICHMENT_STUB_ENABLED", "true");

        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "false");
        record(
            resolve("attention_draft_enrichment", {
                metadata: orgMetadata({ provider: "openai", consumer: "attention_draft_enrichment" }),
            }),
        );
        vi.stubEnv("AI_ENRICHMENT_USE_PERMISSION_REQUIRED", "true");

        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("OPENAI_MODEL", "");
        record(
            resolve("attention_draft_enrichment", {
                metadata: orgMetadata({ provider: "openai", consumer: "attention_draft_enrichment" }),
            }),
        );

        expect([...seen].sort()).toEqual([...TRUST_AUTHORIZATION_REFUSAL_CATEGORIES].sort());
    });
});
