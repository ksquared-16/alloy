/**
 * Canonical BP runtime dedupe fingerprint.
 *
 * Rule: at most one open BP operational task per tuple:
 *   org_id + entity_type + entity_id + stage_key + template_key
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";

export type BusinessProcessWorkRuntimeFingerprintInput = {
    orgId: string;
    entityType: string;
    entityId: string;
    stageKey: string;
    templateKey: string;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

/** Stable fingerprint string stored on operational_tasks.metadata.bp_runtime_fingerprint. */
export function buildBusinessProcessWorkRuntimeFingerprint(
    input: BusinessProcessWorkRuntimeFingerprintInput,
): string {
    const orgId = input.orgId.trim();
    const entityType = input.entityType.trim() || "unknown";
    const entityId = input.entityId.trim();
    const stageKey = input.stageKey.trim();
    const templateKey = input.templateKey.trim();
    return `bp:${orgId}:${entityType}:${entityId}:${stageKey}:${templateKey}`;
}

/** Find an open BP task matching the canonical runtime fingerprint. */
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

/** Parse fingerprint parts when present on task metadata (for tests/diagnostics). */
export function parseBusinessProcessWorkRuntimeFingerprint(raw: unknown): BusinessProcessWorkRuntimeFingerprintInput | null {
    const fingerprint = trimOrNull(raw);
    if (!fingerprint?.startsWith("bp:")) return null;
    const parts = fingerprint.split(":");
    if (parts.length !== 6) return null;
    return {
        orgId: parts[1]!,
        entityType: parts[2]!,
        entityId: parts[3]!,
        stageKey: parts[4]!,
        templateKey: parts[5]!,
    };
}
