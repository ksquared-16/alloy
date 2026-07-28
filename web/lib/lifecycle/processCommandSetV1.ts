/**
 * Business Process `command_set_v1` — sole target process-wide Command selection authority (P6.S1).
 *
 * Domain-neutral: references canonical Capability identities only.
 * Does not define executors, mutation payloads, Automations, UI placement, or permissions.
 *
 * Stage `action_catalog_v1` remains recommendation/evaluation metadata and may only
 * meaningfully reference Commands already selected here.
 *
 * @see qa/missions/commands-p6-process-command-authority-msn_188e8bea6fb6de28dd21.md
 */

export type BusinessProcessCommandAvailabilityV1 = {
    /** Optional surface/context hints — not authorization. */
    contexts?: readonly string[];
};

export type BusinessProcessCommandProcessPolicyV1 = {
    required?: boolean;
    recommended?: boolean;
};

export type BusinessProcessCommandSetEntryV1 = {
    /** Canonical (or alias) capability key — aliases resolve at effective resolution. */
    capability_key: string;
    /** Process-selected; false keeps the row inspectable but inactive. */
    enabled: boolean;
    /** Optional org-configured variant overlay key (P8 product). Does not change executor. */
    variant_key?: string;
    availability?: BusinessProcessCommandAvailabilityV1;
    process_policy?: BusinessProcessCommandProcessPolicyV1;
};

export type BusinessProcessCommandSetV1 = {
    version: 1;
    commands: BusinessProcessCommandSetEntryV1[];
};

export type ProcessCommandSetParseIssue = {
    code:
        | "invalid_shape"
        | "unsupported_version"
        | "duplicate_canonical"
        | "empty_capability_key"
        | "rejected_field";
    message: string;
    capability_key?: string;
};

export type ProcessCommandSetParseResult =
    | { ok: true; value: BusinessProcessCommandSetV1; issues: readonly ProcessCommandSetParseIssue[] }
    | { ok: false; value: null; issues: readonly ProcessCommandSetParseIssue[] };

function trim(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

function readCapabilityKey(row: Record<string, unknown>): string {
    return trim(row.capability_key) || trim(row.capabilityKey);
}

function readVariantKey(row: Record<string, unknown>): string | undefined {
    const v = trim(row.variant_key) || trim(row.variantKey);
    return v || undefined;
}

const REJECTED_ENTRY_FIELDS = [
    "executor",
    "execution_owner",
    "mutation",
    "mutation_payload",
    "handler",
    "automation",
    "automation_rules",
    "permission",
    "permissions",
] as const;

/**
 * Parse `command_set_v1`. Unknown version / invalid shape → fail closed.
 * Duplicate capability keys (after trim) keep the first and diagnose.
 * Rejected executor/mutation/automation fields are diagnosed and ignored.
 */
export function parseProcessCommandSetV1(raw: unknown): ProcessCommandSetParseResult {
    if (raw == null) {
        return {
            ok: false,
            value: null,
            issues: [{ code: "invalid_shape", message: "command_set_v1 is null or missing." }],
        };
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return {
            ok: false,
            value: null,
            issues: [{ code: "invalid_shape", message: "command_set_v1 must be an object." }],
        };
    }
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) {
        return {
            ok: false,
            value: null,
            issues: [
                {
                    code: "unsupported_version",
                    message: `Unsupported command_set version: ${String(o.version)}.`,
                },
            ],
        };
    }
    if (!Array.isArray(o.commands)) {
        return {
            ok: false,
            value: null,
            issues: [{ code: "invalid_shape", message: "command_set_v1.commands must be an array." }],
        };
    }

    const issues: ProcessCommandSetParseIssue[] = [];
    const commands: BusinessProcessCommandSetEntryV1[] = [];
    const seen = new Set<string>();

    for (const item of o.commands) {
        if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
        const row = item as Record<string, unknown>;
        for (const field of REJECTED_ENTRY_FIELDS) {
            if (field in row) {
                issues.push({
                    code: "rejected_field",
                    message: `Process command selection cannot define '${field}'.`,
                    capability_key: readCapabilityKey(row) || undefined,
                });
            }
        }
        const capability_key = readCapabilityKey(row);
        if (!capability_key) {
            issues.push({ code: "empty_capability_key", message: "Empty capability_key skipped." });
            continue;
        }
        if (seen.has(capability_key)) {
            issues.push({
                code: "duplicate_canonical",
                message: `Duplicate capability_key '${capability_key}' — first entry retained.`,
                capability_key,
            });
            continue;
        }
        seen.add(capability_key);

        const enabled = row.enabled !== false;
        const variant_key = readVariantKey(row);
        const availabilityRaw =
            row.availability != null && typeof row.availability === "object" && !Array.isArray(row.availability)
                ? (row.availability as Record<string, unknown>)
                : null;
        const contexts = Array.isArray(availabilityRaw?.contexts)
            ? availabilityRaw!.contexts!
                  .map((c) => trim(c))
                  .filter(Boolean)
            : undefined;
        const policyRaw =
            row.process_policy != null && typeof row.process_policy === "object" && !Array.isArray(row.process_policy)
                ? (row.process_policy as Record<string, unknown>)
                : row.processPolicy != null && typeof row.processPolicy === "object" && !Array.isArray(row.processPolicy)
                  ? (row.processPolicy as Record<string, unknown>)
                  : null;

        const entry: BusinessProcessCommandSetEntryV1 = {
            capability_key,
            enabled,
            ...(variant_key ? { variant_key } : {}),
            ...(contexts && contexts.length
                ? { availability: { contexts: [...contexts] } }
                : {}),
            ...(policyRaw
                ? {
                      process_policy: {
                          ...(typeof policyRaw.required === "boolean" ? { required: policyRaw.required } : {}),
                          ...(typeof policyRaw.recommended === "boolean"
                              ? { recommended: policyRaw.recommended }
                              : {}),
                      },
                  }
                : {}),
        };
        commands.push(entry);
    }

    return { ok: true, value: { version: 1, commands }, issues };
}

/** Lenient parse for lifecycle builder JSON — invalid → undefined (omit field). */
export function parseProcessCommandSetV1OrNull(raw: unknown): BusinessProcessCommandSetV1 | null {
    const parsed = parseProcessCommandSetV1(raw);
    return parsed.ok ? parsed.value : null;
}

export function emptyProcessCommandSetV1(): BusinessProcessCommandSetV1 {
    return { version: 1, commands: [] };
}

export function commandSetHasEnabledKey(
    set: BusinessProcessCommandSetV1 | null | undefined,
    capabilityKey: string,
    resolveCanonical: (key: string) => string = (k) => k
): boolean {
    if (!set) return false;
    const want = resolveCanonical(capabilityKey.trim());
    if (!want) return false;
    return set.commands.some((c) => c.enabled && resolveCanonical(c.capability_key) === want);
}

export function listEnabledCommandKeys(
    set: BusinessProcessCommandSetV1 | null | undefined,
    resolveCanonical: (key: string) => string = (k) => k
): string[] {
    if (!set) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const c of set.commands) {
        if (!c.enabled) continue;
        const canon = resolveCanonical(c.capability_key.trim());
        if (!canon || seen.has(canon)) continue;
        seen.add(canon);
        out.push(canon);
    }
    return out;
}
