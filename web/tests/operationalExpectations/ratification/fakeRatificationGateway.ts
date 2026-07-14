/**
 * In-memory ratification gateway (TEST INFRA) — faithful stand-in for the atomic
 * ratify RPC so the orchestration is proven WITHOUT a live Postgres: enforces one
 * ratification per (org, expectation), idempotent retry, conflict on divergent
 * payload, flag toggle, and commit-error injection.
 */

import type {
    RatificationCommitOutcome,
    RatificationGateway,
    RatificationRecord,
    RatificationTargetRow,
} from "@/lib/operationalExpectations/ratification/ratificationGateway";

interface Stored {
    ratificationId: string;
    eventId: string;
    fingerprint: string;
}

export class FakeRatificationGateway implements RatificationGateway {
    enabled = true;
    failCommit = false;
    readonly expectations = new Map<string, RatificationTargetRow>();
    readonly ratifications = new Map<string, Stored>(); // key `${org}:${expectationId}`
    readonly commits: RatificationRecord[] = [];
    readonly events: string[] = [];
    private seq = 0;

    async isRatificationEnabled(): Promise<boolean> {
        return this.enabled;
    }

    async loadExpectation(expectationId: string): Promise<RatificationTargetRow | null> {
        return this.expectations.get(expectationId) ?? null;
    }

    async commit(orgId: string, _actor: string | null, record: RatificationRecord): Promise<RatificationCommitOutcome> {
        if (this.failCommit) return { kind: "error", message: "boom" };
        const key = `${orgId}:${record.expectationId}`;
        const existing = this.ratifications.get(key);
        if (existing) {
            if (existing.fingerprint !== record.payloadFingerprint) return { kind: "conflict" };
            return {
                kind: "committed",
                idempotent: true,
                ratificationId: existing.ratificationId,
                ratificationActEventId: existing.eventId,
                ratifiedAt: "2026-07-21T00:00:00.000Z",
            };
        }
        this.seq += 1;
        const ratificationId = `rat-${this.seq}`;
        const eventId = `revt-${this.seq}`;
        this.ratifications.set(key, { ratificationId, eventId, fingerprint: record.payloadFingerprint });
        this.commits.push(record);
        this.events.push(eventId);
        return {
            kind: "committed",
            idempotent: false,
            ratificationId,
            ratificationActEventId: eventId,
            ratifiedAt: "2026-07-21T00:00:00.000Z",
        };
    }
}
