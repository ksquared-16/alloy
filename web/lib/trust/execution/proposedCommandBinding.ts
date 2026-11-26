/**
 * Proposed command binding — governed intent, never an executable payload.
 *
 * A Decision Package may NAME a registered Operational Command and carry bounded
 * intent data for it. It may not carry the means to execute anything. This
 * module defines that line and enforces it structurally: a binding admits only
 * a command key, a subject reference and bounded scalar inputs, and parsing
 * refuses anything else.
 *
 * Two shapes, deliberately separate:
 *
 *   - {@link TrustProposedCommandBindingV1} — what the recommendation DECLARES.
 *     It carries no package identity and no fingerprint, because it lives inside
 *     the package it would describe.
 *   - {@link TrustResolvedExecutionBinding} — the declared binding plus the
 *     package identity, contract identity, decision class and fingerprint,
 *     computed by the platform. This is what a confirmation binds to and what an
 *     executor is handed.
 *
 * The binding does NOT declare whether confirmation is required. That is the
 * command catalog's answer, and letting a Decision Package assert it would make
 * Trust an authority on command policy.
 *
 * Pure. No I/O, no catalog, no execution.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.5
 */

import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import { fingerprintDecisionPackage } from "@/lib/trust/execution/decisionPackageFingerprint";

/** Bumped when the declared shape changes. An unknown version refuses. */
export const TRUST_BINDING_VERSION = 1 as const;
export type TrustBindingVersion = typeof TRUST_BINDING_VERSION;

/** The key a recommendation uses to declare a command binding. */
export const PROPOSED_COMMAND_KEY = "proposed_command" as const;

/**
 * What a bounded input value may be.
 *
 * Scalars and flat arrays of scalars only. No nested objects, so a binding can
 * never grow into a free-form mutation payload; no functions, so it can never
 * carry executable behaviour.
 */
export type TrustBoundedInputValue = string | number | boolean | null | readonly (string | number | boolean)[];

/** Hard ceilings, so a "bounded input" is bounded in fact and not just in name. */
export const BOUNDED_INPUT_LIMITS = {
    maxKeys: 24,
    maxStringLength: 512,
    maxArrayLength: 32,
} as const;

/**
 * Input keys a binding may never carry.
 *
 * Not a security control on its own — the positive shape rules above are what
 * actually contain a binding. This is a second, legible line that makes an
 * attempt to smuggle a credential or a query obvious at review time.
 */
export const FORBIDDEN_INPUT_KEYS: readonly string[] = [
    "sql",
    "query",
    "statement",
    "table",
    "table_name",
    "schema",
    "exec",
    "execute",
    "script",
    "handler",
    "callback",
    "fn",
    "payload",
    "raw",
    "api_key",
    "apikey",
    "token",
    "secret",
    "password",
    "credential",
    "credentials",
    "connection_string",
    "dsn",
    "authorization",
    "bearer",
];

/** Where the command's subject comes from. */
export type TrustProposedSubject =
    | { readonly kind: "reference"; readonly entity_type: string; readonly entity_id: string }
    /** The command needs a subject the recommendation cannot name; the surface supplies it. */
    | { readonly kind: "resolution_required"; readonly entity_type: string };

/** What a Decision Package's recommendation declares. */
export type TrustProposedCommandBindingV1 = {
    readonly binding_version: TrustBindingVersion;
    /** A registered Operational Command key. Never a function, never a route. */
    readonly command_key: string;
    readonly subject: TrustProposedSubject;
    readonly inputs: Readonly<Record<string, TrustBoundedInputValue>>;
};

/** The declared binding plus the platform-computed identity it must be confirmed against. */
export type TrustResolvedExecutionBinding = {
    readonly binding_version: TrustBindingVersion;
    readonly command_key: string;
    readonly subject: TrustProposedSubject;
    readonly inputs: Readonly<Record<string, TrustBoundedInputValue>>;

    readonly package_id: string;
    readonly contract_id: string;
    readonly org_id: string;
    readonly decision_class_key: string;
    readonly package_fingerprint: string;
    /**
     * Deterministic seed a caller may hand the command runtime as its
     * idempotency key. Trust derives it; the runtime remains authoritative for
     * what idempotency means.
     */
    readonly invocation_seed: string;
};

