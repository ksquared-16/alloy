/**
 * P1 · Wave C — the single held-authority resolver (TS accessor). AI fails closed
 * before any read; otherwise the result mirrors the authoritative DB resolution.
 */

import { describe, expect, it } from "vitest";
import {
    resolveHeldOperationalAuthority,
    type HeldAuthorityGateway,
    type HeldAuthorityQuery,
} from "@/lib/operationalExpectations/standing/resolveHeldOperationalAuthority";

/** Fake gateway: holds iff (holder, authorityKey, scope) is in the grant set. */
class FakeAuthorityGateway implements HeldAuthorityGateway {
    grants = new Set<string>(); // `${holderType}:${holderId}:${authorityKey}`
    calls = 0;
    async resolve(q: HeldAuthorityQuery): Promise<{ assignmentId: string | null }> {
        this.calls += 1;
        return { assignmentId: this.grants.has(`${q.holderType}:${q.holderId}:${q.authorityKey}`) ? "assign-1" : null };
    }
}

const q = (over: Partial<HeldAuthorityQuery> = {}): HeldAuthorityQuery => ({
    orgId: "org-1", holderType: "human", holderId: "u1", authorityKey: "licensing:ratio",
    scopeType: "subject_type", scopeId: "room", ...over,
});

describe("resolveHeldOperationalAuthority", () => {
    it("AI never holds authority — fails closed WITHOUT any read", async () => {
        const gw = new FakeAuthorityGateway();
        const r = await resolveHeldOperationalAuthority(q({ holderType: "ai" }), gw);
        expect(r.holds).toBe(false);
        expect(gw.calls).toBe(0); // no gateway call for AI
    });
    it("fails closed on an incomplete query", async () => {
        const gw = new FakeAuthorityGateway();
        const r = await resolveHeldOperationalAuthority(q({ authorityKey: "" }), gw);
        expect(r.holds).toBe(false);
    });
    it("holds when the DB resolver returns an active assignment", async () => {
        const gw = new FakeAuthorityGateway();
        gw.grants.add("human:u1:licensing:ratio");
        const r = await resolveHeldOperationalAuthority(q(), gw);
        expect(r.holds).toBe(true);
        expect(r.assignmentId).toBe("assign-1");
        expect(r.matchedScope).toBe("subject_type");
    });
    it("does not hold when no assignment resolves (ungoverned/unassigned)", async () => {
        const gw = new FakeAuthorityGateway();
        const r = await resolveHeldOperationalAuthority(q(), gw);
        expect(r.holds).toBe(false);
        expect(r.assignmentId).toBeNull();
    });
    it("never trusts caller-supplied holdings — only the gateway (DB) decides", async () => {
        const gw = new FakeAuthorityGateway();
        // A caller might attach a bogus 'holds' — the query type has no such field,
        // and the resolver derives holds solely from the gateway result.
        const r = await resolveHeldOperationalAuthority({ ...q(), ...({ holds: true } as object) } as HeldAuthorityQuery, gw);
        expect(r.holds).toBe(false);
    });
});
