/**
 * BP V2 Slice 1 — how a Business Process executes, declared on the process (`process_model_v1`).
 *
 * ## Two models, one configuration contract
 *
 * ```
 *   staged_lifecycle    records move through authored stages (Enrollment). Stages, tracks, entry
 *                       points and stage Work Views are the execution model.
 *   domain_projection   the process READS another domain's authority (Assignments → Scheduling,
 *                       Billing → Financials). It has no stages of its own, and it never persists a
 *                       synthetic stage to look like a lifecycle.
 * ```
 *
 * Both use the same draft → validate → publish → department projection chain; only what a
 * published process may contain differs, and publication enforces that difference.
 *
 * ## Absent means staged_lifecycle
 *
 * Every revision published before this field existed is a staged lifecycle, so absence resolves to
 * `staged_lifecycle` and nothing already published changes meaning. That is the one default here.
 * An authored value the platform does not recognise is NOT defaulted: the parser drops it (it cannot
 * type it), and publication reads the raw payload and refuses it, so a typo in `domain` cannot
 * quietly turn Billing into a staged lifecycle.
 *
 * ## Identity is declared, not inferred
 *
 * A domain projection names its `domain`. Consumers that need "which business process is this"
 * (the tile's signal family, the card identity) read that declaration instead of guessing from the
 * process key's text. Staged lifecycles keep the existing key-derived answer, because that is what
 * Enrollment's published configuration has always resolved through.
 */

import type { OperationalCalculationBusinessProcess } from "@/lib/analytics/calculations/types";

export const PROCESS_MODEL_KINDS = ["staged_lifecycle", "domain_projection"] as const;
export type ProcessModelKind = (typeof PROCESS_MODEL_KINDS)[number];

/** The domains a projection process may read. Each names an existing domain authority. */
export const PROCESS_PROJECTION_DOMAINS = ["assignments", "billing"] as const;
export type ProcessProjectionDomain = (typeof PROCESS_PROJECTION_DOMAINS)[number];

export type ProcessModelV1 =
    | { kind: "staged_lifecycle" }
    | { kind: "domain_projection"; domain: ProcessProjectionDomain };

export const STAGED_LIFECYCLE_PROCESS_MODEL: ProcessModelV1 = Object.freeze({ kind: "staged_lifecycle" });

export function isProcessProjectionDomain(value: unknown): value is ProcessProjectionDomain {
    return typeof value === "string" && (PROCESS_PROJECTION_DOMAINS as readonly string[]).includes(value);
}

/** Typed read of an authored `process_model_v1`; null when absent OR unreadable (publish tells them apart). */
export function parseProcessModelV1(raw: unknown): ProcessModelV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.kind === "staged_lifecycle") return { kind: "staged_lifecycle" };
    if (o.kind === "domain_projection" && isProcessProjectionDomain(o.domain)) {
        return { kind: "domain_projection", domain: o.domain };
    }
    return null;
}

/**
 * Why an authored `process_model_v1` cannot be read — null when it is absent or valid. Publication
 * reads this from the RAW payload, because the parser has already dropped what it could not type.
 */
export function processModelV1Problem(raw: unknown): string | null {
    if (raw === undefined || raw === null) return null;
    if (parseProcessModelV1(raw)) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) return "process_model_v1 must be an object.";
    const o = raw as Record<string, unknown>;
    if (!(PROCESS_MODEL_KINDS as readonly unknown[]).includes(o.kind)) {
        return `Unknown process model “${String(o.kind)}”. Known models: ${PROCESS_MODEL_KINDS.join(", ")}.`;
    }
    return `Unknown domain “${String(o.domain)}”. Known domains: ${PROCESS_PROJECTION_DOMAINS.join(", ")}.`;
}

/** The model a process executes under. Absent → staged_lifecycle (every pre-existing revision). */
export function resolveProcessModel(process: { process_model_v1?: ProcessModelV1 | null } | null | undefined): ProcessModelV1 {
    return process?.process_model_v1 ?? STAGED_LIFECYCLE_PROCESS_MODEL;
}

export function isDomainProjectionModel(
    model: ProcessModelV1 | null | undefined,
): model is { kind: "domain_projection"; domain: ProcessProjectionDomain } {
    return model?.kind === "domain_projection";
}

/** Operator-facing name of each domain — the existing domain authority it reads. */
export const PROCESS_PROJECTION_DOMAIN_LABELS: Record<ProcessProjectionDomain, string> = {
    assignments: "Assignments",
    billing: "Billing",
};

/**
 * The Operational Calculation business process whose tile signals a projection may offer.
 *
 * Billing reads Financials, which already IS a registered business process (`financial`). Assignments
 * reads Scheduling, which has no registered calculation family — so null, and the tile says it has no
 * signal rather than borrowing one. No calculation is invented here.
 */
const PROJECTION_DOMAIN_SIGNAL_BUSINESS_PROCESS: Record<ProcessProjectionDomain, OperationalCalculationBusinessProcess | null> = {
    assignments: null,
    billing: "financial",
};

export function signalBusinessProcessForProjectionDomain(
    domain: ProcessProjectionDomain,
): OperationalCalculationBusinessProcess | null {
    return PROJECTION_DOMAIN_SIGNAL_BUSINESS_PROCESS[domain];
}

/**
 * Why a domain projection has no runnable Work Views yet. Shown on its tile in place of an entry
 * link, so the process is visibly present and visibly not executable — never routed into another
 * process's queue.
 */
export const DOMAIN_PROJECTION_WORK_VIEWS_UNAVAILABLE =
    "Work Views for this process are not available yet." as const;

/** The process types offered when creating a Business Process (Settings → Business Processes). */
export const PROCESS_MODEL_CREATE_OPTIONS: readonly {
    value: "staged_lifecycle" | ProcessProjectionDomain;
    label: string;
    description: string;
}[] = [
    {
        value: "staged_lifecycle",
        label: "Staged lifecycle",
        description: "Records move through stages you configure (for example Enrollment).",
    },
    {
        value: "assignments",
        label: "Assignments",
        description: "Reviews assignment and scheduling records owned by Scheduling. No stages.",
    },
    {
        value: "billing",
        label: "Billing",
        description: "Reviews billing exceptions owned by Financials. No stages.",
    },
];

/** The model a create-form choice declares; undefined for a staged lifecycle (absence is that model). */
export function processModelForCreateChoice(
    choice: "staged_lifecycle" | ProcessProjectionDomain,
): ProcessModelV1 | undefined {
    return choice === "staged_lifecycle" ? undefined : { kind: "domain_projection", domain: choice };
}
