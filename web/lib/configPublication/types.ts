/**
 * Configuration Publication Runtime V1.
 *
 * The runtime owns publication and delivery control flow. Domain adapters own
 * draft/revision payloads, validation, and authoritative consumer mutations.
 */

export type ConfigurationFieldPolicy =
    | "organization_locked"
    | "location_may_override"
    | "location_must_supply"
    | "runtime_derived";

export type EffectiveConfigurationSource =
    | "organization"
    | "location_override"
    | "location"
    | "runtime_derived"
    | "platform_default"
    | "missing";

export type ConfigurationFieldDefinition<T = unknown> = {
    key: string;
    policy: ConfigurationFieldPolicy;
    platformDefault?: T;
};

export type EffectiveConfigurationField<T = unknown> = {
    key: string;
    policy: ConfigurationFieldPolicy;
    value: T | undefined;
    source: EffectiveConfigurationSource;
    required: boolean;
    missing: boolean;
};

export type ConfigurationRevisionIdentity = {
    id: string;
    number: number;
    checksum: string;
};

export type ConfigurationPublicationRecord = {
    id: string;
    orgId: string;
    domainKey: string;
    subjectId: string;
    revision: ConfigurationRevisionIdentity;
    publishedAt: string;
};

/** Durable consumer pointer to the published revision currently in use. */
export type ConfigurationConsumptionRecord = {
    id: string;
    orgId: string;
    domainKey: string;
    subjectId: string;
    locationId: string;
    publicationId: string;
    revisionId: string;
    consumedAt: string;
    deliveredByRunId: string;
};

/** Append-only attempt evidence. Retry adds another attempt under the same run. */
export type ConfigurationDeliveryAttemptRecord = {
    id: string;
    runId: string;
    targetId: string;
    locationId: string;
    attemptNumber: number;
    status: "delivered" | "unchanged" | "failed";
    errorCode: string | null;
    errorMessage: string | null;
    attemptedAt: string;
};

export type ConfigurationDistributionTargetRecord = {
    id: string;
    locationId: string;
    status: "pending" | "delivered" | "unchanged" | "failed";
    attemptCount: number;
    errorCode: string | null;
    errorMessage: string | null;
    result: Record<string, unknown>;
};

export type ConfigurationDistributionRunRecord = {
    id: string;
    publicationId: string;
    status: "planned" | "running" | "completed" | "partial_failure" | "failed";
    idempotencyKey: string;
    createdAt: string;
    completedAt: string | null;
    targets: ConfigurationDistributionTargetRecord[];
};

export type ConfigurationDeliveryTarget = {
    locationId: string;
    locationLabel: string;
};

export type ConfigurationDeliveryPlan = {
    orgId: string;
    domainKey: string;
    providerKey: string;
    providerVersion: number;
    publicationId: string;
    revisionId: string;
    targets: ConfigurationDeliveryTarget[];
    targetSetChecksum: string;
    idempotencyKey: string;
};

export type ConfigurationImpactKind =
    | "create"
    | "update"
    | "unchanged"
    | "conflict"
    | "required_input";

export type ConfigurationImpactItem = {
    fieldKey: string;
    kind: ConfigurationImpactKind;
    source: EffectiveConfigurationSource;
    message: string;
};

export type ConfigurationTargetPreview = {
    locationId: string;
    locationLabel: string;
    eligible: boolean;
    currentRevisionId: string | null;
    nextRevisionId: string;
    impacts: ConfigurationImpactItem[];
    conflicts: string[];
    requiredInputs: string[];
};

export type ConfigurationDeliveryDisposition = "delivered" | "unchanged" | "failed";

export type ConfigurationDeliveryOutcome = {
    locationId: string;
    disposition: ConfigurationDeliveryDisposition;
    consumptionId?: string;
    errorCode?: string;
    errorMessage?: string;
};

export type ConfigurationPublicationDomainAdapter<TRevision, TConsumerContext> = {
    domainKey: string;
    providerKey: string;
    providerVersion: number;
    preview: (input: {
        revision: TRevision;
        target: ConfigurationDeliveryTarget;
        context: TConsumerContext;
    }) => ConfigurationTargetPreview;
    deliver: (input: {
        plan: ConfigurationDeliveryPlan;
        revision: TRevision;
        target: ConfigurationDeliveryTarget;
        context: TConsumerContext;
    }) => Promise<ConfigurationDeliveryOutcome>;
};
