/**
 * P1 · Wave C · Slice C1 — pure Authority → Standing resolver.
 *
 * Proves the frozen §5/§12 rules WITHOUT any ledger write (nothing is made binding
 * in the system by this slice — the resolver is a pure function). Ratification acts
 * and intake wiring are Wave C · C2.
 */

import { describe, expect, it } from "vitest";
import {
    resolveAuthorityToStanding,
    type AuthorityResolutionInput,
} from "@/lib/operationalExpectations/standing/resolveAuthorityToStanding";
import type { OperationalModality } from "@/lib/operationalExpectations/expectationLedgerContract";

function input(over: Partial<AuthorityResolutionInput> = {}): AuthorityResolutionInput {
    return {
        authorClass: "human",
        modality: "required",
        claimedAuthorityKey: "licensing:ratio",
        heldAuthorities: ["licensing:ratio"],
        ...over,
    };
}

describe("predicted → model (imposes no obligation)", () => {
    for (const authorClass of ["human", "ai", "policy", "process", "external"] as const) {
        it(`predicted by ${authorClass} → model, never binding`, () => {
            const r = resolveAuthorityToStanding(input({ authorClass, modality: "predicted", externalTrust: "high", definitionRatifies: true }));
            expect(r.standing).toBe("model");
            expect(r.requiresRatification).toBe(false);
        });
    }
});

describe("AI never binds and never self-ratifies", () => {
    for (const modality of ["required", "prohibited", "intended", "committed"] as OperationalModality[]) {
        it(`AI ${modality} → proposed (requires ratification)`, () => {
            const r = resolveAuthorityToStanding(input({ authorClass: "ai", modality, heldAuthorities: ["licensing:ratio"] }));
            expect(r.standing).toBe("proposed");
            expect(r.requiresRatification).toBe(true);
        });
    }
    it("AI never resolves to binding even holding the claimed authority", () => {
        const r = resolveAuthorityToStanding(input({ authorClass: "ai", claimedAuthorityKey: "x", heldAuthorities: ["x"] }));
        expect(r.standing).not.toBe("binding");
    });
});

describe("human self-ratifies within authority", () => {
    it("human holding the claimed authority → binding", () => {
        const r = resolveAuthorityToStanding(input({ authorClass: "human", claimedAuthorityKey: "licensing:ratio", heldAuthorities: ["licensing:ratio"] }));
        expect(r.standing).toBe("binding");
        expect(r.requiresRatification).toBe(false);
    });
    it("human NOT holding the claimed authority → proposed (deontic requires ratification)", () => {
        const r = resolveAuthorityToStanding(input({ authorClass: "human", claimedAuthorityKey: "licensing:ratio", heldAuthorities: ["room:2"] }));
        expect(r.standing).toBe("proposed");
        expect(r.requiresRatification).toBe(true);
    });
    it("an empty claimed authority never self-ratifies", () => {
        const r = resolveAuthorityToStanding(input({ claimedAuthorityKey: "  ", heldAuthorities: [""] }));
        expect(r.standing).toBe("proposed");
    });
});

describe("policy / process bind only via configured-authority ratification", () => {
    it("policy ratified by its configured authority → binding", () => {
        const r = resolveAuthorityToStanding(input({ authorClass: "policy", definitionRatifies: true }));
        expect(r.standing).toBe("binding");
    });
    it("policy without configured-authority ratification → proposed", () => {
        const r = resolveAuthorityToStanding(input({ authorClass: "policy", definitionRatifies: false }));
        expect(r.standing).toBe("proposed");
    });
    it("process ratified by the definition's authority → binding; otherwise proposed", () => {
        expect(resolveAuthorityToStanding(input({ authorClass: "process", definitionRatifies: true })).standing).toBe("binding");
        expect(resolveAuthorityToStanding(input({ authorClass: "process", definitionRatifies: false })).standing).toBe("proposed");
    });
});

describe("external source standing follows mapped trust", () => {
    it("high-trust external holding the authority → binding", () => {
        const r = resolveAuthorityToStanding(input({ authorClass: "external", externalTrust: "high" }));
        expect(r.standing).toBe("binding");
    });
    it("low-trust external → proposed pending ratification", () => {
        const r = resolveAuthorityToStanding(input({ authorClass: "external", externalTrust: "low" }));
        expect(r.standing).toBe("proposed");
        expect(r.requiresRatification).toBe(true);
    });
});

describe("C1 makes nothing binding by itself + fail-closed", () => {
    it("requiresRatification is only ever set on a deontic proposed result", () => {
        const model = resolveAuthorityToStanding(input({ modality: "predicted" }));
        expect(model.requiresRatification).toBe(false);
        const binding = resolveAuthorityToStanding(input());
        expect(binding.requiresRatification).toBe(false);
    });
    it("the resolver is pure — same input yields same result, no side effects", () => {
        const a = resolveAuthorityToStanding(input());
        const b = resolveAuthorityToStanding(input());
        expect(a).toEqual(b);
    });
});
