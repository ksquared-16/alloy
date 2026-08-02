/**
 * Decision Contract — the universal interface between a capability and the
 * Trust Runtime.
 *
 * A Decision Contract declares WHAT decision must be made. It never declares
 * HOW reasoning happens. The type below enforces that structurally: reasoning
 * implementation keys are mapped to `never`, so a prompt, provider name, model
 * identifier or API parameter cannot be represented in a contract at all.
 *
 * @see docs/platform/trust/decision-contract.md
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 021
 */

/**
 * Keys that describe reasoning *implementation*. Doctrine forbids them from
 * appearing in a Decision Contract; this list is what makes that a compile-time
 * property rather than a review convention.
 */
export type ReasoningImplementationKey =
    | "prompt"
    | "prompts"
    | "prompt_text"
    | "system_prompt"
    | "user_prompt"
    | "messages"
    | "completion"
    | "provider"
    | "provider_key"
    | "provider_name"
    | "model"
    | "model_id"
    | "model_key"
    | "model_name"
    | "temperature"
    | "top_p"
    | "max_tokens"
    | "stop_sequences"
    | "api_key"
    | "api_base"
    | "base_url"
    | "endpoint"
    | "embedding"
    | "embeddings";

/** JSON-safe declared value. Contracts carry declarations, never payloads of arbitrary shape. */
export type TrustDeclaredValue = string | number | boolean | null | readonly TrustDeclaredValue[] | { readonly [key: string]: TrustDeclaredValue };

/**
 * Resolves to `true` when a {@link ReasoningImplementationKey} appears anywhere
 * in `T`, at any depth, including inside arrays. Resolves to `never` otherwise.
 */
export type HasReasoningImplementationKey<T> = T extends readonly (infer U)[]
    ? HasReasoningImplementationKey<U>
    : T extends object
      ? [Extract<keyof T, ReasoningImplementationKey>] extends [never]
          ? { [K in keyof T]: HasReasoningImplementationKey<T[K]> }[keyof T]
          : true
      : never;

/**
 * `T` when `T` declares no reasoning implementation, `never` when it does.
 *
 * Used in the contract builder's signature, which is what makes "a Decision
 * Contract cannot represent a prompt, provider, model or API parameter" a
 * compile-time property rather than a review convention (acceptance A2).
 */
export type RejectsReasoningImplementation<T> = [HasReasoningImplementationKey<T>] extends [never] ? T : never;

export const DECISION_CONTRACT_LIFECYCLE_STATES = [
    "created",
    "accepted",
    "prepared",
    "executing",
    "validated",
    "packaged",
    "completed",
    "archived",
] as const;

export type DecisionContractLifecycleState = (typeof DECISION_CONTRACT_LIFECYCLE_STATES)[number];

/** HOW the initiating intent arrived. Mirrors the platform channel vocabulary. */
export const TRUST_CHANNELS = ["operator", "participant", "bos", "api", "system"] as const;
export type TrustChannel = (typeof TRUST_CHANNELS)[number];

/** WHO or WHAT initiated the decision request. */
export type TrustInitiatingActor =
    | { actor_type: "operator"; actor_id: string }
    | { actor_type: "system"; actor_id: null }
    | { actor_type: "automation"; actor_id: string | null };

/**
 * The declared sections of a Decision Contract: intent, decision, information,
 * constraints, success, lifecycle.
 */
export type DecisionContractV1 = {
    readonly schema_version: 1;
    readonly id: string;
    readonly org_id: string;
    readonly decision_class_key: string;

    /** Why reasoning is required. Operational, never conversational. */
    readonly intent: string;
    /** The operational environment. Provided explicitly; never inferred. */
    readonly context: TrustDeclaredValue;

    /** What information is required — not what is available. */
    readonly information_requirements: readonly string[];
    /** Knowledge categories requested. Never storage references. */
    readonly knowledge_requirements: readonly string[];

    /** Policy references, resolved by the runtime. Never implementations. */
    readonly privacy_policy_key: string;
    readonly validation_policy_key: string;

    readonly economic_constraints: {
        readonly max_latency_ms: number;
        readonly max_escalation_level: number;
    };
    readonly success_criteria: readonly string[];

    readonly correlation_id: string;
    readonly initiating_actor: TrustInitiatingActor;
    readonly channel: TrustChannel;

    readonly lifecycle_state: DecisionContractLifecycleState;
    readonly runtime_version: string;
    readonly registry_version: string;
    readonly created_at_iso: string;
};

/** Runtime version pinned into every contract and package for reproducibility. */
export const TRUST_RUNTIME_VERSION = "trust-runtime-v1.0.0" as const;
