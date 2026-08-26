/**
 * THE PARTICIPANT SCOPE CARRIER — and the guesses it refuses to make.
 *
 * The scope is contextual information on a CASE-grain panel. Its value is not that it resolves a
 * child; it is that it resolves the RIGHT child or none, in one place, so cards cannot each invent
 * their own answer and disagree.
 */

import { describe, expect, it } from "vitest";

import { resolveParticipantScope } from "@/lib/adminV2/runtime/operationalContext/resolveParticipantScope";

const AVERY = { id: "ocm_avery", customerMemberId: "cm_avery", name: "Avery Wright", stageKey: "waitlist" };
const RILEY = { id: "ocm_riley", customerMemberId: "cm_riley", name: "Riley Wright", stageKey: "tour" };

describe("resolveParticipantScope", () => {
    it("resolves an explicit selection by participation id", () => {
        const r = resolveParticipantScope({
            selectedParticipationId: "ocm_avery",
            participants: [AVERY, RILEY],
        });
        expect(r.reason).toBe("explicit");
        expect(r.scope?.participationId).toBe("ocm_avery");
        expect(r.scope?.displayName).toBe("Avery Wright");
        expect(r.scope?.stageKey).toBe("waitlist");
    });

    it("also accepts the durable child id — either stable identity, never the name", () => {
        const r = resolveParticipantScope({
            selectedParticipationId: "cm_riley",
            participants: [AVERY, RILEY],
        });
        expect(r.scope?.participationId).toBe("ocm_riley");

        // The display name is NOT an identity and must not resolve anything.
        const byName = resolveParticipantScope({
            selectedParticipationId: "Riley Wright",
            participants: [AVERY, RILEY],
        });
        expect(byName.scope).toBeNull();
    });

    it("REFUSES to pick a child when several are eligible and none is selected", () => {
        const r = resolveParticipantScope({ selectedParticipationId: null, participants: [AVERY, RILEY] });
        // A wrong child is worse than no child: the operator cannot see the substitution.
        expect(r.scope).toBeNull();
        expect(r.reason).toBe("ambiguous");
    });

    it("scopes to a sole participant, because there is no ambiguity to resolve", () => {
        const r = resolveParticipantScope({ selectedParticipationId: null, participants: [AVERY] });
        expect(r.reason).toBe("sole_participant");
        expect(r.scope?.participationId).toBe("ocm_avery");
    });

    it("STALE SCOPE DOES NOT LEAK — a selection from the previous case resolves to nobody", () => {
        // The operator moved from the Wright case to a different family; the old selection is still
        // in hand. Answering with whoever happens to be first here is the leak this refuses.
        const r = resolveParticipantScope({
            selectedParticipationId: "ocm_from_another_case",
            participants: [AVERY, RILEY],
        });
        expect(r.scope).toBeNull();
        expect(r.reason).toBe("not_found");
    });

    it("a case with no participants scopes to nobody", () => {
        const r = resolveParticipantScope({ selectedParticipationId: null, participants: [] });
        expect(r.scope).toBeNull();
        expect(r.reason).toBe("none_selected");
    });

    it("carries stable identity and presentation apart", () => {
        const r = resolveParticipantScope({ selectedParticipationId: "ocm_avery", participants: [AVERY] });
        // Identity fields are ids; the name and image are presentation only.
        expect(r.scope).toMatchObject({
            participationId: "ocm_avery",
            customerMemberId: "cm_avery",
            displayName: "Avery Wright",
        });
        expect(r.scope?.personId).toBeNull();
        expect(r.scope?.imageUrl).toBeNull();
    });
});
