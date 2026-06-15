/**
 * Layout runtime opportunity native field edits — writes PATCH opportunity column.
 */

import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const OPPORTUNITY_NATIVE_REF_KEYS = {
    "opportunity.location_id": "location_id",
} as const;

export type LayoutRuntimeOpportunityNativeRefKey = keyof typeof OPPORTUNITY_NATIVE_REF_KEYS;

export const LAYOUT_RUNTIME_OPPORTUNITY_NATIVE_EDITABLE_REF_KEYS = Object.keys(
    OPPORTUNITY_NATIVE_REF_KEYS,
) as LayoutRuntimeOpportunityNativeRefKey[];

export function isLayoutRuntimeOpportunityNativeRefKey(refKey: string): refKey is LayoutRuntimeOpportunityNativeRefKey {
    const normalized = normalizeRefKeyOnRead(refKey.trim());
    return normalized in OPPORTUNITY_NATIVE_REF_KEYS;
}

function trimUuid(value: string): string | null {
    const t = value.trim();
    return t.length > 0 ? t : null;
}

export function buildLayoutRuntimeOpportunityNativePatch(
    baseline: Record<string, string>,
    draft: Record<string, string>,
): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const refKey of LAYOUT_RUNTIME_OPPORTUNITY_NATIVE_EDITABLE_REF_KEYS) {
        if ((draft[refKey] ?? "") === (baseline[refKey] ?? "")) continue;
        const bodyKey = OPPORTUNITY_NATIVE_REF_KEYS[refKey];
        patch[bodyKey] = trimUuid(draft[refKey] ?? "");
    }
    return patch;
}

export async function patchOpportunityNativeFromLayoutDrawer(params: {
    opportunityId: string;
    body: Record<string, unknown>;
    fetchFn?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const fetchImpl = params.fetchFn ?? fetch;
    const res = await fetchImpl(`/api/admin/opportunities/${encodeURIComponent(params.opportunityId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params.body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
        return { ok: false, error: json.error ?? "Lead save failed" };
    }
    return { ok: true };
}

export async function saveLayoutRuntimeOpportunityNativeEdits(input: {
    record: ProofRuntimeRecord;
    baseline: Record<string, string>;
    draft: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const opportunityId = String(input.record.id ?? "").trim();
    if (!opportunityId) {
        return { ok: false, error: "Lead record is missing an id." };
    }
    const body = buildLayoutRuntimeOpportunityNativePatch(input.baseline, input.draft);
    if (Object.keys(body).length === 0) return { ok: true };
    return patchOpportunityNativeFromLayoutDrawer({ opportunityId, body });
}

export function collectLayoutRuntimeOpportunityNativeBaseline(record: ProofRuntimeRecord): Record<string, string> {
    const out: Record<string, string> = {};
    for (const refKey of LAYOUT_RUNTIME_OPPORTUNITY_NATIVE_EDITABLE_REF_KEYS) {
        const raw = record[refKey] ?? record.location_id;
        out[refKey] = raw == null ? "" : String(raw);
    }
    return out;
}
