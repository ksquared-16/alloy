/**
 * Canonical BP runtime dedupe fingerprint.
 *
 * Durable identity is process subject + semantic work definition — not the current stage.
 * Stage still determines expected work / applicability; it is not part of the durable key.
 *
 * Formats:
 *   Semantic (current): bpw:{org}:{entityType}:{entityId}:{semanticWorkKey}
 *   Legacy (stage-scoped): bp:{org}:{entityType}:{entityId}:{stageKey}:{templateKey}
 *
 * Lookup accepts both. New writes use the semantic form. Legacy rows normalize on
 * carry-forward / instantiate dedupe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";
import { isBusinessProcessStageWorkTaskRow } from "@/lib/lifecycle/isBusinessProcessStageWorkTaskRow";

export type BusinessProcessWorkRuntimeFingerprintInput = {
    orgId: string;
    entityType: string;
    entityId: string;
    /** @deprecated Stage is not part of durable identity; accepted for legacy callers / parse. */
    stageKey?: string;
    /** Template key — used when workDefinitionKey is absent. */
    templateKey?: string;
    /** Preferred semantic work key (platform work definition). */
    workDefinitionKey?: string;
};

export type ParsedBusinessProcessWorkRuntimeFingerprint = {
    orgId: string;
    entityType: string;
    entityId: string;
    /** Present only on legacy stage-scoped fingerprints. */
    stageKey: string | null;
    /** Template or work-definition key depending on format. */
    semanticWorkKey: string;
    /** Alias of semanticWorkKey for legacy callers that expect templateKey. */
    templateKey: string;
    format: "semantic" | "legacy_stage_scoped";
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

/** Resolve the durable semantic work key from definition and/or template. */
export function resolveBusinessProcessSemanticWorkKey(input: {
    workDefinitionKey?: string | null;
    templateKey?: string | null;
}): string | null {
    return trimOrNull(input.workDefinitionKey) ?? trimOrNull(input.templateKey);
}

/**
 * Stable fingerprint stored on operational_tasks.metadata.bp_runtime_fingerprint.
 * Prefer workDefinitionKey; fall back to templateKey. Stage is never encoded.
 */
export function buildBusinessProcessWorkRuntimeFingerprint(
    input: BusinessProcessWorkRuntimeFingerprintInput,
): string {
    const orgId = input.orgId.trim();
    const entityType = input.entityType.trim() || "unknown";
    const entityId = input.entityId.trim();
    const semanticWorkKey = resolveBusinessProcessSemanticWorkKey({
        workDefinitionKey: input.workDefinitionKey,
        templateKey: input.templateKey,
    });
    if (!orgId || !entityId || !semanticWorkKey) {
        throw new Error("BP runtime fingerprint requires orgId, entityId, and semantic work key");
    }
    return `bpw:${orgId}:${entityType}:${entityId}:${semanticWorkKey}`;
}

/**
 * @deprecated Prefer buildBusinessProcessWorkRuntimeFingerprint with workDefinitionKey.
 * Kept for call sites that still pass stageKey; stage is ignored in the durable key.
 */
export function buildLegacyStageScopedBusinessProcessWorkRuntimeFingerprint(input: {
    orgId: string;
    entityType: string;
    entityId: string;
    stageKey: string;
    templateKey: string;
}): string {
    const orgId = input.orgId.trim();
    const entityType = input.entityType.trim() || "unknown";
    const entityId = input.entityId.trim();
    const stageKey = input.stageKey.trim();
    const templateKey = input.templateKey.trim();
    return `bp:${orgId}:${entityType}:${entityId}:${stageKey}:${templateKey}`;
}

/** Find an open BP task matching an exact fingerprint string (semantic or legacy). */
export async function findOpenBusinessProcessWorkTask(params: {
    supabase: SupabaseClient;
    orgId: string;
    fingerprint: string;
}): Promise<OperationalTaskRow | null> {
    const fingerprint = params.fingerprint.trim();
    if (!fingerprint) return null;

    const { data, error } = await params.supabase
        .from("operational_tasks")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("status", "open")
        .filter("metadata->>bp_runtime_fingerprint", "eq", fingerprint)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("[findOpenBusinessProcessWorkTask]", error);
        return null;
    }
    if (!data) return null;

    return data as OperationalTaskRow;
}

