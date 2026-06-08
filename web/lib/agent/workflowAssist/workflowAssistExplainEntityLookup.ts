/**
 * Workflow Assist explain — extract family/name tokens for entity search (deterministic).
 */

import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";

const WHY_BLOCKED_RE =
    /\bwhy\b.*\b(didn'?t|did\s+not|won'?t|never|not)\b/i;

/** Family/household name after why-blocked phrasing, e.g. "Mitchell" from "why didn't the Mitchell family get moved". */
export function extractExplainEntitySearchQuery(command: string): string | null {
    const t = command.trim().slice(0, 500);
    if (!t || !WHY_BLOCKED_RE.test(t)) return null;

    const patterns: RegExp[] = [
        /\bwhy\b[^?]*?\b(?:the|a|an)\s+([A-Za-z][\w'\-]*(?:\s+[A-Za-z][\w'\-]*){0,2})\s+(?:family|household)\b/i,
        /\bwhy\b[^?]*?\b(?:the|a|an)\s+([A-Za-z][\w'\-]+)\s+(?:family|household)\b/i,
        /\bwhy\b[^?]*?\bfor\s+(?:the\s+)?([A-Za-z][\w'\-]*(?:\s+[A-Za-z][\w'\-]*){0,2})\b/i,
    ];

    for (const re of patterns) {
        const m = t.match(re);
        const name = m?.[1]?.trim();
        if (name && name.length >= 2 && !/^(this|that|it|workflow)$/i.test(name)) {
            return name.slice(0, 48);
        }
    }
    return null;
}

/** Single high-confidence opportunity match — safe to auto-run explain. */
export function pickExplainEntityCandidate(
    candidates: TaskAssistEntitySearchCandidate[]
): { kind: "single"; candidate: TaskAssistEntitySearchCandidate } | { kind: "multiple" } | { kind: "none" } {
    const opps = candidates.filter((c) => c.entity_type === "opportunities");
    if (opps.length === 0) return { kind: "none" };
    const high = opps.filter((c) => c.confidence === "high" && !c.matched_fields.includes("fuzzy_match"));
    if (high.length === 1) return { kind: "single", candidate: high[0]! };
    if (opps.length === 1 && opps[0]!.confidence !== "low") return { kind: "single", candidate: opps[0]! };
    if (opps.length > 1) return { kind: "multiple" };
    return { kind: "none" };
}
