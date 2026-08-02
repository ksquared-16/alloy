/**
 * Org / work-unit AI policy from JSON metadata only (no migrations).
 * Default: all enrichment off; provider `disabled`.
 * @see docs/sprints/archive/05_2026/ai_enrichment_and_agent_actions_v1.md
 */

import type { PiiMode } from "@/lib/privacy/redactObject";
import type { AiProviderKey } from "@/lib/ai/providerTypes";

export const AI_POLICY_METADATA_KEY = "ai_policy" as const;

export const AI_ALLOWED_FEATURES = [
    "draft_enrichment",
    "operational_summary",
    "reasoning_paraphrase",
    /** Task Assist V1 — deterministic proposal generation (no LLM in default path). @see docs/sprints/archive/05_2026/task_assist_v1.md */
    "task_assist_draft",
    /** Workflow Assist Cards 4–5 — deterministic workflow draft proposals (no LLM). @see docs/sprints/archive/05_2026/workflow_assist_v1.md */
    "workflow_assist_draft",
] as const;

export type AiAllowedFeature = (typeof AI_ALLOWED_FEATURES)[number];

/** Alias of the platform privacy primitive's mode — one owner, one vocabulary. */
export type AiPiiMode = PiiMode;

export type AiLoggingMode = "minimal" | "verbose";

/** Retention intent for future logging tables — no persistence in Phase 1. */
export type AiRetentionMode = "none" | "ephemeral" | "durable_future";

export type ResolvedAiOrgPolicyV1 = {
    schema_version: 1;
    /** Master switch — must be true for any future live/stub enrichment. */
    enabled: false | true;
    /** Declarative provider preference; execution still gated elsewhere. */
    provider: AiProviderKey;
    allowed_features: readonly AiAllowedFeature[];
    pii_mode: AiPiiMode;
    logging_mode: AiLoggingMode;
    retention_mode: AiRetentionMode;
};

const DEFAULT_POLICY: ResolvedAiOrgPolicyV1 = {
    schema_version: 1,
    enabled: false,
    provider: "disabled",
    allowed_features: [],
    pii_mode: "strict",
    logging_mode: "minimal",
    retention_mode: "none",
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function parseProvider(raw: unknown): AiProviderKey {
    if (typeof raw !== "string" || !raw.trim()) return "disabled";
    const k = raw.trim().toLowerCase();
    if (k === "disabled" || k === "stub" || k === "openai" || k === "anthropic" || k === "azure_openai") {
        return k;
    }
    return "disabled";
}

function parseEnabled(raw: unknown): boolean {
    if (raw === true) return true;
    if (raw === false || raw == null) return false;
    if (typeof raw === "string") {
        const s = raw.trim().toLowerCase();
        return s === "true" || s === "1" || s === "yes";
    }
    return false;
}

function parseAllowedFeatures(raw: unknown): readonly AiAllowedFeature[] {
    if (!Array.isArray(raw)) return [];
    const allow = new Set<string>(AI_ALLOWED_FEATURES);
    const out: AiAllowedFeature[] = [];
    for (const x of raw) {
        if (typeof x !== "string") continue;
        const t = x.trim() as AiAllowedFeature;
        if (allow.has(t)) out.push(t);
    }
    return out;
}

function parsePiiMode(raw: unknown): AiPiiMode {
    if (raw === "strict" || raw === "standard" || raw === "none") return raw;
    if (typeof raw === "string") {
        const s = raw.trim().toLowerCase();
        if (s === "strict" || s === "standard" || s === "none") return s;
    }
    return "strict";
}

function parseLoggingMode(raw: unknown): AiLoggingMode {
    if (raw === "minimal" || raw === "verbose") return raw;
    if (typeof raw === "string") {
        const s = raw.trim().toLowerCase();
        if (s === "verbose") return "verbose";
    }
    return "minimal";
}

function parseRetentionMode(raw: unknown): AiRetentionMode {
    if (raw === "none" || raw === "ephemeral" || raw === "durable_future") return raw;
    if (typeof raw === "string") {
        const s = raw.trim().toLowerCase();
        if (s === "ephemeral") return "ephemeral";
        if (s === "durable_future" || s === "durable") return "durable_future";
    }
    return "none";
}

/**
 * Read `metadata.ai_policy` (or root-level `ai_policy` when caller passes the policy object only).
 * Unknown keys are ignored. `enabled: false` forces conservative defaults for nested fields.
 */
export function parseAiPolicyFromMetadata(metadata: unknown): ResolvedAiOrgPolicyV1 {
    if (!isRecord(metadata)) {
        return { ...DEFAULT_POLICY };
    }
    const rawPolicy = metadata[AI_POLICY_METADATA_KEY];
    if (!isRecord(rawPolicy)) {
        return { ...DEFAULT_POLICY };
    }
    const root = rawPolicy;

    const enabled = parseEnabled(root.enabled);
    const provider = parseProvider(root.provider);
    const allowed_features = parseAllowedFeatures(root.allowed_features);
    const pii_mode = parsePiiMode(root.pii_mode);
    const logging_mode = parseLoggingMode(root.logging_mode);
    const retention_mode = parseRetentionMode(root.retention_mode);

    if (!enabled) {
        return {
            ...DEFAULT_POLICY,
            enabled: false,
            /** Preserve declared provider for UX/debug while execution remains off. */
            provider: provider === "disabled" ? "disabled" : provider,
            allowed_features: [],
            pii_mode,
            logging_mode,
            retention_mode,
        };
    }

    return {
        schema_version: 1,
        enabled: true,
        provider: provider === "disabled" ? "stub" : provider,
        allowed_features,
        pii_mode,
        logging_mode,
        retention_mode,
    };
}
