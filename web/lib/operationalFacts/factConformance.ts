/**
 * Operational Fact Contract — reusable conformance harness (D2).
 *
 * `assertFactStreamConforms(descriptor, probes)` asserts that a fact stream
 * satisfies BOTH halves of the contract:
 *   - Storage half: append-only (UPDATE/DELETE reject), entry-type vocabulary,
 *     corrects self-FK + no-self-reference, org-scoped RLS, no updated_at.
 *   - Consumer-facing half (the STRENGTHENED D2 requirement): each entry type emits
 *     a DISTINCT event, and every emitted payload carries correction identity
 *     (schema_version, entry_type, corrects_event_id), the durable subject ref, the
 *     effective/recorded date, and org_id — the fields downstream interpreters need.
 *
 * It is probe-driven so it can run without a live Postgres: the caller (a test, or
 * a future live-DB harness) supplies the runtime observations. The same harness is
 * reused by every future fact stream (Wave 4 staff presence adds one descriptor +
 * one probe set).
 *
 * Doctrine: RFC operational-expansion-phase1-architecture-rfc.md (D2 — the test is
 *           the enforcement, non-optional at freeze).
 */

import {
    OPERATIONAL_FACT_ENTRY_TYPES,
    OPERATIONAL_FACT_REQUIRED_PAYLOAD_KEYS,
    type OperationalFactEntryType,
    type OperationalFactEventEnvelope,
    type OperationalFactStreamDescriptor,
} from "@/lib/operationalFacts/factContract";

/** Runtime observations of a fact stream, supplied by the caller. */
export interface FactStreamProbes {
    /**
     * Attempt a forbidden mutation against the stream. Append-only streams must
     * REJECT both. Returns whether the mutation was rejected (and why).
     */
    attemptMutation: (op: "update" | "delete") =>
        | { rejected: boolean; message?: string }
        | Promise<{ rejected: boolean; message?: string }>;
    /** The entry-type vocabulary the storage CHECK enforces. */
    entryTypeVocabulary: readonly string[];
    /** The stream has a self-referential corrects FK (correction/reversal → prior row). */
    correctsSelfReference: boolean;
    /** A no-self-reference guard exists (a row cannot correct itself). */
    noSelfReferenceGuard: boolean;
    /** The stream has an org-scoped SELECT policy (RLS). */
    orgScopedRls: boolean;
    /** The table has an updated_at column (append-only streams must NOT). */
    hasUpdatedAt: boolean;
    /** The table has a per-fact schema_version column (recommended, not required). */
    hasSchemaVersionColumn?: boolean;
    /** One emitted event envelope per entry type (asserts distinctness + payload). */
    emittedEvents: {
        original: OperationalFactEventEnvelope;
        correction: OperationalFactEventEnvelope;
        reversal: OperationalFactEventEnvelope;
    };
}

export type ConformanceHalf = "storage" | "consumer";

export interface FactConformanceCheck {
    property: string;
    half: ConformanceHalf;
    passed: boolean;
    detail: string;
}

export interface FactConformanceReport {
    tableName: string;
    conforms: boolean;
    checks: FactConformanceCheck[];
    /** Non-fatal advisories (e.g. missing recommended schema_version column). */
    warnings: string[];
}

function payloadComplete(
    envelope: OperationalFactEventEnvelope,
    descriptor: OperationalFactStreamDescriptor,
): { ok: boolean; missing: string[] } {
    const payload = envelope.payload ?? {};
    const requiredKeys = [
        ...OPERATIONAL_FACT_REQUIRED_PAYLOAD_KEYS,
        ...descriptor.eventPayloadRequiredKeys,
    ];
    const missing: string[] = [];
    for (const key of requiredKeys) {
        if (!(key in payload)) missing.push(key);
    }
    // org_id must be present on the envelope (event is org-scoped).
    if (!envelope.org_id) missing.push("org_id");
    // corrects_event_id must be a declared key even when null (lineage carrier).
    if (!("corrects_event_id" in payload)) missing.push("corrects_event_id");
    // schema_version must be a number.
    if (typeof payload.schema_version !== "number") missing.push("schema_version:number");
    return { ok: missing.length === 0, missing };
}

/**
 * Assert a fact stream conforms to the Operational Fact contract. Returns a
 * structured report (never throws); the caller asserts `report.conforms`.
 */
