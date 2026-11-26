/**
 * Enrollment New Leads — backward-compatible opportunity status aliases (LEGACY, S4 collapse).
 *
 * As of the S4 status collapse, durable case status is `open`|`closed` and the pipeline position is
 * the persisted `stage_key` column — "New Lead" now means the LEAD STAGE (`stage_key = 'lead'`), not a
 * status. Fresh Create Lead writes `status_key = 'open'` + `stage_key = 'lead'`. These alias helpers
 * remain only so lingering legacy `new_inquiry`/`new`/`new_lead` rows keep resolving/labeling until they
 * are migrated; new membership decisions key off `stage_key`, not these aliases.
 */

import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";

/** Legacy opportunity.status_key values that belong in New Leads alongside new_inquiry. */
export const ENROLLMENT_NEW_LEADS_LEGACY_STATUS_ALIASES = ["open", "new"] as const;

const NEW_LEADS_CANONICAL_KEYS = new Set<string>([
    NEW_LEAD_STATUS_KEY,
    "new_inquiry",
    "new_lead",
    ...ENROLLMENT_NEW_LEADS_LEGACY_STATUS_ALIASES,
]);

function normalizeStatusKey(key: string): string {
    return key.trim().toLowerCase();
}

/** Expand filter keys so legacy open/new rows remain visible in New Leads lanes. */
export function expandEnrollmentNewLeadsQueueStatusKeys(statusKeys: readonly string[]): string[] {
    const normalized = [...new Set(statusKeys.map(normalizeStatusKey).filter(Boolean))];
    const hasNewLeadIntent = normalized.some((k) => k === "new_inquiry" || k === "new_lead");
    if (!hasNewLeadIntent) return normalized;
    const out = new Set(normalized);
    for (const alias of ENROLLMENT_NEW_LEADS_LEGACY_STATUS_ALIASES) {
        out.add(alias);
    }
    return [...out];
}

/**
 * Canonical operator label for the New Lead status. Covers the legacy `new_inquiry` key (and a
 * future `new_lead` key) so any lingering New Lead status renders "New Lead" — never "New Inquiry".
 * Returns null for any other key (caller falls back to the configured label / humanize / suppress).
 */
export function canonicalNewLeadStatusLabel(statusKey: string | null | undefined): string | null {
    const k = normalizeStatusKey(statusKey ?? "");
    if (k === "new_inquiry" || k === "new_lead") return "New Lead";
    // Legacy bare `new` still appears on some rows / activity previews — never render lowercase.
    if (k === "new") return "New";
    return null;
}

export function isEnrollmentNewLeadsQueueKey(queueKey: string): boolean {
    const k = normalizeStatusKey(queueKey);
    if (!k) return false;
    if (k === "new_leads" || k === "new_inquiry" || k === "new_lead") return true;
    if (k.startsWith("lifecycle_") && k.includes("new_lead")) return true;
    return false;
}

export function shouldExpandEnrollmentNewLeadsStatusAliases(input: {
    statusKeys: readonly string[];
    queueKey?: string | null;
    domain?: string | null;
}): boolean {
    const keys = input.statusKeys.map(normalizeStatusKey).filter(Boolean);
    if (keys.some((k) => k === "new_inquiry" || k === "new_lead")) return true;
    const queueKey = normalizeStatusKey(input.queueKey ?? "");
    const domain = normalizeStatusKey(input.domain ?? "");
    if (isEnrollmentNewLeadsQueueKey(queueKey)) return true;
    if (domain === "new_leads") return true;
    return keys.some((k) => NEW_LEADS_CANONICAL_KEYS.has(k));
}
