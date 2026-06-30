/**
 * Operational Mutation Platform — canonical types.
 * Every mutation an operator performs executes through this contract.
 *
 * Doctrine: docs/platform/modules/operational-mutation-platform.md
 */

// ─── Domain ──────────────────────────────────────────────────────────────────

export type MutationDomainKey =
    | "lead_status"
    | "enrollment_status"
    | "person_status"
    | "account_status";

export type MutationDomain = {
    key: MutationDomainKey;
    label: string;
    /** Entity table that owns this domain's state. */
    subjectType: string;
    /** Database column that holds the current state value. */
    canonicalField: string;
};

// ─── Decision Intent ─────────────────────────────────────────────────────────

export type MutationOrigin = "operator" | "automation" | "api" | "system";

/**
 * Typed input to the Mutation Runtime.
 * Represents an operator's expressed intent — always recorded, even if blocked.
 */
export type DecisionIntent = {
    commandKey: string;
    subjectId: string;
    subjectType: string;
    domain: MutationDomainKey;
    targetState: string;
    contextPayload?: Record<string, unknown>;
    operatorId?: string;
    origin: MutationOrigin;
    overrideReason?: string;
};

// ─── Evaluation ──────────────────────────────────────────────────────────────

export type EvaluationWarning = {
    code: string;
    message: string;
    severity: "info" | "warn";
};

export type EvaluationResult =
    | { ok: true; warnings: EvaluationWarning[] }
    | { ok: false; blocked: true; reason: string; code: string };

// ─── Preview ─────────────────────────────────────────────────────────────────

export type SideEffectSpec = {
    kind: "task" | "communication" | "automation" | "document";
    description: string;
};

export type MutationPreview = {
    commandKey: string;
    domain: MutationDomainKey;
    subjectId: string;
    subjectType: string;
    previousState: string;
    targetState: string;
    warnings: EvaluationWarning[];
    /** Human-readable required-information gaps. Non-empty means the command panel should block confirm. */
    readinessGaps: string[];
    sideEffects: SideEffectSpec[];
};

// ─── Mutation Result ─────────────────────────────────────────────────────────

export type MutationStatus = "committed" | "blocked" | "previewed";

/**
 * Synchronous output of the Mutation Runtime.
 * Drives optimistic UI update before projection refresh arrives.
 */
export type MutationResult =
    | {
          status: "committed";
          mutationId: string;
          commandKey: string;
          domain: MutationDomainKey;
          subjectId: string;
          subjectType: string;
          previousState: string;
          newState: string;
          warnings: EvaluationWarning[];
          sideEffects: SideEffectSpec[];
          committedAt: string;
      }
    | {
          status: "blocked";
          commandKey: string;
          domain: MutationDomainKey;
          subjectId: string;
          blockedReason: string;
          blockedCode: string;
      }
    | {
          status: "previewed";
          preview: MutationPreview;
      };
