import type { PlacementOverrideKind } from "@/lib/orchestration/placement/placementCandidateTypes";
import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";

export const PLACEMENT_OVERRIDE_PIN_ORDINAL_MIN = 1;
export const PLACEMENT_OVERRIDE_PIN_ORDINAL_MAX = 999;
export const PLACEMENT_OVERRIDE_UNPINNED_PRECEDENCE = 1_000_000;

export type ParsedPlacementOverridePayload = {
    pin_ordinal?: number;
    effective_bucket_key?: string;
};

function readPayloadObject(raw: unknown): Record<string, unknown> {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    return {};
}

export function parsePlacementOverridePayload(raw: unknown): ParsedPlacementOverridePayload {
    const o = readPayloadObject(raw);
    const out: ParsedPlacementOverridePayload = {};
    const pin = o.pin_ordinal;
    if (typeof pin === "number" && Number.isFinite(pin)) {
        out.pin_ordinal = Math.trunc(pin);
    } else if (typeof pin === "string" && pin.trim()) {
        const n = Number.parseInt(pin.trim(), 10);
        if (Number.isFinite(n)) out.pin_ordinal = n;
    }
    const bucket = o.effective_bucket_key;
    if (typeof bucket === "string" && bucket.trim()) {
        out.effective_bucket_key = bucket.trim();
    }
    return out;
}

export function validatePlacementOverrideCreateBody(params: {
    override_kind: PlacementOverrideKind;
    reason: string;
    payload: ParsedPlacementOverridePayload;
    expires_at?: string | null;
    profile?: PlacementProfile;
}): string | null {
    const reason = params.reason.trim();
    if (!reason) return "reason is required";

    if (params.override_kind === "temporary" && !params.expires_at?.trim()) {
        return "expires_at is required for temporary overrides";
    }

    if (params.override_kind === "pin") {
        const pin = params.payload.pin_ordinal;
        if (pin == null || pin < PLACEMENT_OVERRIDE_PIN_ORDINAL_MIN || pin > PLACEMENT_OVERRIDE_PIN_ORDINAL_MAX) {
            return `pin_ordinal must be between ${PLACEMENT_OVERRIDE_PIN_ORDINAL_MIN} and ${PLACEMENT_OVERRIDE_PIN_ORDINAL_MAX}`;
        }
    }

    if (params.override_kind === "tier_boost") {
        const key = params.payload.effective_bucket_key;
        if (!key) return "effective_bucket_key is required for tier_boost overrides";
        if (params.profile && !params.profile.buckets.some((b) => b.bucket_key === key)) {
            return `unknown effective_bucket_key: ${key}`;
        }
    }

    if (params.override_kind === "temporary") {
        const hasPin =
            params.payload.pin_ordinal != null &&
            params.payload.pin_ordinal >= PLACEMENT_OVERRIDE_PIN_ORDINAL_MIN;
        const hasBucket = Boolean(params.payload.effective_bucket_key?.trim());
        if (!hasPin && !hasBucket) {
            return "temporary override requires pin_ordinal or effective_bucket_key in payload";
        }
        if (hasPin && params.payload.pin_ordinal! > PLACEMENT_OVERRIDE_PIN_ORDINAL_MAX) {
            return `pin_ordinal must be <= ${PLACEMENT_OVERRIDE_PIN_ORDINAL_MAX}`;
        }
        if (hasBucket && params.profile) {
            const key = params.payload.effective_bucket_key!;
            if (!params.profile.buckets.some((b) => b.bucket_key === key)) {
                return `unknown effective_bucket_key: ${key}`;
            }
        }
    }

    return null;
}

export function buildPlacementOverridePayloadForInsert(
    kind: PlacementOverrideKind,
    payload: ParsedPlacementOverridePayload
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (payload.pin_ordinal != null) out.pin_ordinal = payload.pin_ordinal;
    if (payload.effective_bucket_key) out.effective_bucket_key = payload.effective_bucket_key;
    if (kind === "tier_boost" && payload.effective_bucket_key) {
        out.effective_bucket_key = payload.effective_bucket_key;
    }
    return out;
}
