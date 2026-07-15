/**
 * Authoring intake gateway (P1 · Wave B) — the narrow seam between the pure intake
 * orchestration (`authorOperationalExpectation`) and infrastructure (feature flag,
 * predecessor read, the atomic commit RPC). Injecting it keeps the orchestration
 * unit-testable without a live Postgres; the production wiring is
 * `supabaseAuthoringGateway.ts`.
 */

import type {
    ExpectationTransitionType,
    OperationalModality,
} from "@/lib/operationalExpectations/expectationLedgerContract";

/** The predecessor row an intake needs to validate a supersession (org-unfiltered load). */
export interface PredecessorRow {
    id: string;
    orgId: string;
    subjectKind: string;
    lineageRootId: string | null;
    modality: OperationalModality;
}

/** The fully pre-resolved authoring act handed to the atomic commit RPC. */
export interface AuthoringActRecord {
    idempotencyKey: string;
    payloadFingerprint: string;
    authorityKey: string;
    authorClass: string;
    modality: OperationalModality;
    subjectKind: string;
    subjectRef: unknown;
    condition: unknown;
    temporalFrame: unknown;
    beneficiary: unknown;
    verb: string;
    transitionType: ExpectationTransitionType | null;
    supersedesExpectationId: string | null;
    standing: "proposed" | "model";
    footprint: unknown;
    validFrom: string;
    validTo: string | null;
    configVersionRef: unknown;
    authoredByLabel: string | null;
    // Held-authority resolution inputs (server-trusted). The author RPC resolves
    // authority itself and decides standing — a caller cannot force binding.
    authorityHolderId: string | null;
    authorityScopeType: string;
    authorityScopeId: string | null;
}

/** The outcome of the atomic commit RPC (row + Authoring Act, one transaction). */
export type CommitOutcome =
    | {
          kind: "committed";
          idempotent: boolean;
          expectationId: string;
          authoringActEventId: string;
          transitionType: ExpectationTransitionType | null;
          supersedesExpectationId: string | null;
          lineageRootId: string | null;
          standing: "proposed" | "binding" | "model";
          authoredAt: string;
      }
    | { kind: "conflict" }
    | { kind: "error"; message: string };

export interface AuthoringGateway {
    /** Resolve the `oe.ledger.author` flag for the org (fail-closed on error). */
    isAuthoringEnabled(orgId: string): Promise<boolean>;
    /** Load a predecessor by id (NOT org-filtered — the service checks tenancy). */
    loadPredecessor(predecessorId: string): Promise<PredecessorRow | null>;
    /** Insert the authored row + the Authoring Act atomically via the RPC. */
    commit(orgId: string, actorUserId: string | null, act: AuthoringActRecord): Promise<CommitOutcome>;
}
