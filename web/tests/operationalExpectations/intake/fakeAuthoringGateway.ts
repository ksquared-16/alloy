/**
 * In-memory authoring gateway (TEST INFRA) — a faithful stand-in for the atomic
 * commit RPC so the intake orchestration is proven WITHOUT a live Postgres:
 * enforces (org, idempotency_key) dedupe, same-key/different-payload conflict, one
 * event per committed row, predecessor tenancy, flag toggle, and commit-error
 * injection.
 */

import type {
    AuthoringActRecord,
    AuthoringGateway,
    CommitOutcome,
    PredecessorRow,
} from "@/lib/operationalExpectations/intake/authoringGateway";

interface StoredAct {
    expectationId: string;
    eventId: string;
    fingerprint: string;
    act: AuthoringActRecord;
}

export class FakeAuthoringGateway implements AuthoringGateway {
    enabled = true;
    failCommit = false;
    readonly predecessors = new Map<string, PredecessorRow>();
    readonly store = new Map<string, StoredAct>();
    readonly commits: AuthoringActRecord[] = [];
    readonly events: string[] = [];
    private seq = 0;

    async isAuthoringEnabled(): Promise<boolean> {
        return this.enabled;
    }

    async loadPredecessor(predecessorId: string): Promise<PredecessorRow | null> {
        return this.predecessors.get(predecessorId) ?? null;
    }

    async commit(orgId: string, _actorUserId: string | null, act: AuthoringActRecord): Promise<CommitOutcome> {
        if (this.failCommit) return { kind: "error", message: "boom" };
        const key = `${orgId}:${act.idempotencyKey}`;
        const existing = this.store.get(key);
        if (existing) {
            if (existing.fingerprint !== act.payloadFingerprint) return { kind: "conflict" };
            return {
                kind: "committed",
                idempotent: true,
                expectationId: existing.expectationId,
                authoringActEventId: existing.eventId,
                transitionType: act.transitionType,
                supersedesExpectationId: act.supersedesExpectationId,
                lineageRootId: act.supersedesExpectationId ?? existing.expectationId,
                standing: act.standing,
                authoredAt: "2026-07-19T00:00:00.000Z",
            };
        }
        this.seq += 1;
        const expectationId = `exp-${this.seq}`;
        const eventId = `evt-${this.seq}`;
        this.store.set(key, { expectationId, eventId, fingerprint: act.payloadFingerprint, act });
        this.commits.push(act);
        this.events.push(eventId);
        return {
            kind: "committed",
            idempotent: false,
            expectationId,
            authoringActEventId: eventId,
            transitionType: act.transitionType,
            supersedesExpectationId: act.supersedesExpectationId,
            lineageRootId: act.supersedesExpectationId ?? expectationId,
            standing: act.standing,
            authoredAt: "2026-07-19T00:00:00.000Z",
        };
    }
}