/**
 * Find open BP work for a subject by semantic identity, accepting legacy stage-scoped
 * fingerprints and metadata without a fingerprint when template/definition match.
 */
export async function findOpenBusinessProcessWorkBySemanticIdentity(params: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: string;
    entityId: string;
    workDefinitionKey?: string | null;
    templateKey?: string | null;
}): Promise<OperationalTaskRow | null> {
    const orgId = params.orgId.trim();
    const entityType = params.entityType.trim() || "opportunities";
    const entityId = params.entityId.trim();
    const semanticKey = resolveBusinessProcessSemanticWorkKey({
        workDefinitionKey: params.workDefinitionKey,
        templateKey: params.templateKey,
    });
    if (!orgId || !entityId || !semanticKey) return null;

    const semanticFingerprint = buildBusinessProcessWorkRuntimeFingerprint({
        orgId,
        entityType,
        entityId,
        workDefinitionKey: params.workDefinitionKey ?? undefined,
        templateKey: params.templateKey ?? undefined,
    });

    const byExact = await findOpenBusinessProcessWorkTask({
        supabase: params.supabase,
        orgId,
        fingerprint: semanticFingerprint,
    });
    if (byExact) return byExact;

    const { data, error } = await params.supabase
        .from("operational_tasks")
        .select("*")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("status", "open")
        .order("updated_at", { ascending: false })
        .limit(48);

    if (error) {
        console.error("[findOpenBusinessProcessWorkBySemanticIdentity]", error);
        return null;
    }

    for (const row of data ?? []) {
        if (!isBusinessProcessStageWorkTaskRow(row as { metadata?: Record<string, unknown>; source?: string })) {
            continue;
        }
        const md =
            row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        const rowSemantic =
            resolveBusinessProcessSemanticWorkKey({
                workDefinitionKey: trimOrNull(md.work_definition_key),
                templateKey:
                    trimOrNull(md.operating_plan_template_key) ?? trimOrNull(md.work_intent_key),
            }) ?? null;
        if (rowSemantic === semanticKey) return row as OperationalTaskRow;

        const fp = parseBusinessProcessWorkRuntimeFingerprint(md.bp_runtime_fingerprint);
        if (fp?.semanticWorkKey === semanticKey && fp.entityId === entityId) {
            return row as OperationalTaskRow;
        }
    }

    return null;
}

/** Parse fingerprint parts when present on task metadata (for tests/diagnostics). */
export function parseBusinessProcessWorkRuntimeFingerprint(
    raw: unknown,
): ParsedBusinessProcessWorkRuntimeFingerprint | null {
    const fingerprint = trimOrNull(raw);
    if (!fingerprint) return null;

    if (fingerprint.startsWith("bpw:")) {
        const parts = fingerprint.split(":");
        if (parts.length !== 5) return null;
        const semanticWorkKey = parts[4]!;
        return {
            orgId: parts[1]!,
            entityType: parts[2]!,
            entityId: parts[3]!,
            stageKey: null,
            semanticWorkKey,
            templateKey: semanticWorkKey,
            format: "semantic",
        };
    }

    if (fingerprint.startsWith("bp:")) {
        const parts = fingerprint.split(":");
        if (parts.length !== 6) return null;
        const templateKey = parts[5]!;
        return {
            orgId: parts[1]!,
            entityType: parts[2]!,
            entityId: parts[3]!,
            stageKey: parts[4]!,
            semanticWorkKey: templateKey,
            templateKey,
            format: "legacy_stage_scoped",
        };
    }

    return null;
}
