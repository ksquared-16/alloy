/**
 * Validated `metadata.enrollment_operational` subtree (GATE 3).
 */

import {
    ENROLLMENT_WAIT_BUCKETS,
    type EnrollmentWaitBucket,
    isEnrollmentWaitBucket,
} from "@/lib/opportunities/attentionPlatformCatalog";

export type EnrollmentOperationalValidated = {
    wait_bucket: EnrollmentWaitBucket;
    wait_since: string | null;
    wait_reason: string | null;
    next_expected_action_owner: string | null;
    next_expected_action_at: string | null;
};

const MAX_STRING = 2000;

function trimOrNull(raw: unknown, maxLen: number): string | null {
    if (raw == null) return null;
    if (typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) return null;
    return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function parseIsoInstant(raw: unknown): string | null {
    const s = trimOrNull(raw, 64);
    if (!s) return null;
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? s : null;
}

/** Read-only parse from opportunity metadata root. */
export function parseEnrollmentOperationalFromMetadata(metadata: Record<string, unknown> | null): EnrollmentOperationalValidated {
    const empty: EnrollmentOperationalValidated = {
        wait_bucket: "none",
        wait_since: null,
        wait_reason: null,
        next_expected_action_owner: null,
        next_expected_action_at: null,
    };
    if (!metadata) return empty;
    const raw = metadata.enrollment_operational;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return empty;
    const o = raw as Record<string, unknown>;

    const wbRaw = typeof o.wait_bucket === "string" ? o.wait_bucket.trim().toLowerCase() : "";
    const wait_bucket: EnrollmentWaitBucket =
        wbRaw && isEnrollmentWaitBucket(wbRaw) ? wbRaw : wbRaw === "" || wbRaw === "null" ? "none" : "none";

    return {
        wait_bucket,
        wait_since: parseIsoInstant(o.wait_since),
        wait_reason: trimOrNull(o.wait_reason, MAX_STRING),
        next_expected_action_owner: trimOrNull(o.next_expected_action_owner, 256),
        next_expected_action_at: parseIsoInstant(o.next_expected_action_at),
    };
}

/**
 * Validates a client patch (e.g. admin API body). Unknown keys ignored.
 * Returns a normalized object suitable for merging into metadata.
 */
export function sanitizeEnrollmentOperationalPatch(raw: unknown): Partial<EnrollmentOperationalValidated> | null {
    if (raw == null) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const out: Partial<EnrollmentOperationalValidated> = {};

    if ("wait_bucket" in o) {
        const wbRaw = typeof o.wait_bucket === "string" ? o.wait_bucket.trim().toLowerCase() : "";
        if (!wbRaw || wbRaw === "none" || wbRaw === "null") {
            out.wait_bucket = "none";
        } else if (isEnrollmentWaitBucket(wbRaw)) {
            out.wait_bucket = wbRaw;
        }
    }
    if ("wait_since" in o) {
        const ws = o.wait_since;
        if (ws === null || ws === "") out.wait_since = null;
        else {
            const p = parseIsoInstant(ws);
            if (p) out.wait_since = p;
        }
    }
    if ("wait_reason" in o) {
        const wr = o.wait_reason;
        out.wait_reason = wr === null || wr === "" ? null : trimOrNull(wr, MAX_STRING);
    }
    if ("next_expected_action_owner" in o) {
        const v = o.next_expected_action_owner;
        out.next_expected_action_owner = v === null || v === "" ? null : trimOrNull(v, 256);
    }
    if ("next_expected_action_at" in o) {
        const v = o.next_expected_action_at;
        if (v === null || v === "") out.next_expected_action_at = null;
        else {
            const p = parseIsoInstant(v);
            if (p) out.next_expected_action_at = p;
        }
    }

    return Object.keys(out).length ? out : null;
}

function enrollmentOperationalToStoredShape(m: EnrollmentOperationalValidated): Record<string, unknown> {
    const eo: Record<string, unknown> = { wait_bucket: m.wait_bucket };
    if (m.wait_since != null) eo.wait_since = m.wait_since;
    if (m.wait_reason != null) eo.wait_reason = m.wait_reason;
    if (m.next_expected_action_owner != null) eo.next_expected_action_owner = m.next_expected_action_owner;
    if (m.next_expected_action_at != null) eo.next_expected_action_at = m.next_expected_action_at;
    return eo;
}

/** Deep-merge validated enrollment_operational into existing metadata (returns new metadata object). */
export function mergeEnrollmentOperationalIntoMetadata(
    existingMetadata: Record<string, unknown> | null | undefined,
    patch: Partial<EnrollmentOperationalValidated>
): Record<string, unknown> {
    const base =
        existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
            ? { ...existingMetadata }
            : {};
    const current = parseEnrollmentOperationalFromMetadata(base as Record<string, unknown>);
    const merged: EnrollmentOperationalValidated = { ...current, ...patch };
    base.enrollment_operational = enrollmentOperationalToStoredShape(merged);
    return base;
}
