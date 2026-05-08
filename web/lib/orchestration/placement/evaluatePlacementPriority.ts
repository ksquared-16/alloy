import type {
    FactBag,
    FactPredicate,
    FactValue,
    PlacementEvaluateErr,
    PlacementEvaluateInput,
    PlacementEvaluateOk,
    PlacementEvaluateResult,
    PlacementProfile,
    PlacementPrioritySnapshot,
    PlacementReason,
    TieBreakerTraceStep,
} from "@/lib/orchestration/placement/placementPriorityTypes";

function err(e: PlacementEvaluateErr): PlacementEvaluateResult {
    return e;
}

function ok(value: PlacementEvaluateOk): PlacementEvaluateResult {
    return { ok: true, value };
}

function bucketByKey(profile: PlacementProfile, key: string) {
    return profile.buckets.find((b) => b.bucket_key === key) ?? null;
}

export function validatePlacementProfile(profile: PlacementProfile): PlacementEvaluateErr | null {
    if (!profile.profile_id?.trim()) {
        return { ok: false, code: "INVALID_PROFILE", message: "profile_id is required" };
    }
    if (!profile.revision?.trim()) {
        return { ok: false, code: "INVALID_PROFILE", message: "revision is required" };
    }
    if (!Array.isArray(profile.buckets) || profile.buckets.length === 0) {
        return { ok: false, code: "INVALID_PROFILE", message: "buckets must be non-empty" };
    }
    const keys = new Set<string>();
    for (const b of profile.buckets) {
        if (!b.bucket_key?.trim()) {
            return { ok: false, code: "INVALID_PROFILE", message: "bucket_key required on each bucket" };
        }
        if (keys.has(b.bucket_key)) {
            return { ok: false, code: "INVALID_PROFILE", message: `duplicate bucket_key: ${b.bucket_key}` };
        }
        keys.add(b.bucket_key);
        if (!profile.labels[b.label_key]) {
            return {
                ok: false,
                code: "INVALID_PROFILE",
                message: `missing label for label_key: ${b.label_key}`,
                details: { bucket_key: b.bucket_key },
            };
        }
    }
    if (!profile.fallback_bucket_key || !keys.has(profile.fallback_bucket_key)) {
        return { ok: false, code: "INVALID_PROFILE", message: "fallback_bucket_key must reference a bucket" };
    }
    if (!Array.isArray(profile.rules)) {
        return { ok: false, code: "INVALID_PROFILE", message: "rules must be an array" };
    }
    for (const r of profile.rules) {
        if (!keys.has(r.assign_bucket_key)) {
            return {
                ok: false,
                code: "INVALID_PROFILE",
                message: `rule references unknown bucket: ${r.assign_bucket_key}`,
            };
        }
    }
    if (!Array.isArray(profile.tie_breakers)) {
        return { ok: false, code: "INVALID_PROFILE", message: "tie_breakers must be an array" };
    }
    for (const tb of profile.tie_breakers) {
        if (tb.kind !== "fact") {
            return { ok: false, code: "INVALID_PROFILE", message: "only kind fact tie_breakers supported in v1" };
        }
        if (!tb.field?.trim()) {
            return { ok: false, code: "INVALID_PROFILE", message: "tie_breaker field required" };
        }
    }
    const pgk = profile.primary_group_fact_key?.trim();
    if (profile.primary_group_fact_key != null && profile.primary_group_fact_key !== "" && !pgk) {
        return { ok: false, code: "INVALID_PROFILE", message: "primary_group_fact_key must be non-empty when set" };
    }
    return null;
}

export function evaluatePredicate(predicate: FactPredicate, facts: FactBag): boolean {
    if ("all" in predicate) {
        return predicate.all.every((p) => evaluatePredicate(p, facts));
    }
    if ("any" in predicate) {
        return predicate.any.some((p) => evaluatePredicate(p, facts));
    }
    if ("not" in predicate) {
        return !evaluatePredicate(predicate.not, facts);
    }
    if ("fact_present" in predicate) {
        const fv = facts[predicate.fact_present.key];
        return fv?.presence === "present";
    }
    if ("fact_eq" in predicate) {
        const fv = facts[predicate.fact_eq.key];
        if (!fv || fv.presence !== "present") return false;
        return fv.value === predicate.fact_eq.value;
    }
    if ("fact_in" in predicate) {
        const fv = facts[predicate.fact_in.key];
        if (!fv || fv.presence !== "present") return false;
        const s = fv.value == null ? "" : String(fv.value);
        return predicate.fact_in.values.includes(s);
    }
    return false;
}

