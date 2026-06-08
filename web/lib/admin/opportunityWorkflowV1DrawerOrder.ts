import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

const SECTION_KEY_RE = /^[a-z0-9_]{1,128}$/;

/**
 * Validates a proposed drawer section permutation for opportunity workflow v1 (Card 9).
 * `canonicalKeys` must match `listOpportunityWorkflowV1CanonicalSectionKeys` for the same org catalog + layout config.
 */
export function validateOpportunityWorkflowV1SectionOrder(
    proposed: string[],
    canonicalKeys: string[]
): { ok: true } | { ok: false; error: string } {
    if (!proposed.length) {
        return { ok: false, error: "overview_section_order must be a non-empty array" };
    }
    if (!canonicalKeys.length) {
        return { ok: false, error: "No workflow v1 sections resolved for this org (check inquiry_drawer_mode and field catalog)" };
    }
    if (proposed.length !== canonicalKeys.length) {
        return {
            ok: false,
            error: `section_order must include every resolved section exactly once (expected ${canonicalKeys.length}, got ${proposed.length})`,
        };
    }
    const canonSet = new Set(canonicalKeys);
    const propSet = new Set(proposed);
    if (propSet.size !== proposed.length) {
        return { ok: false, error: "Duplicate keys in overview_section_order" };
    }
    for (const k of proposed) {
        if (!SECTION_KEY_RE.test(k)) {
            return { ok: false, error: `Invalid section key "${k}" (allowed: lowercase letters, digits, underscores)` };
        }
        if (!canonSet.has(k)) {
            return { ok: false, error: `Unknown section key "${k}" for this org’s effective workflow layout` };
        }
    }
    for (const k of canonicalKeys) {
        if (!propSet.has(k)) {
            return { ok: false, error: `Missing section key "${k}"` };
        }
    }
    return { ok: true };
}

/**
 * Merge operator ordering into layout config_json: sets `overview_section_order` and reorders
 * `inquiry_workflow_sections` so DB row order matches drawer order for workflow virtuals.
 */
export function mergeOpportunityWorkflowV1OrderIntoConfigJson(
    cfg: RecordLayoutConfigJson,
    order: string[]
): RecordLayoutConfigJson {
    const wf = cfg.inquiry_workflow_sections;
    const next: RecordLayoutConfigJson = { ...cfg, overview_section_order: [...order] };
    if (!Array.isArray(wf) || wf.length === 0) {
        return next;
    }
    const workflowKeysInGlobalOrder = order.filter((k) => wf.some((w) => w.key === k));
    const byKey = new Map(wf.map((w) => [w.key, w]));
    const reordered = workflowKeysInGlobalOrder.map((k) => byKey.get(k)).filter((x): x is NonNullable<typeof x> => Boolean(x));
    const tail = wf.filter((w) => !workflowKeysInGlobalOrder.includes(w.key));
    next.inquiry_workflow_sections = [...reordered, ...tail];
    return next;
}
