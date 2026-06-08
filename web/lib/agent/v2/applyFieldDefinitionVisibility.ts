/**
 * Shared prepare path for `field_definitions` visibility (admin PUT + agent v2).
 * Persistence + audit: Postgres RPC `agent_v2_commit_field_visibility_apply` (atomic).
 */

import {
    getFieldDefinitionLockTimestamp,
    mergeFieldVisibilityFlags,
    parseFieldVisibilityPatchStrict,
    rowToVisibilityFlags,
    type FieldVisibilityFlagsV0,
} from "@/lib/agent/v2/fieldVisibilityConfigV0";

export type PrepareFieldDefinitionVisibilityResult =
    | { ok: true; mergedFlags: FieldVisibilityFlagsV0; patchKeys: string[] }
    | {
          ok: false;
          status: 400;
          error: string;
          code: "VALIDATION_FAILED";
      };

export function prepareFieldDefinitionVisibilityPatch(
    currentRow: Record<string, unknown>,
    patchRaw: unknown
): PrepareFieldDefinitionVisibilityResult {
    const parsed = parseFieldVisibilityPatchStrict(patchRaw);
    if (!parsed.ok) {
        return { ok: false, status: 400, error: parsed.error, code: "VALIDATION_FAILED" };
    }
    const current = rowToVisibilityFlags(currentRow);
    const merged = mergeFieldVisibilityFlags(current, parsed.value);
    return { ok: true, mergedFlags: merged, patchKeys: parsed.keysTouched };
}

export function lockTimestampMatches(row: Record<string, unknown>, expectedUpdatedAt: string): boolean {
    const lock = getFieldDefinitionLockTimestamp(row);
    const exp = expectedUpdatedAt.trim();
    if (!exp) return false;
    if (lock == null) return false;
    return normalizeIso(lock) === normalizeIso(exp);
}

function normalizeIso(s: string): string {
    const t = Date.parse(s);
    if (Number.isNaN(t)) return s;
    return new Date(t).toISOString();
}