export function collectPredicateFactKeys(predicate: FactPredicate, out: Set<string>): void {
    if ("all" in predicate) {
        for (const p of predicate.all) collectPredicateFactKeys(p, out);
        return;
    }
    if ("any" in predicate) {
        for (const p of predicate.any) collectPredicateFactKeys(p, out);
        return;
    }
    if ("not" in predicate) {
        collectPredicateFactKeys(predicate.not, out);
        return;
    }
    if ("fact_present" in predicate) {
        out.add(predicate.fact_present.key);
        return;
    }
    if ("fact_eq" in predicate) {
        out.add(predicate.fact_eq.key);
        return;
    }
    if ("fact_in" in predicate) {
        out.add(predicate.fact_in.key);
    }
}

function isoOrNull(fv: FactValue | undefined): string | null {
    if (!fv || fv.presence !== "present") return null;
    if (fv.value == null) return null;
    if (typeof fv.value !== "string") return null;
    const t = fv.value.trim();
    if (!t) return null;
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? t : null;
}

function isoToSortNumber(iso: string | null, direction: "asc" | "desc"): number | null {
    if (iso == null) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    return direction === "asc" ? ms : -ms;
}

function factSortComponent(
    facts: FactBag,
    field: string,
    direction: "asc" | "desc"
): string | number | null {
    const fv = facts[field];
    if (!fv || fv.presence !== "present") return null;
    if (fv.value == null) return null;

    const iso = isoOrNull(fv);
    if (iso != null) {
        return isoToSortNumber(iso, direction);
    }

    if (typeof fv.value === "number" && Number.isFinite(fv.value)) {
        return direction === "asc" ? fv.value : -fv.value;
    }
    const s = String(fv.value).toLowerCase();
    /** Non-date strings: only deterministic ascending lexical order is guaranteed in v1. */
    return s;
}

function buildFactDigest(facts: FactBag): string {
    const keys = Object.keys(facts).filter((k) => facts[k]?.presence === "present");
    keys.sort();
    return keys.join(",");
}

function resolveBucketLabel(profile: PlacementProfile, bucketKey: string): string {
    const b = bucketByKey(profile, bucketKey);
    if (!b) return bucketKey;
    return profile.labels[b.label_key] ?? bucketKey;
}

/**
 * Pure placement priority evaluation — no I/O, no clocks except input.now_ms.
 */
