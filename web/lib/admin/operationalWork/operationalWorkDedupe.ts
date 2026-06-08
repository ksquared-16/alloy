import type { OperationalWorkDedupePolicy } from "@/lib/admin/operationalWork/operationalWorkTypes";

/** Default definition key for operator freeform work — weak dedupe. */
export const MANUAL_AD_HOC_WORK_DEFINITION_KEY = "manual_ad_hoc" as const;

export function buildOperationalWorkSubjectFingerprint(params: {
    orgId: string;
    entityType?: string | null;
    entityId?: string | null;
    subjectFingerprint?: string | null;
}): string {
    const override = params.subjectFingerprint?.trim();
    if (override) return override;

    const entityId = params.entityId?.trim() || null;
    if (!entityId) return `${params.orgId.trim()}:unlinked`;

    const entityType = params.entityType?.trim() || "unknown";
    return `${params.orgId.trim()}:${entityType}:${entityId}`;
}

/** Canonical dedupe identity: org + definition + subject (+ optional period). */
export function buildOperationalWorkDedupeKey(params: {
    orgId: string;
    workDefinitionKey: string;
    subjectFingerprint: string;
    periodKey?: string | null;
}): string {
    const orgId = params.orgId.trim();
    const definitionKey = params.workDefinitionKey.trim();
    const subjectFingerprint = params.subjectFingerprint.trim();
    const base = `${orgId}|${definitionKey}|${subjectFingerprint}`;
    const periodKey = params.periodKey?.trim();
    return periodKey ? `${base}|${periodKey}` : base;
}

export function resolveOperationalWorkDedupePolicy(params: {
    workDefinitionKey: string;
    dedupePolicy?: OperationalWorkDedupePolicy;
    periodKey?: string | null;
}): OperationalWorkDedupePolicy {
    if (params.dedupePolicy) return params.dedupePolicy;
    if (params.workDefinitionKey.trim() === MANUAL_AD_HOC_WORK_DEFINITION_KEY) return "none";
    if (params.periodKey?.trim()) return "definition_subject_period";
    return "definition_subject";
}

export function shouldDedupeOperationalWork(policy: OperationalWorkDedupePolicy): boolean {
    return policy !== "none";
}
