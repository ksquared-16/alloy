/**
 * Server-only AI enrichment + operational summaries (Phase 1–2).
 * @see docs/sprints/archive/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

export type {
    AiProviderKey,
    AiProviderExecutionMode,
    AiStructuredRequestV1,
    AiStructuredResponseV1,
    AiProviderOutcome,
    AiProviderErrorEnvelope,
    OpenAiProviderHttpErrorMeta,
    AiStructuredProvider,
} from "@/lib/ai/providerTypes";

export { createDisabledAiProvider, createAiProviderForPolicy, type ResolveStructuredAiProviderOptions } from "@/lib/ai/disabledProvider";

export {
    AI_POLICY_METADATA_KEY,
    AI_ALLOWED_FEATURES,
    parseAiPolicyFromMetadata,
    type ResolvedAiOrgPolicyV1,
    type AiAllowedFeature,
    type AiPiiMode,
    type AiLoggingMode,
    type AiRetentionMode,
} from "@/lib/ai/aiPolicy";

export { redactObjectForAi, type RedactObjectForAiResult, type RedactionStep, type RedactionKind } from "@/lib/privacy/redactObject";

export {
    NEEDS_ATTENTION_SUGGESTION_ENRICHMENT_AGENT_KEY,
    type AttentionSuggestionAiEnrichmentV1,
    type OperationalSummaryV1,
    type OperationalSummaryQueuePreviewV1,
    type OperationalSummaryRiskHint,
    type OperationalSummaryGenerationMode,
    type AiEnrichmentEnvelopeV1,
    type AiUsageTelemetryPayloadV1,
    type AiTelemetryOutcome,
    type OperationalSummarySourceKind,
    aiUsageTelemetryPayloadV1ToJson,
    aiEnrichmentEnvelopeV1ToJson,
    operationalSummaryV1ToJson,
} from "@/lib/ai/enrichmentContracts";

export { aiUsageTelemetryPayloadV1Schema, safeParseAiUsageTelemetryPayloadV1 } from "@/lib/ai/aiUsageTelemetrySchema";

export { safeParseOperationalSummaryV1 } from "@/lib/ai/operationalSummarySchema";

export { applyStubOperationalSummaryOverlay } from "@/lib/ai/buildOperationalSummary";
export {
    buildOperationalSummaryDeterministic,
    toOperationalSummaryQueuePreview,
} from "@/lib/operationalSummary/buildOperationalSummary";

export {
    isAiEnrichmentStubEnvEnabled,
    isAiEnrichmentTelemetryEnvEnabled,
    hasOpenAiStructuredCredentials,
    DEFAULT_OPENAI_REQUEST_TIMEOUT_MS,
    getOpenAiStructuredRequestTimeoutMs,
} from "@/lib/ai/aiEnrichmentEnv";

export {
    supportsCustomTemperature,
    resolveOpenAiStructuredCompletionTemperature,
} from "@/lib/ai/openAiModelCapabilities";

export { createStubAiProvider } from "@/lib/ai/stubProvider";

export { resolveStructuredAiProviderForPolicy } from "@/lib/ai/resolveStructuredAiProvider";

export {
    enrichAttentionSuggestionStubEnvelope,
    NEEDS_ATTENTION_DRAFT_ENRICHMENT_FEATURE,
    type EnrichAttentionSuggestionStubInput,
    type EnrichAttentionSuggestionStubResult,
} from "@/lib/ai/enrichAttentionSuggestionStub";

export {
    maybeEmitAiEnrichmentTelemetryEvent,
    shouldEmitAiEnrichmentTelemetry,
    AI_ENRICHMENT_USAGE_EVENT_TYPE,
} from "@/lib/ai/enrichmentTelemetry";

export {
    AI_ENRICHMENT_USE_PERMISSION_KEY,
    isAiEnrichmentUsePermissionRequired,
    computeOpenAiLiveInvocationPermitted,
    resolveAiEnrichmentPortalAccess,
    type AiEnrichmentRouteAccessFailure,
} from "@/lib/ai/aiEnrichmentPermissions";

export {
    evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute,
    evaluateOrgPolicyForOpenAiAttentionDraftEnrichmentRoute,
} from "@/lib/ai/aiEnrichmentRouteGuards";

export type {
    AlloyLiveProviderFamily,
    AlloyLiveProviderEndpointConfigV1,
    AlloyProviderRetryPolicyV1,
    AlloyProviderTimeoutPolicyV1,
    AlloyProviderCapabilityV1,
    AlloyLiveStructuredProviderAdapter,
} from "@/lib/ai/providerAdapterDesign";

export { createLiveProviderAdapterPlaceholder, LIVE_PROVIDER_ADAPTER_NOT_CONFIGURED } from "@/lib/ai/liveProviderAdapterPlaceholder";