export function evaluatePlacementPriority(input: PlacementEvaluateInput): PlacementEvaluateResult {
    const inv = validatePlacementProfile(input.profile);
    if (inv) return err(inv);

    if (!input.entity?.entity_id?.trim()) {
        return err({ ok: false, code: "INVALID_PROFILE", message: "entity.entity_id is required" });
    }

    const cf = input.profile.cohort_filter;
    if (cf?.queue_keys?.length) {
        const qk = input.cohort.queue_key.trim();
        if (!cf.queue_keys.includes(qk)) {
            return err({
                ok: false,
                code: "UNSUPPORTED_COHORT",
                message: `queue_key ${qk} not supported by profile cohort_filter`,
                details: { queue_key: qk, allowed: cf.queue_keys },
            });
        }
    }
    if (cf?.status_keys?.length && input.cohort.status_keys_allowed?.length) {
        const allowed = new Set(cf.status_keys);
        const okSome = input.cohort.status_keys_allowed.some((s) => allowed.has(s));
        if (!okSome) {
            return err({
                ok: false,
                code: "UNSUPPORTED_COHORT",
                message: "status_keys_allowed does not overlap profile cohort_filter.status_keys",
                details: {
                    status_keys_allowed: input.cohort.status_keys_allowed,
                    cohort_status_keys: cf.status_keys,
                },
            });
        }
    }

    const req = input.profile.required_fact_keys ?? [];
    if (input.profile.strict_required_facts === true) {
        for (const key of req) {
            const fv = input.facts[key];
            if (!fv || fv.presence !== "present") {
                return err({
                    ok: false,
                    code: "FACT_CONSTRAINT_VIOLATION",
                    message: `required fact missing or not present: ${key}`,
                    details: { key },
                });
            }
        }
    }

    const sortedRules = [...input.profile.rules].sort((a, b) => a.rule_order - b.rule_order);

    let matchedBucketKey: string | null = null;
    let matchedRuleFacts: Set<string> | null = null;

    for (const r of sortedRules) {
        if (evaluatePredicate(r.when, input.facts)) {
            matchedBucketKey = r.assign_bucket_key;
            const ks = new Set<string>();
            collectPredicateFactKeys(r.when, ks);
            matchedRuleFacts = ks;
            break;
        }
    }

    const reasons: PlacementReason[] = [];
    const warnings: PlacementEvaluateOk["warnings"] = [];

    if (matchedBucketKey == null) {
        matchedBucketKey = input.profile.fallback_bucket_key;
        reasons.push({
            code: "fallback_bucket",
            bucket_key: matchedBucketKey,
            label: input.profile.labels.reason_fallback ?? "Standard placement tier — no higher-priority rule matched.",
        });
    } else {
        reasons.push({
            code: "rule_matched",
            bucket_key: matchedBucketKey,
            fact_refs: matchedRuleFacts ? [...matchedRuleFacts] : undefined,
            label: input.profile.labels.reason_rule_matched ?? "Placement tier matched policy rules.",
        });
    }

    const bucket = bucketByKey(input.profile, matchedBucketKey);
    if (!bucket) {
        return err({
            ok: false,
            code: "INVALID_PROFILE",
            message: "internal: resolved bucket missing",
            details: { bucket_key: matchedBucketKey },
        });
    }

    for (const key of input.profile.warn_if_unknown_fact_keys ?? []) {
        const fv = input.facts[key];
        if (fv?.presence === "unknown") {
            warnings.push({
                code: "unknown_fact",
                message: input.profile.labels[`warn_unknown_${key}`] ?? `Fact "${key}" is unknown.`,
                fact_keys: [key],
            });
            reasons.push({
                code: "fact_unknown_optional",
                bucket_key: matchedBucketKey,
                fact_refs: [key],
                label:
                    input.profile.labels[`reason_unknown_${key}`] ??
                    `Fact "${key}" could not be verified; ordering uses defaults within this tier.`,
            });
        }
    }

    const tie_breaker_trace: TieBreakerTraceStep[] = [];
    const primaryGroupKey = input.profile.primary_group_fact_key?.trim();
    let programRoomGroupLabel: string | null = null;
    const sortTuple: Array<string | number | null> = [];
    if (primaryGroupKey) {
        const gc = factSortComponent(input.facts, primaryGroupKey, "asc");
        sortTuple.push(gc);
        const gfv = input.facts[primaryGroupKey];
        if (gfv?.presence === "present" && gfv.value != null) {
            const raw = String(gfv.value).trim();
            programRoomGroupLabel = raw.length ? raw : null;
        }
    }
    sortTuple.push(bucket.priority_order);

    let tbIndex = 0;
    for (const tb of input.profile.tie_breakers) {
        const component = factSortComponent(input.facts, tb.field, tb.direction);
        sortTuple.push(component);
        const displayVal =
            component == null
                ? null
                : typeof component === "number"
                  ? component
                  : String(component);
        tie_breaker_trace.push({
            tie_breaker_index: tbIndex,
            field: tb.field,
            direction: tb.direction,
            resolved_a: displayVal,
            resolved_b: displayVal,
        });
        tbIndex += 1;
    }

    sortTuple.push(input.entity.entity_id);

    tie_breaker_trace.push({
        tie_breaker_index: tbIndex,
        field: "__entity_id__",
        direction: "asc",
        resolved_a: input.entity.entity_id,
        resolved_b: input.entity.entity_id,
    });

    const snapshot: PlacementPrioritySnapshot = {
        schema_version: 1,
        evaluator_version: input.evaluator_version,
        profile_id: input.profile.profile_id,
        profile_revision: input.profile.revision,
        evaluated_at_ms: input.now_ms,
        bucket_key: bucket.bucket_key,
        bucket_priority_order: bucket.priority_order,
        bucket_label: resolveBucketLabel(input.profile, bucket.bucket_key),
        sort_tuple: sortTuple,
        fact_digest: buildFactDigest(input.facts),
        ...(primaryGroupKey ? { program_room_group_label: programRoomGroupLabel } : {}),
    };

    return ok({
        snapshot,
        reasons,
        tie_breaker_trace,
        warnings,
    });
}
