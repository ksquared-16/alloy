/**
 * Deterministic grounding signal normalization (Phase 1 / Card 1.3).
 */

import type { RawGroundingSignalInputV1 } from "@/lib/adminV2/bos/recommendations/signals/operationalRecommendationSignals";
import { MAX_GROUNDING_SIGNALS_V1 } from "@/lib/adminV2/bos/recommendations/signals/operationalRecommendationSignals";
import type { GroundingSignalV1 } from "@/lib/adminV2/bos/recommendations/types";
import { GROUNDING_SIGNAL_SOURCE_TYPES_V1 } from "@/lib/adminV2/bos/recommendations/types";

export class OperationalRecommendationSignalError extends Error {
    readonly path: string;

    constructor(path: string, message: string) {
        super(`operational_recommendation_signal:${path}: ${message}`);
        this.name = "OperationalRecommendationSignalError";
        this.path = path;
    }
}

const CODE_RE = /^[a-z][a-z0-9_]*$/;

function fail(path: string, message: string): never {
    throw new OperationalRecommendationSignalError(path, message);
}

function trimUiSafe(text: string, max: number): string {
    return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function dedupeKey(signal: {
    code: string;
    source_type: string;
    source_id: string | null;
}): string {
    return `${signal.code}|${signal.source_type}|${signal.source_id ?? ""}`;
}

function validateRawSignal(raw: RawGroundingSignalInputV1, index: number): RawGroundingSignalInputV1 {
    const path = `raw_signals[${index}]`;
    const code = String(raw.code ?? "").trim();
    if (!code || !CODE_RE.test(code)) {
        fail(`${path}.code`, "expected snake_case code");
    }
    const label = trimUiSafe(String(raw.label ?? ""), 120);
    if (!label) fail(`${path}.label`, "required non-empty label");
    const source_type = String(raw.source_type ?? "").trim();
    if (!(GROUNDING_SIGNAL_SOURCE_TYPES_V1 as readonly string[]).includes(source_type)) {
        fail(`${path}.source_type`, "invalid source_type");
    }
    const provenance = trimUiSafe(String(raw.provenance ?? ""), 120);
    if (!provenance) fail(`${path}.provenance`, "required provenance");
    return {
        ...raw,
        code,
        label,
        source_type: source_type as RawGroundingSignalInputV1["source_type"],
        provenance,
        value_hint: raw.value_hint != null ? trimUiSafe(String(raw.value_hint), 80) : undefined,
        priority: typeof raw.priority === "number" && Number.isFinite(raw.priority) ? raw.priority : 50,
        reason_code: raw.reason_code != null ? String(raw.reason_code).trim() || null : null,
        source_id: raw.source_id != null ? String(raw.source_id).trim() || null : null,
    };
}

function rawToGroundingSignal(raw: RawGroundingSignalInputV1): GroundingSignalV1 {
    const out: GroundingSignalV1 = {
        code: raw.code,
        label: raw.label,
        source_type: raw.source_type,
        provenance: raw.provenance,
        priority: raw.priority ?? 50,
    };
    if (raw.severity) out.severity = raw.severity;
    if (raw.sla_tier) out.sla_tier = raw.sla_tier;
    if (raw.value_hint) out.value_hint = raw.value_hint;
    if (raw.reason_code) out.reason_code = raw.reason_code;
    return out;
}

/**
 * Normalize, dedupe, cap, and sort signals deterministically.
 * Phase 1: `source_signal` and `grounding_signals` are identical arrays.
 */
export function normalizeGroundingSignals(rawSignals: RawGroundingSignalInputV1[]): GroundingSignalV1[] {
    const validated = rawSignals.map((r, i) => validateRawSignal(r, i));
    const seen = new Set<string>();
    const deduped: GroundingSignalV1[] = [];

    for (const raw of validated) {
        const key = dedupeKey({
            code: raw.code,
            source_type: raw.source_type,
            source_id: raw.source_id ?? null,
        });
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(rawToGroundingSignal(raw));
    }

    deduped.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.code.localeCompare(b.code);
    });

    return deduped.slice(0, MAX_GROUNDING_SIGNALS_V1);
}

/** Stable hash input for signal ordering in fingerprint (codes only). */
export function normalizedSignalCodesForFingerprint(signals: GroundingSignalV1[]): string[] {
    return signals.map((s) => s.code).slice().sort((a, b) => a.localeCompare(b));
}

export function assertRequiredCatalogSignalsPresent(
    requiredCodes: string[],
    normalized: GroundingSignalV1[]
): void {
    const present = new Set(normalized.map((s) => s.code));
    for (const req of requiredCodes) {
        const ok =
            present.has(req) ||
            [...present].some((c) => c === req || c.startsWith(`${req}_`) || req.startsWith(c));
        if (!ok) {
            fail(
                "required_grounding_signals",
                `missing required grounding signal: ${req} (have: ${[...present].join(", ")})`
            );
        }
    }
}
