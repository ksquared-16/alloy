import { describe, it, expect } from "vitest";
import {
    resolveIntakeIdentity,
    type IntakeIdentityResolverDeps,
} from "@/lib/forms/intake/resolveIntakeIdentity";

function makeDeps(opts: {
    emailIds?: Record<string, string[]>;
    phoneIds?: Record<string, string[]>;
    labels?: Record<string, string>;
} = {}) {
    const calls = { email: 0, phone: 0, labels: 0 };
    const deps: IntakeIdentityResolverDeps = {
        async listPersonIdsByEmail(_orgId, e) {
            calls.email++;
            return opts.emailIds?.[e] ?? [];
        },
        async listPersonIdsByPhone(_orgId, p) {
            calls.phone++;
            return opts.phoneIds?.[p] ?? [];
        },
        async getPersonLabels(_orgId, ids) {
            calls.labels++;
            return new Map(ids.map((id) => [id, opts.labels?.[id] ?? id]));
        },
    };
    return { deps, calls };
}

describe("resolveIntakeIdentity — read-only match-first recommendation", () => {
    it("no match -> create", async () => {
        const { deps } = makeDeps();
        const r = await resolveIntakeIdentity(deps, {
            orgId: "o1",
            person: { email: "new@example.com", phone: null, firstName: "A", lastName: "B" },
        });
        expect(r.decision).toBe("create");
        expect(r.candidates).toEqual([]);
        expect(r.proposed.person.email).toBe("new@example.com");
    });

    it("one email match -> link (high confidence, recommended candidate)", async () => {
        const { deps } = makeDeps({ emailIds: { "ava@example.com": ["p1"] }, labels: { p1: "Ava Rivera" } });
        const r = await resolveIntakeIdentity(deps, {
            orgId: "o1",
            person: { email: "Ava@Example.com", phone: null, firstName: null, lastName: null },
        });
        expect(r.decision).toBe("link");
        expect(r.confidence).toBe("high");
        expect(r.recommendedCandidateId).toBe("p1");
        expect(r.candidates[0]).toMatchObject({ id: "p1", label: "Ava Rivera", matchReason: "parent email" });
        expect(r.matchedOn).toEqual(["email"]);
    });

    it("ambiguous matches -> route with the competing candidates", async () => {
        const { deps } = makeDeps({ emailIds: { "dup@example.com": ["p1", "p2"] }, labels: { p1: "One", p2: "Two" } });
        const r = await resolveIntakeIdentity(deps, {
            orgId: "o1",
            person: { email: "dup@example.com", phone: null, firstName: null, lastName: null },
        });
        expect(r.decision).toBe("route");
        expect(r.blockers).toContain("ambiguous_email");
        expect(r.candidates).toHaveLength(2);
    });

    it("missing identifiers -> route (and does not even look up)", async () => {
        const { deps, calls } = makeDeps();
        const r = await resolveIntakeIdentity(deps, {
            orgId: "o1",
            person: { email: null, phone: null, firstName: "A", lastName: "B" },
        });
        expect(r.decision).toBe("route");
        expect(r.blockers).toContain("missing_identifiers");
        expect(calls.email).toBe(0);
        expect(calls.phone).toBe(0);
    });

    it("resolver performs only reads — the deps interface has no write methods", async () => {
        const { deps, calls } = makeDeps({ emailIds: { "x@example.com": ["p1"] } });
        await resolveIntakeIdentity(deps, {
            orgId: "o1",
            person: { email: "x@example.com", phone: null, firstName: null, lastName: null },
        });
        expect(calls.email).toBeGreaterThan(0);
        expect(Object.keys(deps).sort()).toEqual(["getPersonLabels", "listPersonIdsByEmail", "listPersonIdsByPhone"]);
    });
});
