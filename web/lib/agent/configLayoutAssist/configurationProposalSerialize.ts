/**
 * Deterministic JSON serialization for ConfigurationProposalV1 (Card 5).
 */

import { normalizeConfigurationProposal } from "./configurationProposalNormalize";
import {
    CONFIGURATION_PROPOSAL_VERSION,
    type ConfigurationProposalV1,
    type ProposalValidationResultV1,
} from "./configurationProposalV1";
import { validateConfigurationProposal } from "./configurationProposalValidate";

function isPlainObject(x: unknown): x is Record<string, unknown> {
    return x != null && typeof x === "object" && !Array.isArray(x);
}

/** Recursively sort object keys for stable JSON. */
export function stableJsonValue(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(stableJsonValue);
    if (typeof value !== "object") return value;
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort((a, b) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const k of keys) {
        const v = o[k];
        if (v === undefined) continue;
        out[k] = stableJsonValue(v);
    }
    return out;
}

export type SerializeConfigurationProposalOptions = {
    /** Run normalize before serialize (default true). */
    normalize?: boolean;
    /** Validate after normalize; throws if invalid when strict (default false). */
    strict?: boolean;
};

export type DeserializeConfigurationProposalResult =
    | { ok: true; proposal: ConfigurationProposalV1; validation: ProposalValidationResultV1 }
    | { ok: false; error: string; validation?: ProposalValidationResultV1 };

function parseProposalFromUnknown(raw: unknown): ConfigurationProposalV1 | { error: string } {
    if (!isPlainObject(raw)) return { error: "proposal must be a JSON object" };

    const version = raw.version;
    if (version !== CONFIGURATION_PROPOSAL_VERSION) {
        return { error: `unsupported proposal version: ${version}` };
    }

    const proposed_operations = raw.proposed_operations;
    if (!Array.isArray(proposed_operations)) {
        return { error: "proposed_operations must be an array" };
    }

    const proposal: ConfigurationProposalV1 = {
        version: CONFIGURATION_PROPOSAL_VERSION,
        id: String(raw.id ?? ""),
        category: raw.category as ConfigurationProposalV1["category"],
        intent: String(raw.intent ?? ""),
        summary: String(raw.summary ?? ""),
        rationale: Array.isArray(raw.rationale) ? raw.rationale.map(String) : [],
        impacted_entities: Array.isArray(raw.impacted_entities) ? raw.impacted_entities.map(String) : [],
        impacted_layouts: Array.isArray(raw.impacted_layouts) ? raw.impacted_layouts.map(String) : undefined,
        impacted_fields: Array.isArray(raw.impacted_fields) ? raw.impacted_fields.map(String) : undefined,
        warnings: Array.isArray(raw.warnings) ? (raw.warnings as ConfigurationProposalV1["warnings"]) : undefined,
        risk_level: raw.risk_level as ConfigurationProposalV1["risk_level"],
        requires_approval: Boolean(raw.requires_approval),
        permission_requirements: Array.isArray(raw.permission_requirements)
            ? raw.permission_requirements.map(String)
            : [],
        proposed_operations: proposed_operations as ConfigurationProposalV1["proposed_operations"],
        apply_mode: raw.apply_mode as ConfigurationProposalV1["apply_mode"],
        metadata: isPlainObject(raw.metadata) ? raw.metadata : undefined,
        generated_by: String(raw.generated_by ?? ""),
        created_at: String(raw.created_at ?? ""),
        created_by: raw.created_by != null ? String(raw.created_by) : null,
    };

    return proposal;
}

/**
 * Serialize proposal to deterministic JSON string (normalized by default).
 */
export function serializeConfigurationProposal(
    proposal: ConfigurationProposalV1,
    options: SerializeConfigurationProposalOptions = {}
): string {
    const normalize = options.normalize !== false;
    const p = normalize ? normalizeConfigurationProposal(proposal) : proposal;

    if (options.strict) {
        const validation = validateConfigurationProposal(p);
        if (!validation.ok) {
            throw new Error(
                `ConfigurationProposal validation failed: ${validation.issues.map((i: { message: string }) => i.message).join("; ")}`
            );
        }
    }

    const stable = stableJsonValue(p);
    return JSON.stringify(stable);
}

/**
 * Parse JSON string or object into ConfigurationProposalV1 with validation result.
 */
export function deserializeConfigurationProposal(
    input: string | Record<string, unknown>
): DeserializeConfigurationProposalResult {
    let raw: unknown;
    if (typeof input === "string") {
        try {
            raw = JSON.parse(input) as unknown;
        } catch {
            return { ok: false, error: "invalid JSON" };
        }
    } else {
        raw = input;
    }

    const parsed = parseProposalFromUnknown(raw);
    if ("error" in parsed) {
        return { ok: false, error: parsed.error };
    }

    const normalized = normalizeConfigurationProposal(parsed);
    const validation = validateConfigurationProposal(normalized);
    if (!validation.ok) {
        return { ok: false, error: "proposal validation failed", validation };
    }

    return { ok: true, proposal: normalized, validation };
}

/** Stable hash-friendly canonical string (normalize + serialize). */
export function configurationProposalCanonicalString(proposal: ConfigurationProposalV1): string {
    return serializeConfigurationProposal(proposal, { normalize: true, strict: false });
}