export const BINDING_PARSE_ERROR_CODES = [
    "NO_BINDING_DECLARED",
    "UNSUPPORTED_BINDING_VERSION",
    "INVALID_RECOMMENDATION_SHAPE",
    "INVALID_COMMAND_KEY",
    "INVALID_SUBJECT",
    "FORBIDDEN_INPUT_KEY",
    "UNBOUNDED_INPUT_VALUE",
    "TOO_MANY_INPUTS",
] as const;
export type BindingParseErrorCode = (typeof BINDING_PARSE_ERROR_CODES)[number];

export type BindingParseResult =
    | { readonly ok: true; readonly binding: TrustProposedCommandBindingV1 }
    | { readonly ok: false; readonly code: BindingParseErrorCode; readonly detail: string };

function isRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

function nonEmptyString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseBoundedValue(key: string, raw: unknown): { ok: true; value: TrustBoundedInputValue } | { ok: false; detail: string } {
    if (raw === null) return { ok: true, value: null };
    if (typeof raw === "boolean") return { ok: true, value: raw };
    if (typeof raw === "number") {
        return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, detail: `input "${key}" is not a finite number` };
    }
    if (typeof raw === "string") {
        return raw.length <= BOUNDED_INPUT_LIMITS.maxStringLength
            ? { ok: true, value: raw }
            : { ok: false, detail: `input "${key}" exceeds ${BOUNDED_INPUT_LIMITS.maxStringLength} characters` };
    }
    if (Array.isArray(raw)) {
        if (raw.length > BOUNDED_INPUT_LIMITS.maxArrayLength) {
            return { ok: false, detail: `input "${key}" exceeds ${BOUNDED_INPUT_LIMITS.maxArrayLength} entries` };
        }
        const out: (string | number | boolean)[] = [];
        for (const entry of raw) {
            if (typeof entry === "string") {
                if (entry.length > BOUNDED_INPUT_LIMITS.maxStringLength) {
                    return { ok: false, detail: `input "${key}" contains an over-long string` };
                }
                out.push(entry);
            } else if (typeof entry === "number" && Number.isFinite(entry)) {
                out.push(entry);
            } else if (typeof entry === "boolean") {
                out.push(entry);
            } else {
                // A nested object or a function inside an array is exactly the
                // "unrestricted mutation payload" this contract exists to refuse.
                return { ok: false, detail: `input "${key}" contains a non-scalar entry` };
            }
        }
        return { ok: true, value: Object.freeze(out) };
    }
    return { ok: false, detail: `input "${key}" is neither a scalar nor a flat array of scalars` };
}

/**
 * Parses a binding out of a Decision Package recommendation.
 *
 * Refuses rather than coerces. A recommendation that declares nothing is not an
 * error — most recommendations propose no command at all.
 */
