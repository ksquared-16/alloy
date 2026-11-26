/**
 * Parse and build requirement rule metadata (rule_meta_v1).
 */

import type {
    RequirementRuleMetaV1,
    RequirementScope,
    RequirementEnforcement,
    RequirementTiming,
    RuleMetaV1,
} from "@/lib/lifecycle/requirementTimingTypes";

const REQUIREMENT_TIMINGS: readonly RequirementTiming[] = [
    "record_creation",
    "stage_progress",
    "stage_exit",
    "process_completion",
];

const REQUIREMENT_SCOPES: readonly RequirementScope[] = [
    "record",
    "primary_contact",
    "any_child",
    "each_child",
    "relationship",
];

const REQUIREMENT_ENFORCEMENTS: readonly RequirementEnforcement[] = [
    "informational",
    "attention",
    "blocking",
];

function normalizeStringList(raw: unknown): string[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const t = item.trim();
        if (t && !out.includes(t)) out.push(t);
    }
    return out.length ? out : undefined;
}

function parseTiming(raw: unknown): RequirementTiming | RequirementTiming[] | undefined {
    if (typeof raw === "string" && (REQUIREMENT_TIMINGS as readonly string[]).includes(raw)) {
        return raw as RequirementTiming;
    }
    if (Array.isArray(raw)) {
        const timings = raw.filter(
            (t): t is RequirementTiming =>
                typeof t === "string" && (REQUIREMENT_TIMINGS as readonly string[]).includes(t),
        );
        return timings.length ? timings : undefined;
    }
    return undefined;
}

function parseRuleMetaEntry(raw: unknown): RequirementRuleMetaV1 | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const timing = parseTiming(o.timing);
    const scope =
        typeof o.scope === "string" && (REQUIREMENT_SCOPES as readonly string[]).includes(o.scope)
            ? (o.scope as RequirementScope)
            : undefined;
    const enforcement =
        typeof o.enforcement === "string" &&
        (REQUIREMENT_ENFORCEMENTS as readonly string[]).includes(o.enforcement)
            ? (o.enforcement as RequirementEnforcement)
            : undefined;
    const applies_to_transition_keys = normalizeStringList(o.applies_to_transition_keys);
    const excluded_transition_keys = normalizeStringList(o.excluded_transition_keys);

    if (!timing && !scope && !enforcement && !applies_to_transition_keys && !excluded_transition_keys) {
        return null;
    }

    return {
        ...(timing ? { timing } : {}),
        ...(scope ? { scope } : {}),
        ...(enforcement ? { enforcement } : {}),
        ...(applies_to_transition_keys ? { applies_to_transition_keys } : {}),
        ...(excluded_transition_keys ? { excluded_transition_keys } : {}),
    };
}

export function parseRuleMetaV1(raw: unknown): RuleMetaV1 | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if ((raw as { version?: unknown }).version !== 1) return null;
    const byRaw = (raw as { by_rule_id?: unknown }).by_rule_id;
    if (!byRaw || typeof byRaw !== "object" || Array.isArray(byRaw)) return null;

    const by_rule_id: Record<string, RequirementRuleMetaV1> = {};
    for (const [key, value] of Object.entries(byRaw as Record<string, unknown>)) {
        const ruleId = key.trim();
        if (!ruleId) continue;
        const entry = parseRuleMetaEntry(value);
        if (entry) by_rule_id[ruleId] = entry;
    }
    if (!Object.keys(by_rule_id).length) return null;
    return { version: 1, by_rule_id };
}

export function ruleMetaForRule(
    ruleMeta: RuleMetaV1 | null | undefined,
    ruleId: string,
): RequirementRuleMetaV1 | undefined {
    return ruleMeta?.by_rule_id[ruleId.trim()];
}

export function buildRuleMetaV1(
    by_rule_id: Record<string, RequirementRuleMetaV1>,
): RuleMetaV1 | null {
    const cleaned: Record<string, RequirementRuleMetaV1> = {};
    for (const [ruleId, meta] of Object.entries(by_rule_id)) {
        const trimmed = ruleId.trim();
        if (!trimmed || !meta) continue;
        // Drop empty entries so legacy/default timing is absence of metadata, not `{}`.
        const entry = parseRuleMetaEntry(meta);
        if (!entry) continue;
        cleaned[trimmed] = entry;
    }
    if (!Object.keys(cleaned).length) return null;
    return { version: 1, by_rule_id: cleaned };
}