export async function assertFactStreamConforms(
    descriptor: OperationalFactStreamDescriptor,
    probes: FactStreamProbes,
): Promise<FactConformanceReport> {
    const checks: FactConformanceCheck[] = [];
    const warnings: string[] = [];

    // -- Storage half ---------------------------------------------------------
    const updateOutcome = await probes.attemptMutation("update");
    const deleteOutcome = await probes.attemptMutation("delete");
    checks.push({
        property: "append_only",
        half: "storage",
        passed: updateOutcome.rejected && deleteOutcome.rejected,
        detail: `UPDATE rejected=${updateOutcome.rejected}${updateOutcome.message ? ` (${updateOutcome.message})` : ""}; DELETE rejected=${deleteOutcome.rejected}${deleteOutcome.message ? ` (${deleteOutcome.message})` : ""}`,
    });

    const vocabHasAll = OPERATIONAL_FACT_ENTRY_TYPES.every((t) =>
        probes.entryTypeVocabulary.includes(t),
    );
    const vocabNoExtras = probes.entryTypeVocabulary.every((t) =>
        (OPERATIONAL_FACT_ENTRY_TYPES as readonly string[]).includes(t),
    );
    checks.push({
        property: "entry_type_vocabulary",
        half: "storage",
        passed: vocabHasAll && vocabNoExtras,
        detail: `vocabulary=[${probes.entryTypeVocabulary.join(",")}] expected=[${OPERATIONAL_FACT_ENTRY_TYPES.join(",")}]`,
    });

    checks.push({
        property: "corrects_self_reference",
        half: "storage",
        passed: probes.correctsSelfReference === true,
        detail: `self-FK on ${descriptor.correctsColumn}=${probes.correctsSelfReference}`,
    });

    checks.push({
        property: "no_self_reference_guard",
        half: "storage",
        passed: probes.noSelfReferenceGuard === true,
        detail: `no-self-reference CHECK present=${probes.noSelfReferenceGuard}`,
    });

    checks.push({
        property: "org_scoped_rls",
        half: "storage",
        passed: probes.orgScopedRls === true,
        detail: `org-scoped SELECT policy on ${descriptor.orgColumn}=${probes.orgScopedRls}`,
    });

    checks.push({
        property: "no_updated_at",
        half: "storage",
        passed: probes.hasUpdatedAt === false,
        detail: `append-only stream must have no updated_at; hasUpdatedAt=${probes.hasUpdatedAt}`,
    });

    // -- Consumer-facing half -------------------------------------------------
    const types: Record<OperationalFactEntryType, string> = {
        original: probes.emittedEvents.original.event_type,
        correction: probes.emittedEvents.correction.event_type,
        reversal: probes.emittedEvents.reversal.event_type,
    };
    const distinct = new Set(Object.values(types)).size === 3;
    const matchesDescriptor =
        types.original === descriptor.emittedEventTypes.original &&
        types.correction === descriptor.emittedEventTypes.correction &&
        types.reversal === descriptor.emittedEventTypes.reversal;
    checks.push({
        property: "distinct_event_types",
        half: "consumer",
        passed: distinct && matchesDescriptor,
        detail: `emitted=[${types.original},${types.correction},${types.reversal}] distinct=${distinct} matchesDescriptor=${matchesDescriptor}`,
    });

    for (const entryType of OPERATIONAL_FACT_ENTRY_TYPES) {
        const envelope = probes.emittedEvents[entryType];
        const result = payloadComplete(envelope, descriptor);
        // The payload's entry_type must equal the entry type it was emitted for.
        const entryTypeMatches = envelope.payload?.entry_type === entryType;
        checks.push({
            property: `event_payload_completeness:${entryType}`,
            half: "consumer",
            passed: result.ok && entryTypeMatches,
            detail: result.ok
                ? `entry_type=${envelope.payload?.entry_type} (expected ${entryType})`
                : `missing=[${result.missing.join(",")}] entry_type=${envelope.payload?.entry_type}`,
        });
    }

    // -- Advisory (not a failure) --------------------------------------------
    if (descriptor.schemaVersionSource === "event" && probes.hasSchemaVersionColumn !== true) {
        warnings.push(
            `${descriptor.tableName}: no per-fact schema_version column (recommended for new streams; attendance carries it on the event envelope).`,
        );
    }

    const conforms = checks.every((c) => c.passed);
    return { tableName: descriptor.tableName, conforms, checks, warnings };
}