export function parseProposedCommandBinding(recommendation: unknown): BindingParseResult {
    if (!isRecord(recommendation)) {
        return { ok: false, code: "INVALID_RECOMMENDATION_SHAPE", detail: "The recommendation is not an object." };
    }
    const raw = recommendation[PROPOSED_COMMAND_KEY];
    if (raw === undefined || raw === null) {
        return { ok: false, code: "NO_BINDING_DECLARED", detail: "The recommendation declares no proposed command." };
    }
    if (!isRecord(raw)) {
        return { ok: false, code: "INVALID_RECOMMENDATION_SHAPE", detail: `"${PROPOSED_COMMAND_KEY}" is not an object.` };
    }

    if (raw.binding_version !== TRUST_BINDING_VERSION) {
        return {
            ok: false,
            code: "UNSUPPORTED_BINDING_VERSION",
            detail: `Binding version ${String(raw.binding_version)} is not supported; this runtime speaks version ${TRUST_BINDING_VERSION}.`,
        };
    }

    const commandKey = nonEmptyString(raw.command_key);
    if (!commandKey) {
        return { ok: false, code: "INVALID_COMMAND_KEY", detail: "The binding names no command key." };
    }

    const subjectRaw = raw.subject;
    if (!isRecord(subjectRaw)) {
        return { ok: false, code: "INVALID_SUBJECT", detail: "The binding declares no subject." };
    }
    const entityType = nonEmptyString(subjectRaw.entity_type);
    if (!entityType) {
        return { ok: false, code: "INVALID_SUBJECT", detail: "The binding's subject names no entity type." };
    }
    let subject: TrustProposedSubject;
    if (subjectRaw.resolution_required === true) {
        subject = { kind: "resolution_required", entity_type: entityType };
    } else {
        const entityId = nonEmptyString(subjectRaw.entity_id);
        if (!entityId) {
            return {
                ok: false,
                code: "INVALID_SUBJECT",
                detail: "The binding's subject names no entity id and does not require resolution.",
            };
        }
        subject = { kind: "reference", entity_type: entityType, entity_id: entityId };
    }

    const inputsRaw = raw.inputs === undefined || raw.inputs === null ? {} : raw.inputs;
    if (!isRecord(inputsRaw)) {
        return { ok: false, code: "INVALID_RECOMMENDATION_SHAPE", detail: "The binding's inputs are not an object." };
    }
    const inputKeys = Object.keys(inputsRaw);
    if (inputKeys.length > BOUNDED_INPUT_LIMITS.maxKeys) {
        return {
            ok: false,
            code: "TOO_MANY_INPUTS",
            detail: `The binding declares ${inputKeys.length} inputs; the ceiling is ${BOUNDED_INPUT_LIMITS.maxKeys}.`,
        };
    }
    const inputs: Record<string, TrustBoundedInputValue> = {};
    for (const key of inputKeys) {
        if (FORBIDDEN_INPUT_KEYS.includes(key.toLowerCase())) {
            return {
                ok: false,
                code: "FORBIDDEN_INPUT_KEY",
                detail: `Input key "${key}" is forbidden in a command binding. A binding carries governed intent, never a payload, a query or a credential.`,
            };
        }
        const parsed = parseBoundedValue(key, inputsRaw[key]);
        if (!parsed.ok) {
            return { ok: false, code: "UNBOUNDED_INPUT_VALUE", detail: parsed.detail };
        }
        inputs[key] = parsed.value;
    }

    return {
        ok: true,
        binding: Object.freeze({
            binding_version: TRUST_BINDING_VERSION,
            command_key: commandKey,
            subject,
            inputs: Object.freeze(inputs),
        }),
    };
}

/** True when a recommendation declares a binding at all, well-formed or not. */
export function declaresProposedCommand(recommendation: unknown): boolean {
    return isRecord(recommendation) && recommendation[PROPOSED_COMMAND_KEY] != null;
}

/**
 * Deterministic invocation seed.
 *
 * Same package, same fingerprint, same command → same seed, so a replay carries
 * the idempotency key the first attempt used. Trust derives it; the Operational
 * Command Runtime decides what to do with it.
 */
export function deriveInvocationSeed(input: {
    package_id: string;
    package_fingerprint: string;
    command_key: string;
}): string {
    // Reuses the fingerprint's digest rather than hashing again: the fingerprint
    // already covers the package, so the seed only needs the command to differ.
    return `trust:${input.package_id}:${input.command_key}:${input.package_fingerprint.split(":").pop() ?? ""}`.slice(
        0,
        200,
    );
}

/** Binds a declared binding to the package it came from. Pure; the package is read only. */
export function resolveExecutionBinding(
    pkg: DecisionPackageV1,
    binding: TrustProposedCommandBindingV1,
): TrustResolvedExecutionBinding {
    const fingerprint = fingerprintDecisionPackage(pkg);
    return Object.freeze({
        binding_version: binding.binding_version,
        command_key: binding.command_key,
        subject: binding.subject,
        inputs: binding.inputs,
        package_id: pkg.id,
        contract_id: pkg.contract_id,
        org_id: pkg.org_id,
        decision_class_key: pkg.decision_class_key,
        package_fingerprint: fingerprint,
        invocation_seed: deriveInvocationSeed({
            package_id: pkg.id,
            package_fingerprint: fingerprint,
            command_key: binding.command_key,
        }),
    });
}
