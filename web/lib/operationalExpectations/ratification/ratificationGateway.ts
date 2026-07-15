/**
 * Ratification gateway (P1 · Wave C · C2) — the seam between the pure ratification
 * orchestration and infrastructure (flag, expectation read, atomic ratify RPC).
 * Injecting it keeps the orchestration unit-testable without a live Postgres.
 */

import type { OperationalModality } from "@/lib/operationalExpectations/expectationLedgerContract";

/** The target expectation an ratifier needs to validate tenancy + ratifiability. */
export interface RatificationTargetRow {
    id: string;
    orgId: string;
    modality: OperationalModality;
    standing: "proposed" | "binding" | "model";
}

/** The pre-resolved ratification handed to the atomic RPC. */
export interface RatificationRecord {
    idempotencyKey: string;
    payloadFingerprint: string;
    expectationId: string;
    ratifierAuthorityKey: string;
    ratifiedByLabel: string | null;
    rationale: string | null;
}

export type RatificationCommitOutcome =
    | {
          kind: "committed";
          idempotent: boolean;
          ratificationId: string;
          ratificationActEventId: string;
          ratifiedAt: string;
      }
    | { kind: "conflict" }
    | { kind: "insufficient_authority" }
    | { kind: "error"; message: string };

export interface RatificationGateway {
    /** Resolve the `oe.ledger.author` (P1) rollout flag for the org (fail-closed). */
    isRatificationEnabled(orgId: string): Promise<boolean>;
    /** Load the target expectation by id (NOT org-filtered — the service checks tenancy). */
    loadExpectation(expectationId: string): Promise<RatificationTargetRow | null>;
    /** Insert the ratification record + Ratification Act atomically via the RPC. */
    commit(orgId: string, actorUserId: string | null, record: RatificationRecord): Promise<RatificationCommitOutcome>;
}
